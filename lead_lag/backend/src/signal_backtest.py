"""
signal_backtest.py
Dynamic exit trading strategy using validated lead-lag pairs.

Exit conditions (checked daily at close, in priority order):
  1. Take Profit: cumulative trade return >= +TP_MULT x follower_train_std
  2. Stop Loss:   cumulative trade return <= -SL_MULT x follower_train_std
  3. Leader reversal: leader fires opposite signal (|leader_ret| > SIGMA_THRESHOLD x leader_std
                      in opposite direction)
  4. Max hold: fallback exit after MAX_HOLD_DAYS if none of above triggered

All parameters calibrated on train period only. No look-ahead bias.
"""

import os
import pandas as pd
import numpy as np
from scipy import stats

# ── Date constants ─────────────────────────────────────────────────────────
TRAIN_START = '2015-01-01'
TRAIN_END   = '2022-12-31'
TEST_START  = '2023-01-01'
TEST_END    = '2026-01-01'

# ── Strategy parameters ────────────────────────────────────────────────────
SIGMA_THRESHOLD     = 1.5    # Leader move threshold to trigger signal
TP_MULT             = 2.0    # Take profit: +2σ follower train std
SL_MULT             = 1.5    # Stop loss:   -1.5σ follower train std
MAX_HOLD_DAYS       = 10     # Fallback exit if no condition triggered
CORR_CONFIRM_WINDOW = 20     # Rolling days to check recent correlation
CORR_CONFIRM_MIN    = 0.20   # Minimum recent correlation to enter

# ── Volatile leaders — position sizing disabled ────────────────────────────
VOLATILE_LEADERS = {'VIX', 'DAX'}

# ── Transaction costs ──────────────────────────────────────────────────────
TC_TIGHT = {
    'SP500','NASDAQ100','DOWJONES','RUSSELL2000',
    'DAX','CAC40','FTSE100','EUROSTOXX50',
    'EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD'
}
TC_WIDE = {'USDNOK','USDSEK','EURGBP','EURJPY','GBPJPY','AUDJPY','EURCHF'}

# ── Excluded leaders ───────────────────────────────────────────────────────
EXCLUDED_LEADERS = {'USDCAD'}


