"""
proxy_sentiment.py – Blend sparse ticker sentiment with correlated proxy assets.

When a ticker has fewer than ``min_obs`` days of sentiment data, the backtester
falls back to a simple global-threshold simulation that is less reliable.
This module provides ``get_proxy_sentiment_series()`` which supplements a sparse
series by blending it with the sentiment of one or two highly correlated
instruments, allowing the walk-forward backtest to run on more observations.

Design principles:
  • Proxy data only fills gaps or blends at reduced weight (``proxy_weight``).
    It never fabricates signal where the ticker has its own data.
  • The returned Series carries a ``.metadata`` attribute so callers can
    surface a transparency warning to the user.
  • No side-effects: this module only reads existing data, never writes.
"""

import logging
from typing import Callable, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Proxy relationship map
# ---------------------------------------------------------------------------
# Each entry maps a sparse ticker to an ordered list of proxy tickers.
# Proxies are chosen based on well-known financial correlations:
#   • FX pairs share drivers (DXY, ECB, BoE, etc.)
#   • Equity peers in the same sector / region
#   • Commodities share macro drivers (USD, energy complex)
#   • Bonds share duration / rates-curve drivers
#
# Up to 2 proxies are used (equal-weighted average).
PROXY_MAP: Dict[str, List[str]] = {
    # ── Equities (thin coverage) ──────────────────────────────────────────
    "BBVA":   ["JPM", "BAC"],
    "SAN":    ["JPM", "BAC"],
    "BNP":    ["GS", "JPM"],
    "DB":     ["GS", "MS"],
    "HSBC":   ["JPM", "BAC"],
    "MTN":    ["SPY"],
    "RIO":    ["CPER", "WTI"],
    "TTE":    ["WTI", "XOM"],
    "SLB":    ["WTI", "XOM"],
    "XOM":    ["WTI", "SPY"],
    "CVX":    ["WTI", "SPY"],
    "WFC":    ["JPM", "BAC"],
    "MS":     ["GS", "JPM"],
    "C":      ["JPM", "BAC"],
    "KO":     ["SPY"],
    "SBUX":   ["SPY"],
    "AMD":    ["NVDA", "SPY"],
    "QQQ":    ["SPY", "NVDA"],
    "XLF":    ["JPM", "BAC"],

    # ── Commodities ───────────────────────────────────────────────────────
    "GOLD":   ["DXY", "WTI"],
    "SILVER": ["GOLD", "DXY"],
    "PPLT":   ["GOLD"],
    "CPER":   ["WTI", "AUDUSD"],
    "WEAT":   ["WTI"],
    "UNG":    ["WTI"],
    "BNO":    ["WTI"],
    "JO":     ["AUDUSD"],
    "JJU":    ["CPER", "WTI"],

    # ── FX pairs ─────────────────────────────────────────────────────────
    "EURGBP": ["EURUSD", "GBPUSD"],
    "EURJPY": ["EURUSD", "USDJPY"],
    "GBPJPY": ["GBPUSD", "USDJPY"],
    "USDCHF": ["DXY", "EURUSD"],
    "USDNOK": ["DXY", "WTI"],       # NOK is a petro-currency
    "USDSEK": ["DXY", "EURUSD"],
    "USDZAR": ["DXY", "GOLD"],
    "USDTRY": ["DXY"],
    "USDEGP": ["DXY"],
    "USDMAD": ["EURUSD", "DXY"],
    "NZDUSD": ["AUDUSD", "DXY"],
    "USDCAD": ["WTI", "DXY"],
    "AUDUSD": ["DXY", "CPER"],

    # ── Bonds ────────────────────────────────────────────────────────────
    "SHY":   ["IEF", "TLT"],
    "VGSH":  ["IEF", "SHY"],
    "BUND":  ["IEF", "TLT"],
    "OAT":   ["BUND", "IEF"],
    "EMB":   ["TLT", "SPY"],
    "RSX":   ["TLT"],
    "IEF":   ["TLT", "DXY"],
}


# ---------------------------------------------------------------------------
# Core blending function
# ---------------------------------------------------------------------------

