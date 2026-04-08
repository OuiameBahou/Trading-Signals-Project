"""
optimize_global_params.py
Grid search over global TP_MULT and SL_MULT on TRAIN period only (2015-2022).
Reports best params, then evaluates on TEST period (2023-2026) ONCE.
This is the correct academic approach — no test-period data used during search.
"""
import os
import sys
import pandas as pd
import numpy as np

BASE = r'C:\Users\info\Downloads\trading_signals_project\lead_lag\backend'
sys.path.insert(0, os.path.join(BASE, 'src'))

TRAIN_START = '2015-01-01'
TRAIN_END   = '2022-12-31'
TEST_START  = '2023-01-01'
TEST_END    = '2026-01-01'
SIGMA_THRESHOLD = 1.5
MAX_HOLD_DAYS   = 10

TC_TIGHT = {'SP500','NASDAQ100','DOWJONES','RUSSELL2000','DAX','CAC40',
            'FTSE100','EUROSTOXX50','EURUSD','GBPUSD','USDJPY','USDCHF',
            'USDCAD','AUDUSD','NZDUSD'}
TC_WIDE  = {'USDNOK','USDSEK','EURGBP','EURJPY','GBPJPY','AUDJPY','EURCHF'}
EXCLUDED = {'USDCAD'}

def run_backtest_period(pairs_df, returns_df, regime_map,
                        tp_mult, sl_mult, start, end):
    """Run backtest on a given period with fixed TP/SL multipliers."""
    all_trades = []

    for _, row in pairs_df.iterrows():
        leader   = row['Leader']
        follower = row['Follower']
        cross_corr = row.get('Cross_Corr')
        if pd.isna(cross_corr):
            cross_corr = abs(row.get('Best_AbsCorr', 1.0))
        direction = 1 if float(cross_corr) >= 0 else -1

        if leader not in returns_df.columns or follower not in returns_df.columns:
            continue

        tc = 0.0001 if follower in TC_TIGHT else 0.0003 if follower in TC_WIDE else 0.0002
        tc_rt = 2 * tc

        # Train std — always from train period regardless of which period we backtest
        l_std = returns_df[leader].loc[TRAIN_START:TRAIN_END].std()
        f_std = returns_df[follower].loc[TRAIN_START:TRAIN_END].std()
        if pd.isna(l_std) or l_std == 0 or pd.isna(f_std) or f_std == 0:
            continue

        tp_threshold = tp_mult * f_std
        sl_threshold = sl_mult * f_std

        l_ret = returns_df[leader].loc[start:end].dropna()
        f_ret = returns_df[follower].loc[start:end].dropna()
        common = l_ret.index.intersection(f_ret.index)
        l_ret = l_ret.loc[common]
        f_ret = f_ret.loc[common]
        if len(l_ret) < 20:
            continue

        regime_s = regime_map.get(leader)
        n = len(l_ret)
        trades = []
        i = 0
        in_trade = False
        trade_start = 0
        trade_dir = 0
        cum_ret = 0.0

        while i < n:
            date  = l_ret.index[i]
            l_val = l_ret.iloc[i]
            f_val = f_ret.iloc[i]

            if in_trade:
                cum_ret += trade_dir * f_val
                exit_now = False
                if cum_ret >= tp_threshold:
                    exit_now = True
                elif cum_ret <= -sl_threshold:
                    exit_now = True
                elif abs(l_val) > SIGMA_THRESHOLD * l_std:
                    if ((1 if l_val > 0 else -1) * direction) != trade_dir:
                        exit_now = True
                elif (i - trade_start) >= MAX_HOLD_DAYS:
                    exit_now = True
                if exit_now:
                    trades.append(cum_ret - tc_rt)
                    in_trade = False
                    cum_ret = 0.0
            else:
                regime_ok = True
                if regime_s is not None and date in regime_s.index:
                    regime_ok = regime_s.loc[date] not in ['High Volatility', 'Unknown']
                if abs(l_val) > SIGMA_THRESHOLD * l_std and regime_ok:
                    trade_dir   = (1 if l_val > 0 else -1) * direction
                    in_trade    = True
                    trade_start = i
                    cum_ret     = 0.0
            i += 1

        all_trades.extend(trades)

    if len(all_trades) < 5:
        return 0.0, 0.0, 0

    arr = np.array(all_trades)
    n_trades = len(arr)
    test_days = len(returns_df.loc[start:end])
    tpy = n_trades / (test_days / 252)
    sharpe = (arr.mean() / arr.std(ddof=1)) * np.sqrt(max(tpy, 1)) if arr.std(ddof=1) > 0 else 0.0
    win_rate = (arr > 0).mean()
    return round(sharpe, 4), round(win_rate, 4), n_trades


