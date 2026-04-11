"""
metrics.py
Formats raw Backtester output into JSON-serialisable dicts.
"""
import numpy as np
import pandas as pd


def format_backtest_response(bt, initial_capital: float, trade_log_fn=None):
    """Build the full API response payload from a completed backtester.

    Parameters
    ----------
    bt              : Backtester (oppt.Backtester or regime_strategy.Backtester)
    initial_capital : float
    trade_log_fn    : callable(bt) → list[dict]  (extract_trade_log from engine module)
    """
    equity_series = bt.results['Equity']
    pnl_series = bt.All_pnl['P&L']

    # ── Metrics ────────────────────────────────────────────────────────────
    returns = equity_series.pct_change().dropna()
    last_equity = float(equity_series.iloc[-1])
    total_return = (last_equity / initial_capital - 1) * 100

    years = len(equity_series) / 252
    annual_return = (
        ((last_equity / initial_capital) ** (1 / years) - 1) * 100
        if years > 0 else total_return
    )

    max_drawdown = float(
        (equity_series / equity_series.cummax() - 1).min() * 100
    )

    sharpe_ratio = float(
        np.sqrt(252) * returns.mean() / returns.std()
        if len(returns) > 1 and returns.std() != 0 else 0.0
    )

    down_returns = returns[returns < 0]
    sortino_ratio = float(
        np.sqrt(252) * returns.mean() / down_returns.std()
        if len(down_returns) > 1 and down_returns.std() != 0 else 0.0
    )

    buy_hold_return = float(
        (bt.data['close'].iloc[-1] / bt.data['close'].iloc[0] - 1) * 100
    )

    last_pnl = float(pnl_series.iloc[-1])

    # Win-rate / profit-factor from incremental P&L diff
    pnl_diff = pnl_series.diff().dropna()
    closed_trades = pnl_diff[pnl_diff != 0]
    win_rate = float((closed_trades > 0).mean() * 100) if len(closed_trades) else 0.0
    gross_profit = float(closed_trades[closed_trades > 0].sum())
    gross_loss = float(abs(closed_trades[closed_trades < 0].sum()))
    profit_factor = round(gross_profit / gross_loss, 3) if gross_loss != 0 else None

    # ── Series (keep NaN-safe) ─────────────────────────────────────────────
    def _series_to_records(s, value_key):
        out = []
        for dt, val in s.items():
            dt_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)
            out.append({
                'date': dt_str,
                value_key: None if (isinstance(val, float) and np.isnan(val)) else round(float(val), 4),
            })
        return out

    equity_records = _series_to_records(equity_series, 'value')
    pnl_records = _series_to_records(pnl_series, 'value')

    # ── Positions ──────────────────────────────────────────────────────────
    positions = []
    for pos in bt.position_log:
        if pos is not None:
            entry_date = pos['entry_date']
            if hasattr(entry_date, 'date'):
                entry_date = entry_date.date().isoformat()
            else:
                entry_date = str(entry_date)
            positions.append({
                'entry_date': entry_date,
                'entry_price': round(float(pos['entry_price']), 5),
                'direction': int(pos['direction']),
                'size': int(pos['size']),
                'stop': round(float(pos['stop']), 5),
                'take_profit': round(float(pos['take_profit']), 5),
            })

    # ── Trade log (optional) ──────────────────────────────────────────────
    trade_log = trade_log_fn(bt) if trade_log_fn else []

    return {
        'equity': equity_records,
        'pnl': pnl_records,
        'metrics': {
            'total_return': round(total_return, 3),
            'annual_return': round(annual_return, 3),
            'max_drawdown': round(max_drawdown, 3),
            'sharpe_ratio': round(sharpe_ratio, 3),
            'sortino_ratio': round(sortino_ratio, 3),
            'win_rate': round(win_rate, 2),
            'profit_factor': profit_factor,
            'nb_trades': int(bt.nb_trades),
            'buy_hold_return': round(buy_hold_return, 3),
            'last_pnl': round(last_pnl, 2),
        },
        'positions': positions,
        'trade_log': trade_log,
    }