def run_signal_backtest(pairs_path, returns_path, prices_path, output_dir,
                        frequency='daily'):
    """
    Main entry point.

    Uses prices for TP/SL monitoring (daily close-to-close).
    Uses returns for signal generation (leader threshold).
    """
    # ── Load pairs ─────────────────────────────────────────────────────────
    pairs_df = pd.read_csv(pairs_path)
    pairs_df = pairs_df[
        (pairs_df['Robustesse'] == 'Forte') &
        (pairs_df['Stability_Rate'] >= 0.80) &
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

    # ── Load returns and prices ─────────────────────────────────────────────
    returns_df = pd.read_csv(returns_path, index_col=0, parse_dates=True)
    prices_df  = pd.read_csv(prices_path,  index_col=0, parse_dates=True)

    results       = []
    family_trades = {}

    for _, row in pairs_df.iterrows():
        leader   = row['Leader']
        follower = row['Follower']

        cross_corr = row.get('Cross_Corr')
        if pd.isna(cross_corr):
            cross_corr = abs(row.get('Best_AbsCorr', 1.0))
        direction = 1 if float(cross_corr) >= 0 else -1

        if leader not in returns_df.columns or follower not in returns_df.columns:
            continue
        if leader not in prices_df.columns or follower not in prices_df.columns:
            print(f'WARNING: {leader} or {follower} not in prices_df — skipping')
            continue

        # Transaction cost
        if follower in TC_TIGHT:
            tc = 0.0001
        elif follower in TC_WIDE:
            tc = 0.0003
        else:
            tc = 0.0002
        tc_roundtrip = 2 * tc

        # ── Train-period calibration (NO LOOK-AHEAD) ──────────────────────
        l_train = returns_df[leader].loc[TRAIN_START:TRAIN_END].dropna()
        f_train = returns_df[follower].loc[TRAIN_START:TRAIN_END].dropna()

        if len(l_train) < 30 or len(f_train) < 30:
            continue

        l_std = l_train.std()
        f_std = f_train.std()

        if pd.isna(l_std) or l_std == 0 or pd.isna(f_std) or f_std == 0:
            continue

        # TP/SL thresholds in return terms
        tp_threshold = TP_MULT * f_std
        sl_threshold = SL_MULT * f_std

        # ── Test period data ───────────────────────────────────────────────
        l_ret_test = returns_df[leader].loc[TEST_START:TEST_END].dropna()
        f_ret_test = returns_df[follower].loc[TEST_START:TEST_END].dropna()
        l_ret_test = l_ret_test.loc[l_ret_test.index.isin(f_ret_test.index)]
        f_ret_test = f_ret_test.loc[f_ret_test.index.isin(l_ret_test.index)]

        if len(l_ret_test) < 30:
            continue

        common_idx = l_ret_test.index
        l_ret_test = l_ret_test.loc[common_idx]
        f_ret_test = f_ret_test.loc[common_idx]

        # ── Load regime data ───────────────────────────────────────────────
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

        # ── Signal generation with dynamic exit ───────────────────────────
        n             = len(l_ret_test)
        trades        = []
        daily_ret     = pd.Series(0.0, index=f_ret_test.index)
        trade_details = []

        i                   = 0
        in_trade            = False
        trade_start         = 0
        trade_dir           = 0
        cum_ret             = 0.0
        exit_reason         = ''
        entry_position_size = 1.0
        corr_filtered_count = 0

        while i < n:
            date  = l_ret_test.index[i]
            l_val = l_ret_test.iloc[i]
            f_val = f_ret_test.iloc[i]

            if in_trade:
                # Update cumulative return — scaled by position size fixed at entry
                position_ret      = trade_dir * f_val * entry_position_size
                cum_ret          += position_ret
                daily_ret.iloc[i] = position_ret

                # Check exit conditions in priority order
                exit_now = False

                # 1. Take Profit
                if cum_ret >= tp_threshold:
                    exit_now    = True
                    exit_reason = 'TP'

                # 2. Stop Loss
                elif cum_ret <= -sl_threshold:
                    exit_now    = True
                    exit_reason = 'SL'

                # 3. Leader reversal — opposite strong signal (global threshold)
                elif abs(l_val) > SIGMA_THRESHOLD * l_std:
                    leader_dir_now = 1 if l_val > 0 else -1
                    signal_dir     = leader_dir_now * direction
                    if signal_dir != trade_dir:
                        exit_now    = True
                        exit_reason = 'Leader_Reversal'

                # 4. Max hold days fallback
                elif (i - trade_start) >= MAX_HOLD_DAYS:
                    exit_now    = True
                    exit_reason = 'MaxHold'

                if exit_now:
                    net_ret = cum_ret - tc_roundtrip
                    trades.append(net_ret)
                    trade_details.append({
                        'entry_idx':   trade_start,
                        'exit_idx':    i,
                        'direction':   trade_dir,
                        'gross_ret':   cum_ret,
                        'net_ret':     net_ret,
                        'exit_reason': exit_reason,
                        'hold_days':   i - trade_start,
                        'pos_size':    entry_position_size,
                    })
                    in_trade = False
                    cum_ret  = 0.0

            else:
                # ── Regime gate ───────────────────────────────────────────
                regime_ok = True
                if regime_series is not None and date in regime_series.index:
                    current_regime = regime_series.loc[date]
                    regime_ok = current_regime not in ['High Volatility', 'Unknown']

                # ── Rolling correlation confirmation ───────────────────────
                if i >= CORR_CONFIRM_WINDOW:
                    recent_l     = l_ret_test.iloc[max(0, i - CORR_CONFIRM_WINDOW):i]
                    recent_f     = f_ret_test.iloc[max(0, i - CORR_CONFIRM_WINDOW):i]
                    recent_corr  = recent_l.corr(recent_f)
                    corr_sign_ok = (recent_corr * np.sign(float(cross_corr))) >= CORR_CONFIRM_MIN
                else:
                    corr_sign_ok = True  # not enough history yet — allow entry

                # ── Entry signal ───────────────────────────────────────────
                if abs(l_val) > SIGMA_THRESHOLD * l_std and regime_ok and corr_sign_ok:
                    # Position sizing — disabled for volatile leaders
                    if leader in VOLATILE_LEADERS:
                        entry_position_size = 1.0
                    else:
                        signal_strength     = abs(l_val) / l_std
                        entry_position_size = min(signal_strength / SIGMA_THRESHOLD, 2.0)
                    trade_dir   = (1 if l_val > 0 else -1) * direction
                    in_trade    = True
                    trade_start = i
                    cum_ret     = 0.0
                elif abs(l_val) > SIGMA_THRESHOLD * l_std and regime_ok and not corr_sign_ok:
                    corr_filtered_count += 1

            i += 1

        # Close any open trade at end of period
        if in_trade and cum_ret != 0.0:
            net_ret = cum_ret - tc_roundtrip
            trades.append(net_ret)
            trade_details.append({
                'entry_idx':   trade_start,
                'exit_idx':    n - 1,
                'direction':   trade_dir,
                'gross_ret':   cum_ret,
                'net_ret':     net_ret,
                'exit_reason': 'EndOfPeriod',
                'hold_days':   n - 1 - trade_start,
                'pos_size':    entry_position_size,
            })

        if len(trades) == 0:
            continue

        # ── Metrics ────────────────────────────────────────────────────────
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

        ANNUALIZATION   = 52 if frequency == 'weekly' else 252
        test_days       = len(daily_ret)
        trades_per_year = n_trades / (test_days / ANNUALIZATION) if test_days > 0 else 0
        annual_ret      = trades_arr.sum() / (test_days / ANNUALIZATION) if test_days > 0 else 0

        if std_ret > 0:
            sharpe = (mean_ret / std_ret) * np.sqrt(max(trades_per_year, 1))
        else:
            sharpe = 0.0

        cum_ret_series = (1 + daily_ret).cumprod()
        rolling_max    = cum_ret_series.cummax()
        drawdowns      = (cum_ret_series - rolling_max) / rolling_max
        max_dd         = float(drawdowns.min())

        # Exit reason breakdown
        exit_counts = {}
        for td in trade_details:
            r = td['exit_reason']
            exit_counts[r] = exit_counts.get(r, 0) + 1

        avg_hold = np.mean([td['hold_days'] for td in trade_details]) if trade_details else 0

        family = _classify_family(leader, follower)
        if family not in family_trades:
            family_trades[family] = []
        family_trades[family].extend(trades)

        results.append({
            'Leader':           leader,
            'Follower':         follower,
            'Cat_Leader':       row.get('Cat_Leader', ''),
            'Cat_Follower':     row.get('Cat_Follower', ''),
            'N_Methods':        int(row.get('N_Methods', 1)),
            'Robustesse':       row.get('Robustesse', ''),
            'Score_Final':      float(row.get('Score_Final', 0)),
            'Lead_Days':        int(row.get('Lead_Days', 1)),
            'Optimal_Lag':      int(row.get('Lead_Days', 1)),
            'Direction':        direction,
            'Frequency':        'Daily',
            'Win_Rate':         round(win_rate, 4),
            'Sharpe_Ratio':     round(sharpe, 4),
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
        })

    df_results = pd.DataFrame(results).sort_values('Sharpe_Ratio', ascending=False)

    # ── Pooled family analysis ─────────────────────────────────────────────
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

    # ── Save ───────────────────────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    df_results.to_csv(os.path.join(output_dir, 'backtest_metrics.csv'), index=False)
    df_results.to_csv(os.path.join(output_dir, 'backtest_daily.csv'), index=False)
    if not df_families.empty:
        df_families.to_csv(os.path.join(output_dir, 'family_analysis.csv'), index=False)

    print(f"Saved {len(df_results)} pairs")
    print()
    print(df_results[['Leader','Follower','Sharpe_Ratio','Win_Rate',
                       'N_Trades','Avg_Hold_Days','Avg_Position_Size','Corr_Filtered',
                       'TP_Exits','SL_Exits','Leader_Rev_Exits','MaxHold_Exits']].to_string())
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
