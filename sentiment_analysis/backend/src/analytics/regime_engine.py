"""
regime_engine.py – Module 3: Regime-Dependent Analysis

Implements:
  3a. Markov-Switching Autoregression: returns ~ f(regime, sentiment_lag)
  3b. Threshold VAR (TVAR): separate Granger tests below/above RV_20 median
  3c. Regime labeling utility: regime=0 (low-vol) / 1 (high-vol) per date
      based on RV_20 vs rolling 60-day median.

The `regime` column produced by label_regimes() is designed to be consumed
by both CausalityEngine and the signal generator.
"""

import logging
from typing import Any, Dict

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ── 3c. Regime labeling utility ──────────────────────────────────────────────

def label_regimes(
    returns_ts: pd.Series,
    rv_window: int = 20,
    rolling_median_window: int = 60,
) -> pd.Series:
    """
    Label each date as low-vol (0) or high-vol (1).

    Algorithm:
      RV_20  = rolling 20-day std(returns) × √252   (annualised daily vol)
      thresh = rolling 60-day median of RV_20
      regime = 1 if RV_20 > thresh, else 0

    For the initial window (< 60 obs), the sample-wide median of RV_20 is used
    as threshold so no dates are left unlabelled.

    Returns pd.Series[int] indexed on returns_ts.index, named "regime".
    """
    rv20   = returns_ts.rolling(window=rv_window).std() * np.sqrt(252)
    thresh = rv20.rolling(window=rolling_median_window).median()
    # Fill early NaNs with sample-wide median
    global_med = rv20.median()
    thresh = thresh.fillna(global_med)
    regime = (rv20 > thresh).astype(int)
    regime.name = "regime"
    return regime


def get_regime_series_for_ticker(
    returns_ts: pd.Series,
    sentiment_ts: pd.Series,
) -> pd.DataFrame:
    """
    Returns a DataFrame with columns [returns, sentiment, rv20, regime]
    aligned on common dates and with NaNs dropped.
    Convenience wrapper for downstream use by CausalityEngine / signals.
    """
    regime = label_regimes(returns_ts)
    rv20   = returns_ts.rolling(window=20).std() * np.sqrt(252)
    df = pd.concat(
        [returns_ts.rename("returns"),
         sentiment_ts.rename("sentiment"),
         rv20.rename("rv20"),
         regime],
        axis=1,
    ).dropna()
    return df


# ── 3a. Markov-Switching Regression ─────────────────────────────────────────

