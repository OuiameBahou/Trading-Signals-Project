import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from hmmlearn import hmm
from statsmodels.tsa.stattools import grangercausalitytests
from statsmodels.tsa.api import VAR
from statsmodels.stats.multitest import multipletests
import os
from .config import *
from .utils import setup_logger, save_figure

logger = setup_logger("LeadershipDetection")

class LeadershipDetection:
    """Detects market regimes using HMM and calculates composite leadership scores.
    
    Banking-grade implementation with:
    - Stationarity blocking filter
    - Train/Test split (fit on train only)
    - Granger via VAR + AIC lag selection
    - Benjamini-Hochberg correction for multiple testing
    - Strict asymmetry check (unidirectional causality only)
    - Rolling stability validation (6-month windows, 60% detection rate)
    - Cross-correlation validation threshold at 0.60
    """

    def __init__(self, prices, returns, stationary_assets=None):
        self.prices = prices
        self.returns = returns
        self.stationary_assets = stationary_assets
        self.regimes = None

        # Apply stationarity filter if provided
        if self.stationary_assets is not None:
            excluded = [c for c in self.returns.columns if c not in self.stationary_assets]
            if excluded:
                logger.warning(f"STATIONARITY BLOCKING FILTER: Excluding {len(excluded)} non-stationary assets: {excluded}")
            self.returns = self.returns[[c for c in self.returns.columns if c in self.stationary_assets]]
            self.prices = self.prices[[c for c in self.prices.columns if c in self.stationary_assets]]
            logger.info(f"Proceeding with {len(self.returns.columns)} stationary assets.")

    def _get_train_data(self):
        """Returns returns filtered to the TRAIN period only."""
        return self.returns.loc[TRAIN_START_DATE:TRAIN_END_DATE]

    def _get_test_data(self):
        """Returns returns filtered to the TEST period only."""
        return self.returns.loc[TEST_START_DATE:TEST_END_DATE]

    def detect_regimes(self, benchmark='SP500'):
        """Uses Hidden Markov Model (HMM) to identify market regimes.
        HMM is FIT on TRAIN period only, then PREDICTS on both periods."""
        logger.info(f"Detecting market regimes using {benchmark} (fit on train: {TRAIN_START_DATE} to {TRAIN_END_DATE})...")
        
        if benchmark not in self.returns.columns:
            logger.warning(f"Benchmark {benchmark} not available (possibly excluded by stationarity filter). Skipping regime detection.")
            return None
        
        train_returns = self._get_train_data()
        all_returns = self.returns[benchmark].dropna()
        train_data = train_returns[benchmark].dropna().values.reshape(-1, 1)
        
        # Fit HMM on TRAIN period only
        model = hmm.GaussianHMM(n_components=HMM_N_COMPONENTS, covariance_type="full", n_iter=1000, random_state=42)
        model.fit(train_data)
        
        # Predict on FULL period (train + test)
        full_data = all_returns.values.reshape(-1, 1)
        self.regimes = model.predict(full_data)
        
        # Create a regime Series indexed by the returns index
        regime_series = pd.Series(self.regimes, index=all_returns.index)
        
        # Align prices for plotting
        plot_prices = self.prices[benchmark].loc[regime_series.index]
        
        # Plot regimes
        fig, ax = plt.subplots(figsize=(15, 7))
        for i in range(HMM_N_COMPONENTS):
            mask = regime_series == i
            ax.scatter(plot_prices.index[mask], plot_prices[mask], 
                       label=f'Regime {i}', s=10)
        
        ax.set_title(f"Market Regimes Detected (HMM on {benchmark})")
        ax.axvline(pd.Timestamp(TEST_START_DATE), color='red', linestyle='--', label='Train/Test Split')
        ax.legend()
        save_figure(fig, "regimes", f"hmm_regimes_{benchmark}")
        
        regime_series.to_csv(os.path.join(RESULTS_DIR, "stats", "market_regimes.csv"))
        return regime_series

    def _granger_via_var(self, leader_series, follower_series, max_lags=GRANGER_MAX_LAGS):
        """Performs Granger causality test using VAR model with AIC lag selection,
        prioritizing shorter lags if they are significant and have comparable AIC.
        Returns (p_value, optimal_lag) or (1.0, 0) on failure."""
        try:
            test_data = pd.DataFrame({
                'follower': follower_series,
                'leader': leader_series
            }).dropna()
            
            if len(test_data) < max_lags * 3:
                return 1.0, 0
            
            model = VAR(test_data)
            # Use AIC to select optimal lag
            lag_order = model.select_order(maxlags=max_lags)
            aic_lag = lag_order.aic
            
            if aic_lag == 0:
                aic_lag = 1  # Minimum 1 lag for Granger
            
            # Get baseline AIC model
            res_aic = model.fit(aic_lag)
            p_aic = res_aic.test_causality('follower', causing='leader', kind='f').pvalue
            base_aic_val = res_aic.aic
            
            best_lag = aic_lag
            best_p = p_aic
            
            # Privilege shorter lags if significant (p<0.05) and AIC is comparable (abs diff < 0.1)
            for lag in range(1, aic_lag):
                res = model.fit(lag)
                p_val = res.test_causality('follower', causing='leader', kind='f').pvalue
                # If significant and AIC is not terribly worse than the best one
                if p_val < GRANGER_P_THRESHOLD and abs(res.aic - base_aic_val) < 0.1:
                    best_lag = lag
                    best_p = p_val
                    break  # Take the shortest lag that works
            
            return best_p, best_lag
            
        except Exception as e:
            logger.debug(f"VAR/Granger failed: {e}")
            return 1.0, 0

    def _rolling_stability_check(self, leader_col, follower_col, train_returns, optimal_lag=None):
        """Checks temporal stability of lead-lag relationship using rolling windows.
        
        Tests the SAME lag range as Phase 1 (-10 to +10, including lag 0).
        Returns the fraction of windows where the relationship is detected 
        (best abs correlation >= STABILITY_CORR_THRESHOLD).
        """
        window = STABILITY_WINDOW_DAYS
        n_obs = len(train_returns)
        
        if n_obs < window + 10:
            return 0.0
        
        detections = 0
        total_windows = 0
        
        # Slide window across the train period (step = quarter window for overlap)
        for start_idx in range(0, n_obs - window + 1, window // 4):
            end_idx = start_idx + window
            if end_idx > n_obs:
                break
            
            window_data = train_returns.iloc[start_idx:end_idx]
            leader_data = window_data[leader_col]
            follower_data = window_data[follower_col]
            
            # Test full range -10 to +10 (same as Phase 1 discovery)
            best_abs_corr = 0
            for lag in range(-10, 11):
                corr = leader_data.shift(lag).corr(follower_data)
                if abs(corr) > best_abs_corr:
                    best_abs_corr = abs(corr)
            
            # Detection = best correlation above the stability threshold (0.45)
            if best_abs_corr >= STABILITY_CORR_THRESHOLD:
                detections += 1
            total_windows += 1
        
        if total_windows == 0:
            return 0.0
        
        detection_rate = detections / total_windows
        return detection_rate

    def discover_leadership_hub(self, correlation_threshold=CORR_PRE_FILTER):
        """
        Banking-grade discovery of all leader/follower pairs.
        
        Pipeline:
        1. Pre-filter by static correlation (>= 0.30)
        2. Cross-correlation with lags -10 to +10, validate at >= 0.60
        3. Granger via VAR + AIC lag selection
        4. Collect all raw p-values
        5. Apply Benjamini-Hochberg FDR correction
        6. Asymmetry check: A→B significant AND B→A NOT significant
        7. Rolling stability validation (6-month windows, >= 60% detection)
        8. Composite score calculation
        """
        logger.info(f"Starting Banking-Grade All-Pairs Discovery...")
        logger.info(f"  Pre-filter: {correlation_threshold}, Final threshold: {CORR_VALIDATION_THRESHOLD}")
        logger.info(f"  Train period: {TRAIN_START_DATE} to {TRAIN_END_DATE}")
        
        train_returns = self._get_train_data()
        assets = train_returns.columns
        
        logger.info(f"  Assets in scope: {len(assets)}")
        
        # ===== PHASE 1: Pre-filter + Cross-Correlation + Raw Granger =====
        candidates = []
        
        for leader in assets:
            for follower in assets:
                if leader == follower:
                    continue
                
                # Pre-filter by static correlation (0.30)
                corr = train_returns[leader].corr(train_returns[follower])
                if abs(corr) < correlation_threshold:
                    continue

                # 1. Optimal Lag Discovery (Cross-Correlation, range -10 to +10)
                lags = range(-10, 11)
                cross_corrs = {lag: train_returns[leader].shift(lag).corr(train_returns[follower]) for lag in lags}
                optimal_lag = max(cross_corrs, key=lambda k: abs(cross_corrs[k]))
                max_cross_corr = cross_corrs[optimal_lag]

                # Validate cross-correlation at 0.60 threshold
                if abs(max_cross_corr) < CORR_VALIDATION_THRESHOLD:
                    continue

                # 2. Granger via VAR + AIC (forward direction: leader -> follower)
                p_forward, granger_lag_forward = self._granger_via_var(
                    train_returns[leader], train_returns[follower]
                )
                
                # 3. Granger reverse direction: follower -> leader (for asymmetry check)
                p_reverse, granger_lag_reverse = self._granger_via_var(
                    train_returns[follower], train_returns[leader]
                )

                candidates.append({
                    'Leader': leader,
                    'Follower': follower,
                    'Optimal_Lag': optimal_lag,
                    'Cross_Corr': max_cross_corr,
                    'Granger_P_Forward': p_forward,
                    'Granger_Lag_Forward': granger_lag_forward,
                    'Granger_P_Reverse': p_reverse,
                    'Granger_Lag_Reverse': granger_lag_reverse,
                })

        if not candidates:
            logger.warning("No candidates passed the pre-filter + cross-correlation stage.")
            df_empty = pd.DataFrame()
            os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
            df_empty.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
            return df_empty

        df_candidates = pd.DataFrame(candidates)
        logger.info(f"  Phase 1 complete: {len(df_candidates)} candidates after pre-filter + cross-corr >= {CORR_VALIDATION_THRESHOLD}")

        # Save ALL candidates that passed cross-corr threshold (before BH/asymmetry/stability)
        # This enables building Double/Single tiers from new-threshold data
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_candidates_all.csv"), index=False)
        logger.info(f"  Saved {len(df_candidates)} candidates to leadership_candidates_all.csv")

        # ===== PHASE 2: Benjamini-Hochberg correction on ALL forward p-values =====
        raw_p_values = df_candidates['Granger_P_Forward'].values
        reject_bh, corrected_p, _, _ = multipletests(raw_p_values, alpha=GRANGER_P_THRESHOLD, method='fdr_bh')
        
        df_candidates['Granger_P_Corrected'] = corrected_p
        df_candidates['BH_Significant'] = reject_bh
        
        n_before_bh = len(df_candidates)
        df_candidates = df_candidates[df_candidates['BH_Significant'] == True].copy()
        logger.info(f"  Phase 2 complete: {len(df_candidates)}/{n_before_bh} pairs survived Benjamini-Hochberg correction (alpha={GRANGER_P_THRESHOLD})")

        if df_candidates.empty:
            logger.warning("No pairs survived BH correction.")
            os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
            df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
            return df_candidates

        # ===== PHASE 3: Strict Asymmetry Check =====
        # A→B must be significant (corrected p < 0.05) AND B→A must NOT be significant (raw p > 0.05)
        asymmetric_mask = df_candidates['Granger_P_Reverse'] > GRANGER_P_THRESHOLD
        bidirectional = df_candidates[~asymmetric_mask]
        
        if len(bidirectional) > 0:
            logger.info(f"  ASYMMETRY FILTER: Rejecting {len(bidirectional)} bidirectional (feedback loop) pairs:")
            for _, row in bidirectional.iterrows():
                logger.info(f"    {row['Leader']} <-> {row['Follower']} (p_fwd={row['Granger_P_Corrected']:.4f}, p_rev={row['Granger_P_Reverse']:.4f})")
        
        n_before_asym = len(df_candidates)
        df_candidates = df_candidates[asymmetric_mask].copy()
        logger.info(f"  Phase 3 complete: {len(df_candidates)}/{n_before_asym} pairs are strictly unidirectional")

        if df_candidates.empty:
            logger.warning("No pairs survived asymmetry check.")
            os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
            df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
            return df_candidates

        # ===== PHASE 4: Rolling Stability Validation =====
        stability_rates = []
        for _, row in df_candidates.iterrows():
            rate = self._rolling_stability_check(row['Leader'], row['Follower'], train_returns)
            stability_rates.append(rate)
        
        df_candidates['Stability_Rate'] = stability_rates
        
        n_before_stab = len(df_candidates)
        unstable = df_candidates[df_candidates['Stability_Rate'] < STABILITY_MIN_DETECTION]
        if len(unstable) > 0:
            logger.info(f"  STABILITY FILTER: Rejecting {len(unstable)} temporally unstable pairs (< {STABILITY_MIN_DETECTION*100:.0f}% detection):")
            for _, row in unstable.iterrows():
                logger.info(f"    {row['Leader']} -> {row['Follower']} (stability={row['Stability_Rate']:.1%})")
        
        df_candidates = df_candidates[df_candidates['Stability_Rate'] >= STABILITY_MIN_DETECTION].copy()
        logger.info(f"  Phase 4 complete: {len(df_candidates)}/{n_before_stab} pairs are temporally stable")

        if df_candidates.empty:
            logger.warning("No pairs survived stability check.")
            os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
            df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
            return df_candidates

        # ===== PHASE 5: Composite Score =====
        # Only score pairs where granger_lag_forward > 0 (asymmetry is validated positively)
        scores = []
        for _, row in df_candidates.iterrows():
            if row['Granger_Lag_Forward'] > 0:
                # 50% Granger strength (1 - corrected_p) + 50% Cross-Corr strength
                score = (0.5 * (1 - row['Granger_P_Corrected'])) + (0.5 * abs(row['Cross_Corr']))
            else:
                score = 0.0
            scores.append(score)
        
        df_candidates['Leadership_Score'] = scores
        df_candidates = df_candidates.sort_values(by='Leadership_Score', ascending=False)
        
        # Save final elite results with both raw and corrected p-values for audit
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
        
        # Also copy to daily directory for consistency 
        os.makedirs(os.path.join(RESULTS_DIR, "stats", "daily"), exist_ok=True)
        df_candidates.to_csv(os.path.join(RESULTS_DIR, "stats", "daily", "leadership_hub_rigorous.csv"), index=False)
        
        logger.info(f"===== DISCOVERY COMPLETE =====")
        logger.info(f"  Final validated pairs: {len(df_candidates)}")
        logger.info(f"  Pipeline: Pre-filter -> Cross-Corr(0.60) -> BH Correction -> Asymmetry -> Stability({STABILITY_MIN_DETECTION*100:.0f}%)")
        
        return df_candidates

    def run_all(self, correlation_threshold=CORR_PRE_FILTER):
        """Runs the complete Step 4 suite with banking-grade discovery."""
        logger.info("Starting Leadership Hub pipeline (Banking-Grade)...")
        
        # 1. Regime Detection (fit on train, predict on all)
        self.detect_regimes()
        
        # 2. All-Pairs Discovery Engine (train only)
        df_hub = self.discover_leadership_hub(correlation_threshold=correlation_threshold)
        
        # 3. Visualization: Top Leaders
        if not df_hub.empty:
            top_leaders = df_hub.groupby('Leader')['Leadership_Score'].mean().sort_values(ascending=False).head(10)
            fig, ax = plt.subplots(figsize=(12, 6))
            top_leaders.plot(kind='bar', ax=ax, color='navy')
            ax.set_title("Top 10 Global Leaders (Banking-Grade Composite Score)")
            ax.set_ylabel("Average Leadership Score")
            save_figure(fig, "regimes", "top_leaders_rigorous")
        
        logger.info("Leadership Hub pipeline complete.")
