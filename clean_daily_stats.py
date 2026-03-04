import os
import shutil
import pandas as pd

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATS_DAILY = os.path.join(BASE_DIR, 'results', 'stats', 'daily')
ARCHIVE = os.path.join(BASE_DIR, 'results', 'stats', 'archive')
os.makedirs(ARCHIVE, exist_ok=True)

# Important baseline source files needed for the final unified dataset
essential_files = [
    'leader_follower_lag_analysis.csv', 
    'granger_daily_significant.csv', 
    'var_results_daily_full.csv',
    'corr_matrix_daily.csv',
    'granger_leadership_scores_daily.csv',
    'stationarity_adf_kpss.csv',
    'leadership_hub_rigorous.csv',
    'official_leader_follower_pairs.csv' # Will overwrite but keep in list so we don't 'archive' it twice if it crashes
]

# 1. Archive confusing/unnecessary files
archived_count = 0
for file in os.listdir(STATS_DAILY):
    if file.endswith('.csv') and file not in essential_files:
        src = os.path.join(STATS_DAILY, file)
        dst = os.path.join(ARCHIVE, file)
        try:
            shutil.move(src, dst)
            archived_count += 1
            print(f"Archived: {file}")
        except Exception as e:
            print(f"Could not archive {file}: {e}")

print(f"Archived {archived_count} files successfully.\n")

# 2. Regenerate robust `official_leader_follower_pairs.csv`
def safe_bool(v):
    if pd.isna(v): return False
    if isinstance(v, bool): return v
    if isinstance(v, str):  return v.strip().lower() in ('true', '1', 'yes')
    try: return bool(v)
    except: return False

df_lag_path = os.path.join(STATS_DAILY, 'leader_follower_lag_analysis.csv')
df_granger_path = os.path.join(STATS_DAILY, 'granger_daily_significant.csv')
df_var_path = os.path.join(STATS_DAILY, 'var_results_daily_full.csv')

df_lag = pd.read_csv(df_lag_path) if os.path.exists(df_lag_path) else None
df_granger = pd.read_csv(df_granger_path) if os.path.exists(df_granger_path) else None
df_var = pd.read_csv(df_var_path) if os.path.exists(df_var_path) else None

# RIGOROUS THRESHOLDS
MIN_CORR = 0.35
MIN_LAG_GAIN = 0.05
MIN_F_STAT = 20.0
MAX_P_VAL = 0.01
MIN_VAR_IMPACT = 0.20

pairs = {}

# Process Cross-Correlation (Lag)
if df_lag is not None:
    # Only consider pairs where a clear lead exists (Lead_Days != 0)
    df_lag_filt = df_lag[(df_lag['Lead_Days'] != 0)].copy()
    for _, row in df_lag_filt.iterrows():
        leader = str(row.get('Leader', row.get('Asset1', ''))).strip()
        follower = str(row.get('Follower', row.get('Asset2', ''))).strip()
        if not leader or not follower or leader == 'Contemporain': continue
        
        abs_c = float(row.get('Best_AbsCorr', 0) or 0)
        gain = float(row.get('Lag_Gain', 0) or 0)
        
        # Validation Logic: Significant Correlation + Observable Gain from lagging
        is_validated = (abs_c >= MIN_CORR) and (gain >= MIN_LAG_GAIN)
        
        score_lag = round(abs_c * 0.7 + min(gain*2, 1) * 0.3, 4)

        pairs[(leader, follower)] = {
            'Leader': leader, 'Follower': follower,
            'Cat_Leader': str(row.get('Cat1', '—')), 'Cat_Follower': str(row.get('Cat2', '—')),
            'Lead_Days': row.get('Lead_Days', None), 
            'Best_AbsCorr': round(abs_c, 4), 'Lag_Gain': round(gain, 4), 
            'Lag_Validated': is_validated,
            'Granger_Validated': False, 'VAR_Validated': False,
            'Score_Lag': score_lag,
            'Score_Granger': None, 'Score_VAR': None,
            'Granger_Pval': None, 'Granger_Fstat': None, 'VAR_Impact': None
        }

