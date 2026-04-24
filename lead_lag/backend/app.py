"""
Lead-Lag Signal Platform — Flask API + Frontend Server
Attijariwafa Bank | Quant Research Division
"""
import os
import sys
import json
import pandas as pd
import numpy as np
from io import BytesIO
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from flask import Flask, jsonify, send_from_directory, abort, Response
from flask_cors import CORS

# Import backtest helpers for the per-pair equity-curve endpoint
_SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)
try:
    from signal_backtest import (
        _backtest_pair_loop, _precompute_corr_ok, _precompute_regime_ok,
        TC_TIGHT, TC_WIDE, TRAIN_START, TRAIN_END, TEST_START, TEST_END,
    )
    _BACKTEST_AVAILABLE = True
except Exception:
    _BACKTEST_AVAILABLE = False

app = Flask(__name__, static_folder='../frontend/dist', template_folder='../frontend/dist')
CORS(app)

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATS_DIR  = os.path.join(BASE_DIR, 'results', 'stats')
STATS_DAILY = os.path.join(STATS_DIR, 'daily')
DATA_DIR   = os.path.join(BASE_DIR, 'data', 'clean')
FX_DATA_DIR      = os.path.abspath(os.path.join(BASE_DIR, '..', '..', 'fx', 'backend', 'data', 'fx'))
INDICES_DATA_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', '..', 'fx', 'backend', 'data', 'indices'))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_csv(path):
    try:
        if not os.path.exists(path):
            return None
        df = pd.read_csv(path)
        df = df.replace([np.inf, -np.inf], np.nan)
        return df
    except Exception:
        return None

def df_to_json(df):
    if df is None:
        return jsonify({'error': 'Data not found'}), 404
    return jsonify(json.loads(df.to_json(orient='records', date_format='iso')))

def safe_bool(v):
    if isinstance(v, bool): return v
    if isinstance(v, str):  return v.strip().lower() in ('true', '1', 'yes')
    try: return bool(v)
    except: return False

def detect_category(asset, existing_cat=None):
    # Normalize inputs
    asset_str = str(asset).strip().upper()

    # Pre-normalization of existing categories to handle typos or old names
    e = str(existing_cat).strip().lower() if existing_cat else ""
    if any(x in e for x in ['commod', 'gold', 'silver', 'brent', 'crude']):
        matched_cat = 'Commodities'
    elif any(x in e for x in ['fx', 'forex', 'g10', 'usd', 'eur']):
        matched_cat = 'FX G10'
    elif any(x in e for x in ['bond', 'rate', 'treasury', 'yield', 'bund', 'gilt', 'oat']):
        matched_cat = 'Rates'
    elif any(x in e for x in ['index', 'indices', 'equity', 'equities', 'sp500', 'nasdaq', 'russell']):
        matched_cat = 'Indices'
    else:
        matched_cat = 'Other'

    # Mapping keywords to assets directly
    a = asset_str.replace('_', ' ')

    # 1. Commodities
    if any(x in a for x in ['GAS', 'CRUDE', 'BRENT', 'GOLD', 'SILVER', 'COPPER', 'ZINC', 'LEAD', 'PLATINUM', 'WTI', 'OIL', 'NAT', 'COCOA', 'CORN']):
        return 'Commodities'
    # 2. Indices
    if any(x in a for x in ['SP500', 'NASDAQ', 'DOWJONES', 'RUSSELL', 'ASX200', 'NIKKEI', 'DAX', 'CAC40', 'FTSE', 'EUROSTOXX', 'HANGSENG', 'VIX', 'S&P']):
        return 'Indices'
    # 3. Rates / Bonds
    if any(x in a for x in ['US10Y', 'BUND', 'GILT', 'OAT', 'TREASURY', 'BOND', 'RATE', 'FRANCE']):
        return 'Rates'
    # 4. FX
    if any(x in a for x in ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'CAD', 'NZD', 'SEK', 'NOK', 'FX']):
        return 'FX G10'

    return matched_cat if matched_cat != 'Other' else 'Other'

