import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from statsmodels.tsa.stattools import grangercausalitytests
from statsmodels.tsa.api import VAR
import os
from .config import *
from .utils import setup_logger, save_figure

logger = setup_logger("DynamicAnalysis")

class DynamicAnalysis:
    """Performs dynamic time-series analysis including rolling correlations and causality.
    
    Banking-grade: 
    - Accepts stationary_assets filter to exclude non-stationary series
    - All model fitting uses TRAIN period only
    - VAR Cholesky normalization (1σ) is unchanged
    """

    def __init__(self, prices, returns, stationary_assets=None):
        self.prices = prices
        self.returns = returns
        
        # Apply stationarity blocking filter
        if stationary_assets is not None:
            excluded = [c for c in self.returns.columns if c not in stationary_assets]
            if excluded:
                logger.warning(f"STATIONARITY BLOCKING FILTER: Excluding {len(excluded)} non-stationary assets from DynamicAnalysis: {excluded}")
            self.returns = self.returns[[c for c in self.returns.columns if c in stationary_assets]]
            self.prices = self.prices[[c for c in self.prices.columns if c in stationary_assets]]
            logger.info(f"DynamicAnalysis proceeding with {len(self.returns.columns)} stationary assets.")

    def _get_train_returns(self):
        """Returns data filtered to TRAIN period."""
        return self.returns.loc[TRAIN_START_DATE:TRAIN_END_DATE]

    def run_rolling_correlations(self, asset_pairs):
        """Calculates rolling correlations for specific lead-lag asset pairs (on TRAIN data)."""
        logger.info(f"Calculating rolling correlations for {len(asset_pairs)} pairs (train period)...")
        train_returns = self._get_train_returns()
        for leader, follower in asset_pairs:
            if leader not in train_returns.columns or follower not in train_returns.columns:
                logger.warning(f"Skipping {leader}->{follower}: one or both excluded by stationarity filter.")
                continue
            fig, ax = plt.subplots(figsize=(12, 6))
            for window in ROLLING_WINDOWS:
                roll_corr = train_returns[leader].rolling(window=window).corr(train_returns[follower])
                ax.plot(roll_corr, label=f'{window}d Window')
            
            ax.set_title(f"Rolling Correlation: {leader} (Lead?) vs {follower} (Follower?)")
            ax.legend()
            save_figure(fig, "rolling", f"rolling_corr_{leader}_{follower}")

    def test_granger_causality(self, asset_pairs):
        """Runs pairwise Granger Causality tests via VAR + AIC on TRAIN data."""
        logger.info("Testing Granger Causality for provided pairs (train period, VAR+AIC)...")
        train_returns = self._get_train_returns()
        results = []
        for leader, follower in asset_pairs:
            if leader not in train_returns.columns or follower not in train_returns.columns:
                logger.warning(f"Skipping Granger {leader}->{follower}: excluded by stationarity filter.")
                continue
            
            test_data = train_returns[[follower, leader]].dropna()
            try:
                model = VAR(test_data)
                lag_order = model.select_order(maxlags=GRANGER_MAX_LAGS)
                optimal_lag = max(lag_order.aic, 1)
                
                var_results = model.fit(optimal_lag)
                gc_test = var_results.test_causality(follower, causing=leader, kind='f')
                
                results.append({
                    'Leader': leader,
                    'Follower': follower,
                    'P_Value': gc_test.pvalue,
                    'Best_Lag_AIC': optimal_lag,
                    'Is_Significant': gc_test.pvalue < GRANGER_P_THRESHOLD
                })
            except Exception as e:
                logger.error(f"Granger test failed for {leader}->{follower}: {e}")
        
        df_results = pd.DataFrame(results)
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        df_results.to_csv(os.path.join(RESULTS_DIR, "stats", "granger_causality_results.csv"), index=False)
        return df_results

    def run_var_analysis(self, asset_groups):
        """Estimates VAR models for subgroups of assets and extracts IRF.
        Fitted on TRAIN period only. Cholesky normalization (1σ) unchanged."""
        logger.info(f"Running VAR analysis for {len(asset_groups)} groups (train period)...")
        train_returns = self._get_train_returns()
        for i, group in enumerate(asset_groups):
            # Filter group to only include stationary assets
            valid_group = [a for a in group if a in train_returns.columns]
            if len(valid_group) < 2:
                logger.warning(f"VAR group {i+1} has < 2 stationary assets after filtering. Skipping.")
                continue
            
            try:
                model = VAR(train_returns[valid_group])
                results = model.fit(maxlags=GRANGER_MAX_LAGS, ic=VAR_CRITERION)
                
                # Impulse Response Function (IRF) — Cholesky 1σ normalization (orth=True)
                irf = results.irf(10)
                fig = irf.plot(orth=True)
                fig.suptitle(f"VAR Impulse Response Functions - Group {i+1}", fontsize=16)
                save_figure(fig, "rolling", f"var_irf_group_{i+1}")
                
                # Variance Decomposition
                fevd = results.fevd(10)
                fig_fevd = fevd.plot()
                save_figure(fig_fevd, "rolling", f"var_fevd_group_{i+1}")
                
            except Exception as e:
                logger.error(f"VAR analysis failed for group {i}: {e}")

    def run_all(self):
        """Executes the dynamic suite on TRAIN data with stationarity filtering."""
        logger.info("Starting Dynamic & Causal Analysis (Banking-Grade)...")
        
        train_returns = self._get_train_returns()
        available = train_returns.columns.tolist()
        
        # Build sample pairs from available (stationary) assets
        sample_pairs = []
        candidate_pairs = [('SP500', 'NASDAQ100'), ('GOLD', 'SILVER'), ('EURUSD', 'USDJPY')]
        for l, f in candidate_pairs:
            if l in available and f in available:
                sample_pairs.append((l, f))
        
        if sample_pairs:
            self.run_rolling_correlations(sample_pairs)
            self.test_granger_causality(sample_pairs)
        else:
            logger.warning("No sample pairs available after stationarity filter.")
        
        # Sample VAR group (filter to available assets)
        equity_group = [a for a in ['SP500', 'NASDAQ100', 'DAX', 'CAC40'] if a in available]
        if len(equity_group) >= 2:
            self.run_var_analysis([equity_group])
        else:
            logger.warning("Not enough stationary equity assets for VAR group.")
        
        logger.info("Dynamic Analysis suite complete.")
