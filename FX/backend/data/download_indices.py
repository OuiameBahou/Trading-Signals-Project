"""
Downloads daily OHLC for 7 major equity indices from Yahoo Finance.
Same date range as FX project: 2019-01-01 to 2025-03-21.
Saves to fx/backend/data/indices/ in Investing.com CSV format.
"""
import yfinance as yf
import pandas as pd
import os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'indices')
os.makedirs(BASE, exist_ok=True)

INDICES = {
    'SP500':        '^GSPC',
    'NASDAQ100':    '^NDX',
    'DAX':          '^GDAXI',
    'FTSE100':      '^FTSE',
    'CAC40':        '^FCHI',
    'NIKKEI225':    '^N225',
    'EUROSTOXX50':  '^STOXX50E',
}

START = '2019-01-01'
END   = '2025-03-21'

for name, ticker in INDICES.items():
    print(f'Downloading {name} ({ticker})...')
    df = yf.download(ticker, start=START, end=END, auto_adjust=True, progress=False)

    if df.empty:
        print(f'  WARNING: No data for {name}')
        continue

    # Flatten multi-level columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Build output in Investing.com format
    out = pd.DataFrame(index=df.index)
    out['Price']    = df['Close'].round(4)
    out['Open']     = df['Open'].round(4)
    out['High']     = df['High'].round(4)
    out['Low']      = df['Low'].round(4)
    out['Vol.']     = df['Volume'].apply(lambda x: f'{int(x):,}' if pd.notna(x) else '0')
    out['Change %'] = (df['Close'].pct_change() * 100).round(2).astype(str) + '%'

    # Format date like Investing.com: MM/DD/YYYY
    out.index = pd.to_datetime(out.index).strftime('%m/%d/%Y')
    out.index.name = 'Date'

    # Drop first row (NaN change %)
    out = out.iloc[1:]

    out_path = os.path.join(BASE, f'{name}.csv')
    out.to_csv(out_path)
    print(f'  Saved {len(out)} rows -> {out_path}')

print()
print('Files in indices folder:')
for f in sorted(os.listdir(BASE)):
    size = os.path.getsize(os.path.join(BASE, f))
    print(f'  {f}  ({size/1024:.1f} KB)')