# ---------------------------------------------------------------------------
# NEW: Unified all-pairs endpoint
# Merges Lag + Granger + VAR into one dataset, flagging which methods confirm each pair
# ---------------------------------------------------------------------------
@app.route('/api/all_pairs')
def api_all_pairs():
    """Serves ALL validated pairs from the official registry.

    The official file contains all tiers (Triple/Double/Single) generated
    exclusively from the new banking-grade pipeline thresholds.
    No legacy CSV fallback — ensures data consistency.
    """
    df_official = load_csv(os.path.join(STATS_DAILY, 'official_leader_follower_pairs.csv'))
    if df_official is None or df_official.empty:
        return jsonify([])

    # Standardize boolean columns
    for col in ['Lag_Validated', 'Granger_Validated', 'VAR_Validated']:
        if col in df_official.columns:
            df_official[col] = df_official[col].apply(safe_bool)

    # Override CSV classification with our robust detect_category logic
    for idx, row in df_official.iterrows():
        df_official.at[idx, 'Cat_Leader'] = detect_category(row['Leader'], row.get('Cat_Leader'))
        df_official.at[idx, 'Cat_Follower'] = detect_category(row['Follower'], row.get('Cat_Follower'))

    return jsonify(json.loads(df_official.to_json(orient='records', date_format='iso')))

# ---------------------------------------------------------------------------
# Existing endpoints (kept clean)
# ---------------------------------------------------------------------------

@app.route('/api/assets')
def api_assets():
    # Use our unified strict logic to count relations
    all_pairs = api_all_pairs().get_json()

    df_returns = load_csv(os.path.join(DATA_DIR, 'returns_daily.csv'))
    if df_returns is None:
        return jsonify({'error': 'Source data not found'}), 404

    assets_list = df_returns.columns[1:].tolist()

    # Pre-map categories from the official pairs file
    df_pairs = load_csv(os.path.join(STATS_DAILY, 'official_leader_follower_pairs.csv'))
    cat_map = {}
    if df_pairs is not None:
        for _, row in df_pairs.iterrows():
            cat_map[row['Leader']]   = row['Cat_Leader']
            cat_map[row['Follower']] = row['Cat_Follower']

    # Initialize counts based on strictly validated pairs
    leader_counts = {}
    follower_counts = {}
    for p in all_pairs:
        l = p.get('Leader')
        f = p.get('Follower')
        if not l or not f: continue

        # We count a "lead" or "follow" if the relationship is validated by AT LEAST one good test
        # (Already filtered by api_all_pairs thresholds)
        leader_counts[l] = leader_counts.get(l, 0) + 1
        follower_counts[f] = follower_counts.get(f, 0) + 1

    results = []
    for asset in assets_list:
        raw_cat = cat_map.get(asset)
        cat = detect_category(asset, raw_cat)

        l_cnt = int(leader_counts.get(asset, 0))
        f_cnt = int(follower_counts.get(asset, 0))

        results.append({
            'Asset':          asset,
            'Category':       cat,
            'Leader_Count':   l_cnt,
            'Follower_Count': f_cnt,
            'Total_Relations': l_cnt + f_cnt
        })
    return jsonify(results)

