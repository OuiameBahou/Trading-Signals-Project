"""
finviz_scraper.py – Fetch financial news from FinViz Elite API.

Covers all 4 asset classes:
  • EQUITY  – 30 international stocks (US, Europe, ETFs)
  • FX      – 12 currency pairs (majors + MENA)
  • COMMODITY – 10 commodities (energy, metals, agriculture)
  • RATES   – 8 rate/bond instruments

Uses the Elite endpoint: https://elite.finviz.com/news_export.ashx
Auth: ?auth=API_KEY  (passed as query param)
Response: CSV with columns: Title, Source, Date, Url, Category, Ticker
"""

import csv
import hashlib
import io
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

import requests

logger = logging.getLogger("collectors.finviz")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FINVIZ_API_KEY = os.getenv("FINVIZ_API_KEY", "")
FINVIZ_BASE_URL = "https://elite.finviz.com"
FINVIZ_NEWS_ENDPOINT = f"{FINVIZ_BASE_URL}/news_export.ashx"

# Maximum tickers per request (FinViz handles batches well)
MAX_TICKERS_PER_REQUEST = 50

# ---------------------------------------------------------------------------
# Asset Universe
# ---------------------------------------------------------------------------
ASSET_UNIVERSE: Dict[str, List[Dict[str, str]]] = {
    "equity": [
        # US Banks
        {"ticker": "JPM",    "name": "JPMorgan Chase",      "region": "US"},
        {"ticker": "BAC",    "name": "Bank of America",     "region": "US"},
        {"ticker": "GS",     "name": "Goldman Sachs",       "region": "US"},
        {"ticker": "C",      "name": "Citigroup",           "region": "US"},
        {"ticker": "MS",     "name": "Morgan Stanley",      "region": "US"},
        {"ticker": "WFC",    "name": "Wells Fargo",         "region": "US"},
        # European Banks
        {"ticker": "BNP",    "name": "BNP Paribas",         "region": "EU"},
        {"ticker": "SAN",    "name": "Santander",           "region": "EU"},
        {"ticker": "BBVA",   "name": "BBVA",                "region": "EU"},
        {"ticker": "HSBC",   "name": "HSBC",                "region": "UK"},
        {"ticker": "DB",     "name": "Deutsche Bank",       "region": "EU"},
        # Tech Giants
        {"ticker": "AAPL",   "name": "Apple",               "region": "US"},
        {"ticker": "MSFT",   "name": "Microsoft",           "region": "US"},
        {"ticker": "GOOGL",  "name": "Alphabet",            "region": "US"},
        {"ticker": "AMZN",   "name": "Amazon",              "region": "US"},
        {"ticker": "META",   "name": "Meta",                "region": "US"},
        {"ticker": "NVDA",   "name": "Nvidia",              "region": "US"},
        {"ticker": "TSLA",   "name": "Tesla",               "region": "US"},
        {"ticker": "AMD",    "name": "AMD",                 "region": "US"},
        # Energy & Resources
        {"ticker": "XOM",    "name": "ExxonMobil",          "region": "US"},
        {"ticker": "CVX",    "name": "Chevron",             "region": "US"},
        {"ticker": "TTE",    "name": "TotalEnergies",       "region": "EU"},
        {"ticker": "SLB",    "name": "SLB (Schlumberger)",  "region": "US"},
        {"ticker": "RIO",    "name": "Rio Tinto",           "region": "UK"},
        # Emerging Markets
        {"ticker": "MTN",    "name": "MTN Group",           "region": "Africa"},
        {"ticker": "KO",     "name": "Coca-Cola",           "region": "US"},
        {"ticker": "SBUX",   "name": "Starbucks",           "region": "US"},
        # Macro ETFs
        {"ticker": "SPY",    "name": "S&P 500 ETF",         "region": "US"},
        {"ticker": "QQQ",    "name": "Nasdaq 100 ETF",      "region": "US"},
        {"ticker": "XLF",    "name": "Financials ETF",      "region": "US"},
    ],
    "fx": [
        # Majors
        {"ticker": "EURUSD", "name": "EUR/USD",             "region": "Global"},
        {"ticker": "GBPUSD", "name": "GBP/USD",             "region": "Global"},
        {"ticker": "USDJPY", "name": "USD/JPY",             "region": "Global"},
        {"ticker": "USDCHF", "name": "USD/CHF",             "region": "Global"},
        # Cross Pairs
        {"ticker": "EURGBP", "name": "EUR/GBP",             "region": "Europe"},
        {"ticker": "EURJPY", "name": "EUR/JPY",             "region": "Global"},
        {"ticker": "GBPJPY", "name": "GBP/JPY",             "region": "Global"},
        # Commodity FX
        {"ticker": "AUDUSD", "name": "AUD/USD",             "region": "Pacific"},
        {"ticker": "USDCAD", "name": "USD/CAD",             "region": "Americas"},
        {"ticker": "NZDUSD", "name": "NZD/USD",             "region": "Pacific"},
        {"ticker": "USDNOK", "name": "USD/NOK",             "region": "Europe"},
        {"ticker": "USDSEK", "name": "USD/SEK",             "region": "Europe"},
        # MENA / EM
        {"ticker": "USDZAR", "name": "USD/ZAR",             "region": "Africa"},
        {"ticker": "USDTRY", "name": "USD/TRY",             "region": "MENA"},
        {"ticker": "USDEGP", "name": "USD/EGP",             "region": "MENA"},
        {"ticker": "USDMAD", "name": "USD/MAD",             "region": "MENA"},
        # DXY as proxy for dollar strength
        {"ticker": "DXY",    "name": "US Dollar Index",     "region": "Global"},
    ],
    "commodity": [
        # Energy
        {"ticker": "WTI",    "name": "WTI Crude Oil",       "region": "Global"},
        {"ticker": "BNO",    "name": "Brent Crude",         "region": "Global"},  # BNO etf
        {"ticker": "UNG",    "name": "Natural Gas",         "region": "Global"},  # UNG etf
        # Precious Metals
        {"ticker": "GOLD",   "name": "Gold",                "region": "Global"},
        {"ticker": "SILVER", "name": "Silver",              "region": "Global"},
        {"ticker": "PPLT",   "name": "Platinum",            "region": "Global"},
        # Industrial Metals
        {"ticker": "CPER",   "name": "Copper",              "region": "Global"},
        {"ticker": "JJU",    "name": "Aluminum",            "region": "Global"},
        # Agriculture
        {"ticker": "WEAT",   "name": "Wheat",               "region": "Global"},
        {"ticker": "JO",     "name": "Coffee",              "region": "Africa"},
    ],
    "rates": [
        # US Treasuries
        {"ticker": "SHY",    "name": "US 2Y Treasury",      "region": "US"},
        {"ticker": "IEF",    "name": "US 10Y Treasury",     "region": "US"},
        {"ticker": "TLT",    "name": "US 30Y Treasury",     "region": "US"},
        {"ticker": "VGSH",   "name": "US 5Y Treasury",      "region": "US"},
        # European Bonds
        {"ticker": "BUND",   "name": "German Bund 10Y",     "region": "EU"},
        {"ticker": "OAT",    "name": "French OAT 10Y",      "region": "EU"},
        # EM Bonds proxy
        {"ticker": "EMB",    "name": "EM Bond ETF",         "region": "EM"},
        {"ticker": "RSX",    "name": "South Africa Bonds",  "region": "Africa"},
    ],
}

