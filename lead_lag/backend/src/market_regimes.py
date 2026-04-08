import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from hmmlearn import hmm
from .config import *
from .utils import setup_logger, save_figure

logger = setup_logger("MarketRegimes")

class MarketRegimes:
    """
    Step 4: Identification des régimes de marché et stabilité des relations.
    Uses HMM and VIX/ATR proxies to detect Bull, Bear, Volatile, Range regimes.
    
    Banking-grade: HMM is FIT on TRAIN period only, then PREDICTS on full period (including test).
    """
    
    def __init__(self, prices, returns):
        self.prices = prices
        self.returns = returns
        self.regime_series = None
        self.regime_labels = None
        
    def calculate_atr(self, asset='SP500', window=14):
        """Proxy for ATR using rolling volatility."""
        return self.returns[asset].rolling(window=window).std() * np.sqrt(252)
        
    def detect_pair_regimes(self, pairs_df=None):
        """
        Runs HMM Regime detection specifically tailored for each valid asset pair.
        HMM is FIT on TRAIN period only, then PREDICTS on full period.
        """
        logger.info(f"Detecting market regimes per pair (HMM fit on train: {TRAIN_START_DATE} to {TRAIN_END_DATE})...")
        
        if pairs_df is None:
            pairs_path = os.path.join(RESULTS_DIR, "stats", "daily", "official_leader_follower_pairs.csv")
            if not os.path.exists(pairs_path):
                logger.warning(f"Pairs file not found at {pairs_path}. Run previous steps first.")
                return None
            try:
                pairs_df = pd.read_csv(pairs_path)
            except Exception as e:
                logger.warning(f"Could not read pairs file: {e}")
                return None
        
        if pairs_df.empty or 'Leader' not in pairs_df.columns:
            logger.warning("Pairs file is empty or missing 'Leader' column. No regimes to detect.")
            return None

        all_pair_regimes = []
        os.makedirs(os.path.join(RESULTS_DIR, "stats", "regimes", "pairs"), exist_ok=True)

        unique_leaders = pairs_df['Leader'].unique()
        
        for leader in unique_leaders:
            if leader not in self.returns.columns:
                continue
                
            logger.info(f"Detecting specific HMM regimes for Leader: {leader}")
            
            # Full data and train-only data
            full_data = self.returns[leader].dropna()
            train_data = full_data.loc[TRAIN_START_DATE:TRAIN_END_DATE]
            
            # Calculate volatility on full period
            volatility_full = full_data.rolling(window=21).std() * np.sqrt(252)
            volatility_train = train_data.rolling(window=21).std() * np.sqrt(252)
            
            # Valid indices for train (for fitting)
            train_valid_idx = volatility_train.dropna().index
            if len(train_valid_idx) < 50:
                continue
            
            # Valid indices for full period (for prediction)
            full_valid_idx = volatility_full.dropna().index
                
            X_train = np.column_stack([train_data.loc[train_valid_idx], volatility_train.loc[train_valid_idx]])
            X_full = np.column_stack([full_data.loc[full_valid_idx], volatility_full.loc[full_valid_idx]])
            
            n_components = min(4, HMM_N_COMPONENTS + 1)
            model = hmm.GaussianHMM(n_components=n_components, covariance_type="full", n_iter=1000, random_state=42)
            
            try:
                # FIT on TRAIN only
                model.fit(X_train)
                # PREDICT on FULL period (including test)
                regimes = model.predict(X_full)
            except Exception as e:
                logger.warning(f"HMM fit failed for {leader}. Using basic volatility quantiles on full period.")
                regimes = pd.qcut(volatility_full.loc[full_valid_idx], q=4, labels=False, duplicates='drop').values
                n_components = len(np.unique(regimes))
                
            regime_series = pd.Series(regimes, index=full_valid_idx)
            
            # Label regimes based on statistics (computed on train to avoid look-ahead)
            train_regime_mask = regime_series.index.isin(train_valid_idx)
            regime_stats = []
            for i in range(n_components):
                mask = (regime_series == i) & train_regime_mask
                if mask.sum() == 0:
                    regime_stats.append({'Regime': i, 'Mean_Return': 0, 'Volatility': 0})
                    continue
                regime_stats.append({
                    'Regime': i,
                    'Mean_Return': full_data.loc[regime_series.index][mask].mean() * 252,
                    'Volatility': volatility_full.loc[regime_series.index][mask].mean()
                })
                
            stats_df = pd.DataFrame(regime_stats)
            if stats_df.empty:
                continue
                
            stats_df = stats_df.sort_values(by='Volatility', ascending=False)
            high_vol_regime = stats_df.iloc[0]['Regime']
            
            labels = {high_vol_regime: 'High Volatility'}
            if len(stats_df) > 1:
                remaining = stats_df.iloc[1:].sort_values(by='Mean_Return', ascending=False)
                labels[remaining.iloc[0]['Regime']] = 'Bull'
                labels[remaining.iloc[-1]['Regime']] = 'Bear'
                if len(remaining) > 2:
                    labels[remaining.iloc[1]['Regime']] = 'Range'
                    
            # Set default for any missing label
            for i in range(n_components):
                if i not in labels:
                    labels[i] = 'Range'

            labeled_series = regime_series.map(labels)
            
            # Save individual leader regime
            labeled_series.rename("Regime").to_csv(os.path.join(RESULTS_DIR, "stats", "regimes", "pairs", f"regime_{leader}.csv"))
            
            # Attach back to pairs
            follower_pairs = pairs_df[pairs_df['Leader'] == leader]['Follower'].tolist()
            for follower in follower_pairs:
                latest_regime = labeled_series.iloc[-1] if not labeled_series.empty else "Unknown"
                all_pair_regimes.append({
                    'Leader': leader,
                    'Follower': follower,
                    'Current_Regime': latest_regime
                })

        # Save summary of current regimes for all pairs
        df_summary = pd.DataFrame(all_pair_regimes)
        summary_path = os.path.join(RESULTS_DIR, "stats", "regimes", "pairs_current_regimes.csv")
        df_summary.to_csv(summary_path, index=False)
        logger.info(f"Saved pair regimes summary to {summary_path}")
        
        return df_summary

    def run_all(self):
        logger.info("--- Starting Advanced Regime Detection per Validated Pair (HMM fit on TRAIN only) ---")
        regimes = self.detect_pair_regimes()
        logger.info("Advanced pair regimes completed.")
        return regimes
