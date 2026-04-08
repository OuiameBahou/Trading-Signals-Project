"""
backtest_engine.py
Thin wrapper around oppt.py (source-of-truth).
All indicator/signal/backtest logic flows through oppt — nothing is reimplemented here.
"""
import sys
import os
import copy
import math
import pandas as pd

# Mock mpi4py before importing oppt.py (MPI only needed for ParallelStrategyOptimizer
# which is not used in the web API context).
try:
    import mpi4py  # noqa: F401
except ImportError:
    from unittest.mock import MagicMock
    _mock_mpi = MagicMock()
    sys.modules.setdefault('mpi4py', _mock_mpi)
    sys.modules.setdefault('mpi4py.MPI', _mock_mpi.MPI)

# Add FX folder (parent of backend/) to path so oppt.py is importable.
_FX_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if _FX_DIR not in sys.path:
    sys.path.insert(0, _FX_DIR)

# oppt.py has module-level script code (base_bt = Backtester(...); base_bt.load_data(...))
# that runs at import time and requires a specific data file that won't exist in the API
# context.  We load only the class/function definitions by truncating before that block.
import types as _types
_oppt = _types.ModuleType('oppt')
_oppt.__file__ = os.path.join(_FX_DIR, 'oppt.py')
with open(os.path.join(_FX_DIR, 'oppt.py'), 'r', encoding='utf-8') as _f:
    _src = _f.read()
_cutoff = _src.find('\nbase_bt = Backtester')
if _cutoff != -1:
    _src = _src[:_cutoff]
exec(compile(_src, _oppt.__file__, 'exec'), _oppt.__dict__)  # noqa: S102
sys.modules['oppt'] = _oppt

# ---------------------------------------------------------------------------
# Fix 2 — PatchedBacktester: adds missing EMA case to _get_signals.
# Subclass (not monkey-patch) so deep-copy inside
# exhaustive_primary_combination_testing preserves the fix.
# ---------------------------------------------------------------------------
_Backtester = _oppt.Backtester  # keep reference for subclassing

class PatchedBacktester(_Backtester):
    """Backtester subclass that handles the missing EMA case in _get_signals."""
    def _get_signals(self, indicator):
        if indicator == 'EMA':
            return self.sma_signal
        return super()._get_signals(indicator)


# ---------------------------------------------------------------------------
# Fix 3 — sanitize_floats: replace inf/NaN with None before JSON serialisation.
# ---------------------------------------------------------------------------

