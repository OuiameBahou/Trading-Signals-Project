"""
Runs full parameter optimization on each equity index.
Same as FX optimization — grid search over RSI/MACD/BB/SAR/SO params.
Finds optimal parameters per index.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.backtest_engine import run_optimization
import pandas as pd

INDICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indices')
INITIAL_CAPITAL = 10000

indices = [f for f in sorted(os.listdir(INDICES_DIR)) if f.endswith('.csv')]

print('=== PARAMETER OPTIMIZATION — ALL 7 EQUITY INDICES ===')
print('This may take several minutes per index...')
print()

all_results = {}
for fname in indices:
    name = fname.replace('.csv', '')
    path = os.path.join(INDICES_DIR, fname)
    print(f'Optimizing {name}...')
    try:
        results_df, sensitivity_df = run_optimization(
            file_path=path,
            file_type='csv',
            initial_capital=INITIAL_CAPITAL,
            top_n=10,
            max_combinations=1000,
        )
        print(f'  Top 5 results:')
        for _, row in results_df.head(5).iterrows():
            print(f'    Params: {row.get("params","")} | '
                  f'PnL: {row.get("pnl",0):.2f} | '
                  f'Sharpe: {row.get("sharpe_ratio",0):.3f} | '
                  f'Score: {row.get("total_score",0):.3f}')
        all_results[name] = results_df
    except Exception as e:
        print(f'  ERROR: {e}')
    print()

print()
print('=== OPTIMAL PARAMETERS SUMMARY ===')
print(f'{"Index":<20} {"Best Params":<50} {"Sharpe":>8} {"Score":>8}')
print('-' * 90)
for name, df in all_results.items():
    if not df.empty:
        best = df.iloc[0]
        print(f'{name:<20} {str(best.get("params","")):<50} {best.get("sharpe_ratio",0):>8.3f} {best.get("total_score",0):>8.3f}')
