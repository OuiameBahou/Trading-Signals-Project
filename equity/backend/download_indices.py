"""
Downloads daily OHLC data for 7 major equity indices from Yahoo Finance.
Same date range as FX project: 2019-01-01 to 2025-03-21.
Saves each index as a separate CSV in equity/backend/data/indices/
Format matches Investing.com CSV: Date, Price, Open, High, Low, Vol., Change %
"""
import yfinance as yf
import pandas as pd
import os

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), 'data', 'indices'))
os.makedirs(BASE, exist_ok=True)

INDICES = {
    'SP500':       '^GSPC',
    'NASDAQ100':   '^NDX',
    'DAX':         '^GDAXI',
    'FTSE100':     '^FTSE',
    'CAC40':       '^FCHI',
    'NIKKEI225':   '^N225',
    'EUROSTOXX50': '^STOXX50E',
}

START = '2019-01-01'
END   = '2025-03-21'

for name, ticker in INDICES.items():
    print(f'Downloading {name} ({ticker})...')
    df = yf.download(ticker, start=START, end=END, auto_adjust=True)
    if df.empty:
        print(f'  WARNING: No data for {name}')
        continue

    # Flatten multi-level columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Rename to match Investing.com format that oppt.py expects
    out = pd.DataFrame()
    out.index = df.index
    out['Price'] = df['Close'].round(4)
    out['Open']  = df['Open'].round(4)
    out['High']  = df['High'].round(4)
    out['Low']   = df['Low'].round(4)
    out['Vol.']  = df['Volume'].astype(str)
    out['Change %'] = (df['Close'].pct_change() * 100).round(2).astype(str) + '%'

    # Format date exactly like Investing.com CSVs
    out.index = pd.to_datetime(out.index).strftime('%m/%d/%Y')
    out.index.name = 'Date'

    out_path = os.path.join(BASE, f'{name}.csv')
    out.to_csv(out_path)
    print(f'  Saved {len(out)} rows to {out_path}')

print()
print('Done. Files saved:')
for f in os.listdir(BASE):
    print(f'  {f}')
