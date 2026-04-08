"""
massive_scraper.py — Polygon.io (Massive API) institutional-grade price data collector.

Replaces yfinance/Finnhub for US Equities and Forex with real-time, zero-lag data.

Key advantages over legacy scrapers:
  - No free-tier intraday truncation (Finnhub/yfinance cut off 1h data 1-3 weeks early)
  - UTC-native timestamps → zero-offset alignment with Finviz sentiment timestamps
  - Full historical depth (years of intraday data in a single session)
  - Eliminates the need for the "Hybrid Gap-Fill" artifact

Coverage:
  - US Equities: all NYSE/NASDAQ stocks and ETFs
  - Forex: all major/minor/exotic pairs via C:PAIR format
  - NOT covered: commodity futures (GC=F, CL=F, etc.) → falls back to yfinance

Timestamp alignment note:
  Polygon returns timestamps in milliseconds UTC. Finviz news timestamps are stored
  with explicit EST offset and converted to UTC in build_sentiment_timeseries() via
  pd.to_datetime(created_at, utc=True). Both series therefore share the same UTC
  reference frame after tz stripping → correlation lag goes to zero.
"""

import logging
import os
import tempfile
import time
from datetime import datetime, timedelta, date, timezone
from typing import Optional

import requests
import pandas as pd

logger = logging.getLogger(__name__)

POLYGON_API_KEY = os.getenv("POLYGON_API_KEY", "GE8c8x0EKltA8B3RXORyy7_kx3LTPrF_")
_BASE_URL = "https://api.massive.com"
_MAX_PER_PAGE = 50000           # Polygon hard limit per request
_REQUEST_DELAY = 0.12           # seconds between paginated calls (avoid 429s)

# ── S3 Flat Files credentials (Polygon paid subscription) ─────────────────────
POLYGON_S3_ACCESS_KEY = os.getenv("POLYGON_S3_ACCESS_KEY", "")
POLYGON_S3_SECRET_KEY = os.getenv("POLYGON_S3_SECRET_KEY", "")
_S3_ENDPOINT = os.getenv("POLYGON_S3_ENDPOINT", "https://files.massive.com")
_S3_BUCKET   = os.getenv("POLYGON_S3_BUCKET", "flatfiles")
_S3_CACHE_DIR = os.path.join(tempfile.gettempdir(), "polygon_flatfiles_cache")

# ── Ticker mapping: internal platform ticker → Polygon symbol ─────────────────
# None  = asset class not supported by Polygon (caller should fall back)
POLYGON_TICKER_MAP: dict[str, Optional[str]] = {
    # ── US Equities ──────────────────────────────────────────────────────────
    "JPM":   "JPM",   "BAC":  "BAC",  "GS":   "GS",   "C":    "C",
    "MS":    "MS",    "WFC":  "WFC",  "AAPL": "AAPL", "MSFT": "MSFT",
    "GOOGL": "GOOGL", "AMZN": "AMZN", "META": "META", "NVDA": "NVDA",
    "TSLA":  "TSLA",  "AMD":  "AMD",  "XOM":  "XOM",  "CVX":  "CVX",
    "SLB":   "SLB",   "KO":   "KO",   "SBUX": "SBUX",
    # ── US ETFs (equities + bond proxies) ────────────────────────────────────
    "SPY":   "SPY",   "QQQ":  "QQQ",  "XLF":  "XLF",
    "SHY":   "SHY",   "IEF":  "IEF",  "TLT":  "TLT",  "VGSH": "VGSH",
    "EMB":   "EMB",   "BNO":  "BNO",  "UNG":  "UNG",
    "PPLT":  "PPLT",  "CPER": "CPER", "WEAT": "WEAT", "JO":   "JO",
    # ── Forex (Polygon uses C:PAIR format) ───────────────────────────────────
    "EURUSD": "C:EURUSD", "GBPUSD": "C:GBPUSD",
    "USDJPY": "C:USDJPY", "USDCHF": "C:USDCHF",
    "AUDUSD": "C:AUDUSD", "USDCAD": "C:USDCAD",
    "NZDUSD": "C:NZDUSD", "EURGBP": "C:EURGBP",
    "EURJPY": "C:EURJPY", "GBPJPY": "C:GBPJPY",
    "USDNOK": "C:USDNOK", "USDSEK": "C:USDSEK",
    "USDZAR": "C:USDZAR", "USDTRY": "C:USDTRY",
    "USDEGP": "C:USDEGP", "USDMAD": "C:USDMAD",
    # ── Commodities via Polygon FX/Spot endpoint (C:XAU/XAG/XPT) ────────────
    "GOLD": "C:XAUUSD",  # Gold spot vs USD
    "SLV":  "C:XAGUSD",  # Silver spot vs USD
    "PPLT": "C:XPTUSD",  # Platinum spot vs USD
    # ── Not supported on Polygon → no fallback ───────────────────────────────
    "DXY":  None,   # Dollar Index — no Polygon equivalent
    "WTI":  None,   # CL=F crude oil futures
    "BUND": None,   # European bond ETF (IS0L.DE)
    "OAT":  None,   # French bond ETF (GOAT.PA)
    "US10Y": None,  # ^TNX yield index
    "US30Y": None,  # ^TYX yield index
}

