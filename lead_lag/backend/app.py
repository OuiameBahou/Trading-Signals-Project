"""
Lead-Lag Signal Platform — Flask API + Frontend Server
Attijariwafa Bank | Quant Research Division
"""
import os
import json
import pandas as pd
import numpy as np
from flask import Flask, jsonify, send_from_directory, abort
from flask_cors import CORS

app = Flask(__name__, static_folder='../frontend/dist', template_folder='../frontend/dist')
CORS(app)

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATS_DIR  = os.path.join(BASE_DIR, 'results', 'stats')
STATS_DAILY = os.path.join(STATS_DIR, 'daily')
DATA_DIR   = os.path.join(BASE_DIR, 'data', 'clean')

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

    # Top leader — Forte + Moderate, exclude USDCAD (broke down out-of-sample)
    validated_pairs = [p for p in all_pairs_data
                       if p.get('Robustesse') in ('Forte', 'Moderate')
                       and p.get('Leader') != 'USDCAD']
    leader_freq     = {}
    leader_strength = {}
    for p in validated_pairs:
        l = p.get('Leader')
        if l:
            leader_freq[l]     = leader_freq.get(l, 0) + 1
            leader_strength[l] = leader_strength.get(l, 0) + float(p.get('Score_Final', 0))

    top_leader = 'DAX'
    top_count  = 3
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
# FX Market Data (used by FxDashboard and FxCommandCenter)
# ---------------------------------------------------------------------------
@app.route('/api/fx/dashboard')
def api_fx_dashboard():
    fx_dir = os.path.join(BASE_DIR, 'data', 'fx')
    if not os.path.exists(fx_dir):
        return jsonify([])

    dashboard_data = []
    for f in os.listdir(fx_dir):
        if f.endswith('.csv') or f.endswith('.xlsx'):
            pair_name = os.path.splitext(f)[0]
            file_path = os.path.join(fx_dir, f)
            try:
                if f.endswith('.csv'):
                    df = pd.read_csv(file_path, parse_dates=True, index_col=0).tail(100)
                else:
                    df = pd.read_excel(file_path, parse_dates=True, index_col=0).tail(100)

                if len(df) < 20:
                    continue

                df['Close_numeric'] = pd.to_numeric(df.iloc[:, 3], errors='coerce') if df.shape[1] > 3 else df['Close']
                df['SMA'] = df['Close_numeric'].rolling(window=20).mean()
                df['SMA_Slope'] = df['SMA'].pct_change()

                high = pd.to_numeric(df.iloc[:, 1], errors='coerce') if df.shape[1] > 3 else df['High']
                low  = pd.to_numeric(df.iloc[:, 2], errors='coerce') if df.shape[1] > 3 else df['Low']
                tr   = pd.concat([high - low,
                                   abs(high - df['Close_numeric'].shift()),
                                   abs(low  - df['Close_numeric'].shift())], axis=1).max(axis=1)
                atr  = tr.rolling(14).mean()

                last_price = float(df['Close_numeric'].iloc[-1])
                last_slope = float(df['SMA_Slope'].iloc[-1])
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
                    'regime':     'Trend' if abs(last_slope) > 0.0001 else 'Range',
                    'hmm_regime': hmm_regime,
                    'trend':      'Bullish' if last_slope > 0 else 'Bearish',
                    'atr':        last_atr,
                    'slope':      slope_bps,
                    'date':       str(df.index[-1].date()) if isinstance(df.index, pd.DatetimeIndex) else 'N/A',
                })
            except Exception as e:
                print(f"Error processing {pair_name} for dashboard: {e}")

    return jsonify(dashboard_data)


@app.route('/api/fx/live_signals')
def api_fx_live_signals():
    fx_dir = os.path.join(BASE_DIR, 'data', 'fx')
    if not os.path.exists(fx_dir):
        return jsonify([])

    signals_data = []

    for f in os.listdir(fx_dir):
        if not (f.endswith('.csv') or f.endswith('.xlsx')):
            continue

        pair_name = os.path.splitext(f)[0]
        file_path = os.path.join(fx_dir, f)

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
