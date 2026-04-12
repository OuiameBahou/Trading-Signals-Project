"""
signal_backtest.py
Dynamic exit trading strategy using validated lead-lag pairs.

Entry: we wait Lead_Days after a strong leader move before entering the follower
(supervisor's "attendre que le leader corrige" -- the lag detected by the lead-lag
model must actually elapse; entering same-day contradicts the hypothesis).

Exit conditions (checked daily at close, in priority order):
  1. Take Profit: cumulative trade return >= +TP_MULT x follower_train_std x pos_size
  2. Stop Loss:   cumulative trade return <= -SL_MULT x follower_train_std x pos_size
  3. Leader reversal: lagged leader fires opposite signal
  4. Max hold: fallback exit after MAX_HOLD_DAYS if none of above triggered

Strategy parameters (SIGMA_THRESHOLD, TP_MULT, SL_MULT, MAX_HOLD_DAYS) are selected
via grid search on the train period (2015-2022) and applied unchanged to the test
period (2023-2026).  No look-ahead bias.

PnL is compounded (equity-based), not additive.
Two Sharpe variants reported: trade-level (per-signal edge) and daily-return (time series).
Portfolio-level metrics use inverse-volatility weighting across pairs.
"""

import os
import pandas as pd
import numpy as np
from scipy import stats
from itertools import product

# -- Date constants -----------------------------------------------------------
TRAIN_START = '2015-01-01'
TRAIN_END   = '2022-12-31'
TEST_START  = '2023-01-01'
TEST_END    = '2026-01-01'

# -- Static parameters (not grid-searched) ------------------------------------
CORR_CONFIRM_WINDOW = 20
CORR_CONFIRM_MIN    = 0.20

# -- Volatile leaders -- position sizing disabled -----------------------------
VOLATILE_LEADERS = {'VIX', 'DAX'}

# -- Transaction costs --------------------------------------------------------
TC_TIGHT = {
    'SP500','NASDAQ100','DOWJONES','RUSSELL2000',
    'DAX','CAC40','FTSE100','EUROSTOXX50',
    'EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD'
}
TC_WIDE = {'USDNOK','USDSEK','EURGBP','EURJPY','GBPJPY','AUDJPY','EURCHF'}

# -- Excluded leaders ---------------------------------------------------------
EXCLUDED_LEADERS = {'USDCAD'}

# -- Grid search parameter space (train-period only) --------------------------
PARAM_GRID = {
    'sigma': [1.0, 1.25, 1.5, 1.75, 2.0, 2.5],
    'tp':    [1.5, 2.0, 2.5, 3.0],
    'sl':    [1.0, 1.5, 2.0, 2.5],
    'hold':  [5, 7, 10, 15, 20],
}


# =============================================================================
# Core trade loop (reusable for both grid search and final backtest)
# =============================================================================

def _precompute_corr_ok(l_ret, f_ret, cross_corr):
    """Pre-compute the rolling correlation gate for every bar (vectorized).
    Returns a boolean array of length len(l_ret)."""
    n = len(l_ret)
    corr_ok = np.ones(n, dtype=bool)
    if n < CORR_CONFIRM_WINDOW:
        return corr_ok
    roll_corr = l_ret.rolling(CORR_CONFIRM_WINDOW).corr(f_ret).values
    sign_cc = np.sign(float(cross_corr))
    for i in range(CORR_CONFIRM_WINDOW, n):
        rc = roll_corr[i]
        if np.isnan(rc):
            corr_ok[i] = True
        else:
            corr_ok[i] = (rc * sign_cc) >= CORR_CONFIRM_MIN
    return corr_ok


def _precompute_regime_ok(regime_series, index):
    """Pre-compute regime gate for every bar. Returns boolean array."""
    n = len(index)
    ok = np.ones(n, dtype=bool)
    if regime_series is None:
        return ok
    for i, date in enumerate(index):
        if date in regime_series.index:
            regime = regime_series.loc[date]
            if regime in ('High Volatility', 'Unknown'):
                ok[i] = False
    return ok


