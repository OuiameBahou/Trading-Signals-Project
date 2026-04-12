"""Quick test of Polymarket API and tag filtering."""
import requests
import json

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

r = requests.get(
    "https://gamma-api.polymarket.com/events",
    params={"closed": "false", "limit": 50, "order": "volume", "ascending": "false"},
    headers={"User-Agent": "Test/1.0"},
    timeout=15,
)
print(f"API Status: {r.status_code}")
data = r.json()
print(f"Total events returned: {len(data)}")

# Collect all tag slugs
all_slugs = set()
for e in data:
    for t in e.get("tags", []):
        s = t.get("slug", "") if isinstance(t, dict) else t
        all_slugs.add(s)

print(f"\nAll unique tag slugs ({len(all_slugs)}):")
for s in sorted(all_slugs):
    print(f"  {s}")

# Filter
print("\n--- Filtering results ---")
fin_count = 0
for e in data:
    slugs = set()
    for t in e.get("tags", []):
        s = t.get("slug", "") if isinstance(t, dict) else t
        slugs.add(s)

    has_fin = bool(slugs & FINANCIAL_TAG_SLUGS)
    has_sport = bool(slugs & SPORTS_TAG_SLUGS)
    is_financial = has_fin and not has_sport

    label = "FIN" if is_financial else "SKIP"
    if is_financial:
        fin_count += 1
    title = e.get("title", "")[:70]
    tag_list = [t.get("slug", "") if isinstance(t, dict) else t for t in e.get("tags", [])]
    print(f"  {label}: {title}")
    print(f"        tags: {tag_list}")

print(f"\nFinancial events: {fin_count}/{len(data)}")

# Test the full pipeline
print("\n\n--- Full pipeline test ---")
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))
from collectors.polymarket_scraper import fetch_financial_markets
markets = fetch_financial_markets(limit=10, with_ai=False)
print(f"Markets returned by fetch_financial_markets: {len(markets)}")
for m in markets[:3]:
    print(f"  - {m['question'][:60]} | prob={m['yes_probability']} | vol={m['volume']}")