@app.route('/api/asset/<asset>')
def api_asset_detail(asset):
    # Returns the list of assets this specific asset leads or follows
    all_pairs = api_all_pairs().get_json()
    leaders = []
    followers = []

    for p in all_pairs:
        if p['Leader'] == asset:
            # Asset is the leader, so add the follower to the list
            followers.append({
                'Asset': p['Follower'],
                'Category': p['Cat_Follower'],
                'Robustesse': p['Robustesse'],
                'Score_Final': p['Score_Final'],
                'Lag_Validated': p['Lag_Validated'],
                'Granger_Validated': p['Granger_Validated'],
                'VAR_Validated': p['VAR_Validated'],
                'Best_AbsCorr': p['Best_AbsCorr'],
                'Lead_Days': p['Lead_Days'],
                'Score_Lag': p['Score_Lag'],
                'Score_Granger': p['Score_Granger'],
                'Score_VAR': p['Score_VAR'],
                'Granger_Fstat': p['Granger_Fstat'],
                'VAR_Impact': p['VAR_Impact']
            })
        if p['Follower'] == asset:
            # Asset is following these leaders
            leaders.append({
                'Asset': p['Leader'],
                'Category': p['Cat_Leader'],
                'Robustesse': p['Robustesse'],
                'Score_Final': p['Score_Final'],
                'Lag_Validated': p['Lag_Validated'],
                'Granger_Validated': p['Granger_Validated'],
                'VAR_Validated': p['VAR_Validated'],
                'Best_AbsCorr': p['Best_AbsCorr'],
                'Lead_Days': p['Lead_Days'],
                'Score_Lag': p['Score_Lag'],
                'Score_Granger': p['Score_Granger'],
                'Score_VAR': p['Score_VAR'],
                'Granger_Fstat': p['Granger_Fstat'],
                'VAR_Impact': p['VAR_Impact']
            })

    return jsonify({
        'asset': asset,
        'leaders': leaders,
        'followers': followers
    })

@app.route('/api/pairs')
def api_pairs():
    df = load_csv(os.path.join(STATS_DAILY, 'official_leader_follower_pairs.csv'))
    return df_to_json(df)

@app.route('/api/correlation_matrix')
def api_corr_matrix():
    df = load_csv(os.path.join(STATS_DAILY, 'corr_matrix_daily.csv'))
    if df is None:
        return jsonify({'error': 'Data not found'}), 404
    df = df.set_index(df.columns[0])
    assets = df.columns.tolist()
    data = []
    for row_asset in assets:
        for col_asset in assets:
            val = df.loc[row_asset, col_asset] if row_asset in df.index else None
            data.append({
                'x': col_asset, 'y': row_asset,
                'v': round(float(val), 4) if val is not None and pd.notna(val) else None
            })
    return jsonify({'assets': assets, 'data': data})

@app.route('/api/summary_stats')
def api_summary_stats():
    try:
        all_pairs_data = api_all_pairs().get_json()
    except:
        all_pairs_data = []

    n_triple = sum(1 for p in all_pairs_data if int(p.get('N_Methods', 0)) == 3)
    n_total  = len(all_pairs_data)

    # Top leader — must exist in trading signals backtest AND be Forte/Moderate
    bt_path = os.path.join(BASE_DIR, 'results', 'signals', 'backtest_daily.csv')
    bt_df   = load_csv(bt_path)
    signal_leaders = set(bt_df['Leader'].unique()) if bt_df is not None else set()

    validated_pairs = [p for p in all_pairs_data
                       if p.get('Robustesse') in ('Forte', 'Moderate')
                       and p.get('Leader') in signal_leaders]
    leader_freq     = {}
    leader_strength = {}
    for p in validated_pairs:
        l = p.get('Leader')
        if l:
            leader_freq[l]     = leader_freq.get(l, 0) + 1
            leader_strength[l] = leader_strength.get(l, 0) + float(p.get('Score_Final', 0))

    top_leader = max(signal_leaders) if signal_leaders else 'N/A'
    top_count  = 0
    if leader_freq:
        top_leader = max(leader_freq,
                         key=lambda l: (leader_freq[l], leader_strength.get(l, 0)))
        top_count  = leader_freq[top_leader]

    result = {
        'official_pairs':   n_triple,
        'total_validated':  n_total,
        'top_leader':       top_leader,
        'top_leader_count': top_count,
        'assets_covered':   39,
        'universe_pairs':   1482,
    }
    print('summary_stats:', result)
    return jsonify(result)

