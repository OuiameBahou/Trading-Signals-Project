"""
Polymarket data collector with OpenAI-powered market sentiment analysis.

Uses the Gamma REST API /events endpoint to fetch prediction market data.
Enriches each event with:
  - Affected tickers (auto-detected from question/description)
  - OpenAI GPT-4o interpretation of probability & market impact
  - Sentiment scoring for trading signals
"""
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

try:
    from openai import OpenAI
    _OPENAI_OK = True
except ImportError:
    _OPENAI_OK = False

_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(dotenv_path=os.path.join(_project_root, ".env"))

logger = logging.getLogger("polymarket_scraper")

GAMMA_BASE = "https://gamma-api.polymarket.com"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "FinancialSentimentPlatform/1.0"})

# ─────────────────────────────────────────────────────────────────────────────
# Tag-based filtering
# ─────────────────────────────────────────────────────────────────────────────
FINANCIAL_TAG_SLUGS = {
    "politics", "economy", "economic-policy", "crypto", "finance",
    "business", "stocks", "fed", "fed-rates", "trade", "tariffs",
    "geopolitics", "world", "elections", "us-presidential-election",
    "global-elections", "world-elections", "ipos", "tech",
}
SPORTS_TAG_SLUGS = {
    "sports", "soccer", "nba", "nfl", "mlb", "golf", "tennis",
    "f1", "formula1", "basketball", "mma", "ufc", "boxing",
    "cricket", "esports", "hockey", "rugby", "racing",
}

# Category mapping: assign each event to one of our 4 categories
CATEGORY_TAG_MAP = {
    "economics": {"economy", "economic-policy", "fed", "fed-rates", "finance", "stocks", "ipos", "trade", "tariffs"},
    "crypto": {"crypto"},
    "politics": {"politics", "elections", "us-presidential-election", "global-elections", "world-elections", "geopolitics", "world"},
    "business": {"business", "tech"},
}

CATEGORY_LABELS = {
    "economics": "Macro / Economics",
    "crypto": "Crypto",
    "politics": "Politics",
    "business": "Business",
}

