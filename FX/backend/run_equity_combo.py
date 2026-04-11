"""
Runs exhaustive combination test on all 7 equity indices.
Same as what was done for FX pairs — tests all 192 primary+confirmer combinations.
Reports best strategy per index.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.backtest_engine import run_combination_test
import pandas as pd

INDICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indices')
INITIAL_CAPITAL = 10000

indices = [f for f in sorted(os.listdir(INDICES_DIR)) if f.endswith('.csv')]

print('=== COMBINATION TEST — ALL 7 EQUITY INDICES ===')
print(f'{"Index":<20} {"Best Strategy":<25} {"PnL":>10} {"Trades":>8} {"Sharpe":>8} {"WinRate":>8}')
print('-' * 85)

results = {}
for fname in indices:
    name = fname.replace('.csv', '')
    path = os.path.join(INDICES_DIR, fname)
    try:
        pnl_df, nb_trades_df = run_combination_test(
            file_path=path,
            file_type='csv',
            initial_capital=INITIAL_CAPITAL,
        )
        # Find best by final PnL
        final_pnl = pnl_df.iloc[-1]
        best_col  = final_pnl.idxmax()
        best_pnl  = final_pnl[best_col]
        best_trades = int(nb_trades_df[best_col].iloc[0]) if best_col in nb_trades_df.columns else 0

        # Sharpe for best
        series = pnl_df[best_col]
        daily_ret = series.pct_change().fillna(0)
        sharpe = (daily_ret.mean() / daily_ret.std() * (252**0.5)) if daily_ret.std() > 0 else 0
        trades_arr = series.diff().dropna()
        trades_arr = trades_arr[trades_arr != 0]
        win_rate = float((trades_arr > 0).mean() * 100) if len(trades_arr) > 0 else 0

        print(f'{name:<20} {best_col:<25} {best_pnl:>10.2f} {best_trades:>8} {sharpe:>8.3f} {win_rate:>7.1f}%')
        results[name] = {
            'best_strategy': best_col,
            'best_pnl': best_pnl,
            'trades': best_trades,
            'sharpe': sharpe,
            'win_rate': win_rate,
            'all_strategies': final_pnl.sort_values(ascending=False).head(5).to_dict()
        }
    except Exception as e:
        print(f'{name:<20} ERROR: {e}')

print()
print('=== TOP 5 STRATEGIES PER INDEX ===')
for name, r in results.items():
    print(f'\n{name}:')
    for strat, pnl in r["all_strategies"].items():
        print(f'  {strat:<25} PnL: {pnl:>10.2f}')