# ── Load data ──────────────────────────────────────────────────────────────
pairs_df = pd.read_csv(os.path.join(BASE, 'results', 'stats', 'daily',
                                    'official_leader_follower_pairs.csv'))
pairs_df = pairs_df[
    (pairs_df['Robustesse'] == 'Forte') &
    (pairs_df['Stability_Rate'] >= 0.80) &
    (~pairs_df['Leader'].isin(EXCLUDED))
].copy()

# Deduplicate
seen = set()
keep = []
for _, row in pairs_df.iterrows():
    key = tuple(sorted([row['Leader'], row['Follower']]))
    if key not in seen:
        seen.add(key)
        keep.append(True)
    else:
        keep.append(False)
pairs_df = pairs_df[keep].reset_index(drop=True)

returns_df = pd.read_csv(os.path.join(BASE, 'data', 'clean', 'returns_daily.csv'),
                         index_col=0, parse_dates=True)

# Load regime map
regime_map = {}
regimes_dir = os.path.join(BASE, 'results', 'stats', 'regimes', 'pairs')
for fname in os.listdir(regimes_dir):
    if fname.startswith('regime_') and fname.endswith('.csv'):
        leader_name = fname.replace('regime_', '').replace('.csv', '')
        rdf = pd.read_csv(os.path.join(regimes_dir, fname),
                          index_col=0, parse_dates=True)
        if 'Regime' in rdf.columns:
            regime_map[leader_name] = rdf['Regime']

# ── STEP 1: Grid search on TRAIN period ───────────────────────────────────
tp_grid  = [1.0, 1.5, 2.0, 2.5, 3.0]
sl_grid  = [0.5, 1.0, 1.5, 2.0, 2.5]

print('=== GRID SEARCH ON TRAIN PERIOD (2015-2022) ===')
print(f'{"TP":>6} {"SL":>6} {"Sharpe":>8} {"WinRate":>8} {"Trades":>8}')
print('-' * 45)

train_results = []
for tp in tp_grid:
    for sl in sl_grid:
        sharpe, wr, n = run_backtest_period(
            pairs_df, returns_df, regime_map,
            tp, sl, TRAIN_START, TRAIN_END
        )
        train_results.append((tp, sl, sharpe, wr, n))
        print(f'{tp:>6.1f} {sl:>6.1f} {sharpe:>8.4f} {wr:>8.4f} {n:>8}')

# Best on train
best = max(train_results, key=lambda x: x[2])
print()
print(f'BEST ON TRAIN: TP={best[0]}, SL={best[1]} -> Sharpe={best[2]}, WR={best[3]:.1%}, Trades={best[4]}')

# ── STEP 2: Evaluate best params on TEST period ONCE ──────────────────────
print()
print('=== EVALUATION ON TEST PERIOD (2023-2026) — ONE SHOT ===')
test_sharpe, test_wr, test_n = run_backtest_period(
    pairs_df, returns_df, regime_map,
    best[0], best[1], TEST_START, TEST_END
)
print(f'TP={best[0]}, SL={best[1]} -> Sharpe={test_sharpe}, WR={test_wr:.1%}, Trades={test_n}')

# Also show current default (TP=2.0, SL=1.0) on test for comparison
print()
print('=== COMPARISON: CURRENT DEFAULT (TP=2.0, SL=1.0) ON TEST ===')
def_sharpe, def_wr, def_n = run_backtest_period(
    pairs_df, returns_df, regime_map,
    2.0, 1.0, TEST_START, TEST_END
)
print(f'TP=2.0, SL=1.0 -> Sharpe={def_sharpe}, WR={def_wr:.1%}, Trades={def_n}')

print()
if test_sharpe > def_sharpe:
    print(f'Optimised params BETTER: +{test_sharpe - def_sharpe:.4f} Sharpe improvement')
else:
    print(f'Default params better — keep TP=2.0, SL=1.0')
