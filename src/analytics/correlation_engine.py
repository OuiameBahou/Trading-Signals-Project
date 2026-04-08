"""
correlation_engine.py – Structural pre-tests and phase-shift similarity.

Retained modules (Spearman/CCF/rolling-correlation removed):
  1. Stationarity pre-testing (ADF + KPSS) → integration order d per series
  2. Dynamic Time Warping as phase-shift-robust similarity metric

These feed into the Transfer Entropy pipeline and the /api/advanced_analysis
endpoint alongside the causality and regime engines.
"""

import logging
from typing import Any, Dict

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ── 1. Stationarity pre-testing ─────────────────────────────────────────────

def run_stationarity_tests(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
) -> Dict[str, Any]:
    """
    ADF + KPSS on both log-return and sentiment series.

    Decision rule (Cheung & Lai 1995):
      - Both ADF and KPSS agree on non-stationarity → I(1)
      - Otherwise → I(0) (conservative: prefer stationarity for causality tests)

    Returns: d_sentiment, d_returns, d_max, per-series details.
    """
    from statsmodels.tsa.stattools import adfuller, kpss

    def _test_one(series: pd.Series, name: str) -> Dict[str, Any]:
        s = series.dropna()
        if len(s) < 20:
            return {"name": name, "n_obs": len(s),
                    "error": "Insufficient data (<20 obs)", "integration_order": 0}

        res: Dict[str, Any] = {"name": name, "n_obs": len(s)}

        # ADF (H0: unit root)
        try:
            adf_t, adf_p, adf_lags, _, adf_cv, _ = adfuller(s, autolag="AIC")
            res["adf"] = {
                "statistic": round(float(adf_t), 4),
                "pvalue": round(float(adf_p), 4),
                "lags_used": int(adf_lags),
                "critical_values": {k: round(float(v), 4) for k, v in adf_cv.items()},
                "stationary": bool(adf_p < 0.05),
            }
        except Exception as e:
            res["adf"] = {"error": str(e), "stationary": True}

        # KPSS (H0: stationary)
        try:
            kpss_t, kpss_p, kpss_lags, kpss_cv = kpss(s, regression="c", nlags="auto")
            res["kpss"] = {
                "statistic": round(float(kpss_t), 4),
                "pvalue": round(float(kpss_p), 4),
                "lags_used": int(kpss_lags),
                "critical_values": {k: round(float(v), 4) for k, v in kpss_cv.items()},
                "stationary": bool(kpss_p > 0.05),
            }
        except Exception as e:
            res["kpss"] = {"error": str(e), "stationary": True}

        adf_stat = res["adf"].get("stationary", True)
        kpss_stat = res["kpss"].get("stationary", True)

        if not adf_stat and not kpss_stat:
            d, conclusion = 1, "I(1): ADF and KPSS both indicate non-stationarity"
        elif adf_stat and kpss_stat:
            d, conclusion = 0, "I(0): ADF and KPSS both indicate stationarity"
        elif not adf_stat and kpss_stat:
            d, conclusion = 0, "Ambiguous (ADF->I(1), KPSS->I(0)); treating as I(0)"
        else:
            d, conclusion = 0, "Ambiguous (ADF->I(0), KPSS->I(1)); treating as I(0)"

        res["integration_order"] = d
        res["conclusion"] = conclusion
        return res

    sent_res = _test_one(sentiment_ts, "sentiment")
    ret_res = _test_one(returns_ts, "returns")
    d_max = max(sent_res.get("integration_order", 0), ret_res.get("integration_order", 0))

    return {
        "sentiment": sent_res,
        "returns": ret_res,
        "d_sentiment": sent_res.get("integration_order", 0),
        "d_returns": ret_res.get("integration_order", 0),
        "d_max": d_max,
    }


# ── 2. Dynamic Time Warping ──────────────────────────────────────────────────

def compute_dtw_correlation(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
) -> Dict[str, Any]:
    """
    DTW distance between z-score-normalised sentiment and return series.

    Tries dtaidistance → tslearn → pure-numpy fallback (O(n²)).
    Similarity score = exp(−DTW_normalised) ∈ (0, 1].
    """
    aligned = pd.concat(
        [sentiment_ts.rename("s"), returns_ts.rename("r")], axis=1
    ).dropna()
    n = len(aligned)

    if n < 20:
        return {"error": f"Insufficient data ({n} obs)", "n_obs": n}

    s_norm = (aligned["s"].values - aligned["s"].mean()) / (aligned["s"].std() + 1e-12)
    r_norm = (aligned["r"].values - aligned["r"].mean()) / (aligned["r"].std() + 1e-12)

    dtw_dist = _dtw_distance(s_norm, r_norm)
    norm_dist = dtw_dist / n
    similarity = float(np.exp(-norm_dist))

    quality = "high" if similarity > 0.6 else ("moderate" if similarity > 0.3 else "low")

    return {
        "dtw_distance": round(float(dtw_dist), 4),
        "dtw_normalised": round(float(norm_dist), 4),
        "similarity": round(similarity, 4),
        "n_obs": n,
        "interpretation": (
            f"DTW similarity = {similarity:.3f} ({quality} phase-shift-robust alignment)"
        ),
    }


def _dtw_distance(x: np.ndarray, y: np.ndarray) -> float:
    """DTW distance: try fast C libraries first, fall back to pure numpy."""
    try:
        from dtaidistance import dtw as _dtai
        return float(_dtai.distance(x.astype(np.double), y.astype(np.double)))
    except ImportError:
        pass
    try:
        from tslearn.metrics import dtw as _ts_dtw
        return float(_ts_dtw(x.reshape(-1, 1), y.reshape(-1, 1)))
    except ImportError:
        pass
    # Pure numpy O(n·m) fallback
    n, m = len(x), len(y)
    dtw = np.full((n + 1, m + 1), np.inf)
    dtw[0, 0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = abs(x[i - 1] - y[j - 1])
            dtw[i, j] = cost + min(dtw[i - 1, j], dtw[i, j - 1], dtw[i - 1, j - 1])
    return float(dtw[n, m])


# ── Combined runner ──────────────────────────────────────────────────────────

def run_correlation_engine(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
) -> Dict[str, Any]:
    """Run stationarity pre-tests + DTW similarity and return a combined result dict."""
    results: Dict[str, Any] = {}

    for key, fn, args in [
        ("stationarity", run_stationarity_tests,  (sentiment_ts, returns_ts)),
        ("dtw",          compute_dtw_correlation, (sentiment_ts, returns_ts)),
    ]:
        try:
            results[key] = fn(*args)
        except Exception as exc:
            logger.warning("correlation_engine[%s] failed: %s", key, exc)
            results[key] = {"error": str(exc)}

    return results