# Process Granger
if df_granger is not None:
    for _, row in df_granger.iterrows():
        leader = str(row.get('Leader', '')).strip()
        follower = str(row.get('Follower', '')).strip()
        if not leader or not follower: continue
        
        pval_raw = row.get('Best_Pvalue')
        pval = float(pval_raw) if pval_raw is not None and str(pval_raw).strip() != "" else 1.0
        
        fstat_raw = row.get('Best_Fstat')
        fstat = float(fstat_raw) if fstat_raw is not None and str(fstat_raw).strip() != "" else 0.0
        
        # Validation Logic: High F-stat and Low P-value
        is_validated = (pval <= MAX_P_VAL) and (fstat >= MIN_F_STAT)
        
        key = (leader, follower)
        if key not in pairs:
            # We only add it if it might be interesting, even if not fully validated here
            if not is_validated and fstat < 5: continue 
            
            pairs[key] = {
                'Leader': leader, 'Follower': follower,
                'Cat_Leader': str(row.get('Cat_Leader', '—')), 'Cat_Follower': str(row.get('Cat_Follower', '—')),
                'Lead_Days': row.get('Best_Lag', None), 
                'Best_AbsCorr': None, 'Lag_Gain': None,
                'Lag_Validated': False, 'Granger_Validated': False, 'VAR_Validated': False, 
                'Score_Lag': None, 'Score_Granger': None, 'Score_VAR': None,
                'Granger_Pval': None, 'Granger_Fstat': None, 'VAR_Impact': None
            }
        
        p = pairs[key]
        p['Granger_Validated'] = is_validated
        p['Granger_Pval'] = round(pval, 6)
        p['Granger_Fstat'] = round(fstat, 4)
        p['Score_Granger'] = round(min(fstat / 100, 1.0), 4)
        if pd.isna(p['Lead_Days']) and pd.notna(row.get('Best_Lag')):
            p['Lead_Days'] = row['Best_Lag']

# Process VAR
if df_var is not None:
    for _, row in df_var.iterrows():
        leader = str(row.get('VAR_Leader', '')).strip()
        follower = str(row.get('VAR_Follower', '')).strip()
        if not leader or not follower: continue
        
        impact_raw = row.get('Impact_A1_on_A2')
        impact = float(impact_raw) if impact_raw is not None and str(impact_raw).strip() != "" else 0.0
        
        # Validation Logic: Strong Impact coefficient
        is_validated = abs(impact) >= MIN_VAR_IMPACT
        
        key = (leader, follower)
        if key not in pairs:
            if not is_validated: continue
            pairs[key] = {
                'Leader': leader, 'Follower': follower,
                'Cat_Leader': '—', 'Cat_Follower': '—',
                'Lead_Days': row.get('Optimal_Lag', None),
                'Best_AbsCorr': None, 'Lag_Gain': None,
                'Lag_Validated': False, 'Granger_Validated': False, 'VAR_Validated': False, 
                'Score_Lag': None, 'Score_Granger': None, 'Score_VAR': None,
                'Granger_Pval': None, 'Granger_Fstat': None, 'VAR_Impact': None
            }
        
        p = pairs[key]
        p['VAR_Validated'] = is_validated
        p['VAR_Impact'] = round(impact, 4)
        p['Score_VAR'] = round(min(abs(impact) * 2, 1.0), 4)

# Calculate final metrics and export
result = []
for key, p in pairs.items():
    # Final check: we only want to show pairs that have at least ONE high-quality validation
    # Or have high enough scores to be considered "signals"
    n_validated = sum([p['Lag_Validated'], p['Granger_Validated'], p['VAR_Validated']])
    p['N_Methods'] = n_validated
    
    scores = [s for s in [p['Score_Lag'], p['Score_Granger'], p['Score_VAR']] if s is not None]
    p['Score_Final'] = round(sum(scores) / len(scores), 4) if scores else 0
    
    # Robustness categories
    if n_validated == 3:
        p['Robustesse'] = 'Forte'
    elif n_validated == 2:
        p['Robustesse'] = 'Moderate'
    else:
        p['Robustesse'] = 'Faible'

    # Filter: keep anything that's at least Moderate OR has N_Methods >= 1
    # We don't want to show garbage that failed all strict tests
    if n_validated >= 1:
        result.append(p)

# Sort by N_Methods (desc), then Score_Final (desc)
result.sort(key=lambda x: (-x['N_Methods'], -x['Score_Final']))

df_merged = pd.DataFrame(result)
out_path = os.path.join(STATS_DAILY, 'official_leader_follower_pairs.csv')
temp_path = out_path + ".tmp"

try:
    df_merged.to_csv(temp_path, index=False)
    if os.path.exists(out_path):
        os.remove(out_path)
    os.rename(temp_path, out_path)
    print(f"Regenerated {out_path} with {len(df_merged)} pairs successfully!")
    print(f"Summary: Forte: {len(df_merged[df_merged['N_Methods']==3])}, Moderate: {len(df_merged[df_merged['N_Methods']==2])}")
except Exception as e:
    print(f"Error saving results: {e}")
    if os.path.exists(temp_path):
        print(f"Results saved to temporary file instead: {temp_path}")