def markov_switching_var(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
    n_regimes: int = 2,
) -> Dict[str, Any]:
    """
    Markov-Switching Autoregression (statsmodels).

    Model fitted on returns:
      r_t = μ_{S_t} + φ_{S_t}·r_{t-1} + β·sentiment_{t-1} + σ_{S_t}·ε_t

    Regime 0 = low-volatility, Regime 1 = high-volatility
    (identified post-hoc by conditional variance).

    Returns per-regime smoothed probabilities time series and model parameters.
    """
    try:
        from statsmodels.tsa.regime_switching.markov_autoregression import (
            MarkovAutoregression,
        )
    except ImportError:
        return {"error": "statsmodels MarkovAutoregression not available"}

    aligned = pd.concat(
        [sentiment_ts.rename("sentiment"), returns_ts.rename("returns")], axis=1
    ).dropna()
    aligned["sent_lag1"] = aligned["sentiment"].shift(1)
    data = aligned.dropna()
    n    = len(data)

    if n < 60:
        return {"error": f"Insufficient data ({n} obs, need 60)"}

    returns = data["returns"].values
    exog    = data["sent_lag1"].values.reshape(-1, 1)
    result: Dict[str, Any] = {"n_obs": n, "n_regimes": n_regimes}

    try:
        mod = MarkovAutoregression(
            returns,
            k_regimes=n_regimes,
            order=1,
            switching_ar=True,
            switching_variance=True,
            exog=exog,
        )
        res = mod.fit(
            search_reps=20,
            search_iter=10,
            disp=False,
        )

        # Smoothed regime probabilities
        sprob = res.smoothed_marginal_probabilities  # DataFrame or ndarray
        if hasattr(sprob, "values"):
            sprob_arr = sprob.values
        else:
            sprob_arr = np.array(sprob)

        dominant = sprob_arr.argmax(axis=1)
        dates = [
            str(d.date()) if hasattr(d, "date") else str(d)
            for d in data.index
        ]

        regime_ts = [
            {
                "date": dates[i],
                "prob_regime_0": round(float(sprob_arr[i, 0]), 4),
                "prob_regime_1": round(float(sprob_arr[i, 1]), 4),
                "dominant_regime": int(dominant[i]),
            }
            for i in range(min(len(dates), len(dominant)))
        ]

        # All model parameters
        params_dict = {
            name: round(float(val), 6)
            for name, val in zip(res.model.param_names, res.params)
        }

        # Identify which regime is high-vol by comparing sigma params
        sigma_keys  = [k for k in params_dict if "sigma" in k.lower()]
        variance_labelling = {}
        if len(sigma_keys) >= n_regimes:
            sigmas = [(k, params_dict[k]) for k in sigma_keys[:n_regimes]]
            high_vol_regime = max(sigmas, key=lambda x: x[1])
            low_vol_regime  = min(sigmas, key=lambda x: x[1])
            variance_labelling = {
                "high_vol_regime": int(sigma_keys.index(high_vol_regime[0])),
                "low_vol_regime":  int(sigma_keys.index(low_vol_regime[0])),
                "sigma_values":    {k: v for k, v in sigmas},
            }

        # Sentiment (exog) coefficient — non-switching in this spec
        exog_keys = [k for k in params_dict if "x1" in k.lower() or "exog" in k.lower()]
        beta_sentiment = {k: params_dict[k] for k in exog_keys} if exog_keys else {}

        result["regime_probabilities"] = regime_ts
        result["params"]               = params_dict
        result["variance_labelling"]   = variance_labelling
        result["beta_sentiment"]       = beta_sentiment
        result["aic"]                  = round(float(res.aic), 2)
        result["bic"]                  = round(float(res.bic), 2)
        result["interpretation"]       = (
            f"Markov-Switching AR(1) with {n_regimes} regimes fitted. "
            "Inspect regime_probabilities for time-varying state."
        )

    except Exception as exc:
        logger.warning("Markov-Switching VAR failed: %s", exc)
        result["error"] = str(exc)

    return result


# ── 3b. Threshold VAR ────────────────────────────────────────────────────────