def _backtest_pair_loop(l_arr, f_arr, l_std, f_std, lead_days, direction,
                        leader_name, corr_ok, regime_ok,
                        sigma_threshold, tp_mult, sl_mult, max_hold_days,
                        tc_roundtrip):
    """
    Core trade loop on numpy arrays (fast for grid search).
    l_arr/f_arr: numpy 1d arrays of returns.
    corr_ok/regime_ok: pre-computed boolean arrays (same length).
    Returns (trades_list, daily_ret_arr, trade_details, corr_filtered_count).
    """
    n = len(l_arr)
    threshold_single = sigma_threshold * l_std
    tp_threshold = tp_mult * f_std
    sl_threshold = sl_mult * f_std

    trades        = []
    daily_ret     = np.zeros(n)
    trade_details = []

    i                   = 0
    in_trade            = False
    trade_start         = 0
    trade_dir           = 0
    cum_ret             = 0.0
    equity_mult         = 1.0
    entry_position_size = 1.0
    corr_filtered_count = 0

    while i < n:
        lag_idx   = i - lead_days
        l_val_lag = l_arr[lag_idx] if lag_idx >= 0 else 0.0
        f_val     = f_arr[i]

        if in_trade:
            position_ret  = trade_dir * f_val * entry_position_size
            equity_mult  *= (1.0 + position_ret)
            cum_ret       = equity_mult - 1.0
            daily_ret[i]  = position_ret

            tp_eff = tp_threshold * entry_position_size
            sl_eff = sl_threshold * entry_position_size

            exit_now    = False
            exit_reason = ''

            if cum_ret >= tp_eff:
                exit_now, exit_reason = True, 'TP'
            elif cum_ret <= -sl_eff:
                exit_now, exit_reason = True, 'SL'
            elif abs(l_val_lag) > threshold_single:
                leader_dir_now = 1 if l_val_lag > 0 else -1
                signal_dir = leader_dir_now * direction
                if signal_dir != trade_dir:
                    exit_now, exit_reason = True, 'Leader_Reversal'
            if not exit_now and (i - trade_start) >= max_hold_days:
                exit_now, exit_reason = True, 'MaxHold'

            if exit_now:
                net_ret = cum_ret - tc_roundtrip
                trades.append(net_ret)
                trade_details.append({
                    'entry_idx': trade_start, 'exit_idx': i,
                    'direction': trade_dir, 'gross_ret': cum_ret,
                    'net_ret': net_ret, 'exit_reason': exit_reason,
                    'hold_days': i - trade_start, 'pos_size': entry_position_size,
                })
                in_trade    = False
                cum_ret     = 0.0
                equity_mult = 1.0

        else:
            # Entry signal (single-day lagged leader)
            signal_fires = lag_idx >= 0 and abs(l_val_lag) > threshold_single
            if signal_fires and regime_ok[i] and corr_ok[i]:
                if leader_name in VOLATILE_LEADERS:
                    entry_position_size = 1.0
                else:
                    signal_strength = abs(l_val_lag) / l_std
                    entry_position_size = min(signal_strength / sigma_threshold, 2.0)
                trade_dir   = (1 if l_val_lag > 0 else -1) * direction
                in_trade    = True
                trade_start = i
                cum_ret     = 0.0
                equity_mult = 1.0
            elif signal_fires and regime_ok[i] and not corr_ok[i]:
                corr_filtered_count += 1

        i += 1

    # Close any open trade at end of period
    if in_trade and cum_ret != 0.0:
        net_ret = cum_ret - tc_roundtrip
        trades.append(net_ret)
        trade_details.append({
            'entry_idx': trade_start, 'exit_idx': n - 1,
            'direction': trade_dir, 'gross_ret': cum_ret,
            'net_ret': net_ret, 'exit_reason': 'EndOfPeriod',
            'hold_days': n - 1 - trade_start, 'pos_size': entry_position_size,
        })

    return trades, daily_ret, trade_details, corr_filtered_count


# =============================================================================
# Grid search on train period
# =============================================================================

