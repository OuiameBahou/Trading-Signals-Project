"""
correlation.py – Data utilities: price fetching and sentiment time-series building.

Provides the shared data layer (price download + sentiment aggregation) consumed
by the Transfer Entropy and advanced analytics modules.  All basic statistical
tests (Spearman, Pearson, Granger causality) have been removed in favour of the
information-theoretic Transfer Entropy approach in transfer_entropy.py.
"""

import logging
import os
import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Polygon.io (Massive API) disabled — Yahoo Finance is the exclusive price feed
_MASSIVE_AVAILABLE = False
_POLYGON_MAP = {}


def _to_log_returns(closes: pd.Series, resample_to: str | None = None) -> pd.Series:
    """Compute log-returns from a Close price series with optional resampling."""
    if closes.empty:
        return pd.Series(dtype=float)
    if resample_to:
        closes = closes.resample(resample_to).last().dropna()
        if closes.empty:
            return pd.Series(dtype=float)
    lr = np.log(closes / closes.shift(1)).dropna()
    if resample_to:
        lr.index = lr.index.floor(resample_to)
    else:
        lr.index = lr.index.normalize()
    return lr


# ── Chemin vers data/ ───────────────────────────────────────────────────────
DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
)
PRICE_CACHE_DIR = os.path.join(DATA_DIR, "price_cache")
os.makedirs(PRICE_CACHE_DIR, exist_ok=True)

# ── Mapping plateforme → yfinance ────────────────────────────────────────────
YFINANCE_TICKER_MAP = {
    # ── Commodities ──
    "GOLD":  "GC=F",      # Gold Futures
    "WTI":   "CL=F",      # WTI Crude Oil Futures
    "BNO":   "BZ=F",      # Brent Crude Futures
    "UNG":   "NG=F",      # Natural Gas Futures
    "SLV":   "SI=F",      # Silver Futures
    "PPLT":  "PL=F",      # Platinum Futures
    "CPER":  "HG=F",      # Copper Futures
    "JJU":   "ALI=F",     # Aluminum Futures
    "WEAT":  "ZW=F",      # Wheat Futures (CBOT)
    "JO":    "KC=F",      # Coffee Futures

    # ── Forex ──
    "EURUSD": "EURUSD=X",
    "GBPUSD": "GBPUSD=X",
    "USDJPY": "JPY=X",
    "USDCHF": "CHF=X",
    "AUDUSD": "AUDUSD=X",
    "USDCAD": "CAD=X",
    "NZDUSD": "NZDUSD=X",
    "EURGBP": "EURGBP=X",
    "EURJPY": "EURJPY=X",
    "GBPJPY": "GBPJPY=X",
    "USDNOK": "NOK=X",
    "USDSEK": "SEK=X",
    "USDZAR": "ZAR=X",
    "USDTRY": "TRY=X",
    "USDEGP": "EGP=X",
    "USDMAD": "MAD=X",
    "DXY":   "DX-Y.NYB",   # US Dollar Index

    # ── Bonds / Rates (ETF proxies work directly, but add aliases) ──
    "BUND":  "IS0L.DE",    # iShares German Bund ETF
    "OAT":   "GOAT.PA",    # Amundi France Govt Bond ETF
    "US10Y": "^TNX",       # 10-Year Treasury Yield
    "US30Y": "^TYX",       # 30-Year Treasury Yield
}


def _resolve_yfinance_ticker(ticker: str) -> str:
    """Traduit un ticker interne en symbole Yahoo Finance valide."""
    return YFINANCE_TICKER_MAP.get(ticker.upper(), ticker)