# Flat mapping: ticker → {asset_type, name, region}
TICKER_META: Dict[str, Dict[str, str]] = {}
for asset_type, assets in ASSET_UNIVERSE.items():
    for asset in assets:
        TICKER_META[asset["ticker"]] = {
            "asset_type": asset_type,
            "name": asset["name"],
            "region": asset.get("region", "Global"),
        }


# General News Keyword Heuristics for MACRO/FX/COMMODITIES missing from v=3
KEYWORD_MAPPING = {
    # ── Commodities ──────────────────────────────────────────────────────────
    "BNO": ["brent", "bno", "north sea oil", "ice brent", "brent crude", "uk oil", "uk crude"],
    "WTI": ["oil", "crude", "wti", "opec", "energy", "petroleum", "barrel"],
    "GOLD": ["gold", "bullion", "xau"],
    "SILVER": ["silver", "xag", "silver price", "silver market"],
    "CPER": ["copper", "xcu"],
    "WEAT": ["wheat", "grain"],
    "JO": ["coffee", "arabica", "robusta"],
    "UNG": ["natural gas", "natgas", "lng"],

    # ── Forex – Majors ────────────────────────────────────────────────────────
    "EURUSD": [
        "euro", "eur/usd", "eurusd", "ecb", "lagarde", "european central bank",
        "eurozone", "euro area", "eu economy", "german gdp", "france gdp",
        "eu inflation", "eu cpi", "eu pmi", "eu gdp",
    ],
    "GBPUSD": [
        "pound", "sterling", "gbp/usd", "gbpusd", "boe", "bank of england",
        "uk economy", "uk gdp", "uk inflation", "uk cpi", "uk pmi",
        "britain", "bailey", "mpc", "uk rate",
    ],
    "USDJPY": [
        "yen", "jpy", "usd/jpy", "usdjpy", "boj", "bank of japan",
        "japan economy", "japan gdp", "japan inflation", "japan cpi",
        "ueda", "kuroda", "nikkei", "japanese yen",
    ],
    "USDCHF": [
        "franc", "chf", "usd/chf", "usdchf", "snb", "swiss national bank",
        "switzerland", "swiss economy", "swiss gdp", "swiss inflation", "jordan snb",
    ],
    "AUDUSD": [
        "aussie", "aud", "aud/usd", "audusd", "rba", "reserve bank of australia",
        "australia economy", "australia gdp", "australia cpi", "bullock rba",
        "iron ore", "china demand", "australia rate",
    ],
    "USDCAD": [
        "loonie", "cad", "usd/cad", "usdcad", "boc", "bank of canada",
        "canada economy", "canada gdp", "canada cpi", "macklem", "canada rate",
    ],
    "NZDUSD": [
        "kiwi", "nzd", "nzd/usd", "nzdusd", "rbnz", "reserve bank of new zealand",
        "new zealand economy", "new zealand gdp", "new zealand cpi", "orr rbnz",
    ],

    # ── Forex – Cross Pairs ───────────────────────────────────────────────────
    "EURGBP": ["eur/gbp", "eurgbp", "euro pound"],
    "EURJPY": ["eur/jpy", "eurjpy", "euro yen"],
    "GBPJPY": ["gbp/jpy", "gbpjpy", "pound yen"],

    # ── Forex – Commodity FX ──────────────────────────────────────────────────
    "USDNOK": ["nok", "usd/nok", "usdnok", "norges bank", "norway", "norwegian krone"],
    "USDSEK": ["sek", "usd/sek", "usdsek", "riksbank", "sweden", "swedish krona"],

    # ── Forex – EM / MENA ─────────────────────────────────────────────────────
    "USDZAR": [
        "rand", "zar", "usd/zar", "usdzar", "sarb", "south africa",
        "south african reserve bank", "south africa economy",
    ],
    "USDTRY": [
        "lira", "try", "usd/try", "usdtry", "tcmb", "turkey", "turkish lira",
        "central bank of turkey", "turkey inflation", "turkey rate",
    ],
    "USDEGP": [
        "egyptian pound", "egp", "usd/egp", "usdegp", "cbe",
        "central bank of egypt", "egypt economy", "egypt inflation",
    ],
    "USDMAD": [
        "dirham", "mad", "usd/mad", "usdmad", "bank al-maghrib",
        "morocco economy", "moroccan dirham",
    ],

    # ── Dollar Index / Macro ──────────────────────────────────────────────────
    "DXY": [
        "dollar index", "dxy", "usd index", "dollar strength", "dollar weakness",
        "us dollar", "fed", "federal reserve", "powell", "jerome powell",
        "fomc", "interest rate", "rate hike", "rate cut", "us inflation", "us cpi",
        "us pce", "us gdp", "us jobs", "nonfarm payroll", "nfp",
        # Key 2026 figures & themes
        "trump", "donald trump", "white house",
    ],

    # ── Rates & Macro ─────────────────────────────────────────────────────────
    "IEF": [
        "treasury", "treasuries", "yields", "10-year", "10yr",
        "fed", "powell", "jerome powell", "interest rate", "inflation", "us bond",
    ],
    "BUND": ["bund", "german bond", "bundesbank", "german yield"],
    "OAT": ["french bond", "oat", "macron", "french yield"],
    "SPY": ["s&p", "spx", "stocks", "wall street", "equities", "market",
            "elon musk", "trade war", "tariffs"],
}

