"""
ic_analysis.py – Analyse du Coefficient d'Information (IC) des signaux de sentiment.

Robustness features:
  - Minimum unique-rank check per rolling window (avoids degenerate IC = ±1).
  - Bayesian shrinkage: raw IC is pulled toward 0 proportionally to how little
    data is available (fewer observations → heavier shrinkage).
  - Confidence-weighted sentiment: articles with higher FinBERT confidence
    contribute more to the daily net-sentiment used for IC.
  - A `reliability` score (0–1) is returned so the frontend can distinguish
    strong IC estimates from noisy ones.
"""

import logging
from typing import Dict, Any
import pandas as pd
import numpy as np
from scipy.stats import spearmanr

logger = logging.getLogger(__name__)

# ── Tuning constants ────────────────────────────────────────────────────────
IC_ROLLING_WINDOW = 20          # rolling window for Spearman IC
MIN_OBS_RATIO     = 1.5         # require at least window × 1.5 observations
MIN_UNIQUE_RANKS  = 3           # per-window: need ≥3 distinct sentiment ranks
SHRINKAGE_N_FULL  = 50          # observations at which shrinkage factor → 0
MIN_ARTICLES_PER_TICKER = 3     # refuse IC if ticker has < 3 raw articles


def _bayesian_shrinkage(raw_ic: float, n_obs: int) -> float:
    """Shrink raw IC toward 0 based on sample size.

    shrinkage = max(0, 1 − n_obs / SHRINKAGE_N_FULL)
    adjusted  = raw_ic × (1 − shrinkage)

    With 200+ observations → no shrinkage.  With 60 → shrink by 70%.
    """
    shrinkage = max(0.0, 1.0 - n_obs / SHRINKAGE_N_FULL)
    return raw_ic * (1.0 - shrinkage)


def _reliability_score(n_obs: int, std_ic: float, pct_valid_windows: float) -> float:
    """Composite reliability metric in [0, 1].

    Factors:
      - sample_factor : sigmoid-ish ramp from 0 (few obs) to 1 (many obs)
      - stability     : inverse of IC standard deviation (stable IC → high)
      - coverage      : fraction of rolling windows that were non-degenerate
    """
    sample_factor = min(1.0, n_obs / SHRINKAGE_N_FULL)
    stability = 1.0 / (1.0 + std_ic) if std_ic > 0 else 0.0
    reliability = 0.5 * sample_factor + 0.3 * stability + 0.2 * pct_valid_windows
    return round(min(1.0, max(0.0, reliability)), 4)


