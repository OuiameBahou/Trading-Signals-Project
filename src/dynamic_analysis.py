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
    """Performs dynamic time-series analysis including rolling correlations and causality."""

    def __init__(self, prices, returns):
        self.prices = prices
        self.returns = returns

    def run_rolling_correlations(self, asset_pairs):
        """Calculates rolling correlations for specific lead-lag asset pairs."""
        logger.info(f"Calculating rolling correlations for {len(asset_pairs)} pairs...")
        for leader, follower in asset_pairs:
            fig, ax = plt.subplots(figsize=(12, 6))
            for window in ROLLING_WINDOWS:
                roll_corr = self.returns[leader].rolling(window=window).corr(self.returns[follower])
                ax.plot(roll_corr, label=f'{window}d Window')
            
            ax.set_title(f"Rolling Correlation: {leader} (Lead?) vs {follower} (Follower?)")
            ax.legend()
            save_figure(fig, "rolling", f"rolling_corr_{leader}_{follower}")

    def test_granger_causality(self, asset_pairs):
        """Runs pairwise Granger Causality tests across multiple lags."""
        logger.info("Testing Granger Causality for provided pairs...")
        results = []
        for leader, follower in asset_pairs:
            # Test if leader causes follower
            # Data must be 2-column: [follower, leader]
            test_data = self.returns[[follower, leader]].to_numpy()
            try:
                gc_res = grangercausalitytests(test_data, maxlag=GRANGER_MAX_LAGS, verbose=False)
                # Extract p-values for SSR F-test
                p_values = [gc_res[i][0]['ssr_ftest'][1] for i in range(1, GRANGER_MAX_LAGS + 1)]
                min_p = min(p_values)
                best_lag = np.argmin(p_values) + 1
                
                results.append({
                    'Leader': leader,
                    'Follower': follower,
                    'Min_P_Value': min_p,
                    'Best_Lag': best_lag,
                    'Is_Significant': min_p < 0.05
                })
            except Exception as e:
                logger.error(f"Granger test failed for {leader}->{follower}: {e}")
        
        df_results = pd.DataFrame(results)
        df_results.to_csv(os.path.join(RESULTS_DIR, "stats", "granger_causality_results.csv"), index=False)
        return df_results

    def run_var_analysis(self, asset_groups):
        """Estimates VAR models for subgroups of assets and extracts IRF."""
        logger.info(f"Running VAR analysis for {len(asset_groups)} groups...")
        for i, group in enumerate(asset_groups):
            try:
                model = VAR(self.returns[group])
                results = model.fit(maxlags=GRANGER_MAX_LAGS, ic=VAR_CRITERION)
                
                # Impulse Response Function (IRF)
                irf = results.irf(10)
                fig = irf.plot(orth=True)
                # Cleanup fig slightly for better titles
                fig.suptitle(f"VAR Impulse Response Functions - Group {i+1}", fontsize=16)
                save_figure(fig, "rolling", f"var_irf_group_{i+1}")
                
                # Variance Decomposition
                fevd = results.fevd(10)
                fig_fevd = fevd.plot()
                save_figure(fig_fevd, "rolling", f"var_fevd_group_{i+1}")
                
            except Exception as e:
                logger.error(f"VAR analysis failed for group {i}: {e}")

    def run_all(self):
        """Executes a sample dynamic suite. In reality, asset_pairs would be high-corr ones."""
        logger.info("Starting Dynamic & Causal Analysis...")
        
        # Select some sample high-correlation pairs from static analysis (if we had it here)
        # For now, we take some known relationships as example
        sample_pairs = [('SP500', 'NASDAQ100'), ('GOLD', 'SILVER'), ('EURUSD', 'USDJPY')]
        self.run_rolling_correlations(sample_pairs)
        self.test_granger_causality(sample_pairs)
        
        # Sample VAR group (e.g., Equity Indices)
        equity_group = ['SP500', 'NASDAQ100', 'DAX', 'CAC40']
        self.run_var_analysis([equity_group])
        
        logger.info("Dynamic Analysis suite complete.")