def get_proxy_sentiment_series(
    ticker: str,
    min_obs: int = 80,
    proxy_weight: float = 0.3,
    build_fn: Optional[Callable[[str], pd.Series]] = None,
) -> pd.Series:
    """
    Return a sentiment series for ``ticker``, optionally blended with proxy
    data when the ticker's own series has fewer than ``min_obs`` observations.

    Args:
        ticker:       Target ticker symbol (case-insensitive).
        min_obs:      If the ticker's own series has >= this many observations,
                      return it unchanged without any blending.
        proxy_weight: Fraction of the proxy signal to mix in when blending.
                      ``0.0`` = pure ticker signal, ``1.0`` = pure proxy.
                      Applied only when ``n_own < min_obs``.
        build_fn:     Callable ``(ticker: str) -> pd.Series`` that returns a
                      daily net_sentiment series indexed by date.
                      Defaults to :func:`analytics.correlation.build_sentiment_timeseries`.
                      Injectable for unit testing.

    Returns:
        ``pd.Series`` of net_sentiment indexed by date.
        Carries a ``.metadata`` dict attribute with keys:

        * ``blended``      – ``True`` if proxy blending was applied.
        * ``n_own``        – Number of observations from the ticker's own data.
        * ``n_proxy``      – Approximate number of additional days covered by proxy.
        * ``proxies_used`` – List of proxy ticker symbols that were blended.
    """
    if build_fn is None:
        from analytics.correlation import build_sentiment_timeseries
        build_fn = build_sentiment_timeseries

    own_ts = build_fn(ticker.upper())
    n_own = len(own_ts)

    metadata: dict = {
        "blended": False,
        "n_own": n_own,
        "n_proxy": 0,
        "proxies_used": [],
    }

    # Sufficient own data – return as-is
    if n_own >= min_obs:
        own_ts.metadata = metadata  # type: ignore[attr-defined]
        return own_ts

    # Look up proxy tickers
    proxy_tickers: List[str] = PROXY_MAP.get(ticker.upper(), [])
    proxy_series_list: List[pd.Series] = []
    proxies_used: List[str] = []

    for pt in proxy_tickers:
        try:
            ps = build_fn(pt)
        except Exception as exc:
            logger.debug("proxy_sentiment: could not build series for proxy %s: %s", pt, exc)
            continue
        if not ps.empty:
            proxy_series_list.append(ps)
            proxies_used.append(pt)
        if len(proxy_series_list) >= 2:
            break  # Use at most 2 proxies

    if not proxy_series_list:
        logger.info(
            "proxy_sentiment: no proxy data available for %s (%d own obs) – returning own series",
            ticker.upper(), n_own,
        )
        own_ts.metadata = metadata  # type: ignore[attr-defined]
        return own_ts

    # Equal-weighted average of proxy series
    proxy_combined = pd.concat(proxy_series_list, axis=1).mean(axis=1)

    # Align to a common date index
    combined = pd.concat(
        [own_ts.rename("own"), proxy_combined.rename("proxy")],
        axis=1,
    )

    # Where we have both: weighted blend
    both_present = combined["own"].notna() & combined["proxy"].notna()
    combined.loc[both_present, "blended"] = (
        (1.0 - proxy_weight) * combined.loc[both_present, "own"]
        + proxy_weight * combined.loc[both_present, "proxy"]
    )

    # Where only own data exists: keep it unchanged
    only_own = combined["own"].notna() & combined["proxy"].isna()
    combined.loc[only_own, "blended"] = combined.loc[only_own, "own"]

    # Where only proxy exists: use it at reduced weight (don't invent strong signal)
    only_proxy = combined["own"].isna() & combined["proxy"].notna()
    combined.loc[only_proxy, "blended"] = combined.loc[only_proxy, "proxy"] * proxy_weight

    result = combined["blended"].dropna().sort_index()
    n_result = len(result)

    metadata.update({
        "blended": True,
        "n_own": n_own,
        "n_proxy": max(0, n_result - n_own),
        "proxies_used": proxies_used,
    })
    result.metadata = metadata  # type: ignore[attr-defined]

    logger.info(
        "proxy_sentiment: %s – %d own obs blended with %s → %d total obs",
        ticker.upper(), n_own, proxies_used, n_result,
    )
    return result