def threshold_var(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
    rv_window: int = 20,
    max_p: int = 3,
) -> Dict[str, Any]:
    """
    Threshold VAR (TVAR) split on RV_20 vs sample median.

    1. Compute RV_20 = rolling 20-day std(returns)×√252.
    2. threshold = median(RV_20) over full sample.
    3. Split data into low-vol (RV_20 ≤ threshold) and high-vol subsets.
    4. Fit Granger causality (chi2 / SSR F→chi2) in each regime.
    5. Compare p-values across regimes.
    """
    from statsmodels.tsa.stattools import grangercausalitytests

    aligned = pd.concat(
        [sentiment_ts.rename("sentiment"), returns_ts.rename("returns")], axis=1
    ).dropna()
    n = len(aligned)

    if n < 50:
        return {"error": f"Insufficient data ({n} obs, need 50)"}

    rv20      = aligned["returns"].rolling(window=rv_window).std() * np.sqrt(252)
    threshold = float(rv20.median())

    aligned["rv20"]   = rv20
    aligned["regime"] = (rv20 > threshold).astype(int)
    clean = aligned.dropna()

    low_vol  = clean[clean["regime"] == 0][["returns", "sentiment"]]
    high_vol = clean[clean["regime"] == 1][["returns", "sentiment"]]

    result: Dict[str, Any] = {
        "threshold_rv20":   round(threshold, 6),
        "n_low_vol":        len(low_vol),
        "n_high_vol":       len(high_vol),
        "n_obs_total":      n,
    }

    def _granger_in_regime(df: pd.DataFrame, regime_label: str) -> Dict[str, Any]:
        if len(df) < max_p * 2 + 10:
            return {
                "regime": regime_label,
                "error": f"Insufficient data ({len(df)} obs)",
                "n_obs": len(df),
            }
        p_eff = min(max_p, max(1, len(df) // 8))
        try:
            gc = grangercausalitytests(
                df[["returns", "sentiment"]], maxlag=p_eff, verbose=False
            )
            lag_results = []
            for lag, tests in gc.items():
                # Use SSR chi2 test (consistent with Toda-Yamamoto)
                t = tests[0]["ssr_chi2test"]
                lag_results.append({
                    "lag":        lag,
                    "chi2_stat":  round(float(t[0]), 4),
                    "pvalue":     round(float(t[1]), 4),
                    "df":         int(t[2]),
                    "significant": bool(t[1] < 0.05),
                })
            best_p = min(r["pvalue"] for r in lag_results)
            return {
                "regime":      regime_label,
                "n_obs":       len(df),
                "best_pvalue": round(best_p, 4),
                "significant": bool(best_p < 0.05),
                "lag_results": lag_results,
            }
        except Exception as exc:
            return {"regime": regime_label, "error": str(exc), "n_obs": len(df)}

    result["low_vol_regime"]  = _granger_in_regime(low_vol,  "low_vol")
    result["high_vol_regime"] = _granger_in_regime(high_vol, "high_vol")

    low_sig  = result["low_vol_regime"].get("significant", False)
    high_sig = result["high_vol_regime"].get("significant", False)
    low_p    = result["low_vol_regime"].get("best_pvalue", 1.0)
    high_p   = result["high_vol_regime"].get("best_pvalue", 1.0)

    if high_sig and not low_sig:
        interp = f"Causality only in HIGH-vol regime (p={high_p:.3f}); silent in low-vol"
    elif low_sig and not high_sig:
        interp = f"Causality only in LOW-vol regime (p={low_p:.3f}); silent in high-vol"
    elif high_sig and low_sig:
        interp = f"Causality in both regimes (high: p={high_p:.3f}, low: p={low_p:.3f})"
    else:
        interp = "No significant Granger causality in either volatility regime"

    result["interpretation"] = interp
    return result


# ── Combined runner ──────────────────────────────────────────────────────────

def run_regime_engine(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
) -> Dict[str, Any]:
    """Run Module 3 in full and return combined results."""
    results: Dict[str, Any] = {}

    # Regime labels (serialised for API output)
    try:
        regime_s = label_regimes(returns_ts)
        regime_aligned = regime_s.reindex(returns_ts.index)
        rv20 = returns_ts.rolling(window=20).std() * np.sqrt(252)
        rows = []
        for d in returns_ts.index:
            rv_val  = rv20.get(d)
            reg_val = regime_aligned.get(d)
            if pd.isna(rv_val) or pd.isna(reg_val):
                continue
            rows.append({
                "date":    str(d.date()) if hasattr(d, "date") else str(d),
                "rv20":    round(float(rv_val), 6),
                "regime":  int(reg_val),
            })
        n_low  = sum(1 for r in rows if r["regime"] == 0)
        n_high = sum(1 for r in rows if r["regime"] == 1)
        results["regime_labels"] = {
            "values":       rows,
            "n_low_vol":    n_low,
            "n_high_vol":   n_high,
            "pct_high_vol": round(n_high / max(1, n_low + n_high), 4),
        }
    except Exception as exc:
        logger.warning("Regime labeling failed: %s", exc)
        results["regime_labels"] = {"error": str(exc)}

    for key, fn in [
        ("markov_switching", lambda: markov_switching_var(sentiment_ts, returns_ts)),
        ("threshold_var",    lambda: threshold_var(sentiment_ts, returns_ts)),
    ]:
        try:
            results[key] = fn()
        except Exception as exc:
            logger.warning("regime_engine[%s] failed: %s", key, exc)
            results[key] = {"error": str(exc)}

    return results
