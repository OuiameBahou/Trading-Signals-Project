import os

# --- PROJECT SETTINGS ---
PROJECT_NAME = "trading_signals_project"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
DATA_CLEAN_DIR = os.path.join(BASE_DIR, "data", "clean")
FIGURES_DIR = os.path.join(BASE_DIR, "figures")
RESULTS_DIR = os.path.join(BASE_DIR, "results")
STATS_DIR = os.path.join(RESULTS_DIR, "stats")
STATS_DAILY = os.path.join(STATS_DIR, "daily")
STATS_WEEKLY = os.path.join(STATS_DIR, "weekly")

# --- DATE SETTINGS ---
START_DATE = '2015-01-01'
END_DATE = '2026-01-01'

# --- TRAIN / TEST SPLIT ---
TRAIN_START_DATE = '2015-01-01'
TRAIN_END_DATE = '2022-12-31'
TEST_START_DATE = '2023-01-01'
TEST_END_DATE = '2026-01-01'

# --- DATA SOURCE SETTINGS ---
# Bloomberg Excel File path
BLOOMBERG_FILE = r"C:\Users\info\Downloads\Data rates (1).xlsx"

# Mapping for Bloomberg sheets
BLOOMBERG_DAILY = {
    'TY D': 'TY_US10Y',
    'RX D': 'RX_BUND',
    'G D': 'G_GILT',
    'OAT D': 'OAT_FRANCE',
    'Zinc D': 'ZINC',
    'Lead D': 'LEAD',
}

# Yahoo Finance Tickers
YAHOO_TICKERS = {
    # -- Indices --
    'SP500': '^GSPC',
    'NASDAQ100': '^NDX',
    'DOWJONES': '^DJI',
    'EUROSTOXX50': '^STOXX50E',
    'DAX': '^GDAXI',
    'FTSE100': '^FTSE',
    'CAC40': '^FCHI',
    'NIKKEI225': '^N225',
    'HANGSENG': '^HSI',
    'ASX200': '^AXJO',
    'RUSSELL2000': '^RUT',
    'VIX': '^VIX',
    # -- FX G10 --
    'EURUSD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X',
    'USDJPY': 'USDJPY=X',
    'USDCHF': 'USDCHF=X',
    'USDCAD': 'USDCAD=X',
    'AUDUSD': 'AUDUSD=X',
    'NZDUSD': 'NZDUSD=X',
    'USDNOK': 'USDNOK=X',
    'USDSEK': 'USDSEK=X',
    'EURGBP': 'EURGBP=X',
    'EURJPY': 'EURJPY=X',
    'GBPJPY': 'GBPJPY=X',
    'AUDJPY': 'AUDJPY=X',
    'EURCHF': 'EURCHF=X',
    # -- Commodities --
    'GOLD': 'GC=F',
    'SILVER': 'SI=F',
    'WTI_CRUDE': 'CL=F',
    'BRENT_CRUDE': 'BZ=F',
    'NAT_GAS': 'NG=F',
    'COPPER': 'HG=F',
    'PLATINUM': 'PL=F',
}

# --- PARAMETERS ---
CLEANING_FFILL_LIMIT = 3
OUTLIER_THRESHOLD_Z = 5  # Quant standards for outlier detection (sigma)
ROLLING_WINDOWS = [30, 60, 90, 120]
GRANGER_MAX_LAGS = 10
VAR_CRITERION = 'aic'
HMM_N_COMPONENTS = 3  # Standard for regime detection: Bullish, Bearish, Volatile

# --- BANKING-GRADE THRESHOLDS ---
CORR_PRE_FILTER = 0.30        # Static correlation pre-filter (unchanged)
CORR_VALIDATION_THRESHOLD = 0.55  # Final cross-correlation validation threshold
GRANGER_P_THRESHOLD = 0.05   # Significance level for Granger (applied after BH correction)
STABILITY_WINDOW_DAYS = 252   # Rolling window size for stability check (~1 year)
STABILITY_CORR_THRESHOLD = 0.45  # Correlation threshold within rolling windows
STABILITY_MIN_DETECTION = 0.60  # Minimum fraction of windows where lead-lag must be detected
