"""
transfer_entropy.py — Transfer Entropy analysis for sentiment → price relationships.

Transfer Entropy (Schreiber 2000) quantifies *directed* information flow:

    TE(X→Y, lag) = I(Y_t ; X_{t-lag} | Y_{t-1})
                 = H(Y_t | Y_{t-1}) − H(Y_t | Y_{t-1}, X_{t-lag})

A positive TE(sentiment→returns) means: knowing the history of sentiment
reduces our uncertainty about future returns *beyond* what returns alone tell us.

This is strictly more general than Granger causality (linear, parametric) or
Pearson/Spearman (monotone relationships only).  TE captures any statistical
dependency — linear, non-linear, or non-monotone — via an information-theoretic
lens.

Implementation
--------------
• Histogram plug-in estimator with quantile-based binning (robust for
  heavy-tailed financial returns).
• Bias correction via Miller–Madow term.
• Block-shuffle permutation test (preserves local autocorrelation in null).
• Lag scan from 1 to max_lag in both directions (S→R and R→S).
• Net directionality score and human-readable interpretation.
"""

import logging
from typing import Any, Dict, List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ── 1. Discretization ────────────────────────────────────────────────────────

def _discretize(x: np.ndarray, n_bins: int) -> np.ndarray:
    """
    Quantile-based discretization into n_bins equal-probability bins.
    More robust than uniform binning for skewed / heavy-tailed distributions.
    """
    quantiles = np.linspace(0, 100, n_bins + 1)
    edges = np.percentile(x, quantiles)
    edges = np.unique(edges)
    if len(edges) < 3:
        edges = np.linspace(x.min() - 1e-9, x.max() + 1e-9, n_bins + 1)
    # np.digitize: bin index 0 → below first edge, n_bins → above last edge
    idx = np.digitize(x, edges[1:-1]).astype(int)
    return np.clip(idx, 0, n_bins - 1)


# ── 2. Core TE estimator ─────────────────────────────────────────────────────

def _te_histogram(
    source: np.ndarray,
    target: np.ndarray,
    lag: int,
    n_bins: int,
) -> float:
    """
    Compute TE(source → target) at *lag* using the histogram plug-in estimator.

    Construction (lag ≥ 1):
        Y_future  = target[lag:]          — Y_t
        Y_past    = target[lag-1 : -1]    — Y_{t-1}
        X_lagged  = source[:n - lag]      — X_{t-lag}

    TE via chain rule of entropy:
        TE = H(Y_f, Y_p) − H(Y_p) − H(Y_f, Y_p, X_l) + H(Y_p, X_l)

    Miller–Madow bias correction applied to each term:
        Δ = (k − 1) / (2 N)   where k = number of occupied bins.
    """
    n = min(len(source), len(target))
    if lag < 1 or n - lag < 15:
        return np.nan

    src = source[:n]
    tgt = target[:n]

    y_future = tgt[lag:]
    y_past   = tgt[lag - 1:-1] if lag > 1 else tgt[:-1]
    x_lagged = src[:n - lag]

    m = min(len(y_future), len(y_past), len(x_lagged))
    if m < 15:
        return np.nan

    y_future = y_future[:m]
    y_past   = y_past[:m]
    x_lagged = x_lagged[:m]

    yf = _discretize(y_future, n_bins)
    yp = _discretize(y_past,   n_bins)
    xp = _discretize(x_lagged, n_bins)
    nb = n_bins

    # ── Joint count tables ────────────────────────────────────────────
    # H(Y_f, Y_p) — 2-D
    jt_yf_yp = np.zeros((nb, nb), dtype=np.float64)
    for i in range(m):
        jt_yf_yp[yf[i], yp[i]] += 1

    # H(Y_f, Y_p, X_p) — 3-D
    jt_yf_yp_xp = np.zeros((nb, nb, nb), dtype=np.float64)
    for i in range(m):
        jt_yf_yp_xp[yf[i], yp[i], xp[i]] += 1

    # ── Entropy helper (Miller–Madow) ──────────────────────────────────
    def _h(counts: np.ndarray) -> float:
        total = counts.sum()
        if total == 0:
            return 0.0
        p = counts.ravel() / total
        mask = p > 0
        h = float(-np.sum(p[mask] * np.log2(p[mask])))
        # Miller-Madow correction: (occupied_bins - 1) / (2 * N)
        k_occ = int(mask.sum())
        h += (k_occ - 1) / (2.0 * total)
        return h

    # H(Y_f, Y_p)
    h_yf_yp = _h(jt_yf_yp)

    # H(Y_p) from marginalising jt_yf_yp
    h_yp = _h(jt_yf_yp.sum(axis=0))

    # H(Y_f, Y_p, X_p)
    h_yf_yp_xp = _h(jt_yf_yp_xp)

    # H(Y_p, X_p) from marginalising jt_yf_yp_xp over Y_f axis
    h_yp_xp = _h(jt_yf_yp_xp.sum(axis=0))

    # TE = H(Yf,Yp) − H(Yp) − H(Yf,Yp,Xp) + H(Yp,Xp)
    te = h_yf_yp - h_yp - h_yf_yp_xp + h_yp_xp

    # TE is theoretically ≥ 0; clamp small negative artefacts
    return float(max(te, 0.0))