# ─────────────────────────────────────────────────────────────────────────────
# Ticker detection — keyword → ticker(s) mapping
# ─────────────────────────────────────────────────────────────────────────────
TICKER_KEYWORDS: Dict[str, List[str]] = {
    # Crypto
    r"\bbitcoin\b|\bbtc\b": ["BTC"],
    r"\bethereum\b|\beth\s": ["ETH"],
    r"\bsolana\b|\bsol\b": ["SOL"],
    r"\bxrp\b|\bripple\b": ["XRP"],
    r"\bdogecoin\b|\bdoge\b": ["DOGE"],
    r"\bcardano\b|\bada\b": ["ADA"],
    r"\bavax\b|\bavalanch": ["AVAX"],
    r"\bchainlink\b|\blink\b": ["LINK"],
    r"\blitecoin\b|\bltc\b": ["LTC"],
    r"\bcrypto\b|cryptocurrency|microstrategy": ["BTC"],

    # US Equities
    r"\btesla\b": ["TSLA"],
    r"\bapple\b": ["AAPL"],
    r"\bmicrosoft\b": ["MSFT"],
    r"\bnvidia\b|\bnvda\b": ["NVDA"],
    r"\bamazon\b": ["AMZN"],
    r"\bgoogle\b|\balphabet\b": ["GOOGL"],
    r"\bmeta\b|\bfacebook\b": ["META"],
    r"\bnetflix\b": ["NFLX"],
    r"\bamd\b": ["AMD"],
    r"\bkraken\b": ["BTC"],

    # Indices & Broad Market
    r"\bs&p\s?500\b|\bsp500\b|\bspx\b": ["SPY"],
    r"\bnasdaq\b": ["QQQ"],
    r"\bdow\s?jones\b|\bdjia\b": ["DIA"],
    r"\brussell\b": ["IWM"],
    r"\bstock\s?market\b|\bequit(?:y|ies)\b|\bwall\s?street\b": ["SPY", "QQQ"],

    # FX
    r"\bdollar\b|\busd\b|\bgreenback\b": ["DXY"],
    r"\beuro\b|\beur\b": ["EURUSD"],
    r"\byen\b|\bjpy\b": ["USDJPY"],
    r"\bpound\b|\bsterling\b|\bgbp\b": ["GBPUSD"],
    r"\byuan\b|\brenminbi\b|\bcny\b": ["USDCNY"],

    # Commodities
    r"\boil\b|\bcrude\b|\bwti\b|\bpetrol\b|\bopec\b": ["WTI"],
    r"\bgold\b": ["GOLD"],
    r"\bsilver\b": ["SILVER"],
    r"\bnatural\s?gas\b": ["UNG"],
    r"\bwheat\b|\bgrain\b": ["WEAT"],
    r"\bcopper\b": ["CPER"],

    # Rates & Bonds
    r"\bfed\b|\bfederal\s?reserve\b|\binterest\s?rate\b|\brate\s?cut\b|\brate\s?hike\b": ["TLT", "SHY"],
    r"\btreasur(?:y|ies)\b|\bbond\b|\byield\b": ["TLT", "IEF"],
    r"\binflation\b|\bcpi\b|\bpce\b": ["TLT", "GOLD", "DXY"],

    # Sectors
    r"\bbank(?:s|ing)?\b|\bfinancial\b": ["XLF", "JPM"],
    r"\btech(?:nology)?\b|\bsemiconductor\b|\bchip\b": ["QQQ", "NVDA"],
    r"\benergy\b": ["XLE", "XOM"],

    # Geopolitical
    r"\btariff\b|\btrade\s?war\b|\bsanction\b": ["SPY", "DXY", "GOLD"],
    r"\bchina\b": ["FXI", "USDCNY"],
    r"\brussia\b|\bukraine\b|\bwar\b|\biran\b|\bisrael\b|\bconflict\b": ["GOLD", "WTI"],
    r"\brecession\b|\bgdp\b": ["SPY", "TLT", "GOLD"],
    r"\bdebt\s?ceiling\b|\bgovernment\s?shutdown\b": ["SPY", "TLT"],
    r"\belection\b|\btrump\b|\bbiden\b|\bpresident\b": ["SPY", "DXY"],
    r"\bregulat(?:ion|ory|e)\b|\bsec\b": ["SPY", "BTC"],
    r"\bgreenland\b": ["DXY", "EURUSD"],
    r"\bvenezuela\b|\bmaduro\b": ["WTI", "DXY"],
}


def detect_tickers(text: str) -> List[str]:
    """Scan text for keywords and return deduplicated list of affected tickers."""
    if not text:
        return []
    text_lower = text.lower()
    found: List[str] = []
    for pattern, tickers in TICKER_KEYWORDS.items():
        if re.search(pattern, text_lower):
            found.extend(tickers)
    seen = set()
    return [t for t in found if not (t in seen or seen.add(t))]


def _classify_category(tag_slugs: set) -> str:
    """Map event tag slugs to one of our 4 categories."""
    # Priority: economics > crypto > business > politics
    for cat, cat_tags in CATEGORY_TAG_MAP.items():
        if tag_slugs & cat_tags:
            return cat
    return "politics"  # default for geopolitical events


# ─────────────────────────────────────────────────────────────────────────────
# OpenAI GPT-4o AI interpretation
# ─────────────────────────────────────────────────────────────────────────────
_ai_cache: Dict[str, Dict] = {}


def _get_openai_client():
    """Return an OpenAI client or None if unavailable."""
    if not _OPENAI_OK:
        logger.warning("openai package not installed — skipping AI interpretation.")
        return None
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key.startswith("sk-your"):
        logger.warning("OPENAI_API_KEY not set — skipping AI interpretation.")
        return None
    return OpenAI(api_key=api_key)