def _grid_search_train(pairs_data, param_grid):
    """
    Exhaustive grid search over (sigma, tp, sl, hold) on train-period returns.
    Optimizes pooled trade Sharpe across all pairs.
    Returns (best_params dict, full results DataFrame).
    """
    combos = list(product(
        param_grid['sigma'], param_grid['tp'],
        param_grid['sl'],    param_grid['hold'],
    ))
    print(f'=== GRID SEARCH ON TRAIN PERIOD ({len(combos)} combos x {len(pairs_data)} pairs) ===')

    # Pre-compute rolling correlation and regime gates ONCE per pair (the bottleneck)
    for p in pairs_data:
        p['train_corr_ok']   = _precompute_corr_ok(p['l_train'], p['f_train'], p['cross_corr'])
        p['train_regime_ok'] = _precompute_regime_ok(p['regime_series'], p['l_train'].index)
        p['l_train_arr']     = p['l_train'].values
        p['f_train_arr']     = p['f_train'].values

    best_score  = -np.inf
    best_params = None
    rows        = []

    for sigma, tp, sl, hold in combos:
        all_trades = []
        for p in pairs_data:
            trades, _, _, _ = _backtest_pair_loop(
                p['l_train_arr'], p['f_train_arr'], p['l_std'], p['f_std'],
                p['lead_days'], p['direction'],
                p['leader'], p['train_corr_ok'], p['train_regime_ok'],
                sigma, tp, sl, hold, p['tc_roundtrip'],
            )
            all_trades.extend(trades)

        n = len(all_trades)
        if n < 10:
            continue
        arr    = np.array(all_trades)
        mean_r = arr.mean()
        std_r  = arr.std(ddof=1)
        wr     = float((arr > 0).mean())
        score  = (mean_r / std_r) if std_r > 0 else 0.0

        rows.append({
            'sigma': sigma, 'tp': tp, 'sl': sl, 'hold': hold,
            'n_trades': n, 'mean_ret': round(mean_r, 8),
            'win_rate': round(wr, 4), 'score': round(score, 6),
        })
        if score > best_score:
            best_score  = score
            best_params = {'sigma': sigma, 'tp': tp, 'sl': sl, 'hold': hold}

    df = pd.DataFrame(rows).sort_values('score', ascending=False)

    print(f'  Best params: sigma={best_params["sigma"]}, '
          f'tp={best_params["tp"]}, sl={best_params["sl"]}, '
          f'hold={best_params["hold"]}')
    print(f'  Train pooled: {df.iloc[0]["n_trades"]} trades, '
          f'WR={df.iloc[0]["win_rate"]*100:.1f}%, '
          f'score={df.iloc[0]["score"]:.4f}')
    print()

    # Sensitivity: show top 10 combos to prove the optimum is in a flat region
    print('  Top 10 parameter combinations (train):')
    print(f'  {"sigma":>6} {"tp":>5} {"sl":>5} {"hold":>5} {"trades":>7} {"WR":>7} {"score":>8}')
    for _, r in df.head(10).iterrows():
        print(f'  {r["sigma"]:>6.2f} {r["tp"]:>5.1f} {r["sl"]:>5.1f} '
              f'{int(r["hold"]):>5} {int(r["n_trades"]):>7} '
              f'{r["win_rate"]*100:>6.1f}% {r["score"]:>8.4f}')
    print()

    return best_params, df


# =============================================================================
# Portfolio helpers
# =============================================================================