def _map_title_to_ticker(title: str, category: str) -> Optional[str]:
    """Heuristic to map a general news title to one of our tracked assets."""
    title_lower = title.lower()
    
    # Fast macro/commodity check
    for ticker, keywords in KEYWORD_MAPPING.items():
        if any(kw in title_lower for kw in keywords):
            return ticker
            
    # Fallback to checking exact ticker name or description
    for ticker, meta in TICKER_META.items():
        if meta["name"].lower() in title_lower:
            return ticker
        # Whole word match for ticker (e.g. " AAPL ")
        if f" {ticker.lower()} " in f" {title_lower} ":
            return ticker
            
    return None

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _url_hash(url: str) -> str:
    return hashlib.sha256(url.strip().encode("utf-8")).hexdigest()


def _parse_finviz_date(date_str: str) -> str:
    """Parse FinViz date format '2026-02-23 10:30:00' -> ISO 8601."""
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


def _retry_request(
    session: requests.Session,
    url: str,
    params: Dict,
    max_retries: int = 5,
) -> requests.Response:
    """
    GET request with exponential backoff and rate-limit handling.

    Detects HTTP 429/503 as rate-limit signals and applies an extended wait.
    Backoff formula: 2^attempt * (0.5 + random())  seconds.
    Raises the last exception if all retries are exhausted.
    """
    last_exc: Exception = RuntimeError("No attempts made")
    for attempt in range(max_retries):
        try:
            resp = session.get(url, params=params, timeout=30)
            # 401/403 = permanent auth failure → no point retrying
            if resp.status_code in (401, 403):
                logger.error(
                    "Auth error (%d) – API key expired or invalid, skipping retries",
                    resp.status_code,
                )
                resp.raise_for_status()
            if resp.status_code in (429, 503):
                wait = (2 ** attempt) * (1.5 + random.random())
                logger.warning(
                    "Rate limit (%d) – waiting %.1fs (attempt %d/%d)",
                    resp.status_code, wait, attempt + 1, max_retries,
                )
                time.sleep(wait)
                last_exc = requests.HTTPError(response=resp)
                continue
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            # Don't retry on auth errors (401/403)
            if hasattr(exc, 'response') and exc.response is not None and exc.response.status_code in (401, 403):
                raise
            last_exc = exc
            wait = (2 ** attempt) * (0.5 + random.random())
            logger.warning(
                "Request error %s – retrying in %.1fs (attempt %d/%d)",
                exc, wait, attempt + 1, max_retries,
            )
            time.sleep(wait)
    raise last_exc