def _call_openai(markets: List[Dict]) -> Dict[str, Dict]:
    """
    Send a batch of markets to GPT-4o for interpretation.
    Returns dict keyed by market id with analysis fields.
    """
    client = _get_openai_client()
    if client is None:
        return {}

    market_summaries = []
    for m in markets[:20]:
        market_summaries.append({
            "id": m.get("id", ""),
            "question": m.get("question", ""),
            "yes_probability": m.get("yes_probability", 0.5),
            "volume": m.get("volume", 0),
            "category": m.get("primary_category", ""),
            "tickers": m.get("tickers", []),
        })

    prompt = f"""You are a financial market analyst. Analyze these Polymarket prediction markets and their probabilities to determine market sentiment impact.

For EACH market, provide:
1. "sentiment_score": a float from -1.0 (extremely bearish for financial markets) to +1.0 (extremely bullish) — what the current probability implies for stocks, crypto, forex
2. "impact_level": "high", "medium", or "low" — how much this event could move financial markets
3. "interpretation": ONE sentence (max 20 words) explaining what this probability means for traders
4. "market_bias": "risk-on", "risk-off", or "neutral" — the crowd positioning

Think about it from a TRADER'S perspective: how does each prediction market outcome affect equities, bonds, commodities, and crypto?

Markets to analyze:
{json.dumps(market_summaries, indent=2)}

Respond ONLY with valid JSON — a list of objects with keys: id, sentiment_score, impact_level, interpretation, market_bias."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a financial market analyst. Return only valid JSON, no markdown."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=2048,
        )
        text = response.choices[0].message.content
        parsed = json.loads(text)

        # Accept {"analyses": [...]} or [...] directly
        analyses = parsed
        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    analyses = v
                    break

        if isinstance(analyses, list):
            return {str(a["id"]): a for a in analyses if "id" in a}
        return {}
    except Exception as exc:
        logger.error("OpenAI analysis failed: %s", exc)
        return {}


def _local_sentiment_fallback(m: Dict) -> Dict:
    """
    Generate a rule-based sentiment interpretation when Gemini is unavailable.
    Uses probability, volume, tickers, and category to derive sentiment.
    """
    prob = m.get("yes_probability", 0.5)
    volume = m.get("volume", 0)
    category = m.get("primary_category", "")
    question = m.get("question", "").lower()
    tickers = m.get("tickers", [])

    # Determine impact from volume
    if volume > 10_000_000:
        impact = "high"
    elif volume > 2_000_000:
        impact = "medium"
    else:
        impact = "low"

    # Sentiment: depends on what the event IS and the probability
    # Geopolitical risk events (war, regime fall, invasion) → high prob = bearish
    risk_keywords = ["war", "invade", "invasion", "conflict", "regime fall",
                     "sanction", "shutdown", "recession", "crash", "collapse"]
    is_risk_event = any(kw in question for kw in risk_keywords)

    # Positive events (rate cut, ceasefire, deal, growth)
    positive_keywords = ["ceasefire", "peace", "deal", "growth", "rate cut",
                         "ipo", "acquire", "approve"]
    is_positive_event = any(kw in question for kw in positive_keywords)

    if is_risk_event:
        sentiment = -abs(prob - 0.5) * 1.5  # higher prob of risk = more bearish
        bias = "risk-off" if prob > 0.3 else "neutral"
    elif is_positive_event:
        sentiment = abs(prob - 0.5) * 1.2
        bias = "risk-on" if prob > 0.4 else "neutral"
    else:
        # Neutral/mixed: use signal strength as weak sentiment
        sentiment = (prob - 0.5) * 0.5
        bias = "risk-on" if prob > 0.65 else ("risk-off" if prob < 0.35 else "neutral")

    sentiment = max(-1.0, min(1.0, round(sentiment, 3)))

    # Generate interpretation
    pct = f"{prob*100:.0f}%"
    if is_risk_event:
        interp = f"Crowd sees {pct} chance — {'elevated' if prob > 0.3 else 'low'} risk for {', '.join(tickers[:3]) or 'markets'}"
    elif is_positive_event:
        interp = f"{pct} probability — {'positive catalyst' if prob > 0.5 else 'uncertain outlook'} for {', '.join(tickers[:3]) or 'markets'}"
    elif category == "economics":
        interp = f"Market pricing {pct} — watch {', '.join(tickers[:3]) or 'rates/bonds'} for directional move"
    elif category == "crypto":
        interp = f"Crowd at {pct} — {'strong conviction' if abs(prob - 0.5) > 0.3 else 'split opinion'} on crypto direction"
    else:
        interp = f"Prediction at {pct} — {'strong signal' if abs(prob - 0.5) > 0.3 else 'uncertain'} for {', '.join(tickers[:2]) or 'markets'}"

    return {
        "sentiment_score": sentiment,
        "impact_level": impact,
        "interpretation": interp,
        "market_bias": bias,
    }


def enrich_markets_with_ai(markets: List[Dict]) -> List[Dict]:
    """
    Enrich a list of normalized markets with Gemini AI interpretation.
    Falls back to rule-based local analysis when Gemini is unavailable.
    """
    uncached = [m for m in markets if m["id"] not in _ai_cache]
    if uncached:
        analyses = _call_openai(uncached)
        _ai_cache.update(analyses)

    for m in markets:
        ai = _ai_cache.get(m["id"])
        if ai:
            m["ai_sentiment"] = ai.get("sentiment_score", 0.0)
            m["ai_impact"] = ai.get("impact_level", "low")
            m["ai_interpretation"] = ai.get("interpretation", "")
            m["ai_bias"] = ai.get("market_bias", "neutral")
        else:
            # Fallback: rule-based interpretation
            fb = _local_sentiment_fallback(m)
            m["ai_sentiment"] = fb["sentiment_score"]
            m["ai_impact"] = fb["impact_level"]
            m["ai_interpretation"] = fb["interpretation"]
            m["ai_bias"] = fb["market_bias"]

    return markets


# ─────────────────────────────────────────────────────────────────────────────
# Low-level fetchers (using /events endpoint)
# ─────────────────────────────────────────────────────────────────────────────

def _get(path: str, params: Optional[Dict] = None, timeout: int = 15) -> Any:
    """GET helper — returns parsed JSON or raises."""
    url = f"{GAMMA_BASE}{path}"
    resp = _SESSION.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def fetch_events(limit: int = 200) -> List[Dict]:
    """
    Fetch active events from the Gamma API, sorted by volume.
    Returns raw event dicts.
    """
    params = {
        "closed": "false",
        "limit": limit,
        "order": "volume",
        "ascending": "false",
    }
    try:
        data = _get("/events", params=params)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("data", data.get("events", []))
        return []
    except Exception as exc:
        logger.error("Polymarket fetch_events failed: %s", exc)
        return []


def _filter_financial_events(events: List[Dict]) -> List[Dict]:
    """Filter events to only financial/market-relevant ones (exclude sports, etc)."""
    result = []
    for e in events:
        tags = e.get("tags", [])
        slugs = set()
        for t in tags:
            if isinstance(t, dict):
                slugs.add(t.get("slug", ""))
            elif isinstance(t, str):
                slugs.add(t)

        # Include if has any financial tag and NO sports tag
        if slugs & FINANCIAL_TAG_SLUGS and not (slugs & SPORTS_TAG_SLUGS):
            result.append(e)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Normalization: event → list of market dicts
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json_field(value: Any, default: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value if value is not None else default


def _derive_signal(yes_prob: float) -> str:
    if yes_prob > 0.65:
        return "bullish"
    if yes_prob < 0.35:
        return "bearish"
    return "neutral"


def normalize_event(raw_event: Dict) -> List[Dict]:
    """
    Convert a raw event dict into a list of normalized market dicts.

    For multi-candidate events (>10 sub-markets, e.g. presidential races),
    picks only the TOP candidate by yes_probability — the one the crowd
    actually thinks will win. This avoids flooding with noise like
    "Will LeBron James win the presidency?" at 0.5%.

    For smaller events (e.g. "Fed rate cut", "Bitcoin $100K by..."),
    picks the most actionable sub-markets (highest probability, filtered
    to >5% to exclude expired/resolved ones).
    """
    event_title = str(raw_event.get("title", ""))
    event_desc = str(raw_event.get("description", ""))
    event_slug = str(raw_event.get("slug", raw_event.get("id", "")))
    event_image = str(raw_event.get("image", ""))
    event_volume = float(raw_event.get("volume", 0) or 0)

    # Extract tags
    tags_raw = raw_event.get("tags", [])
    tag_slugs_set = set()
    tag_labels = []
    for t in tags_raw:
        if isinstance(t, dict):
            tag_slugs_set.add(t.get("slug", ""))
            tag_labels.append(t.get("label", ""))
        elif isinstance(t, str):
            tag_slugs_set.add(t)
            tag_labels.append(t)

    primary_category = _classify_category(tag_slugs_set)
    tickers = detect_tickers(f"{event_title} {event_desc}")

    # Get sub-markets
    sub_markets = raw_event.get("markets", [])
    if not isinstance(sub_markets, list):
        sub_markets = []

    def _make_market(sm_or_event, is_event=False):
        """Build a normalized market dict from a sub-market or bare event."""
        if is_event:
            return {
                "id": str(raw_event.get("id", "")),
                "slug": event_slug,
                "question": event_title,
                "description": event_desc[:300],
                "image": event_image,
                "outcomes": ["Yes", "No"],
                "outcome_prices": [],
                "yes_probability": 0.5,
                "no_probability": 0.5,
                "volume": event_volume,
                "volume_24h": 0.0,
                "liquidity": 0.0,
                "end_date": str(raw_event.get("endDate", "")),
                "active": True, "closed": False,
                "tags": tag_labels, "tag_slugs": list(tag_slugs_set),
                "primary_category": primary_category,
                "tickers": tickers,
                "crowd_signal": "neutral", "signal_strength": 0.0,
                "url": f"https://polymarket.com/event/{event_slug}",
                "ai_sentiment": 0.0, "ai_impact": "low",
                "ai_interpretation": "", "ai_bias": "neutral",
            }

        sm = sm_or_event
        outcomes = _parse_json_field(sm.get("outcomes"), ["Yes", "No"])
        outcome_prices_raw = _parse_json_field(sm.get("outcomePrices"), [])
        try:
            outcome_prices = [float(p) for p in outcome_prices_raw]
        except Exception:
            outcome_prices = []

        yes_prob = outcome_prices[0] if outcome_prices else 0.5
        yes_prob = max(0.0, min(1.0, yes_prob))
        crowd_signal = _derive_signal(yes_prob)
        signal_strength = round(abs(yes_prob - 0.5) * 2, 4)

        sm_question = str(sm.get("question", sm.get("title", event_title)))
        sm_tickers = detect_tickers(sm_question)
        all_tickers = list(dict.fromkeys(tickers + sm_tickers))

        return {
            "id": str(sm.get("id", "")),
            "slug": event_slug,
            "question": sm_question,
            "description": event_desc[:300],
            "image": event_image,
            "outcomes": outcomes, "outcome_prices": outcome_prices,
            "yes_probability": round(yes_prob, 4),
            "no_probability": round(1.0 - yes_prob, 4),
            "volume": float(sm.get("volume", 0) or 0),
            "volume_24h": float(sm.get("volume24hr", 0) or 0),
            "liquidity": float(sm.get("liquidity", 0) or 0),
            "end_date": str(sm.get("endDate", sm.get("end_date", ""))),
            "active": bool(sm.get("active", True)),
            "closed": bool(sm.get("closed", False)),
            "tags": tag_labels, "tag_slugs": list(tag_slugs_set),
            "primary_category": primary_category,
            "tickers": all_tickers,
            "crowd_signal": crowd_signal,
            "signal_strength": signal_strength,
            "url": f"https://polymarket.com/event/{event_slug}",
            "ai_sentiment": 0.0, "ai_impact": "low",
            "ai_interpretation": "", "ai_bias": "neutral",
        }

    if not sub_markets:
        return [_make_market(None, is_event=True)]

    # Parse probabilities for all sub-markets
    for sm in sub_markets:
        prices = _parse_json_field(sm.get("outcomePrices"), [])
        try:
            sm["_yes"] = max(0.0, min(1.0, float(prices[0]))) if prices else 0.0
        except Exception:
            sm["_yes"] = 0.0
        sm["_vol"] = float(sm.get("volume", 0) or 0)

    is_multi_candidate = len(sub_markets) > 10

    if is_multi_candidate:
        # Multi-candidate event: pick only the TOP candidate (highest probability)
        # This gives us "JD Vance leads Republican primary at 38%" not "LeBron at 0.5%"
        best = max(sub_markets, key=lambda x: x["_yes"])
        if best["_yes"] >= 0.01:  # at least 1%
            return [_make_market(best)]
        return []  # no viable candidate
    else:
        # Small event: pick sub-markets with probability > 5%
        # Sort by probability descending for most actionable first
        viable = [sm for sm in sub_markets if sm["_yes"] >= 0.05]
        if not viable:
            # Fallback: take the one with highest probability
            viable = [max(sub_markets, key=lambda x: x["_yes"])]

        # Cap at 3 per event
        viable.sort(key=lambda x: x["_yes"], reverse=True)
        return [_make_market(sm) for sm in viable[:3]]


# ─────────────────────────────────────────────────────────────────────────────
# High-level helpers
# ─────────────────────────────────────────────────────────────────────────────

def fetch_financial_markets(limit: int = 120, with_ai: bool = True) -> List[Dict]:
    """
    Fetch and normalize the most liquid financial prediction markets.
    Enriches with Gemini AI interpretation when with_ai=True.
    """
    raw_events = fetch_events(limit=200)
    financial = _filter_financial_events(raw_events)

    all_markets: List[Dict] = []
    for event in financial:
        all_markets.extend(normalize_event(event))

    # Sort by volume descending
    all_markets.sort(key=lambda x: x["volume"], reverse=True)

    # Deduplicate by id
    seen: set = set()
    unique: List[Dict] = []
    for m in all_markets:
        if m["id"] and m["id"] not in seen:
            seen.add(m["id"])
            unique.append(m)

    result = unique[:limit]

    if with_ai and result:
        result = enrich_markets_with_ai(result)

    return result


def fetch_top_macro_signals(n: int = 12, with_ai: bool = True) -> List[Dict]:
    """
    Return the top-N highest-volume financial prediction markets —
    intended for the 'top signals' view.
    """
    return fetch_financial_markets(limit=n, with_ai=with_ai)


def fetch_markets_by_category(category: str, limit: int = 30, with_ai: bool = True) -> List[Dict]:
    """Fetch markets for a specific category."""
    all_markets = fetch_financial_markets(limit=200, with_ai=False)

    if category != "all" and category in CATEGORY_TAG_MAP:
        all_markets = [m for m in all_markets if m["primary_category"] == category]

    result = all_markets[:limit]

    if with_ai and result:
        result = enrich_markets_with_ai(result)

    return result


def get_sentiment_summary(markets: List[Dict]) -> Dict:
    """
    Compute aggregate sentiment metrics from a list of enriched markets.
    Used by the frontend stats bar.
    """
    if not markets:
        return {
            "total_markets": 0,
            "avg_sentiment": 0.0,
            "bullish_pct": 0.0,
            "bearish_pct": 0.0,
            "neutral_pct": 0.0,
            "high_impact_count": 0,
            "risk_on_pct": 0.0,
            "risk_off_pct": 0.0,
            "top_tickers": [],
            "overall_bias": "neutral",
        }

    sentiments = [m.get("ai_sentiment", 0.0) for m in markets]
    avg_sent = sum(sentiments) / len(sentiments) if sentiments else 0.0

    bullish = sum(1 for m in markets if m.get("crowd_signal") == "bullish")
    bearish = sum(1 for m in markets if m.get("crowd_signal") == "bearish")
    neutral = len(markets) - bullish - bearish

    high_impact = sum(1 for m in markets if m.get("ai_impact") == "high")
    risk_on = sum(1 for m in markets if m.get("ai_bias") == "risk-on")
    risk_off = sum(1 for m in markets if m.get("ai_bias") == "risk-off")

    ticker_freq: Dict[str, int] = {}
    for m in markets:
        for t in m.get("tickers", []):
            ticker_freq[t] = ticker_freq.get(t, 0) + 1
    top_tickers = sorted(ticker_freq.items(), key=lambda x: -x[1])[:10]

    n = len(markets)
    overall = "bullish" if avg_sent > 0.15 else ("bearish" if avg_sent < -0.15 else "neutral")

    return {
        "total_markets": n,
        "avg_sentiment": round(avg_sent, 3),
        "bullish_pct": round(bullish / n * 100, 1),
        "bearish_pct": round(bearish / n * 100, 1),
        "neutral_pct": round(neutral / n * 100, 1),
        "high_impact_count": high_impact,
        "risk_on_pct": round(risk_on / n * 100, 1),
        "risk_off_pct": round(risk_off / n * 100, 1),
        "top_tickers": [{"ticker": t, "count": c} for t, c in top_tickers],
        "overall_bias": overall,
    }