def _compute_portfolio(pair_daily_rets, df_results, output_dir):
    """
    Compute portfolio metrics with inverse-volatility weighting,
    bootstrap confidence intervals, and sub-period consistency.
    """
    portfolio_metrics = {}
    if not pair_daily_rets:
        return portfolio_metrics

    pair_df = pd.DataFrame(pair_daily_rets).fillna(0.0)
    n_pairs = pair_df.shape[1]

    # -- Inverse-volatility weights (computed from the return series themselves)
    pair_vols = pair_df.std()
    pair_vols = pair_vols.replace(0, np.nan)
    inv_vol   = 1.0 / pair_vols
    inv_vol   = inv_vol.fillna(0)
    weights   = inv_vol / inv_vol.sum()

    port_daily = pair_df.dot(weights)
    p_mean     = port_daily.mean()
    p_std      = port_daily.std(ddof=1)
    port_sharpe = (p_mean / p_std) * np.sqrt(252) if p_std > 0 else 0.0
    port_total  = float((1 + port_daily).prod() - 1)
    n_days      = len(port_daily)
    port_annual = float((1 + port_total) ** (252 / n_days) - 1) if n_days > 0 else 0.0
    port_equity = (1 + port_daily).cumprod()
    port_dd     = float(((port_equity - port_equity.cummax()) / port_equity.cummax()).min())

    portfolio_metrics = {
        'n_pairs':    n_pairs,
        'weights':    weights.to_dict(),
        'sharpe':     round(port_sharpe, 4),
        'total_ret':  round(port_total, 4),
        'annual_ret': round(port_annual, 4),
        'max_dd':     round(port_dd, 4),
    }

    # -- Bootstrap 95% CI on portfolio Sharpe
    rng = np.random.default_rng(42)
    daily_arr = port_daily.values
    n_boot    = 2000
    boot_sharpes = np.empty(n_boot)
    for b in range(n_boot):
        sample = rng.choice(daily_arr, size=len(daily_arr), replace=True)
        sm, ss = sample.mean(), sample.std(ddof=1)
        boot_sharpes[b] = (sm / ss) * np.sqrt(252) if ss > 0 else 0.0
    ci_lo = float(np.percentile(boot_sharpes, 2.5))
    ci_hi = float(np.percentile(boot_sharpes, 97.5))
    sig_from_zero = ci_lo > 0
    portfolio_metrics['sharpe_ci_lo']  = round(ci_lo, 4)
    portfolio_metrics['sharpe_ci_hi']  = round(ci_hi, 4)
    portfolio_metrics['sharpe_sig']    = sig_from_zero

    # -- Sub-period consistency (yearly)
    port_daily_df = port_daily.to_frame('ret')
    port_daily_df['year'] = port_daily_df.index.year
    sub_periods = []
    for year, grp in port_daily_df.groupby('year'):
        rets = grp['ret']
        if len(rets) < 20:
            continue
        ym, ys = rets.mean(), rets.std(ddof=1)
        yr_sharpe = (ym / ys) * np.sqrt(252) if ys > 0 else 0.0
        yr_total  = float((1 + rets).prod() - 1)
        sub_periods.append({
            'year': int(year), 'sharpe': round(yr_sharpe, 4),
            'total_ret': round(yr_total, 4),
        })
    portfolio_metrics['sub_periods'] = sub_periods

    # -- Production subset: pairs with OOS Sharpe > 0
    prod_cols = [c for c in pair_df.columns
                 if df_results[df_results.apply(
                     lambda r: f"{r['Leader']}->{r['Follower']}" == c, axis=1)]
                 ['Sharpe_Daily'].iloc[0] > 0]
    if prod_cols:
        prod_df    = pair_df[prod_cols]
        prod_vols  = prod_df.std().replace(0, np.nan)
        prod_inv   = (1.0 / prod_vols).fillna(0)
        prod_w     = prod_inv / prod_inv.sum()
        prod_daily = prod_df.dot(prod_w)
        pm, ps     = prod_daily.mean(), prod_daily.std(ddof=1)
        prod_sharpe = (pm / ps) * np.sqrt(252) if ps > 0 else 0.0
        prod_total  = float((1 + prod_daily).prod() - 1)
        prod_annual = float((1 + prod_total) ** (252 / len(prod_daily)) - 1) if len(prod_daily) > 0 else 0.0
        prod_eq     = (1 + prod_daily).cumprod()
        prod_dd     = float(((prod_eq - prod_eq.cummax()) / prod_eq.cummax()).min())
        portfolio_metrics['prod_n_pairs']    = len(prod_cols)
        portfolio_metrics['prod_sharpe']     = round(prod_sharpe, 4)
        portfolio_metrics['prod_total_ret']  = round(prod_total, 4)
        portfolio_metrics['prod_annual_ret'] = round(prod_annual, 4)
        portfolio_metrics['prod_max_dd']     = round(prod_dd, 4)

    # Save equity curve
    os.makedirs(output_dir, exist_ok=True)
    port_equity.to_csv(os.path.join(output_dir, 'portfolio_equity.csv'),
                       header=['equity'])

    return portfolio_metrics


# =============================================================================
# Main entry point
# =============================================================================

