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

app = Flask(__name__, static_folder='frontend/dist', template_folder='frontend/dist')
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
    # Attempt to load from the official registry first (source of truth for validated signals)
    df_official = load_csv(os.path.join(STATS_DAILY, 'official_leader_follower_pairs.csv'))
    if df_official is not None:
        # Standardize boolean columns and ENFORCE our strict detection for categories
        for col in ['Lag_Validated', 'Granger_Validated', 'VAR_Validated']:
            if col in df_official.columns:
                df_official[col] = df_official[col].apply(safe_bool)
        
        # Override CSV classification with our robust detect_category logic
        for idx, row in df_official.iterrows():
            df_official.at[idx, 'Cat_Leader'] = detect_category(row['Leader'], row.get('Cat_Leader'))
            df_official.at[idx, 'Cat_Follower'] = detect_category(row['Follower'], row.get('Cat_Follower'))
            
        return jsonify(json.loads(df_official.to_json(orient='records', date_format='iso')))

    # Fallback to dynamic merge logic if official file is missing
    df_lag     = load_csv(os.path.join(STATS_DAILY, 'leader_follower_lag_analysis.csv'))
    df_granger = load_csv(os.path.join(STATS_DAILY, 'granger_daily_significant.csv'))
    df_var     = load_csv(os.path.join(STATS_DAILY, 'var_results_daily_full.csv'))

    pairs = {}  # key: (Leader, Follower)

    # ── 1. LAG pairs ──────────────────────────────────────────────────────
    if df_lag is not None:
        df_l_filt = df_lag[(df_lag['Lead_Days'] != 0) & (df_lag['Best_AbsCorr'].abs() > 0.35)].copy()
        for _, row in df_l_filt.iterrows():
            l = str(row.get('Leader', '')).strip()
            f = str(row.get('Follower', '')).strip()
            if not l or not f or l == 'Contemporain': continue
            key = (l, f)
            pairs[key] = {
                'Leader': l, 'Follower': f,
                'Cat_Leader': detect_category(l, row.get('Cat1')),
                'Cat_Follower': detect_category(f, row.get('Cat2')),
                'Lead_Days': int(row['Lead_Days']) if pd.notna(row.get('Lead_Days')) else 0,
                'Best_AbsCorr': round(float(row['Best_AbsCorr']), 4),
                'Lag_Gain': round(float(row.get('Lag_Gain', 0)), 4),
                'Lag_Validated': True, 'Granger_Validated': False, 'VAR_Validated': False,
                'Score_Lag': round(float(row['Best_AbsCorr']) * 0.7, 4), 'Score_Granger': 0.0, 'Score_VAR': 0.0,
                'Granger_Pval': 1.0, 'Granger_Fstat': 0.0, 'VAR_Impact': 0.0
            }

    # ── 2. GRANGER pairs ───────────────────────────────────────────────────
    if df_granger is not None:
        df_g = df_granger[(df_granger['Significant'].apply(safe_bool)) & (df_granger['Best_Fstat'] > 20)]
        for _, row in df_g.iterrows():
            l, f = str(row.get('Leader', '')).strip(), str(row.get('Follower', '')).strip()
            if not l or not f: continue
            key = (l, f)
            if key not in pairs:
                pairs[key] = {
                    'Leader': l, 'Follower': f,
                    'Cat_Leader': detect_category(l, row.get('Cat_Leader')),
                    'Cat_Follower': detect_category(f, row.get('Cat_Follower')),
                    'Lead_Days': int(row.get('Best_Lag', 0)),
                    'Best_AbsCorr': 0.0, 'Lag_Gain': 0.0,
                    'Lag_Validated': False, 'Granger_Validated': False, 'VAR_Validated': False,
                    'Score_Lag': 0.0, 'Score_Granger': 0.0, 'Score_VAR': 0.0,
                    'Granger_Pval': float(row.get('Best_Pvalue', 1.0)), 
                    'Granger_Fstat': float(row.get('Best_Fstat', 0.0)), 'VAR_Impact': 0.0
                }
            pairs[key]['Granger_Validated'] = True
            pairs[key]['Score_Granger'] = round(min(float(row.get('Best_Fstat', 0)) / 400.0, 1.0), 4)

    # ── 3. VAR pairs ───────────────────────────────────────────────────────
    if df_var is not None:
        # User specified threshold: Impact > 0.20
        df_v = df_var[(df_var['Leader_Confirmed'].apply(safe_bool)) & ((df_var['Impact_A1_on_A2'].abs() > 0.20) | (df_var['Impact_A2_on_A1'].abs() > 0.20))]
        for _, row in df_v.iterrows():
            l, f = str(row.get('VAR_Leader', '')).strip(), str(row.get('VAR_Follower', '')).strip()
            if not l or not f: continue
            key = (l, f)
            if key not in pairs:
                pairs[key] = {
                    'Leader': l, 'Follower': f,
                    'Cat_Leader': detect_category(l), 'Cat_Follower': detect_category(f),
                    'Lead_Days': int(row.get('Optimal_Lag', 0)),
                    'Best_AbsCorr': 0.0, 'Lag_Gain': 0.0,
                    'Lag_Validated': False, 'Granger_Validated': False, 'VAR_Validated': False,
                    'Score_Lag': 0.0, 'Score_Granger': 0.0, 'Score_VAR': 0.0,
                    'Granger_Pval': 1.0, 'Granger_Fstat': 0.0, 'VAR_Impact': 0.0
                }
            pairs[key]['VAR_Validated'] = True
            # Determine impact based on leadership direction
            impact = float(row.get('Impact_A1_on_A2', 0)) if l == row.get('Asset1') else float(row.get('Impact_A2_on_A1', 0))
            pairs[key]['VAR_Impact'] = round(impact, 4)
            pairs[key]['Score_VAR'] = round(min(abs(impact), 1.0), 4)

    # ── 4. Final aggregation ──────────────────────────────────────────────
    result = []
    for p in pairs.values():
        n = sum([p['Lag_Validated'], p['Granger_Validated'], p['VAR_Validated']])
        p['N_Methods'] = n
        valid_scores = [p['Score_Lag'], p['Score_Granger'], p['Score_VAR']]
        p['Score_Final'] = round(sum(valid_scores) / 3.0 if n > 0 else 0, 4)
        p['Robustesse'] = 'Forte' if n == 3 else ('Moderate' if n == 2 else 'Faible')
        result.append(p)

    result.sort(key=lambda x: (-x['N_Methods'], -x['Score_Final']))
    return jsonify(result)

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

