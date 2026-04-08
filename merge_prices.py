import pandas as pd
import os

BASE = r'C:\Users\info\Downloads\trading_signals_project\lead_lag\backend'

bb = pd.read_csv(os.path.join(BASE, 'data', 'raw', 'bloomberg_daily_raw.csv'),
                 index_col=0, parse_dates=True)
yh = pd.read_csv(os.path.join(BASE, 'data', 'raw', 'yahoo_daily_raw.csv'),
                 index_col=0, parse_dates=True)

# Merge on date index — outer join to keep all dates
prices = pd.concat([bb, yh], axis=1)

# Forward fill up to 3 days for missing values (weekends, holidays)
prices = prices.ffill(limit=3)

# Remove duplicate columns if any
prices = prices.loc[:, ~prices.columns.duplicated()]

# Sort by date
prices = prices.sort_index()

print(f'Merged price data: {prices.shape}')
print(f'Date range: {prices.index[0]} to {prices.index[-1]}')
print(f'Assets: {prices.columns.tolist()}')
print(f'Missing values per asset:')
print(prices.isnull().sum()[prices.isnull().sum() > 0])

# Save
out_path = os.path.join(BASE, 'data', 'clean', 'price_daily.csv')
prices.to_csv(out_path)
print(f'Saved to {out_path}')