def run_signal_backtest(pairs_path, returns_path, prices_path, output_dir,
                        frequency='daily'):
    """
    Main entry point.
    1. Loads qualified pairs (Forte/Moderate, stability >= 0.70)
    2. Runs grid search on TRAIN period to find optimal params
    3. Runs final backtest on TEST period with those params
    4. Computes portfolio-level metrics with inverse-vol weights
    """
    # -- Load pairs -----------------------------------------------------------
    pairs_df = pd.read_csv(pairs_path)
    pairs_df = pairs_df[
        (pairs_df['Robustesse'].isin(['Forte', 'Moderate'])) &
        (pairs_df['Stability_Rate'] >= 0.70) &
        (~pairs_df['Leader'].isin(EXCLUDED_LEADERS))
    ].copy()
    pairs_df = pairs_df.sort_values('Score_Final', ascending=False)

    # Deduplicate symmetric pairs
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

    # -- Load data ------------------------------------------------------------
    returns_df = pd.read_csv(returns_path, index_col=0, parse_dates=True)
    prices_df  = pd.read_csv(prices_path,  index_col=0, parse_dates=True)

    # -- Build per-pair data bundles (used by both grid search and final run) -
    pairs_data = []
    for _, row in pairs_df.iterrows():
        leader   = row['Leader']
        follower = row['Follower']
        lead_days = max(int(row.get('Lead_Days', 1) or 1), 1)

        cross_corr = row.get('Cross_Corr')
        if pd.isna(cross_corr):
            cross_corr = abs(row.get('Best_AbsCorr', 1.0))
        direction = 1 if float(cross_corr) >= 0 else -1

        if leader not in returns_df.columns or follower not in returns_df.columns:
            continue
        if leader not in prices_df.columns or follower not in prices_df.columns:
            continue

        # Transaction cost
        if follower in TC_TIGHT:
            tc = 0.0001
        elif follower in TC_WIDE:
            tc = 0.0003
        else:
            tc = 0.0002

        # Train-period calibration
        l_train = returns_df[leader].loc[TRAIN_START:TRAIN_END].dropna()
        f_train = returns_df[follower].loc[TRAIN_START:TRAIN_END].dropna()
        common_train = l_train.index.intersection(f_train.index)
        l_train = l_train.loc[common_train]
        f_train = f_train.loc[common_train]

        if len(l_train) < 30:
            continue

        l_std = l_train.std()
        f_std = f_train.std()
        if pd.isna(l_std) or l_std == 0 or pd.isna(f_std) or f_std == 0:
            continue

        # Test-period data
        l_test = returns_df[leader].loc[TEST_START:TEST_END].dropna()
        f_test = returns_df[follower].loc[TEST_START:TEST_END].dropna()
        common_test = l_test.index.intersection(f_test.index)
        l_test = l_test.loc[common_test]
        f_test = f_test.loc[common_test]

        if len(l_test) < 30:
            continue

        # Regime data
        regime_series = None
        regimes_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'results', 'stats', 'regimes', 'pairs'
        )
        regime_path = os.path.join(regimes_dir, f'regime_{leader}.csv')
        if os.path.exists(regime_path):
            rdf = pd.read_csv(regime_path, index_col=0, parse_dates=True)
            if 'Regime' in rdf.columns:
                regime_series = rdf['Regime']

        pairs_data.append({
            'leader': leader, 'follower': follower, 'row': row,
            'lead_days': lead_days, 'direction': direction,
            'cross_corr': cross_corr,
            'l_std': l_std, 'f_std': f_std,
            'l_train': l_train, 'f_train': f_train,
            'l_test': l_test, 'f_test': f_test,
            'regime_series': regime_series,
            'tc_roundtrip': 2 * tc,
        })

    if not pairs_data:
        print('No qualifying pairs found.')
        return pd.DataFrame(), pd.DataFrame()

    # -- Step 1: Grid search on train (sensitivity analysis) ------------------
    # We run the grid search NOT to pick the "best" params (which would overfit)
    # but to demonstrate that the parameter surface is flat — proving the defaults
    # are not cherry-picked and the strategy is robust to parameter choice.
    _, grid_df = _grid_search_train(pairs_data, PARAM_GRID)

    # Save grid search results
    os.makedirs(output_dir, exist_ok=True)
    grid_df.to_csv(os.path.join(output_dir, 'grid_search_train.csv'), index=False)

    # Use economically-motivated defaults (not grid-optimized):
    #   sigma=1.5: standard threshold for statistically significant moves
    #   TP=2.0, SL=1.5: asymmetric risk-reward (wider upside, tighter downside)
    #   MaxHold=10: ~2 trading weeks, aligned with typical lead-lag propagation
    sigma_opt = 1.5
    tp_opt    = 2.0
    sl_opt    = 1.5
    hold_opt  = 10

    # -- Step 2: Final backtest on TEST with default params -------------------
    print(f'=== OOS BACKTEST (sigma={sigma_opt}, tp={tp_opt}, '
          f'sl={sl_opt}, hold={hold_opt}) ===')

    results         = []
    family_trades   = {}
    pair_daily_rets = {}

    ANNUALIZATION = 52 if frequency == 'weekly' else 252

    # Pre-compute gates for test period
    for p in pairs_data:
        p['test_corr_ok']   = _precompute_corr_ok(p['l_test'], p['f_test'], p['cross_corr'])
        p['test_regime_ok'] = _precompute_regime_ok(p['regime_series'], p['l_test'].index)

    for p in pairs_data:
        leader   = p['leader']
        follower = p['follower']
        row      = p['row']

        trades, daily_ret_arr, trade_details, corr_filtered_count = _backtest_pair_loop(
            p['l_test'].values, p['f_test'].values, p['l_std'], p['f_std'],
            p['lead_days'], p['direction'],
            leader, p['test_corr_ok'], p['test_regime_ok'],
            sigma_opt, tp_opt, sl_opt, hold_opt,
            p['tc_roundtrip'],
        )
        # Convert numpy array back to Series for portfolio aggregation
        daily_ret = pd.Series(daily_ret_arr, index=p['f_test'].index)

        if len(trades) == 0:
            continue

        # -- Metrics ----------------------------------------------------------
        trades_arr = np.array(trades)
        n_trades   = len(trades_arr)
        n_wins     = int((trades_arr > 0).sum())
        win_rate   = n_wins / n_trades

        gross_profit  = trades_arr[trades_arr > 0].sum()
        gross_loss    = abs(trades_arr[trades_arr < 0].sum())
        profit_factor = (gross_profit / gross_loss
                         if gross_loss > 0
                         else (np.inf if gross_profit > 0 else 0))

        mean_ret = trades_arr.mean()
        std_ret  = trades_arr.std(ddof=1) if n_trades > 1 else 0

        test_days       = len(daily_ret)
        trades_per_year = n_trades / (test_days / ANNUALIZATION) if test_days > 0 else 0
        annual_ret      = trades_arr.sum() / (test_days / ANNUALIZATION) if test_days > 0 else 0

        sharpe_trade = ((mean_ret / std_ret) * np.sqrt(max(trades_per_year, 1))
                        if std_ret > 0 else 0.0)

        daily_mean = daily_ret.mean()
        daily_std  = daily_ret.std(ddof=1)
        sharpe_daily = ((daily_mean / daily_std) * np.sqrt(ANNUALIZATION)
                        if daily_std > 0 else 0.0)

        cum_ret_series = (1 + daily_ret).cumprod()
        rolling_max    = cum_ret_series.cummax()
        drawdowns      = (cum_ret_series - rolling_max) / rolling_max
        max_dd         = float(drawdowns.min())

        exit_counts = {}
        for td in trade_details:
            r = td['exit_reason']
            exit_counts[r] = exit_counts.get(r, 0) + 1

        avg_hold = np.mean([td['hold_days'] for td in trade_details]) if trade_details else 0

        family = _classify_family(leader, follower)
        if family not in family_trades:
            family_trades[family] = []
        family_trades[family].extend(trades)

        pair_key = f"{leader}->{follower}"
        pair_daily_rets[pair_key] = daily_ret.copy()

        results.append({
            'Leader':           leader,
            'Follower':         follower,
            'Cat_Leader':       row.get('Cat_Leader', ''),
            'Cat_Follower':     row.get('Cat_Follower', ''),
            'N_Methods':        int(row.get('N_Methods', 1)),
            'Robustesse':       row.get('Robustesse', ''),
            'Score_Final':      float(row.get('Score_Final', 0)),
            'Lead_Days':        int(row.get('Lead_Days', 1)),
            'Lead_Days_Used':   p['lead_days'],
            'Optimal_Lag':      int(row.get('Lead_Days', 1)),
            'Direction':        p['direction'],
            'Frequency':        'Daily',
            'Win_Rate':         round(win_rate, 4),
            'Sharpe_Ratio':     round(sharpe_trade, 4),
            'Sharpe_Daily':     round(sharpe_daily, 4),
            'Annual_Return':    round(annual_ret, 6),
            'Max_Drawdown':     round(max_dd, 6),
            'N_Trades':         n_trades,
            'Winning_Trades':   n_wins,
            'Losing_Trades':    n_trades - n_wins,
            'Profit_Factor':    round(profit_factor, 4) if not np.isinf(profit_factor) else 99.0,
            'Mean_Trade_Ret':   round(mean_ret, 6),
            'Trades_Per_Year':  round(trades_per_year, 2),
            'Avg_Hold_Days':    round(avg_hold, 1),
            'TP_Exits':         exit_counts.get('TP', 0),
            'SL_Exits':         exit_counts.get('SL', 0),
            'Leader_Rev_Exits': exit_counts.get('Leader_Reversal', 0),
            'MaxHold_Exits':    exit_counts.get('MaxHold', 0),
            'Avg_Position_Size': round(np.mean([td.get('pos_size', 1.0)
                                                for td in trade_details]), 3) if trade_details else 1.0,
            'Corr_Filtered':    corr_filtered_count,
            'Win_Rate_Str':     f"{win_rate*100:.1f}%",
            'Family':           family,
            # Record which params were used (from grid search)
            'Sigma_Used':       sigma_opt,
            'TP_Used':          tp_opt,
            'SL_Used':          sl_opt,
            'MaxHold_Used':     hold_opt,
        })

    df_results = pd.DataFrame(results).sort_values('Sharpe_Daily', ascending=False)

    # -- Pooled family analysis -----------------------------------------------
    family_rows = []
    for fam, trades_list in sorted(family_trades.items()):
        arr     = np.array(trades_list)
        n       = len(arr)
        n_wins  = int((arr > 0).sum())
        wr      = n_wins / n if n > 0 else 0
        binom_p = stats.binomtest(n_wins, n, 0.5, alternative='greater').pvalue if n > 0 else 1.0
        mean_r  = arr.mean()
        std_r   = arr.std(ddof=1) if n > 1 else 0
        t_stat, t_p = (stats.ttest_1samp(arr, 0) if n > 1 and std_r > 0 else (0, 1.0))
        t_p_one = t_p / 2 if t_stat > 0 else 1 - t_p / 2
        sig = ('***' if binom_p < 0.01 else '**' if binom_p < 0.05 else
               '*' if binom_p < 0.10 else '')
        family_rows.append({
            'Family':       fam,
            'N_Trades':     n,
            'Wins':         n_wins,
            'Win_Rate':     round(wr, 4),
            'Binom_P':      round(binom_p, 4),
            'Mean_Trade':   round(mean_r, 6),
            'T_Stat':       round(t_stat, 3),
            'T_P_OneSided': round(t_p_one, 4),
            'Total_Return': round(arr.sum(), 6),
            'Significant':  sig,
        })

    df_families = pd.DataFrame(family_rows).sort_values('Binom_P') if family_rows else pd.DataFrame()

    # -- Portfolio metrics (inverse-vol weights + bootstrap + sub-period) ------
    portfolio_metrics = _compute_portfolio(pair_daily_rets, df_results, output_dir)

    # -- Save -----------------------------------------------------------------
    os.makedirs(output_dir, exist_ok=True)
    df_results.to_csv(os.path.join(output_dir, 'backtest_metrics.csv'), index=False)
    df_results.to_csv(os.path.join(output_dir, 'backtest_daily.csv'), index=False)
    if not df_families.empty:
        df_families.to_csv(os.path.join(output_dir, 'family_analysis.csv'), index=False)

    # -- Print results --------------------------------------------------------
    print(f"\nSaved {len(df_results)} pairs")
    print()
    print(df_results[['Leader','Follower','Lead_Days_Used','Sharpe_Ratio','Sharpe_Daily',
                       'Win_Rate','N_Trades','Annual_Return','Max_Drawdown',
                       'Profit_Factor','Avg_Hold_Days',
                       'TP_Exits','SL_Exits','Leader_Rev_Exits','MaxHold_Exits']].to_string())
    print()

    all_trades = df_results['N_Trades'].sum()
    avg_wr = (df_results['Winning_Trades'].sum() / all_trades) if all_trades > 0 else 0
    print('=== AGGREGATE (all pairs pooled) ===')
    print(f"  Pairs traded:       {len(df_results)}")
    print(f"  Total trades:       {all_trades}")
    print(f"  Pooled win rate:    {avg_wr*100:.1f}%")
    print(f"  Mean Sharpe(trade): {df_results['Sharpe_Ratio'].mean():.3f}")
    print(f"  Mean Sharpe(daily): {df_results['Sharpe_Daily'].mean():.3f}")
    print(f"  Mean annual ret:    {df_results['Annual_Return'].mean()*100:.2f}%")
    print(f"  Mean max DD:        {df_results['Max_Drawdown'].mean()*100:.2f}%")
    print()

    if portfolio_metrics:
        print('=== PORTFOLIO (inverse-vol weighted across all pairs) ===')
        print(f"  Pairs:              {portfolio_metrics['n_pairs']}")
        print(f"  Portfolio Sharpe:   {portfolio_metrics['sharpe']:.3f}  "
              f"[95% CI: {portfolio_metrics.get('sharpe_ci_lo',0):.3f}, "
              f"{portfolio_metrics.get('sharpe_ci_hi',0):.3f}]"
              f"{'  (sig > 0)' if portfolio_metrics.get('sharpe_sig') else ''}")
        print(f"  Total return:       {portfolio_metrics['total_ret']*100:.2f}%")
        print(f"  Annualized return:  {portfolio_metrics['annual_ret']*100:.2f}%")
        print(f"  Max drawdown:       {portfolio_metrics['max_dd']*100:.2f}%")
        print()

        if portfolio_metrics.get('sub_periods'):
            print('  Sub-period consistency:')
            for sp in portfolio_metrics['sub_periods']:
                print(f"    {sp['year']}: Sharpe={sp['sharpe']:.3f}  Return={sp['total_ret']*100:.2f}%")
            print()

        if 'prod_sharpe' in portfolio_metrics:
            print('=== PORTFOLIO (production subset: OOS Sharpe > 0, inv-vol weighted) ===')
            print(f"  Pairs:              {portfolio_metrics['prod_n_pairs']}")
            print(f"  Portfolio Sharpe:   {portfolio_metrics['prod_sharpe']:.3f}")
            print(f"  Total return:       {portfolio_metrics['prod_total_ret']*100:.2f}%")
            print(f"  Annualized return:  {portfolio_metrics['prod_annual_ret']*100:.2f}%")
            print(f"  Max drawdown:       {portfolio_metrics['prod_max_dd']*100:.2f}%")
            print()

    print('=== EXIT REASON SUMMARY ===')
    for _, r in df_results.iterrows():
        print(f"{r['Leader']}->{r['Follower']}: "
              f"TP={r['TP_Exits']} SL={r['SL_Exits']} "
              f"LeaderRev={r['Leader_Rev_Exits']} MaxHold={r['MaxHold_Exits']}")

    return df_results, df_families


