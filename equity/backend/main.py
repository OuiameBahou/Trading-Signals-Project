"""
main.py — Equity Indices Backtest FastAPI server
Run with:  uvicorn main:app --host 0.0.0.0 --port 8003 --reload
from the equity/backend/ directory.
"""
import os
import sys
import time
import shutil
from typing import List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Local imports ──────────────────────────────────────────────────────────
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_EQUITY_DIR = os.path.dirname(_BACKEND_DIR)
for p in [_BACKEND_DIR, _EQUITY_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from engine.backtest_engine import (
    run_combination_backtest,
    run_optimization,
    run_combination_test,
    extract_trade_log as combo_trade_log,
    sanitize_floats,
)
from engine.regime_engine import (
    run_regime_backtest,
    run_regime_optimize,
    run_multi_asset,
    extract_trade_log as regime_trade_log,
)
from utils.metrics import format_backtest_response

# ── App & CORS ─────────────────────────────────────────────────────────────
app = FastAPI(title="Equity Indices Backtest API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'data', 'indices'))
os.makedirs(UPLOAD_DIR, exist_ok=True)

INDICATOR_MAPPING = {
    'BB':   {'confirmers': ['RSI', 'MACD', 'SO', 'SAR', 'EMA'], 'description': 'Bollinger Bands'},
    'RSI':  {'confirmers': ['MACD', 'BB', 'SO', 'SAR', 'EMA'],  'description': 'Relative Strength Index'},
    'MACD': {'confirmers': ['RSI', 'BB', 'SO', 'SAR', 'EMA'],   'description': 'MACD'},
    'SO':   {'confirmers': ['BB', 'MACD', 'RSI', 'SAR', 'EMA'], 'description': 'Stochastic Oscillator'},
    'SAR':  {'confirmers': ['MACD', 'RSI', 'SO', 'BB', 'EMA'],  'description': 'Parabolic SAR'},
    'EMA':  {'confirmers': ['MACD', 'RSI', 'SO', 'BB', 'SAR'],  'description': 'EMA Crossover'},
}


# ── Request models ──────────────────────────────────────────────────────────

class CombinationIndicatorConfig(BaseModel):
    primary: str
    confirmers: List[str] = []

class RegimeIndicatorConfig(BaseModel):
    weights: dict = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}
    theta_enter: float = 0.1
    eps_trend: float = 0.0165
    confirmed_indicators: List[str] = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']

class BacktestRunRequest(BaseModel):
    file_path: str
    file_type: str = 'xlsx'
    initial_capital: float = 10_000
    strategy: str = 'combination'           # 'combination' | 'regime'
    indicator_config: dict = {}
    stp_multiplier: float = 3.0
    tp_multiplier: float = 3.0

class OptimizeRequest(BaseModel):
    file_path: str
    file_type: str = 'xlsx'
    initial_capital: float = 10_000
    top_n: int = 20
    max_combinations: int = 1000

class CombinationTestRequest(BaseModel):
    file_path: str
    file_type: str = 'xlsx'
    initial_capital: float = 10_000

class RegimeOptimizeRequest(BaseModel):
    file_path: str
    file_type: str = 'xlsx'
    initial_capital: float = 10_000
    theta_range: List[float] = [0.1, 0.6, 6]
    eps_range: List[float] = [0.01, 12.0, 20]
    confirmed_indicators: List[str] = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']
    weights: dict = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}

class MultiAssetRequest(BaseModel):
    file_paths: List[str] = []
    file_types: List[str] = []
    folder_path: Optional[str] = None
    initial_capital: float = 10_000
    use_optimal_params: bool = True
    weights: dict = {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}
    theta_enter: float = 0.1
    eps_trend: float = 0.0165
    confirmed_indicators: List[str] = ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']
    stp_multiplier: float = 3.0
    tp_multiplier: float = 3.0

class MultiAssetScanRequest(BaseModel):
    file_paths: List[str] = []
    file_types: List[str] = []
    initial_capital: float = 10_000
    top_n: int = 20


# ── Helpers ────────────────────────────────────────────────────────────────

def _err(msg: str, status: int = 400):
    raise HTTPException(status_code=status, detail={"error": True, "message": msg})