# ── Mapping plateforme → stooq (secondaire, US equities/ETFs uniquement) ─────
STOOQ_TICKER_MAP = {
    # US Equities
    "JPM": "JPM.US", "BAC": "BAC.US", "GS": "GS.US", "C": "C.US",
    "MS": "MS.US", "WFC": "WFC.US", "AAPL": "AAPL.US", "MSFT": "MSFT.US",
    "GOOGL": "GOOGL.US", "AMZN": "AMZN.US", "META": "META.US",
    "NVDA": "NVDA.US", "TSLA": "TSLA.US", "AMD": "AMD.US",
    "XOM": "XOM.US", "CVX": "CVX.US", "SLB": "SLB.US",
    "KO": "KO.US", "SBUX": "SBUX.US",
    # US ETFs
    "SPY": "SPY.US", "QQQ": "QQQ.US", "XLF": "XLF.US",
    "SHY": "SHY.US", "IEF": "IEF.US", "TLT": "TLT.US", "VGSH": "VGSH.US",
    "EMB": "EMB.US", "BNO": "BNO.US", "UNG": "UNG.US",
    "PPLT": "PPLT.US", "CPER": "CPER.US", "WEAT": "WEAT.US", "JO": "JO.US",
}


def _period_to_start_date(period: str) -> str:
    """Convertit une période yfinance (ex: '6mo') en date de début ISO pour stooq."""
    from datetime import date
    today = date.today()
    mapping = {
        "1mo":  30, "3mo":  90, "6mo": 180,
        "1y":  365, "2y":  730, "5y": 1825,
        "max": 3650,
    }
    days = mapping.get(period, 180)
    return str(today - timedelta(days=days))


# ── 1. Données de prix ──────────────────────────────────────────────────────

def fetch_price_data(
    ticker: str,
    period: str = "6mo",
    interval: str = "1d",
    start: str | None = None,
    end: str | None = None,
) -> pd.Series:
    """
    Télécharge les cours historiques et retourne les log-returns indexés par date (sans timezone).

    Délègue au module collectors.yahoo_finance_scraper quand disponible (stratégies robustes :
    yf.download → Ticker.history → period-fallback → stooq). Sinon utilise un chemin legacy.

    Cache local : data/price_cache/ — TTL 1 heure.
    La série 1h est rééchantillonnée en 4h avant le calcul des log-returns.
    """
    ticker_upper = ticker.upper()
    cache_id = start if start else period
    cache_file = os.path.join(PRICE_CACHE_DIR, f"{ticker_upper}_{cache_id}_{interval}.json")

    # ── Vérifier le cache (TTL 1 heure + stale-end guard) ────────────────────
    if os.path.exists(cache_file):
        mtime = datetime.fromtimestamp(os.path.getmtime(cache_file), tz=timezone.utc)
        if datetime.now(tz=timezone.utc) - mtime < timedelta(hours=1):
            try:
                with open(cache_file, "r") as f:
                    cached = json.load(f)
                series = pd.Series(cached["returns"], index=pd.to_datetime(cached["dates"]))
                if not series.empty:
                    # Stale-end guard: even a fresh cache file is useless if the data
                    # inside ends >24 h ago (e.g. yfinance returned old data last fetch).
                    last_ts = pd.Timestamp(series.index.max())
                    stale_cutoff = (datetime.now(tz=timezone.utc) - timedelta(hours=24)).replace(tzinfo=None)
                    if last_ts >= stale_cutoff:
                        logger.debug("Prix %s chargés depuis le cache (%d pts).", ticker_upper, len(series))
                        return series
                    logger.info(
                        "Cache stale-end for %s: last point %s is >24 h old — forcing fresh fetch.",
                        ticker_upper, last_ts.date(),
                    )
            except Exception:
                pass  # cache corrompu → on refetch

    def _write_cache(log_returns: pd.Series) -> None:
        try:
            with open(cache_file, "w") as f:
                json.dump({
                    "dates": [str(d) for d in log_returns.index],
                    "returns": log_returns.tolist(),
                }, f)
        except Exception as exc:
            logger.warning("Écriture cache prix impossible pour %s: %s", ticker_upper, exc)

    # ── Primary feed: Yahoo Finance ─────────────────────────────────────────
    yf_ticker = _resolve_yfinance_ticker(ticker_upper)
    try:
        import yfinance as yf
        yf_kwargs: dict = {"interval": interval, "auto_adjust": True, "progress": False}
        if start:
            yf_kwargs["start"] = start
            if end:
                yf_kwargs["end"] = end
        else:
            yf_kwargs["period"] = period
        hist = yf.download(yf_ticker, **yf_kwargs)
        if isinstance(hist.columns, pd.MultiIndex):
            hist.columns = hist.columns.get_level_values(0)
        if hist.empty:
            hist = yf.Ticker(yf_ticker).history(**yf_kwargs)
        if not hist.empty:
            closes = hist["Close"].dropna()
            closes.index = pd.to_datetime(closes.index).tz_localize(None)
            resample = "4h" if interval not in ("1d", "5d", "1wk", "1mo", "3mo") else None
            log_returns = _to_log_returns(closes, resample_to=resample)
            if not log_returns.empty:
                _write_cache(log_returns)
                logger.info(
                    "fetch_price_data: %s ← yfinance — %d log-return points [%s]",
                    ticker_upper, len(log_returns), interval,
                )
                return log_returns
    except Exception as exc:
        logger.warning("fetch_price_data: yfinance fallback failed for %s: %s", ticker_upper, exc)

    logger.warning("fetch_price_data: all sources exhausted for %s [%s]", ticker_upper, interval)
    return pd.Series(dtype=float)