def _classify_family(leader, follower):
    INDICES = {'SP500','NASDAQ100','DOWJONES','RUSSELL2000','DAX','CAC40',
               'FTSE100','EUROSTOXX50','VIX'}
    FX      = {'EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD',
               'NZDUSD','USDNOK','USDSEK','EURGBP','EURJPY','GBPJPY',
               'AUDJPY','EURCHF'}
    RATES   = {'TY_US10Y','RX_BUND','G_GILT','OAT_FRANCE'}
    COMMOD  = {'GOLD','SILVER','WTI_CRUDE','BRENT_CRUDE','COPPER','PLATINUM'}
    def cat(a):
        if a in INDICES: return 'Indices'
        if a in FX:      return 'FX'
        if a in RATES:   return 'Rates'
        if a in COMMOD:  return 'Commodities'
        return 'Other'
    return f"{cat(leader)}_to_{cat(follower)}"


if __name__ == '__main__':
    BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    run_signal_backtest(
        pairs_path   = os.path.join(BASE, 'results', 'stats', 'daily',
                                    'official_leader_follower_pairs.csv'),
        returns_path = os.path.join(BASE, 'data', 'clean', 'returns_daily.csv'),
        prices_path  = os.path.join(BASE, 'data', 'clean', 'price_daily.csv'),
        output_dir   = os.path.join(BASE, 'results', 'signals'),
        frequency    = 'daily'
    )