def _fetch_news_for_tickers(
    tickers: List[str],
    session: requests.Session,
) -> List[Dict[str, Any]]:
    """Fetch news from FinViz for a batch of tickers. Returns parsed rows."""
    ticker_str = ",".join(tickers)
    try:
        resp = _retry_request(
            session,
            FINVIZ_NEWS_ENDPOINT,
            params={"v": "3", "t": ticker_str, "auth": FINVIZ_API_KEY},
        )
    except requests.RequestException as e:
        logger.error("FinViz request failed for tickers %s: %s", ticker_str, e)
        return []

    rows = []
    reader = csv.DictReader(io.StringIO(resp.text), quotechar='"')
    for row in reader:
        # Normalize keys (strip whitespace)
        row = {k.strip(): v.strip() for k, v in row.items() if k}
        url = row.get("Url", "")
        ticker_raw = row.get("Ticker", "").strip().upper()
        title = row.get("Title", "")
        source = row.get("Source", "")
        date_str = row.get("Date", "")
        category = row.get("Category", "")

        if not url or not title:
            continue

        # FinViz can return multiple comma-separated tickers per line (e.g. "MSFT,NVDA")
        for ticker in [t.strip() for t in ticker_raw.split(",") if t.strip()]:
            meta = TICKER_META.get(ticker, {})
            doc = {
                "url": url,
                "url_hash": _url_hash(url),
                "title": title,
                "description": title,  # FinViz news only provides headline
                "text": title,
                "source": source,
                "ticker": ticker,
                "asset_type": meta.get("asset_type", "equity"),
                "asset_name": meta.get("name", ticker),
                "category": category,
                "published_at": _parse_finviz_date(date_str),
                "collected_at": datetime.now(timezone.utc).isoformat(),
                "data_source": "finviz",
            }
            rows.append(doc)

    return rows