# ── Interval → (Polygon timespan, multiplier) ─────────────────────────────────
_INTERVAL_MAP: dict[str, tuple[str, int]] = {
    "1m":  ("minute", 1),
    "5m":  ("minute", 5),
    "15m": ("minute", 15),
    "30m": ("minute", 30),
    "60m": ("hour",   1),
    "1h":  ("hour",   1),
    "4h":  ("hour",   4),
    "1d":  ("day",    1),
    "5d":  ("day",    5),
    "1wk": ("week",   1),
    "1mo": ("month",  1),
}

# Period string → number of calendar days (for computing from-date)
_PERIOD_DAYS: dict[str, int] = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825, "max": 3650,
}


def _resolve_date_range(
    period: Optional[str],
    start: Optional[str],
    end: Optional[str],
) -> tuple[str, str]:
    """
    Return (from_date, to_date) as YYYY-MM-DD strings.

    Priority: explicit start/end > period string > default 6 months.
    """
    today = date.today()
    to_dt = pd.to_datetime(end).date() if end else today
    if start:
        from_dt = pd.to_datetime(start).date()
    elif period:
        days = _PERIOD_DAYS.get(period, 180)
        from_dt = today - timedelta(days=days)
    else:
        from_dt = today - timedelta(days=180)
    return str(from_dt), str(to_dt)


def _fetch_aggs(
    polygon_ticker: str,
    timespan: str,
    multiplier: int,
    from_date: str,
    to_date: str,
) -> list[dict]:
    """
    Fetch all aggregate bars from Polygon, following next_url pagination.

    Returns a flat list of raw result dicts (fields: t, c, o, h, l, v).
    """
    url = (
        f"{_BASE_URL}/v2/aggs/ticker/{polygon_ticker}"
        f"/range/{multiplier}/{timespan}/{from_date}/{to_date}"
    )
    params = {
        "adjusted": "true",
        "sort": "asc",
        "limit": _MAX_PER_PAGE,
        "apiKey": POLYGON_API_KEY,
    }

    all_results: list[dict] = []
    pages = 0

    while url:
        try:
            if pages > 0:
                time.sleep(_REQUEST_DELAY)
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else "?"
            if status == 403:
                logger.error(
                    "Polygon 403 Forbidden for %s — check API key or subscription tier.",
                    polygon_ticker,
                )
            elif status == 429:
                logger.warning("Polygon 429 rate-limit for %s — backing off 5s.", polygon_ticker)
                time.sleep(5)
                continue  # retry same URL
            else:
                logger.warning("Polygon HTTP %s for %s: %s", status, polygon_ticker, exc)
            break
        except Exception as exc:
            logger.warning("Polygon request error for %s: %s", polygon_ticker, exc)
            break

        status_str = data.get("status", "")
        if status_str not in ("OK", "DELAYED"):
            logger.warning(
                "Polygon non-OK status '%s' for %s: %s",
                status_str, polygon_ticker, data.get("error", ""),
            )
            break

        batch = data.get("results") or []
        all_results.extend(batch)
        pages += 1

        # Follow cursor pagination
        next_url = data.get("next_url")
        if next_url:
            # next_url already contains cursor; still need apiKey
            url = next_url
            params = {"apiKey": POLYGON_API_KEY}
        else:
            url = None  # done

    logger.debug(
        "Polygon _fetch_aggs: %s [%s x %d] %s→%s — %d bars in %d page(s)",
        polygon_ticker, timespan, multiplier, from_date, to_date, len(all_results), pages,
    )
    return all_results