@app.route('/api/market_regimes')
def api_market_regimes():
    # Load advanced market regimes specific to pairs
    df = load_csv(os.path.join(STATS_DIR, 'regimes', 'pairs_current_regimes.csv'))
    return df_to_json(df)


@app.route('/api/regime_history/<leader>')
def api_regime_history(leader):
    """Return the Test-period (2023+) daily regime history for a given leader asset."""
    path = os.path.join(STATS_DIR, 'regimes', 'pairs', f'regime_{leader}.csv')
    df = load_csv(path)
    if df is None:
        return jsonify({'error': f'No regime data for {leader}'}), 404
    # Filter to test period only
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'])
        df = df[df['Date'] >= '2023-01-01']
        df['Date'] = df['Date'].dt.strftime('%Y-%m-%d')
    return df_to_json(df)


# ---------------------------------------------------------------------------
# Trading Signals
# ---------------------------------------------------------------------------
TRADING_FREQ_MAP    = {'1d': 'daily', '1h': 'hourly', '1w': 'weekly'}
TRADING_FREQ_LABELS = {'1d': 'Daily', '1h': 'Hourly', '1w': 'Weekly'}

@app.route('/api/trading_signals/<frequency>')
def api_trading_signals_freq(frequency):
    dir_name = TRADING_FREQ_MAP.get(frequency)
    if not dir_name:
        return jsonify({'error': f'Unknown frequency: {frequency}'}), 400

    # Primary: frequency-specific file. Fallback to daily for 1d.
    bt_path = os.path.join(BASE_DIR, 'results', 'signals', f'backtest_{dir_name}.csv')
    if not os.path.exists(bt_path):
        bt_path = os.path.join(BASE_DIR, 'results', 'signals', 'backtest_metrics.csv')

    df = load_csv(bt_path)
    if df is None or df.empty:
        return jsonify({
            'leaders': {}, 'frequency': frequency,
            'label': TRADING_FREQ_LABELS.get(frequency, frequency),
            'total_pairs': 0
        })

    # Load current regimes for enrichment
    regime_df = load_csv(os.path.join(STATS_DIR, 'regimes', 'pairs_current_regimes.csv'))
    regime_map = {}
    if regime_df is not None:
        for _, row in regime_df.iterrows():
            regime_map[(row['Leader'], row['Follower'])] = row.get('Current_Regime', 'Unknown')

    # Keep only Forte (triple-validated) pairs
    if 'Robustesse' in df.columns:
        df = df[df['Robustesse'] == 'Forte'].copy()
    if df.empty:
        return jsonify({
            'leaders': {}, 'frequency': frequency,
            'label': TRADING_FREQ_LABELS.get(frequency, frequency),
            'total_pairs': 0
        })

    # Enrich with categories and regime
    for idx, row in df.iterrows():
        if 'Cat_Leader' not in df.columns or pd.isna(row.get('Cat_Leader')):
            df.at[idx, 'Cat_Leader'] = detect_category(row['Leader'])
        if 'Cat_Follower' not in df.columns or pd.isna(row.get('Cat_Follower')):
            df.at[idx, 'Cat_Follower'] = detect_category(row['Follower'])
        df.at[idx, 'Current_Regime'] = regime_map.get(
            (row['Leader'], row['Follower']), 'Unknown'
        )

    # Build leader-centric structure
    leaders = {}
    for leader_name in df['Leader'].unique():
        ldf = df[df['Leader'] == leader_name].copy()
        ldf = ldf.sort_values('Sharpe_Ratio', ascending=False)
        followers_list = json.loads(ldf.to_json(orient='records', date_format='iso'))
        leaders[leader_name] = {
            'leader':         leader_name,
            'category':       detect_category(leader_name),
            'follower_count': len(followers_list),
            'avg_win_rate':   float(ldf['Win_Rate'].mean()) if 'Win_Rate' in ldf.columns else 0,
            'best_sharpe':    float(ldf['Sharpe_Ratio'].max()) if 'Sharpe_Ratio' in ldf.columns else 0,
            'followers':      followers_list,
        }

    return jsonify({
        'leaders':     leaders,
        'frequency':   frequency,
        'label':       TRADING_FREQ_LABELS.get(frequency, frequency),
        'total_pairs': len(df),
    })


