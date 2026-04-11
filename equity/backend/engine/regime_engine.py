"""
regime_engine.py
Thin wrapper around regime_strategy.py (extracted verbatim from
AWB_Backtest_Regime_Check_FIXED.ipynb).
All indicator/signal/backtest logic flows through regime_strategy — nothing
is reimplemented here.
"""
import sys
import os
import numpy as np

# Canonical location of per-pair FX data files.
_DATA_FX_DIR = r'C:/Users/info/Downloads/trading_signals_project/data/fx'

# regime_strategy.py lives in the same directory as this file.
_ENGINE_DIR = os.path.dirname(__file__)
if _ENGINE_DIR not in sys.path:
    sys.path.insert(0, _ENGINE_DIR)

from regime_strategy import (  # noqa: E402
    Backtester as RegimeBacktester,
    OPTIMAL_PARAMS,
)


# ---------------------------------------------------------------------------
# Single-asset regime backtest
# ---------------------------------------------------------------------------

def run_regime_backtest(
    file_path: str,
    file_type: str,
    initial_capital: float,
    weights_dict: dict,
    theta_enter: float,
    eps_trend: float,
    confirmed_indicators: list,
    stp_multiplier: float,
    tp_multiplier: float,
):
    """Run a single regime backtest.
    Returns the fully-run RegimeBacktester instance.
    """
    weights = [weights_dict, theta_enter, eps_trend]
    bt = RegimeBacktester(weights=weights, initial_capital=initial_capital)
    bt.load_data(file_path, type=file_type)
    bt.precompute_indicators()
    bt.confirmed_indicators = list(confirmed_indicators)
    bt._generate_combined_signals()
    bt.generate_signals()
    bt.run_backtest(stp_multiplier, tp_multiplier)
    return bt


# ---------------------------------------------------------------------------
# 2-D grid optimisation (theta × eps)
# ---------------------------------------------------------------------------

def run_regime_optimize(
    file_path: str,
    file_type: str,
    initial_capital: float,
    theta_range: tuple,   # (min, max, steps)
    eps_range: tuple,     # (min, max, steps)
    confirmed_indicators: list,
    weights_dict: dict = None,
    stp_multiplier: float = 3.0,
    tp_multiplier: float = 3.0,
):
    """Sweep theta × eps exactly as in Cell 19 of the notebook.
    Returns (total_returns 2-D array, theta_values, eps_values, best_theta, best_eps).
    """
    if weights_dict is None:
        weights_dict = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}

    theta_values = np.linspace(theta_range[0], theta_range[1], int(theta_range[2]))
    eps_values = np.linspace(eps_range[0], eps_range[1], int(eps_range[2]))

    tt, ep = np.meshgrid(theta_values, eps_values)
    total_returns = np.zeros_like(tt)

    for i in range(tt.shape[0]):
        for j in range(tt.shape[1]):
            try:
                weights = [weights_dict, float(tt[i, j]), float(ep[i, j])]
                bt = RegimeBacktester(weights=weights, initial_capital=initial_capital)
                bt.load_data(file_path, type=file_type)
                bt.precompute_indicators()
                bt.confirmed_indicators = list(confirmed_indicators)
                bt._generate_combined_signals()
                bt.generate_signals()
                bt.run_backtest(stp_multiplier, tp_multiplier)
                equity = bt.results['Equity'].values
                total_returns[i, j] = (equity[-1] / equity[0] - 1) * 100
            except Exception:
                total_returns[i, j] = float('nan')

    best_idx = np.unravel_index(
        np.nanargmax(total_returns),
        total_returns.shape
    )
    best_theta = float(tt[best_idx])
    best_eps = float(ep[best_idx])

    return total_returns, theta_values.tolist(), eps_values.tolist(), best_theta, best_eps


# ---------------------------------------------------------------------------
# Multi-asset backtest
# ---------------------------------------------------------------------------

