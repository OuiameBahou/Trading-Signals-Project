"""
Runs regime backtest on all 7 indices simultaneously using their
optimal params found in Step 4. Produces the multi-asset dashboard output.
Same as what was verified for the 7 FX pairs.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.regime_engine import run_multi_asset
from utils.metrics import format_backtest_response

INDICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indices')
INITIAL_CAPITAL = 10000

WEIGHTS    = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}
CONFIRMED  = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']
STP = 3.0
TP  = 3.0

file_paths = []
file_types = []
for f in sorted(os.listdir(INDICES_DIR)):
    if f.endswith('.csv'):
        file_paths.append(os.path.join(INDICES_DIR, f))
        file_types.append('csv')

print('=== MULTI-ASSET REGIME BACKTEST — 7 EQUITY INDICES ===')
print(f'Running on {len(file_paths)} indices...')
print()

raw_results = run_multi_asset(
    file_paths=file_paths,
    file_types=file_types,
    initial_capital=INITIAL_CAPITAL,
    use_optimal_params=True,
    weights_dict=WEIGHTS,
    theta_enter=0.1,
    eps_trend=0.0165,
    confirmed_indicators=CONFIRMED,
    stp_multiplier=STP,
    tp_multiplier=TP,
)

print(f'{"Index":<20} {"Return %":>10} {"Sharpe":>8} {"Trades":>8} {"Win%":>8} {"MaxDD%":>8}')
print('-' * 70)

for r in raw_results:
    name = r['name']
    if 'error' in r:
        print(f'{name:<20} ERROR: {r["error"]}')
        continue
    bt = r['bt']
    try:
        resp = format_backtest_response(bt, INITIAL_CAPITAL)
        m = resp['metrics']
        total_ret = m.get('total_return', 0) or 0
        sharpe    = m.get('sharpe_ratio', 0) or 0
        trades    = m.get('nb_trades', 'N/A')
        win_rate  = m.get('win_rate', 0) or 0
        max_dd    = m.get('max_drawdown', 0) or 0
        print(f'{name:<20} {total_ret:>10.2f} {sharpe:>8.3f} {str(trades):>8} {win_rate:>7.1f}% {max_dd:>8.2f}')
    except Exception as e:
        print(f'{name:<20} ERROR reading results: {e}')
