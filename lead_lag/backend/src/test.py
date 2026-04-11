import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from engine.regime_engine import run_multi_asset
from utils.metrics import format_backtest_response
from engine.backtest_engine import sanitize_floats

INDICES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'indices')
CAPITAL   = 10000
WEIGHTS   = {'EMA':0.2,'MACD':0.2,'RSI':0.2,'SO':0.2,'PSAR':0.1,'BB':0.1}
CONFIRMED = ['RSI','MACD','SO','SAR','BB','EMA']
STP, TP   = 3.0, 3.0

file_paths, file_types = [], []
for f in sorted(os.listdir(INDICES_DIR)):
    if f.endswith('.csv'):
        file_paths.append(os.path.join(INDICES_DIR, f))
        file_types.append('csv')

print('=== MULTI-ASSET REGIME BACKTEST — 7 EQUITY INDICES ===')
print(f'Running on {len(file_paths)} indices...')
print()

raw = run_multi_asset(
    file_paths=file_paths,
    file_types=file_types,
    initial_capital=CAPITAL,
    use_optimal_params=True,
    weights_dict=WEIGHTS,
    theta_enter=0.1,
    eps_trend=0.0165,
    confirmed_indicators=CONFIRMED,
    stp_multiplier=STP,
    tp_multiplier=TP,
)

print(f'{"Index":<20} {"Return%":>9} {"Sharpe":>8} {"Trades":>8} {"WinRate":>8} {"MaxDD%":>8}')
print('-' * 70)

for r in raw:
    name = r['name']
    if 'error' in r:
        print(f'{name:<20} ERROR: {r["error"]}')
        continue
    try:
        bt   = r['bt']
        resp = sanitize_floats(format_backtest_response(bt, CAPITAL))
        m    = resp.get('metrics', {})
        ret  = m.get('total_return_pct', 0)
        sh   = m.get('sharpe_ratio', 0)
        tr   = m.get('trade_count', 0)
        wr   = m.get('win_rate', 0)
        dd   = m.get('max_drawdown_pct', 0)
        print(f'{name:<20} {ret:>9.2f} {sh:>8.3f} {tr:>8} {wr:>7.1f}% {dd:>8.2f}%')
    except Exception as e:
        print(f'{name:<20} ERROR: {e}')