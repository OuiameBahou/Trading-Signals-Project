"""
tests/check_alignment.py — Verify asymmetric price/sentiment alignment.

Scenario: price data stops 5 days before sentiment ends.
Expected:
  - TE n_obs equals the strict intersection length (price window only).
  - Chart series are independent: sentiment_chart extends past returns_chart.
  - n_sentiment_pts / n_returns_pts in the TE result reflect the raw lengths.

Run from the repo root:
    python tests/check_alignment.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from datetime import date, timedelta

import numpy as np
import pandas as pd

from analytics.transfer_entropy import run_transfer_entropy_analysis
from analytics.correlation import build_chart_series


def _make_series(start: date, end: date, freq: str = "4h", seed: int = 0) -> pd.Series:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(start=str(start), end=str(end), freq=freq)
    return pd.Series(rng.standard_normal(len(idx)), index=idx)


def test_asymmetric_alignment() -> None:
    today      = date.today()
    price_end  = today - timedelta(days=5)
    sent_end   = today
    common_start = today - timedelta(days=90)

    returns_ts   = _make_series(common_start, price_end, freq="4h", seed=1)
    sentiment_ts = _make_series(common_start, sent_end,  freq="4h", seed=2)

    print(f"Price series:     {returns_ts.index.min().date()} → {returns_ts.index.max().date()} ({len(returns_ts)} pts)")
    print(f"Sentiment series: {sentiment_ts.index.min().date()} → {sentiment_ts.index.max().date()} ({len(sentiment_ts)} pts)")

    # ── 1. TE stats must use the intersection (no trailing NaN rows) ──────────
    te = run_transfer_entropy_analysis(sentiment_ts, returns_ts)
    assert "error" not in te, f"TE failed: {te}"

    expected_n_obs = len(
        pd.concat([sentiment_ts.rename("s"), returns_ts.rename("r")], axis=1).dropna()
    )
    assert te["n_obs"] == expected_n_obs, (
        f"n_obs mismatch: got {te['n_obs']}, expected {expected_n_obs}"
    )
    assert te["n_sentiment_pts"] == len(sentiment_ts), "n_sentiment_pts mismatch"
    assert te["n_returns_pts"]   == len(returns_ts),   "n_returns_pts mismatch"
    print(f"TE n_obs (intersection): {te['n_obs']}")
    print(f"TE n_sentiment_pts:      {te['n_sentiment_pts']}")
    print(f"TE n_returns_pts:        {te['n_returns_pts']}")

    # ── 2. Chart series must extend independently to each series' natural end ─
    sentiment_chart, returns_chart = build_chart_series(sentiment_ts, returns_ts)
    assert sentiment_chart and returns_chart, "Chart series should not be empty"

    last_sent  = sentiment_chart[-1]["date"]
    last_price = returns_chart[-1]["date"]
    print(f"Chart sentiment last date: {last_sent}")
    print(f"Chart returns last date:   {last_price}")

    assert last_sent > last_price, (
        f"Sentiment chart should extend past returns chart: {last_sent} vs {last_price}"
    )

    print("\n✓ All assertions passed — asymmetric alignment works correctly.")


if __name__ == "__main__":
    test_asymmetric_alignment()
