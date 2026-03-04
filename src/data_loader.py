import pandas as pd
import numpy as np
import yfinance as yf
from scipy.stats import jarque_bera, shapiro
from .config import *
from .utils import setup_logger

logger = setup_logger("DataLoader")

class DataLoader:
    """Handles professional financial data ingestion, cleaning, and transformation."""

    def __init__(self):
        self.raw_data = None
        self.clean_data = None
        self.returns = None

    def load_bloomberg(self):
        """Parses the specific Bloomberg Excel spreadsheet format."""
        logger.info(f"Loading Bloomberg data from {BLOOMBERG_FILE}")
        try:
            xl = pd.read_excel(BLOOMBERG_FILE, sheet_name=None)
            series_list = []
            
            for sheet, name in BLOOMBERG_DAILY.items():
                df = xl[sheet].copy()
                header_row = next((i for i, val in enumerate(df.iloc[:, 0]) if str(val).strip().lower() == 'date'), None)
                
                if header_row is not None:
                    df.columns = df.iloc[header_row]
                    df = df.iloc[header_row + 1:].copy()
                    df = df[['Date', 'PX_LAST']].dropna(subset=['Date', 'PX_LAST'])
                    df['Date'] = pd.to_datetime(df['Date'])
                    df['PX_LAST'] = pd.to_numeric(df['PX_LAST'], errors='coerce')
                    s = df.dropna().set_index('Date').sort_index()['PX_LAST']
                    s.name = name
                    series_list.append(s)
                else:
                    logger.warning(f"Header 'Date' not found in sheet {sheet}")
            
            return pd.concat(series_list, axis=1)
        except Exception as e:
            logger.error(f"Failed to load Bloomberg data: {e}")
            return pd.DataFrame()

    def load_yahoo(self):
        """Downloads historical data from Yahoo Finance based on config tickers."""
        logger.info(f"Downloading Yahoo Finance data for {len(YAHOO_TICKERS)} tickers...")
        try:
            tickers = list(YAHOO_TICKERS.values())
            raw = yf.download(tickers, start=START_DATE, end=END_DATE, auto_adjust=True, progress=False)
            close = raw['Close'].copy()
            ticker_to_name = {v: k for k, v in YAHOO_TICKERS.items()}
            close = close.rename(columns=ticker_to_name)
            close.index = pd.to_datetime(close.index)
            return close
        except Exception as e:
            logger.error(f"Yahoo Finance download failed: {e}")
            return pd.DataFrame()

    def clean_pipeline(self, df):
        """Rigorous cleaning pipeline: alignment, outlier detection, and interpolation."""
        logger.info("Starting cleaning pipeline...")
        
        # 1. Temporal Alignment & Basic Cleaning
        df = df.sort_index().loc[START_DATE:END_DATE]
        # Remove rows where too many assets are missing (likely holidays)
        thresh = int(df.shape[1] * 0.5)
        df = df.dropna(thresh=thresh)

        # 2. Outlier Detection (Z-Score method)
        # We check log returns for spikes as prices are non-stationary
        rets_temp = np.log(df / df.shift(1))
        for col in rets_temp.columns:
            z_score = (rets_temp[col] - rets_temp[col].mean()) / rets_temp[col].std()
            outliers = np.abs(z_score) > OUTLIER_THRESHOLD_Z
            if outliers.any():
                logger.info(f"Detected {outliers.sum()} outliers in {col}")
                # Mask price in original df for outliers in returns
                df.loc[outliers[outliers].index, col] = np.nan

        # 3. Gap Filling (Forward fill then Backward fill for remaining)
        df = df.ffill(limit=CLEANING_FFILL_LIMIT).bfill(limit=CLEANING_FFILL_LIMIT)
        
        # Final check for hard-to-clean NaNs
        remaining_nan = df.isna().sum().sum()
        if remaining_nan > 0:
            logger.warning(f"Still {remaining_nan} NaNs remaining after cleaning. Forcing interpolation.")
            df = df.interpolate(method='linear')

        return df

    def validate_data(self, df):
        """Performs statistical validation tests (Jarque-Bera, Shapiro-Wilk)."""
        logger.info("Validating data integrity and normality...")
        rets = np.log(df / df.shift(1)).dropna()
        stats = []
        for col in rets.columns:
            jb_stat, jb_p = jarque_bera(rets[col])
            sw_stat, sw_p = shapiro(rets[col])
            stats.append({
                'Asset': col,
                'JB_Stat': jb_stat, 'JB_P': jb_p,
                'SW_Stat': sw_stat, 'SW_P': sw_p,
                'Is_Normal': jb_p > 0.05
            })
        return pd.DataFrame(stats)

    def run_all(self):
        """Runs the full data engineering pipeline."""
        df_bbg = self.load_bloomberg()
        df_yahoo = self.load_yahoo()
        
        merged = pd.concat([df_bbg, df_yahoo], axis=1)
        self.clean_data = self.clean_pipeline(merged)
        
        # Calculate Returns
        self.returns = np.log(self.clean_data / self.clean_data.shift(1)).dropna()
        
        # Validation
        v_report = self.validate_data(self.clean_data)
        os.makedirs(os.path.join(RESULTS_DIR, "stats"), exist_ok=True)
        v_report.to_csv(os.path.join(RESULTS_DIR, "stats", "normality_tests.csv"), index=False)
        
        # Save results
        os.makedirs(DATA_CLEAN_DIR, exist_ok=True)
        self.clean_data.to_csv(os.path.join(DATA_CLEAN_DIR, "price_daily.csv"))
        self.returns.to_csv(os.path.join(DATA_CLEAN_DIR, "returns_daily.csv"))
        
        logger.info(f"Pipeline complete. Shape: {self.clean_data.shape}")
        return self.clean_data, self.returns
