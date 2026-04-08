"""
Polymarket data collector.

Uses the Gamma REST API (https://gamma-api.polymarket.com) — no auth required.
Returns normalized market dicts ready to be served by the FastAPI layer.
"""
import json
import logging
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("polymarket_scraper")

GAMMA_BASE = "https://gamma-api.polymarket.com"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "FinancialSentimentPlatform/1.0"})

# Categories we surface on the platform (Gamma tag slugs)
FINANCIAL_CATEGORIES: List[str] = [
    "economics",
    "crypto",
    "politics",
    "business",
    "climate",
    "science",
]

# Human-readable labels for categories
CATEGORY_LABELS: Dict[str, str] = {
    "economics": "Macro / Economics",
    "crypto": "Crypto",
    "politics": "Politics",
    "business": "Business",
    "climate": "Climate",
    "science": "Science & Tech",
}


# ─────────────────────────────────────────────────────────────────────────────
# Low-level fetchers
# ─────────────────────────────────────────────────────────────────────────────

def _get(path: str, params: Optional[Dict] = None, timeout: int = 12) -> Any:
    """GET helper — returns parsed JSON or raises."""
    url = f"{GAMMA_BASE}{path}"
    resp = _SESSION.get(url, params=params, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def fetch_raw_markets(
    limit: int = 50,
    tag_slug: Optional[str] = None,
    order: str = "volume",
) -> List[Dict]:
    """
    Fetch raw market dicts from the Gamma API.

    Args:
        limit: number of markets to return
        tag_slug: filter by Polymarket category slug (e.g. "economics")
        order: sort field — "volume" | "liquidity" | "end_date"

    Returns list of raw dicts (keys vary by market type).
    """
    params: Dict[str, Any] = {
        "active": "true",
        "closed": "false",
        "order": order,
        "ascending": "false",
        "limit": limit,
    }
    if tag_slug:
        params["tag_slug"] = tag_slug

    try:
        data = _get("/markets", params=params)
        # Gamma returns either a list directly or {"data": [...], "meta": {...}}
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("data", data.get("markets", []))
        return []
    except Exception as exc:
        logger.error("Polymarket fetch_raw_markets failed (tag=%s): %s", tag_slug, exc)
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Normalization
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json_field(value: Any, default: Any) -> Any:
    """Safely parse a field that may already be a Python object or a JSON string."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value if value is not None else default


def _derive_signal(yes_prob: float) -> str:
    """
    Translate a Yes-probability into a directional crowd signal.

    > 0.65 → BULLISH  (crowd strongly expects 'Yes')
    < 0.35 → BEARISH  (crowd strongly expects 'No')
    else   → NEUTRAL
    """
    if yes_prob > 0.65:
        return "bullish"
    if yes_prob < 0.35:
        return "bearish"
    return "neutral"


def normalize_market(raw: Dict) -> Dict:
    """
    Convert a raw Gamma API market dict to our canonical format.

    Returns:
        {
            id, slug, question, description, image,
            outcomes, outcome_prices, yes_probability,
            volume, volume_24h, liquidity,
            end_date, active, closed,
            tags, tag_slugs, primary_category,
            crowd_signal,      # "bullish" | "bearish" | "neutral"
            signal_strength,   # abs(yes_prob - 0.5) * 2  → 0..1
            url
        }
    """
    outcomes = _parse_json_field(raw.get("outcomes"), ["Yes", "No"])
    outcome_prices_raw = _parse_json_field(raw.get("outcomePrices"), [])
    try:
        outcome_prices = [float(p) for p in outcome_prices_raw]
    except Exception:
        outcome_prices = []

    yes_prob = outcome_prices[0] if outcome_prices else 0.5
    yes_prob = max(0.0, min(1.0, yes_prob))  # clamp

    # Tags
    tags_raw = _parse_json_field(raw.get("tags"), [])
    if tags_raw and isinstance(tags_raw[0], dict):
        tag_labels = [t.get("label", "") for t in tags_raw]
        tag_slugs = [t.get("slug", "") for t in tags_raw]
    else:
        tag_labels = [str(t) for t in tags_raw]
        tag_slugs = tag_labels

    # Primary category (first financial tag, or first tag, or "other")
    primary_category = "other"
    for slug in tag_slugs:
        if slug in FINANCIAL_CATEGORIES:
            primary_category = slug
            break
    if primary_category == "other" and tag_slugs:
        primary_category = tag_slugs[0]

    crowd_signal = _derive_signal(yes_prob)
    signal_strength = round(abs(yes_prob - 0.5) * 2, 4)  # 0 = max uncertainty, 1 = certain

    market_id = str(raw.get("id", ""))
    slug = str(raw.get("slug", market_id))

    return {
        "id": market_id,
        "slug": slug,
        "question": str(raw.get("question", raw.get("title", ""))),
        "description": str(raw.get("description", "")),
        "image": str(raw.get("image", "")),
        "outcomes": outcomes,
        "outcome_prices": outcome_prices,
        "yes_probability": round(yes_prob, 4),
        "no_probability": round(1.0 - yes_prob, 4),
        "volume": float(raw.get("volume", 0) or 0),
        "volume_24h": float(raw.get("volume24hr", 0) or 0),
        "liquidity": float(raw.get("liquidity", 0) or 0),
        "end_date": str(raw.get("endDate", raw.get("end_date", ""))),
        "active": bool(raw.get("active", True)),
        "closed": bool(raw.get("closed", False)),
        "tags": tag_labels,
        "tag_slugs": tag_slugs,
        "primary_category": primary_category,
        "crowd_signal": crowd_signal,
        "signal_strength": signal_strength,
        "url": f"https://polymarket.com/event/{slug}",
    }


# ─────────────────────────────────────────────────────────────────────────────
# High-level helpers
# ─────────────────────────────────────────────────────────────────────────────

def fetch_financial_markets(limit: int = 120) -> List[Dict]:
    """
    Fetch and normalize the most liquid/relevant markets across all financial
    categories. Results are deduplicated and sorted by volume descending.
    """
    all_raw: List[Dict] = []
    per_cat = max(30, limit // len(FINANCIAL_CATEGORIES))

    for cat in FINANCIAL_CATEGORIES:
        raw = fetch_raw_markets(limit=per_cat, tag_slug=cat)
        all_raw.extend(raw)

    # Deduplicate by market id
    seen: set = set()
    unique: List[Dict] = []
    for m in all_raw:
        mid = str(m.get("id", ""))
        if mid and mid not in seen:
            seen.add(mid)
            unique.append(m)

    normalized = [normalize_market(m) for m in unique]
    normalized.sort(key=lambda x: x["volume"], reverse=True)
    return normalized[:limit]


def fetch_top_macro_signals(n: int = 8) -> List[Dict]:
    """
    Return the top-N highest-volume macro/economics markets — intended for
    the 'live signal bar' at the top of the Polymarket page.
    """
    raw = fetch_raw_markets(limit=n * 2, tag_slug="economics")
    markets = [normalize_market(m) for m in raw]
    markets.sort(key=lambda x: x["volume"], reverse=True)
    return markets[:n]


def fetch_markets_by_category(category: str, limit: int = 30) -> List[Dict]:
    """Fetch markets for a specific Gamma category slug."""
    if category not in FINANCIAL_CATEGORIES and category != "all":
        return []
    if category == "all":
        return fetch_financial_markets(limit=limit)
    raw = fetch_raw_markets(limit=limit, tag_slug=category)
    markets = [normalize_market(m) for m in raw]
    markets.sort(key=lambda x: x["volume"], reverse=True)
    return markets