def _aggs_to_series(results: list[dict]) -> Optional[pd.Series]:
    """
    Convert raw Polygon aggregate results to a tz-naive UTC Close pd.Series.

    Polygon `t` field = milliseconds since Unix epoch (UTC).
    """
    if not results:
        return None

    timestamps = []
    closes = []
    for bar in results:
        t_ms = bar.get("t")
        c = bar.get("c")
        if t_ms is None or c is None:
            continue
        # Convert ms UTC → tz-naive UTC datetime
        dt = datetime.fromtimestamp(t_ms / 1000, tz=timezone.utc).replace(tzinfo=None)
        timestamps.append(dt)
        closes.append(float(c))

    if not timestamps:
        return None

    series = pd.Series(closes, index=pd.DatetimeIndex(timestamps), name="Close")
    series = series.sort_index()
    series = series[~series.index.duplicated(keep="last")]
    return series


def _s3_client():
    """Return a boto3 S3 client pointed at Polygon's flat-files endpoint, or None."""
    if not POLYGON_S3_ACCESS_KEY or not POLYGON_S3_SECRET_KEY:
        return None
    try:
        import boto3
        from botocore.config import Config
        return boto3.client(
            "s3",
            endpoint_url=_S3_ENDPOINT,
            aws_access_key_id=POLYGON_S3_ACCESS_KEY,
            aws_secret_access_key=POLYGON_S3_SECRET_KEY,
            config=Config(signature_version="s3v4"),
        )
    except ImportError:
        logger.warning("boto3 not installed — Polygon S3 flat files unavailable")
        return None


def _ticker_s3_prefix(polygon_ticker: str) -> str:
    """Map a Polygon ticker to its S3 asset-class prefix."""
    return "global_forex" if polygon_ticker.startswith("C:") else "us_stocks_sip"


def _s3_day_key(asset_class: str, dt: date) -> str:
    return f"{asset_class}/day_aggs_v1/{dt.year}/{dt.month:02d}/{dt}.csv.gz"


def _load_day_file(s3, asset_class: str, dt: date) -> Optional[pd.DataFrame]:
    """
    Fetch one day's flat file from S3, using a local parquet cache.
    Returns a DataFrame with columns [ticker, open, high, low, close, volume, window_start]
    or None if the file does not exist (e.g. market holiday).
    """
    key = _s3_day_key(asset_class, dt)
    cache_path = os.path.join(_S3_CACHE_DIR, key.replace("/", "_").replace(".csv.gz", ".parquet"))

    # Cache hit
    if os.path.exists(cache_path):
        try:
            return pd.read_parquet(cache_path)
        except Exception:
            os.remove(cache_path)  # corrupted — re-download

    try:
        resp = s3.get_object(Bucket=_S3_BUCKET, Key=key)
        df = pd.read_csv(resp["Body"], compression="gzip")
        os.makedirs(_S3_CACHE_DIR, exist_ok=True)
        df.to_parquet(cache_path, index=False)
        return df
    except Exception as exc:
        err = str(exc)
        if "NoSuchKey" in err or "404" in err:
            return None  # non-trading day
        logger.warning("Polygon flat files S3 error for %s on %s: %s", asset_class, dt, exc)
        return None