# ── 3. Permutation significance test ────────────────────────────────────────

def _block_shuffle(x: np.ndarray, block_size: int, rng: np.random.Generator) -> np.ndarray:
    """Shuffle x in contiguous blocks to preserve local autocorrelation structure."""
    n = len(x)
    n_full = n // block_size
    blocks = [x[i * block_size:(i + 1) * block_size] for i in range(n_full)]
    remainder = x[n_full * block_size:]
    rng.shuffle(blocks)
    shuffled = np.concatenate(blocks)
    if len(remainder):
        shuffled = np.concatenate([shuffled, remainder])
    return shuffled


def _permutation_pvalue(
    source: np.ndarray,
    target: np.ndarray,
    lag: int,
    observed_te: float,
    n_perms: int,
    n_bins: int,
) -> float:
    """
    Block-shuffle permutation p-value for TE(source→target, lag).

    H0: source and target are independent (shuffling source destroys
    any directional coupling while preserving its marginal distribution).
    """
    if np.isnan(observed_te):
        return np.nan

    rng = np.random.default_rng(42)
    block_size = max(3, int(np.sqrt(len(source))))
    null_te: List[float] = []

    for _ in range(n_perms):
        shuffled = _block_shuffle(source, block_size, rng)
        te_null = _te_histogram(shuffled, target, lag=lag, n_bins=n_bins)
        if not np.isnan(te_null):
            null_te.append(te_null)

    if not null_te:
        return np.nan

    return float(np.mean(np.array(null_te) >= observed_te))


# ── 4. Lag-profile scan ───────────────────────────────────────────────────────

def compute_te_lag_profile(
    source: np.ndarray,
    target: np.ndarray,
    max_lag: int = 12,
    n_bins: int = 10,
    n_perms: int = 200,
) -> List[Dict[str, Any]]:
    """
    Compute TE(source→target) for lags 1..max_lag with permutation p-values.

    Returns a list of dicts, one per lag:
        lag, te (bits), p_value, significant (p < 0.05)
    """
    results = []
    for lag in range(1, max_lag + 1):
        te = _te_histogram(source, target, lag=lag, n_bins=n_bins)
        p  = _permutation_pvalue(source, target, lag, te, n_perms=n_perms, n_bins=n_bins)
        results.append({
            "lag": lag,
            "te": round(float(te), 6) if not np.isnan(te) else None,
            "p_value": round(float(p), 4) if not np.isnan(p) else None,
            "significant": bool(p < 0.05) if not np.isnan(p) else False,
        })
    return results


# ── 5. Full analysis orchestrator ────────────────────────────────────────────

def _adaptive_bins(n: int, fallback: int = 10) -> int:
    """
    Choose bin count based on sample size using the cube-root rule.

    For small samples (< 500), 10 bins creates extremely sparse 3-D
    histograms (10³ = 1000 cells), inflating TE from noise.  The cube-root
    heuristic keeps cell occupancy reasonable.

    Clamped to [3, fallback] so we always have enough resolution without
    exceeding the caller's upper bound.
    """
    if n < 30:
        return 3
    bins = int(round(n ** (1.0 / 3.0)))
    return max(3, min(bins, fallback))