# ── 2. Série temporelle de sentiment ───────────────────────────────────────

def build_sentiment_timeseries(
    ticker: str,
    exclude_augmented: bool = False,
) -> pd.Series:
    """
    Agrège les données de nlp_results.jsonl en série quotidienne de
    net_sentiment moyen pour un ticker donné.

    Args:
        ticker:            Target ticker symbol.
        exclude_augmented: If True, skip records flagged with ``"augmented": True``.
                           Useful for audit / real-data-only comparison runs.

    Returns: pd.Series indexé par date (sans timezone), valeur = net_sentiment.
    """
    nlp_file = os.path.join(DATA_DIR, "nlp_results.jsonl")
    if not os.path.exists(nlp_file):
        return pd.Series(dtype=float)

    rows = []
    with open(nlp_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if obj.get("ticker", "").upper() != ticker.upper():
                continue
            if exclude_augmented and obj.get("augmented"):
                continue
            # Net sentiment = score_positive - score_negative (si disponible)
            scores = obj.get("scores", {})
            if scores:
                net = scores.get("positive", 0) - scores.get("negative", 0)
            else:
                sentiment = obj.get("sentiment", "neutral")
                net = 1.0 if sentiment == "positive" else (-1.0 if sentiment == "negative" else 0.0)

            created_at = obj.get("created_at")
            if created_at:
                try:
                    dt = pd.to_datetime(created_at, utc=True).tz_localize(None).floor("4h")
                    rows.append({"date": dt, "net_sentiment": net})
                except Exception:
                    continue

    if not rows:
        return pd.Series(dtype=float)

    df = pd.DataFrame(rows)
    daily = df.groupby("date")["net_sentiment"].mean()
    daily.index = pd.to_datetime(daily.index)
    return daily.sort_index()


# ── 3. Build chart-ready time series ────────────────────────────────────────

def build_chart_series(sentiment_ts: pd.Series, returns_ts: pd.Series):
    """
    Convert aligned pandas Series to JSON-serialisable lists for Plotly charts.

    Returns (sentiment_chart, returns_chart) as lists of {date, value} dicts.
    """
    sentiment_chart = [
        {"date": str(d.date()) if hasattr(d, "date") else str(d), "value": round(float(v), 4)}
        for d, v in sentiment_ts.items()
        if not np.isnan(v)
    ]
    returns_chart = [
        {"date": str(d.date()) if hasattr(d, "date") else str(d), "value": round(float(v), 6)}
        for d, v in returns_ts.items()
        if not np.isnan(v)
    ]
    return sentiment_chart, returns_chart