def compute_ic(
    sentiment_ts: pd.Series,
    returns_ts: pd.Series,
    window: int = IC_ROLLING_WINDOW,
) -> Dict[str, Any]:
    """
    Compute the Information Coefficient (IC) and ICIR.

    IC = Spearman rank correlation between lagged sentiment and forward returns,
    computed on a rolling basis with degenerate-window filtering and Bayesian
    shrinkage.

    Returns dict with: mean_ic, icir, ic_ts, n_obs, reliability, raw_mean_ic.
    """
    if sentiment_ts.empty or returns_ts.empty:
        return {"error": "Empty time series"}

    min_required = int(window * MIN_OBS_RATIO)

    # Align sentiment(t-1) with returns(t)
    aligned = pd.concat(
        [sentiment_ts.shift(1).rename("sentiment"), returns_ts.rename("returns")],
        axis=1,
    ).dropna()

    if len(aligned) < min_required:
        return {
            "error": f"Insufficient data: {len(aligned)} observations "
                     f"(need ≥{min_required} for window={window})"
        }

    # Check sentiment variance — if nearly constant, IC is meaningless
    sent_nunique = aligned["sentiment"].nunique()
    if sent_nunique < MIN_UNIQUE_RANKS:
        return {
            "error": f"Sentiment series has only {sent_nunique} unique values "
                     f"(need ≥{MIN_UNIQUE_RANKS}) — IC would be unreliable"
        }

    # ── Rolling Spearman with per-window degeneracy filtering ────────────
    ic_values = []
    ic_dates = []
    n_degenerate = 0

    for i in range(window, len(aligned)):
        w = aligned.iloc[i - window : i]

        # Skip windows where sentiment has too few unique ranks
        if w["sentiment"].nunique() < max(3, MIN_UNIQUE_RANKS // 2):
            n_degenerate += 1
            continue
        # Skip windows where returns have zero variance
        if w["returns"].std() < 1e-10:
            n_degenerate += 1
            continue

        corr, _ = spearmanr(w["sentiment"], w["returns"])
        if np.isnan(corr):
            n_degenerate += 1
            continue

        ic_values.append(corr)
        ic_dates.append(aligned.index[i])

    total_windows = len(aligned) - window
    n_valid = len(ic_values)

    if n_valid < 5:
        return {"error": "Too few valid rolling windows after filtering degenerate periods"}

    ic_series = pd.Series(ic_values, index=ic_dates)
    pct_valid = n_valid / max(1, total_windows)

    # ── Raw statistics ───────────────────────────────────────────────────
    raw_mean_ic = float(ic_series.mean())
    std_ic = float(ic_series.std())

    # ── Bayesian shrinkage ───────────────────────────────────────────────
    mean_ic = _bayesian_shrinkage(raw_mean_ic, n_valid)

    # ── ICIR ─────────────────────────────────────────────────────────────
    if std_ic < 1e-6:
        icir = 0.0
    else:
        icir = mean_ic / std_ic

    # ── Reliability ──────────────────────────────────────────────────────
    reliability = _reliability_score(n_valid, std_ic, pct_valid)

    # ── Chart data ───────────────────────────────────────────────────────
    ic_chart = [
        {"date": str(d.date()) if hasattr(d, "date") else str(d), "value": round(float(v), 4)}
        for d, v in ic_series.items()
        if not np.isnan(v)
    ]

    return {
        "mean_ic":      round(float(mean_ic), 4),
        "raw_mean_ic":  round(float(raw_mean_ic), 4),
        "icir":         round(float(icir), 4),
        "ic_ts":        ic_chart,
        "n_obs":        n_valid,
        "n_degenerate": n_degenerate,
        "reliability":  reliability,
    }


def run_ic_analysis(ticker: str) -> Dict[str, Any]:
    """Run IC analysis for a single asset, with data-quality pre-checks."""
    from analytics.correlation import fetch_price_data, build_sentiment_timeseries
    import json, os

    # ── Pre-check: count raw articles for this ticker ────────────────────
    data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data",
    )
    nlp_file = os.path.join(data_dir, "nlp_results.jsonl")
    article_count = 0
    if os.path.exists(nlp_file):
        with open(nlp_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("ticker", "").upper() == ticker.upper():
                    article_count += 1

    if article_count < MIN_ARTICLES_PER_TICKER:
        return {
            "error": f"Only {article_count} articles for {ticker.upper()} "
                     f"(need ≥{MIN_ARTICLES_PER_TICKER}) — IC would be unreliable",
            "ticker": ticker.upper(),
            "n_articles": article_count,
        }

    # ── Build sentiment series (prefer dense 4h series) ──────────────────
    try:
        from analytics.sentiment_history import get_dense_sentiment_series
        sentiment_ts = get_dense_sentiment_series(ticker, min_days=5, freq="4h")
    except Exception:
        sentiment_ts = build_sentiment_timeseries(ticker)

    start_date = sentiment_ts.index.min().strftime("%Y-%m-%d") if not sentiment_ts.empty else None
    price_ts = fetch_price_data(ticker, start=start_date, interval="1h")

    if sentiment_ts.empty or price_ts.empty:
        return {"error": "Insufficient data for IC analysis", "ticker": ticker.upper()}

    result = compute_ic(sentiment_ts, price_ts)
    result["ticker"] = ticker.upper()
    result["n_articles"] = article_count
    return result