def _safe_float(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if (f != f) else f   # NaN → None
    except Exception:
        return None

def _resolve_folder(folder_path: str):
    """Return list of (file_path, file_type) for all .csv/.xlsx files in folder."""
    pairs = []
    if not os.path.isdir(folder_path):
        return pairs
    for f in sorted(os.listdir(folder_path)):
        if f.endswith('.csv'):
            pairs.append((os.path.join(folder_path, f), 'csv'))
        elif f.endswith('.xlsx'):
            pairs.append((os.path.join(folder_path, f), 'xlsx'))
    return pairs


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/api/fx/indicators")
def get_indicators():
    """Return the full INDICATOR_MAPPING."""
    return INDICATOR_MAPPING


@app.get("/api/fx/data-pairs")
def get_data_pairs():
    """List available equity index data files with their server-side paths."""
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'data', 'indices'))
    if not os.path.isdir(data_dir):
        return []
    pairs = []
    for fname in sorted(os.listdir(data_dir)):
        ext = os.path.splitext(fname)[1].lower()
        if ext in ('.csv', '.xlsx'):
            pairs.append({
                'name': os.path.splitext(fname)[0],
                'file_path': os.path.join(data_dir, fname),
                'file_type': 'csv' if ext == '.csv' else 'xlsx',
            })
    return pairs