def run_multi_asset(
    file_paths: list,
    file_types: list,
    initial_capital: float,
    use_optimal_params: bool,
    weights_dict: dict = None,
    theta_enter: float = 0.1,
    eps_trend: float = 0.0165,
    confirmed_indicators: list = None,
    stp_multiplier: float = 3.0,
    tp_multiplier: float = 3.0,
):
    """Run regime backtest on multiple assets.
    Returns list of dicts with name + pnl_series + metrics.
    """
    if weights_dict is None:
        weights_dict = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}
    if confirmed_indicators is None:
        confirmed_indicators = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']

    # When using optimal params and no explicit file list, auto-scan the canonical data/fx folder.
    if use_optimal_params and not file_paths and os.path.isdir(_DATA_FX_DIR):
        file_paths = []
        file_types = []
        for f in sorted(os.listdir(_DATA_FX_DIR)):
            if f.endswith('.csv'):
                file_paths.append(os.path.join(_DATA_FX_DIR, f))
                file_types.append('csv')
            elif f.endswith('.xlsx'):
                file_paths.append(os.path.join(_DATA_FX_DIR, f))
                file_types.append('xlsx')

    results = []
    for file_path, file_type in zip(file_paths, file_types):
        name = os.path.splitext(os.path.basename(file_path))[0]
        try:
            if use_optimal_params:
                theta, eps = _get_optimal_params(name)
            else:
                theta, eps = theta_enter, eps_trend

            bt = run_regime_backtest(
                file_path=file_path,
                file_type=file_type,
                initial_capital=initial_capital,
                weights_dict=weights_dict,
                theta_enter=theta,
                eps_trend=eps,
                confirmed_indicators=confirmed_indicators,
                stp_multiplier=stp_multiplier,
                tp_multiplier=tp_multiplier,
            )
            results.append({'name': name, 'bt': bt, 'theta': theta, 'eps': eps})
        except Exception as e:
            results.append({'name': name, 'error': str(e)})

    return results


def _get_optimal_params(name: str):
    """Return (theta, eps) for a given pair name using hardcoded optimal params."""
    name_upper = name.upper()
    for key, params in OPTIMAL_PARAMS.items():
        if key in name_upper:
            return params['theta'], params['eps']
    return 0.1, 0.0165  # default fallback


# ---------------------------------------------------------------------------
# Helper: extract trade log from regime backtester position_log
# ---------------------------------------------------------------------------

def extract_trade_log(bt):
    """Same structure as backtest_engine.extract_trade_log."""
    trade_log = []
    in_trade = None
    for i, pos in enumerate(bt.position_log):
        date = bt.data.index[i]
        close = float(bt.data['close'].iloc[i])
        date_str = date.date().isoformat() if hasattr(date, 'date') else str(date)

        if pos is not None and in_trade is None:
            in_trade = {
                'entry_date': date_str,
                'direction': int(pos['direction']),
                'entry_price': round(float(pos['entry_price']), 5),
                'size': int(pos['size']),
                'stop': round(float(pos['stop']), 5),
                'take_profit': round(float(pos['take_profit']), 5),
            }
        elif pos is None and in_trade is not None:
            direction = in_trade['direction']
            pnl = round(in_trade['size'] * (close - in_trade['entry_price']) * direction, 2)
            in_trade['exit_date'] = date_str
            in_trade['exit_price'] = round(close, 5)
            in_trade['pnl'] = pnl
            trade_log.append(in_trade)
            in_trade = None

    if in_trade is not None:
        last_close = round(float(bt.data['close'].iloc[-1]), 5)
        last_date = bt.data.index[-1]
        direction = in_trade['direction']
        pnl = round(in_trade['size'] * (last_close - in_trade['entry_price']) * direction, 2)
        in_trade['exit_date'] = (last_date.date().isoformat()
                                 if hasattr(last_date, 'date') else str(last_date))
        in_trade['exit_price'] = last_close
        in_trade['pnl'] = pnl
        in_trade['open'] = True
        trade_log.append(in_trade)

    return trade_log