def sanitize_floats(obj):
    """Recursively replace inf and nan with None — FastAPI can't serialize them."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_floats(i) for i in obj]
    return obj


# ---------------------------------------------------------------------------
# CSV date fix — patch _clean_data so asfreq('D') gets a proper DatetimeIndex
# ---------------------------------------------------------------------------

def _patch_clean_data(bt):
    """
    oppt.py's _clean_data calls asfreq('D') which requires a DatetimeIndex.
    Investing.com CSVs have string dates — patch _clean_data to convert first.
    """
    def _patched_clean_data(self, df):
        df.index = pd.to_datetime(df.index, infer_datetime_format=True)
        df = df.asfreq('D')
        df = df.ffill().bfill()
        df = df[~df.index.duplicated(keep='first')]
        return df
    bt.data_loader._clean_data = _types.MethodType(_patched_clean_data, bt.data_loader)


# ---------------------------------------------------------------------------
# Fix A/B/C — normalize crossover signal signs
# ---------------------------------------------------------------------------

def normalize_signal_signs(bt):
    """
    oppt.py's crossover() is sign-inverted vs threshold() and generate_signals().
    crossover: series1 > series2  →  -1  (bullish in MACD terms, but negative)
    threshold: RSI < oversold     →  +1  (bullish, positive)

    Flip macd_signal and sma_signal so +1 = buy everywhere.
    SAR, SO, BB all use their own generate_signals() which is already correct.
    EMA goes through PatchedBacktester._get_signals → sma_signal, so flipping
    sma_signal covers EMA too.
    """
    bt.macd_signal = bt.macd_signal * -1
    bt.sma_signal  = bt.sma_signal  * -1


# ---------------------------------------------------------------------------
# Combination strategy
# ---------------------------------------------------------------------------

def run_combination_backtest(
    file_path: str,
    file_type: str,
    initial_capital: float,
    primary: str,
    confirmers: list,
    stp_multiplier: float,
    tp_multiplier: float,
):
    """Load data, build signals with primary+confirmer logic, run backtest.
    Returns the fully-run Backtester instance.
    """
    bt = PatchedBacktester(initial_capital=initial_capital)
    _patch_clean_data(bt)
    bt.updating = True
    bt.rsi_params  = {'period': 9,  'overbought': 70, 'oversold': 30}
    bt.macd_params = {'fast_period': 19, 'slow_period': 36, 'signal_period': 9}
    bt.bb_params   = {'window': 38, 'num_std': 2.0, 'squeeze_threshold': 0.3}
    bt.sar_params  = {'initial_af': 0.02, 'max_af': 0.2, 'step': 0.01}
    bt.so_params   = {'k_period': 14, 'd_period': 5, 'smoothing': 1}
    bt.load_data(file_path, type=file_type)
    bt.precompute_indicators()   # updating=True → uses the params above, then sets self.updating=False
    normalize_signal_signs(bt)
    bt.confirmed_indicators = [primary] + list(confirmers)
    bt._generate_combined_signals()
    bt.generate_signals()
    bt.run_backtest(stp_multiplier, tp_multiplier)
    return bt


# ---------------------------------------------------------------------------
# Parameter optimisation
# ---------------------------------------------------------------------------

def run_optimization(
    file_path: str,
    file_type: str,
    initial_capital: float,
    top_n: int = 5,
    max_combinations: int = 1000,
):
    """Run StrategyOptimizer (grid search) over the param_grid in oppt.py.
    Returns (results_df, sensitivity_df).
    """
    bt = PatchedBacktester(initial_capital=initial_capital)
    _patch_clean_data(bt)
    bt.updating = True
    bt.rsi_params  = {'period': 9,  'overbought': 70, 'oversold': 30}
    bt.macd_params = {'fast_period': 19, 'slow_period': 36, 'signal_period': 9}
    bt.bb_params   = {'window': 38, 'num_std': 2.0, 'squeeze_threshold': 0.3}
    bt.sar_params  = {'initial_af': 0.02, 'max_af': 0.2, 'step': 0.01}
    bt.so_params   = {'k_period': 14, 'd_period': 5, 'smoothing': 1}
    bt.load_data(file_path, type=file_type)
    bt.precompute_indicators()   # updating=True → uses the params above, then sets self.updating=False
    normalize_signal_signs(bt)
    # generate_signals with no confirmed_indicators → _default_signal_generation
    bt.generate_signals()

    optimizer = _oppt.StrategyOptimizer(bt, _oppt.param_grid)

    # Fix A (cont): patch _evaluate_backtester so each deep-copied bt inside
    # the optimizer also gets its freshly-recomputed signals flipped.
    def _patched_evaluate(self, bt):
        bt.precompute_indicators()
        normalize_signal_signs(bt)
        if hasattr(bt, 'combined_signals'):
            del bt.combined_signals
        if hasattr(bt, 'valid_signals'):
            del bt.valid_signals
        bt.generate_signals()
        bt.run_backtest(3, 1)
        equity = bt.results['Equity']
        pnl_series = bt.All_pnl['P&L']
        total_pnl = float(pnl_series.iloc[-1])
        peak = equity.expanding(min_periods=1).max()
        drawdown = (equity - peak) / peak
        max_dd = float(drawdown.min())
        daily_returns = pnl_series.pct_change().replace(
            [float('inf'), float('-inf')], float('nan')
        ).fillna(0)
        if len(daily_returns) > 1 and daily_returns.std() != 0:
            sharpe = float((daily_returns.mean() / daily_returns.std()) * (252 ** 0.5))
        else:
            sharpe = 0.0
        return {
            'params': self._format_params(bt),
            'pnl': total_pnl,
            'max_drawdown': max_dd,
            'sharpe_ratio': sharpe,
        }

    import types as _t
    optimizer._evaluate_backtester = _t.MethodType(_patched_evaluate, optimizer)

    results_df = optimizer.optimize(top_n=top_n, max_combinations=max_combinations)

    sensitivity_df = _oppt.calculate_parameter_sensitivity(
        results_df.to_dict('records')
    )
    return results_df, sensitivity_df


# ---------------------------------------------------------------------------
# Exhaustive combination test
# ---------------------------------------------------------------------------

def run_combination_test(
    file_path: str,
    file_type: str,
    initial_capital: float,
):
    """Run exhaustive_primary_combination_testing() over all indicator combos.
    Returns (pnl_df, nb_trades_df).
    """
    bt = PatchedBacktester(initial_capital=initial_capital)
    _patch_clean_data(bt)
    bt.updating = True
    bt.rsi_params  = {'period': 9,  'overbought': 70, 'oversold': 30}
    bt.macd_params = {'fast_period': 19, 'slow_period': 36, 'signal_period': 9}
    bt.bb_params   = {'window': 38, 'num_std': 2.0, 'squeeze_threshold': 0.3}
    bt.sar_params  = {'initial_af': 0.02, 'max_af': 0.2, 'step': 0.01}
    bt.so_params   = {'k_period': 14, 'd_period': 5, 'smoothing': 1}
    bt.load_data(file_path, type=file_type)
    bt.precompute_indicators()   # updating=True → uses the params above, then sets self.updating=False
    normalize_signal_signs(bt)
    bt.generate_signals()  # default signals needed for deep-copy base state
    pnl_df, nb_trades_df = bt.exhaustive_primary_combination_testing()
    return pnl_df, nb_trades_df


# ---------------------------------------------------------------------------
# Helper: extract trade log from position_log
# ---------------------------------------------------------------------------

def extract_trade_log(bt):
    """Build a list of closed-trade dicts from bt.position_log."""
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