# ---------------------------------------------------------------------------
# Per-pair equity curve  (reuses the backtest loop on demand)
# ---------------------------------------------------------------------------
@app.route('/api/signals/equity/<leader>/<follower>')
def api_signals_equity(leader, follower):
    if not _BACKTEST_AVAILABLE:
        return jsonify({'error': 'Backtest module unavailable'}), 503

    # Fetch saved params for this pair
    bt_df = load_csv(os.path.join(BASE_DIR, 'results', 'signals', 'backtest_daily.csv'))
    if bt_df is None:
        return jsonify({'error': 'No backtest data'}), 404
    mask = (bt_df['Leader'] == leader) & (bt_df['Follower'] == follower)
    if not mask.any():
        return jsonify({'error': f'{leader}->{follower} not found'}), 404
    row = bt_df[mask].iloc[0]

    sigma     = float(row.get('Sigma_Used',   1.5))
    lead_days = int(row.get('Lead_Days_Used', 1))
    direction = int(row.get('Direction',       1))
    tc        = 0.0001 if follower in TC_TIGHT else (0.0003 if follower in TC_WIDE else 0.0002)

    # Load returns
    try:
        returns_df = pd.read_csv(os.path.join(DATA_DIR, 'returns_daily.csv'),
                                 index_col=0, parse_dates=True)
    except Exception:
        return jsonify({'error': 'Returns data not found'}), 404
    if leader not in returns_df.columns or follower not in returns_df.columns:
        return jsonify({'error': 'Asset columns missing'}), 404

    # Train-period std calibration
    l_tr = returns_df[leader].loc[TRAIN_START:TRAIN_END].dropna()
    f_tr = returns_df[follower].loc[TRAIN_START:TRAIN_END].dropna()
    comm = l_tr.index.intersection(f_tr.index)
    l_std = float(l_tr.loc[comm].std())
    f_std = float(f_tr.loc[comm].std())

    # Test-period data
    l_test = returns_df[leader].loc[TEST_START:TEST_END].dropna()
    f_test = returns_df[follower].loc[TEST_START:TEST_END].dropna()
    comm_t = l_test.index.intersection(f_test.index)
    l_test = l_test.loc[comm_t]
    f_test = f_test.loc[comm_t]

    # Regime data
    regime_series = None
    rp = os.path.join(STATS_DIR, 'regimes', 'pairs', f'regime_{leader}.csv')
    if os.path.exists(rp):
        rdf = pd.read_csv(rp, index_col=0, parse_dates=True)
        if 'Regime' in rdf.columns:
            regime_series = rdf['Regime']

    corr_ok   = _precompute_corr_ok(l_test, f_test, float(direction))
    regime_ok = _precompute_regime_ok(regime_series, l_test.index)

    _, daily_arr, trade_details, _ = _backtest_pair_loop(
        l_test.values, f_test.values, l_std, f_std,
        lead_days, direction, leader,
        corr_ok, regime_ok,
        sigma, 2 * tc,
    )

    daily_ret   = pd.Series(daily_arr, index=f_test.index)
    equity_ser  = (1 + daily_ret).cumprod()

    equity_data = [{'date': d.strftime('%Y-%m-%d'), 'value': round(float(v), 6)}
                   for d, v in equity_ser.items()]

    try:
        monthly = daily_ret.resample('ME').apply(lambda x: float((1 + x).prod() - 1))
    except Exception:
        monthly = daily_ret.resample('M').apply(lambda x: float((1 + x).prod() - 1))
    monthly_pnl = [{'month': d.strftime('%b %y'), 'return': round(float(v) * 100, 2)}
                   for d, v in monthly.items()]

    dates     = f_test.index.tolist()
    trade_log = []
    for td in trade_details:
        ei, xi = td['entry_idx'], td['exit_idx']
        trade_log.append({
            'entry_date':  dates[ei].strftime('%Y-%m-%d') if ei < len(dates) else None,
            'exit_date':   dates[xi].strftime('%Y-%m-%d') if xi < len(dates) else None,
            'direction':   int(td['direction']),
            'net_ret':     round(float(td['net_ret']) * 100, 3),
            'exit_reason': td['exit_reason'],
            'hold_days':   int(td['hold_days']),
            'pos_size':    round(float(td['pos_size']), 3),
        })

    return jsonify({
        'leader':      leader,
        'follower':    follower,
        'params':      {'sigma': sigma, 'lead_days': lead_days},
        'equity':      equity_data,
        'monthly_pnl': monthly_pnl,
        'trades':      trade_log,
        'period':      {'start': TEST_START, 'end': TEST_END},
    })