def run_transfer_entropy_analysis(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
    max_lag: int = 12,
    n_bins: int | None = None,
    n_perms: int = 200,
) -> Dict[str, Any]:
    """
    Full Transfer Entropy analysis: both directions, lag profile, net directionality.

    Returns
    -------
    n_obs              : aligned observation count
    lag_profile_s2r    : TE(sentiment→returns) by lag
    lag_profile_r2s    : TE(returns→sentiment) by lag
    optimal_lag        : lag with highest significant TE (S→R)
    peak_te            : TE value at optimal lag (bits)
    peak_pvalue        : p-value at optimal lag
    significant        : True if any lag is significant at p < 0.05
    mean_te_s2r        : mean TE across all lags (S→R direction)
    mean_te_r2s        : mean TE across all lags (R→S direction)
    directionality_score : mean_te_s2r − mean_te_r2s
    net_directionality : "sentiment_leads" | "returns_lead" | "bidirectional" | "none"
    interpretation     : human-readable summary
    """
    # Full series lengths (before intersection) — returned for diagnostics so
    # the caller can report how many extra sentiment points extend past price.
    n_sentiment_pts = len(sentiment_ts)
    n_returns_pts   = len(returns_ts)

    aligned = pd.concat(
        [sentiment_ts.rename("s"), returns_ts.rename("r")],
        axis=1,
    ).dropna()
    n = len(aligned)

    if n < 25:
        return {
            "error": f"Insufficient data ({n} observations; minimum 25 required).",
            "n_obs": n,
        }

    s_arr = aligned["s"].values.astype(float)
    r_arr = aligned["r"].values.astype(float)

    # Adaptive binning: choose bins based on sample size when not specified
    if n_bins is None:
        n_bins = _adaptive_bins(n)

    logger.info(
        "Transfer Entropy: %d obs, max_lag=%d, n_bins=%d, n_perms=%d",
        n, max_lag, n_bins, n_perms,
    )

    lag_profile_s2r = compute_te_lag_profile(
        s_arr, r_arr, max_lag=max_lag, n_bins=n_bins, n_perms=n_perms
    )
    lag_profile_r2s = compute_te_lag_profile(
        r_arr, s_arr, max_lag=max_lag, n_bins=n_bins, n_perms=n_perms
    )

    # ── Best lag (S→R) ─────────────────────────────────────────────────────
    sig_lags = [e for e in lag_profile_s2r if e["significant"] and e["te"] is not None]
    if sig_lags:
        best = max(sig_lags, key=lambda x: x["te"])
    else:
        valid = [e for e in lag_profile_s2r if e["te"] is not None]
        best = max(valid, key=lambda x: x["te"]) if valid else None

    optimal_lag  = best["lag"]       if best else None
    peak_te      = best["te"]        if best else None
    peak_pvalue  = best["p_value"]   if best else None
    peak_sig     = bool(best["significant"]) if best else False

    # ── Directionality ─────────────────────────────────────────────────────
    te_s2r_vals = [e["te"] for e in lag_profile_s2r if e["te"] is not None]
    te_r2s_vals = [e["te"] for e in lag_profile_r2s if e["te"] is not None]

    mean_s2r = float(np.mean(te_s2r_vals)) if te_s2r_vals else 0.0
    mean_r2s = float(np.mean(te_r2s_vals)) if te_r2s_vals else 0.0
    dir_score = mean_s2r - mean_r2s

    any_sig_s2r = any(e["significant"] for e in lag_profile_s2r)
    any_sig_r2s = any(e["significant"] for e in lag_profile_r2s)

    if any_sig_s2r and any_sig_r2s:
        direction = "bidirectional"
    elif any_sig_s2r:
        direction = "sentiment_leads"
    elif any_sig_r2s:
        direction = "returns_lead"
    else:
        direction = "none"

    # ── Interpretation ──────────────────────────────────────────────────────
    if optimal_lag is not None and peak_sig:
        lag_hours = optimal_lag * 4
        if lag_hours < 24:
            lag_str = f"{lag_hours}h"
        else:
            lag_days = lag_hours / 24
            lag_str = f"{lag_days:.1f} day{'s' if lag_days != 1.0 else ''} ({lag_hours}h)"
        pv_str  = f"{peak_pvalue:.3f}" if peak_pvalue is not None else "—"
        interp  = (
            f"Sentiment transfers significant information to returns at lag +{lag_str} "
            f"(TE = {peak_te:.4f} bits, p = {pv_str})."
        )
        if direction == "bidirectional":
            interp += " Bidirectional feedback detected — price also influences sentiment."
        elif direction == "sentiment_leads":
            interp += " Unidirectional: sentiment leads price with no significant reverse flow."
    elif peak_te is not None:
        pv_str = f"{peak_pvalue:.3f}" if peak_pvalue is not None else "—"
        _h = optimal_lag * 4
        _lag_label = f"{_h}h" if _h < 24 else f"{_h / 24:.1f}d ({_h}h)"
        interp = (
            f"Weak or non-significant information transfer "
            f"(best TE = {peak_te:.4f} bits at lag +{_lag_label}, p = {pv_str}). "
            "Collect more data or review sentiment coverage to strengthen the signal."
        )
    else:
        interp = "Insufficient aligned data for Transfer Entropy analysis."

    return {
        "n_obs": int(n),
        "n_bins_used": int(n_bins),
        "n_sentiment_pts": int(n_sentiment_pts),
        "n_returns_pts": int(n_returns_pts),
        "lag_profile_s2r": lag_profile_s2r,
        "lag_profile_r2s": lag_profile_r2s,
        "optimal_lag": optimal_lag,
        "peak_te": round(peak_te, 6)    if peak_te    is not None else None,
        "peak_pvalue": round(peak_pvalue, 4) if peak_pvalue is not None else None,
        "significant": peak_sig,
        "mean_te_s2r": round(mean_s2r, 6),
        "mean_te_r2s": round(mean_r2s, 6),
        "directionality_score": round(dir_score, 6),
        "net_directionality": direction,
        "interpretation": interp,
    }