@app.post("/api/fx/upload")
async def upload_file(file: UploadFile = File(...)):
    """Save uploaded file to data/indices/ and return its server-side absolute path."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.csv', '.xlsx'):
        _err("Only .csv and .xlsx files are supported.")
    dest = os.path.join(UPLOAD_DIR, f"{int(time.time())}_{file.filename}")
    with open(dest, "wb") as f_out:
        shutil.copyfileobj(file.file, f_out)
    file_type = 'csv' if ext == '.csv' else 'xlsx'
    return {"file_path": dest, "file_type": file_type, "filename": file.filename}


@app.post("/api/fx/backtest/run")
def backtest_run(req: BacktestRunRequest):
    """Run a single backtest (combination or regime strategy)."""
    if not os.path.exists(req.file_path):
        _err(f"File not found: {req.file_path}")

    try:
        if req.strategy == 'combination':
            cfg = req.indicator_config
            primary = cfg.get('primary', 'RSI')
            confirmers = cfg.get('confirmers', [])
            bt = run_combination_backtest(
                file_path=req.file_path,
                file_type=req.file_type,
                initial_capital=req.initial_capital,
                primary=primary,
                confirmers=confirmers,
                stp_multiplier=req.stp_multiplier,
                tp_multiplier=req.tp_multiplier,
            )
            tlf = combo_trade_log

        elif req.strategy == 'regime':
            cfg = req.indicator_config
            bt = run_regime_backtest(
                file_path=req.file_path,
                file_type=req.file_type,
                initial_capital=req.initial_capital,
                weights_dict=cfg.get('weights', {'EMA': 0.2, 'MACD': 0.2, 'RSI': 0.2, 'SO': 0.2, 'PSAR': 0.1, 'BB': 0.1}),
                theta_enter=float(cfg.get('theta_enter', 0.1)),
                eps_trend=float(cfg.get('eps_trend', 0.0165)),
                confirmed_indicators=cfg.get('confirmed_indicators', ['RSI', 'MACD', 'SO', 'SAR', 'BB', 'EMA']),
                stp_multiplier=req.stp_multiplier,
                tp_multiplier=req.tp_multiplier,
            )
            tlf = regime_trade_log

        else:
            _err(f"Unknown strategy: {req.strategy}. Use 'combination' or 'regime'.")

        resp = sanitize_floats(format_backtest_response(bt, req.initial_capital, trade_log_fn=tlf))
        if resp.get('trade_log'):
            resp['positions'] = resp['trade_log']
        return resp

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Backtest failed: {str(e)}")


@app.post("/api/fx/backtest/optimize")
def backtest_optimize(req: OptimizeRequest):
    """Run grid-search optimisation using StrategyOptimizer from oppt.py."""
    if not os.path.exists(req.file_path):
        _err(f"File not found: {req.file_path}")
    try:
        results_df, sensitivity_df = run_optimization(
            file_path=req.file_path,
            file_type=req.file_type,
            initial_capital=req.initial_capital,
            top_n=req.top_n,
            max_combinations=req.max_combinations,
        )

        results_list = []
        for _, row in results_df.iterrows():
            results_list.append({
                'params': str(row.get('params', '')),
                'pnl': _safe_float(row.get('pnl')),
                'max_drawdown': _safe_float(row.get('max_drawdown')),
                'sharpe_ratio': _safe_float(row.get('sharpe_ratio')),
                'total_score': _safe_float(row.get('total_score')),
            })

        sensitivity_list = []
        if sensitivity_df is not None:
            for _, row in sensitivity_df.iterrows():
                sensitivity_list.append({
                    'indicator': str(row.get('indicator', '')),
                    'parameter': str(row.get('parameter', '')),
                    'score_sensitivity': _safe_float(row.get('score_sensitivity')),
                    'pnl_sensitivity': _safe_float(row.get('pnl_sensitivity')),
                })

        return sanitize_floats({'results': results_list, 'sensitivity': sensitivity_list})

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Optimization failed: {str(e)}")


@app.post("/api/fx/backtest/combination-test")
def backtest_combination_test(req: CombinationTestRequest):
    """Run exhaustive primary+confirmer combination test."""
    if not os.path.exists(req.file_path):
        _err(f"File not found: {req.file_path}")
    try:
        pnl_df, nb_trades_df = run_combination_test(
            file_path=req.file_path,
            file_type=req.file_type,
            initial_capital=req.initial_capital,
        )

        strategies = []
        for col in pnl_df.columns:
            series = pnl_df[col]
            nb = int(nb_trades_df[col].iloc[0]) if col in nb_trades_df.columns else 0
            final_pnl = _safe_float(series.iloc[-1]) if len(series) else 0.0

            daily_returns = series.pct_change().replace(
                [float('inf'), float('-inf')], float('nan')
            ).fillna(0)
            if len(daily_returns) > 1 and daily_returns.std() != 0:
                sharpe = float((daily_returns.mean() / daily_returns.std()) * (252 ** 0.5))
                import math
                if math.isnan(sharpe) or math.isinf(sharpe):
                    sharpe = 0.0
            else:
                sharpe = 0.0

            diffs = series.diff().dropna()
            trades_arr = diffs[diffs != 0]
            win_rate = float((trades_arr > 0).mean() * 100) if len(trades_arr) > 0 else 0.0

            pnl_points = []
            for dt, v in series.items():
                dt_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)
                pnl_points.append({'date': dt_str, 'value': _safe_float(v)})
            strategies.append({
                'name': col,
                'final_pnl': final_pnl,
                'pnl_series': pnl_points,
                'nb_trades': nb,
                'sharpe_ratio': _safe_float(sharpe),
                'win_rate': _safe_float(win_rate),
            })

        strategies.sort(key=lambda x: (x['final_pnl'] or 0), reverse=True)
        return sanitize_floats({'strategies': strategies, 'count': len(strategies)})

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Combination test failed: {str(e)}")


@app.post("/api/fx/backtest/regime-optimize")
def backtest_regime_optimize(req: RegimeOptimizeRequest):
    """2-D grid sweep over theta x eps."""
    if not os.path.exists(req.file_path):
        _err(f"File not found: {req.file_path}")
    try:
        total_returns, theta_values, eps_values, best_theta, best_eps = run_regime_optimize(
            file_path=req.file_path,
            file_type=req.file_type,
            initial_capital=req.initial_capital,
            theta_range=tuple(req.theta_range),
            eps_range=tuple(req.eps_range),
            confirmed_indicators=req.confirmed_indicators,
            weights_dict=req.weights,
        )

        def _clean_grid(arr):
            result = []
            for row in arr:
                result.append([
                    None if (isinstance(v, float) and v != v) else round(float(v), 4)
                    for v in row
                ])
            return result

        return sanitize_floats({
            'grid': _clean_grid(total_returns),
            'theta_values': [round(v, 4) for v in theta_values],
            'eps_values': [round(v, 6) for v in eps_values],
            'best_theta': round(best_theta, 4),
            'best_eps': round(best_eps, 6),
        })

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Regime optimization failed: {str(e)}")


@app.post("/api/fx/backtest/multi-asset")
def backtest_multi_asset(req: MultiAssetRequest):
    """Run regime backtest on multiple indices (folder or explicit file list)."""
    if req.folder_path:
        pairs = _resolve_folder(req.folder_path)
        if not pairs:
            _err(f"No .csv/.xlsx files found in: {req.folder_path}")
        file_paths = [p[0] for p in pairs]
        file_types = [p[1] for p in pairs]
    else:
        file_paths = req.file_paths
        file_types = req.file_types
        if not file_paths:
            _err("Provide either folder_path or file_paths.")

    for fp in file_paths:
        if not os.path.exists(fp):
            _err(f"File not found: {fp}")

    try:
        raw_results = run_multi_asset(
            file_paths=file_paths,
            file_types=file_types,
            initial_capital=req.initial_capital,
            use_optimal_params=req.use_optimal_params,
            weights_dict=req.weights,
            theta_enter=req.theta_enter,
            eps_trend=req.eps_trend,
            confirmed_indicators=req.confirmed_indicators,
            stp_multiplier=req.stp_multiplier,
            tp_multiplier=req.tp_multiplier,
        )

        assets = []
        for r in raw_results:
            if 'error' in r:
                assets.append({'name': r['name'], 'error': r['error']})
                continue
            bt = r['bt']
            resp = format_backtest_response(bt, req.initial_capital)
            assets.append({
                'name': r['name'],
                'theta': r.get('theta'),
                'eps': r.get('eps'),
                'pnl_series': resp['pnl'],
                'equity': resp['equity'],
                'metrics': resp['metrics'],
            })

        return sanitize_floats({'assets': assets})

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Multi-asset backtest failed: {str(e)}")


@app.post("/api/fx/backtest/multi-asset-scan")
def backtest_multi_asset_scan(req: MultiAssetScanRequest):
    """Run combination test for each index, return top N strategies per index."""
    if not req.file_paths:
        _err("Provide file_paths.")
    for fp in req.file_paths:
        if not os.path.exists(fp):
            _err(f"File not found: {fp}")
    try:
        per_asset = []
        for fp, ft in zip(req.file_paths, req.file_types):
            pair_name = os.path.splitext(os.path.basename(fp))[0]
            try:
                pnl_df, nb_trades_df = run_combination_test(
                    file_path=fp,
                    file_type=ft,
                    initial_capital=req.initial_capital,
                )
                strategies = []
                for col in pnl_df.columns:
                    series = pnl_df[col]
                    nb = int(nb_trades_df[col].iloc[0]) if col in nb_trades_df.columns else 0
                    final_pnl = _safe_float(series.iloc[-1]) if len(series) else 0.0
                    step = max(1, len(series) // 200)
                    pnl_points = []
                    for idx, (dt, v) in enumerate(series.items()):
                        if idx % step == 0 or idx == len(series) - 1:
                            dt_str = dt.date().isoformat() if hasattr(dt, 'date') else str(dt)
                            pnl_points.append({'date': dt_str, 'value': _safe_float(v)})
                    strategies.append({
                        'name': col,
                        'final_pnl': final_pnl,
                        'pnl_series': pnl_points,
                        'nb_trades': nb,
                    })
                strategies.sort(key=lambda x: (x['final_pnl'] or 0), reverse=True)
                top = strategies[:req.top_n]
                per_asset.append({
                    'pair': pair_name,
                    'strategies': top,
                    'total_strategies': len(strategies),
                })
            except Exception as pair_err:
                per_asset.append({
                    'pair': pair_name,
                    'strategies': [],
                    'total_strategies': 0,
                    'error': str(pair_err),
                })

        all_names = set()
        for asset in per_asset:
            for s in asset['strategies']:
                all_names.add(s['name'])

        return sanitize_floats({
            'per_asset': per_asset,
            'all_strategy_names': sorted(all_names),
        })

    except HTTPException:
        raise
    except Exception as e:
        _err(f"Multi-asset scan failed: {str(e)}")


# ── Dev entry-point ────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
