import requests

# Check data-pairs includes both FX and indices
resp = requests.get('http://localhost:8001/api/fx/data-pairs')
pairs = resp.json()
print(f'Total assets available: {len(pairs)}')
for p in pairs:
    print(f"  [{p['category']}] {p['name']}")

# Find SP500 file path
sp500 = next((p for p in pairs if p['name'] == 'SP500'), None)
if not sp500:
    print('SP500 not found!')
else:
    print(f'\nRunning backtest on SP500...')
    result = requests.post('http://localhost:8001/api/fx/backtest/run', json={
        'file_path': sp500['file_path'],
        'file_type': 'csv',
        'initial_capital': 10000,
        'strategy': 'combination',
        'indicator_config': {
            'primary': 'RSI',
            'confirmers': []
        },
        'stp_multiplier': 3.0,
        'tp_multiplier': 3.0,
    })
    data = result.json()
    metrics = data.get('metrics', {})
    print(f"Total Return:  {metrics.get('total_return_pct', metrics.get('total_return', 'N/A'))}")
    print(f"Sharpe Ratio:  {metrics.get('sharpe_ratio', 'N/A')}")
    print(f"Trade Count:   {metrics.get('trade_count', metrics.get('nb_trades', 'N/A'))}")
    print(f"Max Drawdown:  {metrics.get('max_drawdown_pct', metrics.get('max_drawdown', 'N/A'))}")
    print(f"Win Rate:      {metrics.get('win_rate', 'N/A')}")