# ---------------------------------------------------------------------------
# FX Market Data (used by FxDashboard and FxCommandCenter)
# ---------------------------------------------------------------------------
@app.route('/api/fx/dashboard')
def api_fx_dashboard():
    search_paths = [
        (FX_DATA_DIR,      'FX'),
        (INDICES_DATA_DIR, 'Indices'),
    ]

    seen = set()
    all_files = []
    for d, cat in search_paths:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.startswith('~') or f.startswith('.'):
                continue
            if not (f.endswith('.csv') or f.endswith('.xlsx')):
                continue
            pair_name = os.path.splitext(f)[0]
            if pair_name in seen:
                continue
            seen.add(pair_name)
            all_files.append((f, os.path.join(d, f), cat))

    dashboard_data = []
    for f, file_path, category in all_files:
        pair_name = os.path.splitext(f)[0]
        try:
            if f.endswith('.xlsx'):
                df = pd.read_excel(file_path, parse_dates=True, index_col=0).tail(100)
                close = pd.to_numeric(df.get('PX_LAST', df.iloc[:, 0]), errors='coerce')
                high  = pd.to_numeric(df.get('PX_HIGH', df.iloc[:, 1]), errors='coerce')
                low   = pd.to_numeric(df.get('PX_LOW',  df.iloc[:, 2]), errors='coerce')
            else:
                df = pd.read_csv(file_path, parse_dates=True, index_col=0).tail(100)
                # Investing.com layout: Price(close), Open, High, Low, Vol., Change%
                close = pd.to_numeric(df.iloc[:, 0], errors='coerce')
                high  = pd.to_numeric(df.iloc[:, 2], errors='coerce')
                low   = pd.to_numeric(df.iloc[:, 3], errors='coerce')

            close = close.ffill()
            if len(close.dropna()) < 20:
                continue

            sma = close.rolling(20).mean()
            slope = sma.pct_change()
            tr  = pd.concat([high - low,
                             (high - close.shift()).abs(),
                             (low  - close.shift()).abs()], axis=1).max(axis=1)
            atr = tr.rolling(14).mean()

            last_price = float(close.iloc[-1])
            last_slope = float(slope.iloc[-1])
            last_atr   = float(atr.iloc[-1])
            slope_bps  = last_slope * 10000
            mean_atr   = float(atr.mean())

            if abs(slope_bps) > 5:
                hmm_regime = 'Bull' if slope_bps > 0 else 'Bear'
            elif last_atr > mean_atr * 1.3:
                hmm_regime = 'High Volatility'
            else:
                hmm_regime = 'Range'

            dashboard_data.append({
                'pair':       pair_name,
                'price':      last_price,
                'hmm_regime': hmm_regime,
                'trend':      'Bullish' if last_slope > 0 else 'Bearish',
                'atr':        last_atr,
                'slope':      slope_bps,
                'category':   category,
                'date':       str(df.index[-1].date()) if isinstance(df.index, pd.DatetimeIndex) else 'N/A',
            })
        except Exception as e:
            print(f"Error processing {pair_name} for dashboard: {e}")

    return jsonify(dashboard_data)


