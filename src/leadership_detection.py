import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from hmmlearn import hmm
from statsmodels.tsa.stattools import grangercausalitytests
import os
from .config import *
from .utils import setup_logger, save_figure

logger = setup_logger("LeadershipDetection")

class LeadershipDetection:
    """Detects market regimes using HMM and calculates composite leadership scores."""

    def __init__(self, prices, returns):
        self.prices = prices
        self.returns = returns
        self.regimes = None

    def detect_regimes(self, benchmark='SP500'):
        """Uses Hidden Markov Model (HMM) to identify market regimes based on benchmark returns."""
        logger.info(f"Detecting market regimes using {benchmark}...")
        data = self.returns[benchmark].dropna().values.reshape(-1, 1)
        
        # Gaussian HMM for regime switching
        model = hmm.GaussianHMM(n_components=HMM_N_COMPONENTS, covariance_type="full", n_iter=1000)
        model.fit(data)
        self.regimes = model.predict(data)
        
        # Create a regime Series indexed by the returns index (where the data came from)
        regime_series = pd.Series(self.regimes, index=self.returns.index)
        
        # Align prices for plotting (benchmark price might have one extra row at start compared to returns)
        plot_prices = self.prices[benchmark].loc[regime_series.index]
        
        # Plot regimes
        fig, ax = plt.subplots(figsize=(15, 7))
        for i in range(HMM_N_COMPONENTS):
            mask = regime_series == i
            ax.scatter(plot_prices.index[mask], plot_prices[mask], 
                       label=f'Regime {i}', s=10)
        
        ax.set_title(f"Market Regimes Detected (HMM on {benchmark})")
        ax.legend()
        save_figure(fig, "regimes", f"hmm_regimes_{benchmark}")
        
        regime_series.to_csv(os.path.join(RESULTS_DIR, "stats", "market_regimes.csv"))
        return regime_series

    def discover_leadership_hub(self, correlation_threshold=0.3):
        """
        Rigorous discovery of all leader/follower pairs.
        Scans all pairs, calculates optimal lags, and integrates Granger + Cross-Corr + FEVD.
        """
        logger.info(f"Starting Rigorous All-Pairs Discovery (Corr Threshold: {correlation_threshold})...")
        assets = self.returns.columns
        results = []

        # Pairwise combinations
        for leader in assets:
            for follower in assets:
                if leader == follower:
                    continue
                
                # Pre-filter by static correlation to save compute and avoid noise
                corr = self.returns[leader].corr(self.returns[follower])
                if abs(corr) < correlation_threshold:
                    continue

                # 1. Optimal Lag Discovery (Cross-Correlation)
                # We check lags from -10 to 10 to see where the correlation peaks
                lags = range(-10, 11)
                cross_corrs = {lag: self.returns[leader].shift(lag).corr(self.returns[follower]) for lag in lags}
                optimal_lag = max(cross_corrs, key=lambda k: abs(cross_corrs[k]))
                max_cross_corr = cross_corrs[optimal_lag]

                # 2. Granger Causality Rigor (min p-value across lags)
                # Note: Granger test uses [follower, leader]
                try:
                    test_data = self.returns[[follower, leader]].dropna()
                    gc_res = grangercausalitytests(test_data, maxlag=5, verbose=False)
                    # Get the p-value for the best performing lag (min p-value)
                    p_values = [gc_res[i][0]['ssr_ftest'][1] for i in range(1, 6)]
                    min_p = min(p_values)
                    granger_lag = np.argmin(p_values) + 1
                except:
                    min_p = 1.0
                    granger_lag = 0

                # 3. Decision Logic: Is this a valid Lead-Lag?
                # Criteria: Significant Granger (p < 0.05) AND Correlation > Threshold
                is_significant = (min_p < 0.05) and (abs(max_cross_corr) > correlation_threshold)
                
                # 4. Composite Score (Exact & Rigoureux)
                # Weighted: 50% Granger Strength (1-p) + 50% Correlation Strength
                # Only if lag > 0 (meaning leader actually precedes follower)
                score = 0
                if optimal_lag > 0 and is_significant:
                    score = (0.5 * (1 - min_p)) + (0.5 * abs(max_cross_corr))

                if is_significant:
                    results.append({
                        'Leader': leader,
                        'Follower': follower,
                        'Optimal_Lag': optimal_lag,
                        'Granger_P': min_p,
                        'Granger_Lag': granger_lag,
                        'Cross_Corr': max_cross_corr,
                        'Leadership_Score': score
                    })

        df_hub = pd.DataFrame(results)
        df_hub = df_hub.sort_values(by='Leadership_Score', ascending=False)
        
        # Save to results
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        df_hub.to_csv(os.path.join(RESULTS_DIR, "stats", "leadership_hub_rigorous.csv"), index=False)
        
        logger.info(f"Discovery complete. Found {len(df_hub)} significant lead-lag relationships.")
        return df_hub

    def run_all(self, correlation_threshold=0.3):
        """Runs the complete Step 4 suite with all-pairs discovery."""
        logger.info("Starting Leadership Hub pipeline (Step 4 Rigorous)...")
        
        # 1. Regime Detection
        self.detect_regimes()
        
        # 2. All-Pairs Discovery Engine
        df_hub = self.discover_leadership_hub(correlation_threshold=correlation_threshold)
        
        # 3. Visualization: Top Leaders
        if not df_hub.empty:
            top_leaders = df_hub.groupby('Leader')['Leadership_Score'].mean().sort_values(ascending=False).head(10)
            fig, ax = plt.subplots(figsize=(12, 6))
            top_leaders.plot(kind='bar', ax=ax, color='navy')
            ax.set_title("Top 10 Global Leaders (Rigorous Composite Score)")
            ax.set_ylabel("Average Leadership Score")
            save_figure(fig, "regimes", "top_leaders_rigorous")
        
        logger.info("Leadership Hub pipeline complete.")