@app.route('/api/hub')
def api_hub():
    df = load_csv(os.path.join(STATS_DAILY, 'leadership_hub_rigorous.csv'))
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

@app.route('/api/granger_significant')
def api_granger_significant():
    df = load_csv(os.path.join(STATS_DAILY, 'granger_daily_significant.csv'))
    if df is not None and len(df) > 500:
        df = df.head(500)
    return df_to_json(df)

@app.route('/api/granger_scores')
def api_granger_scores():
    df = load_csv(os.path.join(STATS_DAILY, 'granger_leadership_scores_daily.csv'))
    return df_to_json(df)

@app.route('/api/stationarity')
def api_stationarity():
    df = load_csv(os.path.join(STATS_DAILY, 'stationarity_adf_kpss.csv'))
    return df_to_json(df)

@app.route('/api/summary_stats')
def api_summary_stats():
    # Use our unified refined logic as the source of truth
    try:
        all_pairs = api_all_pairs().get_json()
    except:
        all_pairs = []
    
    # Strictly triple-validated signals
    n_pairs = sum(1 for p in all_pairs if int(p.get('N_Methods', 0)) == 3)
    
    # Count how many have Granger validation (at any tier)
    n_granger = sum(1 for p in all_pairs if p.get('Granger_Validated'))
        
    # Calculate Apex Leader: The asset that leads the most other instruments
    # Tie-breaker: Highest total Score_Final
    leader_freq = {}
    leader_strength = {}
    for p in all_pairs:
        l = p.get('Leader')
        if l:
            leader_freq[l] = leader_freq.get(l, 0) + 1
            leader_strength[l] = leader_strength.get(l, 0) + float(p.get('Score_Final', 0))
        
    top_leader = '—'
    top_count = 0
    if leader_freq:
        # Sort by frequency primary, strength secondary
        top_leader = max(leader_freq, key=lambda l: (leader_freq[l], leader_strength.get(l, 0)))
        top_count = leader_freq[top_leader]
            
    return jsonify({
        'official_pairs':      n_pairs,
        'granger_significant': n_granger,
        'top_leader':          top_leader,
        'top_leader_count':    top_count,
        'assets_covered':      39,
        'universe_pairs':      1482
    })


@app.route('/api/plot/rolling/<leader>/<follower>')
def api_plot_rolling(leader, follower):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    returns_df = load_csv(os.path.join(DATA_DIR, 'returns_daily.csv'))
    if returns_df is None: abort(404)
    if leader not in returns_df.columns or follower not in returns_df.columns: abort(404)
    if 'Date' in returns_df.columns:
        returns_df['Date'] = pd.to_datetime(returns_df['Date'])
        returns_df = returns_df.set_index('Date')
    plt.figure(figsize=(10, 5), facecolor='#0f172a')
    ax = plt.gca()
    ax.set_facecolor('#1e293b')
    for window, color in zip([30, 60, 90], ['#ef4444', '#f59e0b', '#3b82f6']):
        roll_corr = returns_df[leader].rolling(window=window).corr(returns_df[follower])
        plt.plot(roll_corr, label=f'{window}d Window', color=color, linewidth=1.5, alpha=0.8)
    plt.title(f"Rolling Correlation: {leader} vs {follower}", color='white', fontweight='bold', pad=20)
    plt.legend(facecolor='#0f172a', edgecolor='white', labelcolor='white', fontsize='small')
    plt.grid(color='white', alpha=0.05)
    plt.tick_params(colors='white', which='both', labelsize=8)
    for spine in ax.spines.values():
        spine.set_edgecolor('#334155')
    plt.tight_layout()
    folder = os.path.join(BASE_DIR, 'figures', 'dynamic')
    os.makedirs(folder, exist_ok=True)
    filename = f"rolling_{leader}_{follower}.png"
    plt.savefig(os.path.join(folder, filename))
    plt.close()
    return send_from_directory(folder, filename)

# ---------------------------------------------------------------------------
# Frontend Routes
# ---------------------------------------------------------------------------
@app.route('/')
@app.route('/<path:subpath>')
def serve_frontend(subpath=''):
    frontend_path = os.path.join(BASE_DIR, 'frontend', 'dist', 'index.html')
    if os.path.exists(frontend_path):
        with open(frontend_path, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}
    return "Frontend not built. Run npm run build in frontend/.", 404

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'frontend', 'dist', 'assets'), filename)

@app.route('/figures/<path:filename>')
def serve_figures(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'figures'), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)