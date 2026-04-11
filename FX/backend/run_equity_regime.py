"""
Runs regime strategy optimization on each equity index.
Same theta x eps grid search as FX regime notebook.
Finds optimal theta and eps per index.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.regime_engine import run_regime_optimize, run_regime_backtest
import pandas as pd

INDICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indices')
INITIAL_CAPITAL = 10000

WEIGHTS = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}
CONFIRMED = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']
STP = 3.0
TP  = 3.0

indices = [f for f in sorted(os.listdir(INDICES_DIR)) if f.endswith('.csv')]

print('=== REGIME OPTIMIZATION — ALL 7 EQUITY INDICES ===')
print()

optimal_params = {}
for fname in indices:
    name = fname.replace('.csv', '')
    path = os.path.join(INDICES_DIR, fname)
    print(f'Regime optimizing {name}...')
    try:
        total_returns, theta_values, eps_values, best_theta, best_eps = run_regime_optimize(
            file_path=path,
            file_type='csv',
            initial_capital=INITIAL_CAPITAL,
            theta_range=(0.1, 0.6, 6),
            eps_range=(0.01, 12.0, 20),
            confirmed_indicators=CONFIRMED,
            weights_dict=WEIGHTS,
        )
        optimal_params[name] = {'theta': best_theta, 'eps': best_eps}
        print(f'  Best theta={best_theta:.4f}, eps={best_eps:.6f}')

        # Run backtest with optimal params
        bt = run_regime_backtest(
            file_path=path,
            file_type='csv',
            initial_capital=INITIAL_CAPITAL,
            weights_dict=WEIGHTS,
            theta_enter=best_theta,
            eps_trend=best_eps,
            confirmed_indicators=CONFIRMED,
            stp_multiplier=STP,
            tp_multiplier=TP,
        )
        pnl_series = bt.pnl if hasattr(bt, 'pnl') else None
        if pnl_series is not None:
            total_ret = float(pnl_series.iloc[-1])
            total_ret_pct = (total_ret / INITIAL_CAPITAL) * 100
            print(f'  Return: {total_ret_pct:.2f}%')
    except Exception as e:
        print(f'  ERROR: {e}')
    print()

print()
print('=== OPTIMAL REGIME PARAMS SUMMARY ===')
print(f'{"Index":<20} {"Theta":>10} {"Eps":>12}')
print('-' * 45)
for name, params in optimal_params.items():
    print(f'{name:<20} {params["theta"]:>10.4f} {params["eps"]:>12.6f}')
