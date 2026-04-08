import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.cluster.hierarchy import dendrogram, linkage
from statsmodels.tsa.stattools import adfuller, kpss
import os
from .config import *
from .utils import setup_logger, save_figure

logger = setup_logger("StaticAnalysis")

class StaticAnalysis:
    """Performs static exploratory data analysis and correlation research."""

    def __init__(self, prices, returns):
        self.prices = prices
        self.returns = returns
        self.corr_matrix = None

    def run_correlation_analysis(self):
        """Calculates and preserves the Pearson correlation matrix."""
        logger.info("Calculating Pearson correlation matrix...")
        self.corr_matrix = self.returns.corr()
        
        # Save results
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        self.corr_matrix.to_csv(os.path.join(RESULTS_DIR, "stats", "corr_matrix_daily.csv"))
        
        # Visualization
        fig, ax = plt.subplots(figsize=(16, 12))
        sns.heatmap(self.corr_matrix, annot=False, cmap='coolwarm', center=0, ax=ax)
        ax.set_title("Static Pearson Correlation Matrix (Daily Returns)")
        save_figure(fig, "corr", "correlation_heatmap_daily")
        return self.corr_matrix

    def run_clustering(self):
        """Performs hierarchical clustering to group similar assets."""
        logger.info("Performing hierarchical clustering...")
        # Use (1 - correlation) as distance metric
        dist = 1 - self.corr_matrix
        linkage_matrix = linkage(dist, method='ward')
        
        fig, ax = plt.subplots(figsize=(15, 8))
        dendrogram(linkage_matrix, labels=self.corr_matrix.columns, leaf_rotation=90, ax=ax)
        ax.set_title("Hierarchical Clustering Dendrogram (Asset Families)")
        save_figure(fig, "corr", "asset_dendrogram")
        return linkage_matrix

    def check_stationarity(self):
        """Runs ADF and KPSS tests to ensure statistical validity of returns.
        Returns the DataFrame of results AND logs excluded (non-stationary) assets."""
        logger.info("Running stationarity tests (ADF & KPSS)...")
        results = []
        for col in self.returns.columns:
            # ADF Test
            adf_res = adfuller(self.returns[col].dropna())
            # KPSS Test
            kpss_res = kpss(self.returns[col].dropna())
            
            results.append({
                'Asset': col,
                'ADF_Stat': adf_res[0],
                'ADF_P': adf_res[1],
                'KPSS_Stat': kpss_res[0],
                'KPSS_P': kpss_res[1],
                'Is_Stationary': adf_res[1] < 0.05 and kpss_res[1] > 0.05
            })
        
        df_results = pd.DataFrame(results)
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        df_results.to_csv(os.path.join(RESULTS_DIR, "stats", "stationarity_tests.csv"), index=False)
        
        # Log excluded assets explicitly
        excluded = df_results[df_results['Is_Stationary'] == False]['Asset'].tolist()
        stationary = df_results[df_results['Is_Stationary'] == True]['Asset'].tolist()
        if excluded:
            logger.warning(f"STATIONARITY FILTER: {len(excluded)} assets EXCLUDED (non-stationary): {excluded}")
        logger.info(f"STATIONARITY FILTER: {len(stationary)} assets PASSED and will proceed to Granger/VAR.")
        
        return df_results
    
    def get_stationary_assets(self):
        """Returns list of asset names that pass both ADF and KPSS stationarity tests.
        This is used as a BLOCKING FILTER before Granger/VAR analyses."""
        df_stat = self.check_stationarity()
        stationary_assets = df_stat[df_stat['Is_Stationary'] == True]['Asset'].tolist()
        return stationary_assets

    def plot_normalized_prices(self):
        """Plots cumulative returns (normalized base) for comparison."""
        logger.info("Plotting normalized performance comparison...")
        norm_prices = (1 + self.returns).cumprod()
        
        fig, ax = plt.subplots(figsize=(15, 8))
        norm_prices.plot(ax=ax, legend=False, alpha=0.6)
        ax.set_title("Normalized Performance (Base 1.0)")
        ax.set_yscale('log')
        # Only show top/interesting legends or move to separate file if too many
        save_figure(fig, "corr", "normalized_performance")

    def run_all(self):
        """Runs the complete static analysis suite.
        Returns list of stationary assets for downstream pipeline filtering."""
        logger.info("Starting complete Static Analysis suite...")
        self.run_correlation_analysis()
        self.run_clustering()
        stationary_assets = self.get_stationary_assets()
        self.plot_normalized_prices()
        logger.info("Static Analysis suite complete.")
        return stationary_assets