@app.route('/api/fx/live_signals')
def api_fx_live_signals():
    scan_dirs = [FX_DATA_DIR, INDICES_DATA_DIR]

    seen = set()
    all_files = []
    for d in scan_dirs:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.startswith('~') or f.startswith('.'):
                continue
            if not (f.endswith('.csv') or f.endswith('.xlsx')):
                continue
            pair_name = os.path.splitext(f)[0]
            if pair_name not in seen:
                seen.add(pair_name)
                all_files.append((f, os.path.join(d, f)))

    signals_data = []

    for f, file_path in all_files:
        pair_name = os.path.splitext(f)[0]

        try:
            # Load and normalise data
            if f.endswith('.xlsx'):
                df = pd.read_excel(file_path, index_col=0)
                df.index = pd.to_datetime(df.index)
                df = df.sort_index()
                close = pd.to_numeric(df['PX_LAST'], errors='coerce').ffill()
                high  = pd.to_numeric(df['PX_HIGH'], errors='coerce').ffill()
                low   = pd.to_numeric(df['PX_LOW'],  errors='coerce').ffill()
            else:
                df = pd.read_csv(file_path, index_col=0)
                df.index = pd.to_datetime(df.index, infer_datetime_format=True)
                df = df.sort_index()
                # Investing.com CSV layout: Price(close), Open, High, Low, Vol., Change%
                close = pd.to_numeric(df.iloc[:, 0], errors='coerce').ffill()
                high  = pd.to_numeric(df.iloc[:, 2], errors='coerce').ffill()
                low   = pd.to_numeric(df.iloc[:, 3], errors='coerce').ffill()

            if len(close.dropna()) < 30:
                continue

            latest_price = float(close.iloc[-1])
            latest_date  = (str(close.index[-1].date())
                            if hasattr(close.index[-1], 'date') else str(close.index[-1]))

            # ATR (14-period)
            prev_close = close.shift(1)
            tr = pd.concat([(high - low).abs(),
                            (high - prev_close).abs(),
                            (low  - prev_close).abs()], axis=1).max(axis=1)
            atr = tr.rolling(14).mean()
            latest_atr = float(atr.iloc[-1]) if pd.notna(atr.iloc[-1]) else latest_price * 0.005

            # RSI (14-period)
            delta = close.diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rs    = gain / loss.replace(0, np.nan)
            rsi   = 100 - (100 / (1 + rs))
            rsi_val = float(rsi.iloc[-1]) if pd.notna(rsi.iloc[-1]) else None

            # MACD (12, 26, 9)
            ema12       = close.ewm(span=12, adjust=False).mean()
            ema26       = close.ewm(span=26, adjust=False).mean()
            macd_line   = ema12 - ema26
            signal_line = macd_line.ewm(span=9, adjust=False).mean()
            macd_val    = float(macd_line.iloc[-1])   if pd.notna(macd_line.iloc[-1])   else None
            sig_val     = float(signal_line.iloc[-1]) if pd.notna(signal_line.iloc[-1]) else None
            macd_bull   = (macd_val > sig_val) if (macd_val is not None and sig_val is not None) else None

            # SMA 50 / 200 golden cross
            sma50_s  = close.rolling(50).mean()
            sma200_s = close.rolling(200).mean()
            sma50_val  = float(sma50_s.iloc[-1])  if pd.notna(sma50_s.iloc[-1])  else None
            sma200_val = float(sma200_s.iloc[-1]) if pd.notna(sma200_s.iloc[-1]) else None
            golden_cross = (sma50_val > sma200_val) if (sma50_val is not None and sma200_val is not None) else None

            # Multi-indicator consensus action
            bull_count = sum([macd_bull is True,
                              rsi_val is not None and rsi_val < 40,
                              golden_cross is True])
            bear_count = sum([macd_bull is False,
                              rsi_val is not None and rsi_val > 60,
                              golden_cross is False])

            if bull_count >= 2:
                action = 'LONG'
                tp = latest_price + (latest_atr * 1.5)
                sl = latest_price - (latest_atr * 2.0)
            elif bear_count >= 2:
                action = 'SHORT'
                tp = latest_price - (latest_atr * 1.5)
                sl = latest_price + (latest_atr * 2.0)
            else:
                action = 'FLAT'
                tp = sl = None

            rsi_state = ('Overbought' if rsi_val and rsi_val > 70
                         else 'Oversold' if rsi_val and rsi_val < 30
                         else 'Neutral') if rsi_val is not None else 'N/A'
            conviction = 'High' if (bull_count >= 3 or bear_count >= 3) else 'Medium'

            signals_data.append({
                'pair':         pair_name,
                'action':       action,
                'price':        latest_price,
                'atr':          latest_atr,
                'tp':           tp,
                'sl':           sl,
                'date':         latest_date,
                'rsi':          round(rsi_val, 2) if rsi_val is not None else None,
                'rsi_state':    rsi_state,
                'macd_bull':    macd_bull,
                'golden_cross': golden_cross,
                'conviction':   conviction,
            })

        except Exception as e:
            print(f"Error computing live signal for {pair_name}: {e}")

    return jsonify(signals_data)