def _fetch_flatfiles_daily(polygon_ticker: str, from_date: str, to_date: str) -> list[dict]:
    """
    Download daily aggregate bars from Polygon S3 flat files for a single ticker.

    Each flat file covers one trading day for ALL tickers; we filter to polygon_ticker
    and convert to the same dict format as _fetch_aggs (t in ms, c, o, h, l, v).

    Only called for 1-day interval requests. Falls back to empty list on any error.
    """
    s3 = _s3_client()
    if s3 is None:
        return []

    asset_class = _ticker_s3_prefix(polygon_ticker)
    from_dt = date.fromisoformat(from_date)
    to_dt   = date.fromisoformat(to_date)

    all_results: list[dict] = []
    current = from_dt
    while current <= to_dt:
        if current.weekday() < 5:  # skip weekends
            df = _load_day_file(s3, asset_class, current)
            if df is not None and not df.empty:
                rows = df[df["ticker"] == polygon_ticker]
                for _, row in rows.iterrows():
                    # window_start is nanoseconds since Unix epoch → convert to ms
                    t_ms = int(row["window_start"]) // 1_000_000
                    all_results.append({
                        "t": t_ms,
                        "c": float(row["close"]),
                        "o": float(row["open"]),
                        "h": float(row["high"]),
                        "l": float(row["low"]),
                        "v": float(row["volume"]),
                    })
        current += timedelta(days=1)

    logger.debug(
        "Polygon flat files: %s [daily] %s→%s — %d bars",
        polygon_ticker, from_date, to_date, len(all_results),
    )
    return all_results


def fetch_price_series_polygon(
    platform_ticker: str,
    interval: str = "1d",
    start: Optional[str] = None,
    end: Optional[str] = None,
    period: Optional[str] = None,
) -> Optional[pd.Series]:
    """
    Download a Close price series from Polygon.io (Massive API).

    Parameters
    ----------
    platform_ticker : Internal ticker name (e.g. "EURUSD", "SPY", "AAPL")
    interval        : Platform interval string ("1h", "1d", "60m", etc.)
    start           : ISO start date YYYY-MM-DD (takes priority over period)
    end             : ISO end date YYYY-MM-DD (defaults to today)
    period          : Period string ("6mo", "2y", etc.) used when start is None

    Returns
    -------
    pd.Series with tz-naive UTC DatetimeIndex (Close prices), or None if the
    ticker is not covered by Polygon or the fetch fails.
    """
    ticker_upper = platform_ticker.upper()
    polygon_sym = POLYGON_TICKER_MAP.get(ticker_upper)

    if polygon_sym is None:
        # Not mapped (None explicitly) or unknown ticker → caller should fall back
        logger.debug(
            "fetch_price_series_polygon: %s not covered by Polygon → skip", ticker_upper
        )
        return None

    timespan_info = _INTERVAL_MAP.get(interval)
    if timespan_info is None:
        logger.warning(
            "fetch_price_series_polygon: unknown interval '%s' for %s — defaulting to 1d",
            interval, ticker_upper,
        )
        timespan_info = ("day", 1)

    timespan, multiplier = timespan_info
    from_date, to_date = _resolve_date_range(period, start, end)

    logger.info(
        "fetch_price_series_polygon: %s → %s [%s x %d] %s → %s",
        ticker_upper, polygon_sym, timespan, multiplier, from_date, to_date,
    )

    # For daily bars on US stocks/ETFs: try S3 flat files first (no rate limits, full depth).
    # Forex/commodity tickers (C: prefix) use REST API — flat files subscription covers stocks only.
    # For intraday: use REST API (flat files are too large to download per-day for one ticker).
    if timespan == "day" and multiplier == 1 and not polygon_sym.startswith("C:"):
        results = _fetch_flatfiles_daily(polygon_sym, from_date, to_date)
        if not results:
            logger.info(
                "fetch_price_series_polygon: flat files empty for %s — falling back to REST API",
                ticker_upper,
            )
            results = _fetch_aggs(polygon_sym, timespan, multiplier, from_date, to_date)
    else:
        results = _fetch_aggs(polygon_sym, timespan, multiplier, from_date, to_date)

    series = _aggs_to_series(results)

    if series is None or series.empty:
        logger.warning(
            "fetch_price_series_polygon: empty response for %s (%s) [%s]",
            ticker_upper, polygon_sym, interval,
        )
        return None

    logger.info(
        "fetch_price_series_polygon: %s success — %d bars [%s … %s]",
        ticker_upper, len(series),
        series.index.min().strftime("%Y-%m-%d"),
        series.index.max().strftime("%Y-%m-%d"),
    )
    return series