def _fetch_general_news(session: requests.Session) -> List[Dict[str, Any]]:
    """Fetch general market news (v=2) and map to tracked assets via heuristics."""
    try:
        resp = _retry_request(
            session,
            FINVIZ_NEWS_ENDPOINT,
            params={"v": "2", "auth": FINVIZ_API_KEY},
        )
    except requests.RequestException as e:
        logger.error("FinViz request failed for general news (v=2): %s", e)
        return []

    rows = []
    # Use replace to handle Windows/char decoding issues on raw API CSV
    raw_csv = resp.content.decode("utf-8", "replace")
    reader = csv.DictReader(io.StringIO(raw_csv), quotechar='"')
    for row in reader:
        row = {k.strip(): v.strip() for k, v in row.items() if k}
        url = row.get("Url", "")
        title = row.get("Title", "")
        source = row.get("Source", "")
        date_str = row.get("Date", "")
        category = row.get("Category", "")

        if not url or not title:
            continue
            
        # Try to map general news to a tracked ticker
        mapped_ticker = _map_title_to_ticker(title, category)
        if not mapped_ticker:
            continue  # Skip news that doesn't map to our cross-assets

        meta = TICKER_META.get(mapped_ticker, {})
        rows.append({
            "url": url,
            "url_hash": _url_hash(url),
            "title": title,
            "description": title,
            "text": title,
            "source": source,
            "ticker": mapped_ticker,
            "asset_type": meta.get("asset_type", "equity"),
            "asset_name": meta.get("name", mapped_ticker),
            "category": category,
            "published_at": _parse_finviz_date(date_str),
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "data_source": "finviz_general",
        })

    return rows


# ---------------------------------------------------------------------------
# Historical (paginated) fetch for a single ticker
# ---------------------------------------------------------------------------