# ---------------------------------------------------------------------------
# Rolling Correlation Plot (on-the-fly)
# ---------------------------------------------------------------------------
@app.route('/api/plot/rolling/<leader>/<follower>')
def api_plot_rolling(leader, follower):
    try:
        returns_df = pd.read_csv(os.path.join(DATA_DIR, 'returns_daily.csv'),
                                 index_col=0, parse_dates=True)
    except Exception:
        abort(404)

    if leader not in returns_df.columns or follower not in returns_df.columns:
        abort(404)

    windows = [30, 60, 90]
    colors  = ['#3b82f6', '#f59e0b', '#10b981']

    fig, ax = plt.subplots(figsize=(12, 5))
    fig.patch.set_facecolor('#0f1117')
    ax.set_facecolor('#0f1117')

    for window, color in zip(windows, colors):
        roll_corr = returns_df[leader].rolling(window=window).corr(returns_df[follower])
        ax.plot(roll_corr.index, roll_corr.values,
                label=f'{window}d', color=color, linewidth=1.5, alpha=0.9)

    ax.axhline(y=0, color='#ffffff30', linewidth=0.8, linestyle='--')
    ax.set_title(f'Rolling Correlation: {leader} → {follower}',
                 color='white', fontsize=13, fontweight='bold', pad=12)
    ax.set_ylabel('Correlation', color='#9ca3af', fontsize=10)
    ax.tick_params(colors='#6b7280', labelsize=8)
    for spine in ['bottom', 'left']:
        ax.spines[spine].set_color('#374151')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.legend(framealpha=0, labelcolor='white', fontsize=9)
    ax.set_ylim(-1.05, 1.05)
    fig.tight_layout()

    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=120, bbox_inches='tight', facecolor='#0f1117')
    buf.seek(0)
    plt.close(fig)

    return Response(buf.getvalue(), mimetype='image/png')


# ---------------------------------------------------------------------------
# Frontend Routes
# ---------------------------------------------------------------------------
@app.route('/')
@app.route('/<path:subpath>')
def serve_frontend(subpath=''):
    frontend_path = os.path.join(BASE_DIR, '..', 'frontend', 'dist', 'index.html')
    if os.path.exists(frontend_path):
        with open(frontend_path, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}
    return "Frontend not built. Run npm run build in frontend/.", 404

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, '..', 'frontend', 'dist', 'assets'), filename)

@app.route('/figures/<path:filename>')
def serve_figures(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'figures'), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)