def fetch_historical_news(
    ticker: str,
    max_articles: int = 100,
    max_pages: int = 20,
    inter_page_delay: tuple = (0.5, 2.0),
) -> List[Dict[str, Any]]:
    """
    Paginated historical news fetch for a single ticker using the FinViz Elite API.

    Iterates through pages (?p=1, ?p=2, ...) until:
      (a) ``max_articles`` unique articles have been collected, or
      (b) a page returns no new rows (history exhausted), or
      (c) ``max_pages`` is reached.

    Between pages a random delay in [inter_page_delay[0], inter_page_delay[1]]
    seconds is applied to respect rate limits.

    Args:
        ticker:            Single ticker symbol, e.g. ``"AAPL"`` or ``"GOLD"``.
        max_articles:      Stop once this many unique articles are collected.
        max_pages:         Hard cap on the number of page requests.
        inter_page_delay:  (min_s, max_s) sleep range between page requests.

    Returns:
        List of article dicts using the same schema as :func:`_fetch_news_for_tickers`,
        with ``data_source`` set to ``"finviz_historical"``.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 SentimentAnalysis/2.0"})

    all_rows: List[Dict[str, Any]] = []
    seen_hashes: set = set()
    ticker_upper = ticker.upper()

    for page in range(1, max_pages + 1):
        try:
            resp = _retry_request(
                session,
                FINVIZ_NEWS_ENDPOINT,
                params={"v": "3", "t": ticker_upper, "auth": FINVIZ_API_KEY, "p": page},
            )
        except requests.RequestException as exc:
            logger.error(
                "fetch_historical_news: page %d failed for %s: %s", page, ticker_upper, exc
            )
            break

        page_rows: List[Dict[str, Any]] = []
        raw_csv = resp.content.decode("utf-8", "replace")
        reader = csv.DictReader(io.StringIO(raw_csv), quotechar='"')
        for row in reader:
            row = {k.strip(): v.strip() for k, v in row.items() if k}
            url = row.get("Url", "")
            title = row.get("Title", "")
            if not url or not title:
                continue
            h = _url_hash(url)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)
            ticker_raw = row.get("Ticker", ticker_upper).strip().upper()
            meta = TICKER_META.get(ticker_raw, TICKER_META.get(ticker_upper, {}))
            page_rows.append({
                "url": url,
                "url_hash": h,
                "title": title,
                "description": title,
                "text": title,
                "source": row.get("Source", ""),
                "ticker": ticker_upper,
                "asset_type": meta.get("asset_type", "equity"),
                "asset_name": meta.get("name", ticker_upper),
                "category": row.get("Category", ""),
                "published_at": _parse_finviz_date(row.get("Date", "")),
                "collected_at": datetime.now(timezone.utc).isoformat(),
                "data_source": "finviz_historical",
            })

        if not page_rows:
            logger.info(
                "fetch_historical_news: empty page %d for %s – pagination complete",
                page, ticker_upper,
            )
            break

        all_rows.extend(page_rows)
        logger.info(
            "fetch_historical_news: %s page %d → %d new articles (total %d)",
            ticker_upper, page, len(page_rows), len(all_rows),
        )

        if len(all_rows) >= max_articles:
            break

        time.sleep(random.uniform(*inter_page_delay))

    return all_rows[:max_articles]


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------
def fetch_finviz_news(
    asset_types: Optional[List[str]] = None,
    output_file: Optional[str] = None,
) -> int:
    """
    Fetch FinViz Elite news for all defined asset classes.

    Parameters
    ----------
    asset_types:
        Optional filter. Pass ['equity', 'fx'] to fetch only those classes.
    output_file:
        Path to output JSONL file. Defaults to data/news.jsonl in project root.

    Returns
    -------
    int: Number of new articles appended.
    """
    if output_file is None:
        # Navigate up from src/collectors/ to project root → data/
        project_root = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        output_file = os.path.join(project_root, "data", "news.jsonl")

    # Load existing URLs to deduplicate
    existing_hashes: set = set()
    if os.path.exists(output_file):
        with open(output_file, encoding="utf-8") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                    if "url_hash" in obj:
                        existing_hashes.add(obj["url_hash"])
                    elif "url" in obj:
                        existing_hashes.add(_url_hash(obj["url"]))
                except json.JSONDecodeError:
                    continue

    logger.info("Existing hashes in cache: %d", len(existing_hashes))

    # Select which asset classes to fetch
    classes_to_fetch = asset_types or list(ASSET_UNIVERSE.keys())

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 SentimentAnalysis/2.0"})

    total_new = 0

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    all_rows = []

    # 1. Fetch General News (v=2) mapped to tickers
    logger.info("Fetching FinViz General News (v=2)...")
    general_news = _fetch_general_news(session)
    all_rows.extend(general_news)
    
    # 2. Fetch Ticker-Specific News (v=3)
    for asset_class in classes_to_fetch:
        assets = ASSET_UNIVERSE.get(asset_class, [])
        tickers = [a["ticker"] for a in assets]
        logger.info(
            "Fetching FinViz Ticker News for %s (%d tickers)...", asset_class.upper(), len(tickers)
        )

        # Batch tickers to stay within API limits
        for i in range(0, len(tickers), MAX_TICKERS_PER_REQUEST):
            batch = tickers[i: i + MAX_TICKERS_PER_REQUEST]
            rows = _fetch_news_for_tickers(batch, session)
            all_rows.extend(rows)

    # Filter out duplicates (based on URL hash to prevent duplicates across v=2 and v=3)
    new_rows = [r for r in all_rows if r["url_hash"] not in existing_hashes]
    for r in new_rows:
        existing_hashes.add(r["url_hash"])

    # Write to JSONL
    if new_rows:
        with open(output_file, "a", encoding="utf-8") as f:
            for row in new_rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    total_new = len(new_rows)
    logger.info("FinViz collection complete. Total new articles: %d", total_new)
    return total_new


def fetch_live_headlines(max_articles: int = 150) -> List[Dict[str, Any]]:
    """
    Fetch the most recent live news from FinViz without saving to disk.

    Used by the /api/headlines endpoint to always return fresh news
    regardless of the scheduled collection cycle.

    Returns a deduplicated list of recent articles mapped to tracked assets.
    """
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 SentimentAnalysis/2.0"})

    all_rows: List[Dict[str, Any]] = []

    # 1. General market news (macro, FX, commodities) via v=2
    try:
        general = _fetch_general_news(session)
        all_rows.extend(general)
        logger.info("Live fetch: %d articles from general news (v=2)", len(general))
    except Exception as exc:
        logger.warning("Live general news fetch failed: %s", exc)

    # 2. Ticker-specific news via v=3 – all asset classes in one batch
    all_tickers = [a["ticker"] for assets in ASSET_UNIVERSE.values() for a in assets]
    try:
        for i in range(0, len(all_tickers), MAX_TICKERS_PER_REQUEST):
            batch = all_tickers[i: i + MAX_TICKERS_PER_REQUEST]
            rows = _fetch_news_for_tickers(batch, session)
            all_rows.extend(rows)
        logger.info("Live fetch: %d total articles after ticker news (v=3)", len(all_rows))
    except Exception as exc:
        logger.warning("Live ticker news fetch failed: %s", exc)

    # Deduplicate by URL hash, keeping insertion order
    seen_hashes: set = set()
    unique: List[Dict[str, Any]] = []
    for row in all_rows:
        h = row.get("url_hash", "")
        if h and h not in seen_hashes:
            seen_hashes.add(h)
            # Normalise field names for the Impact Scorer
            row["text"]       = row.get("title", row.get("text", ""))
            row["created_at"] = row.get("published_at", row.get("collected_at", ""))
            unique.append(row)

    # Sort by published_at descending so freshest news is evaluated first
    try:
        from datetime import datetime, timezone
        def _parse_dt(r):
            try:
                s = r.get("created_at", "")
                return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)
        unique.sort(key=_parse_dt, reverse=True)
    except Exception:
        pass

    return unique[:max_articles]



# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)-8s %(name)s – %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    asset_filter = sys.argv[1:] or None  # e.g. python finviz_scraper.py equity fx
    n = fetch_finviz_news(asset_types=asset_filter)
    print(f"Done. {n} new articles saved.")
