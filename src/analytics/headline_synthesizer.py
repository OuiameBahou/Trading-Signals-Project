"""
headline_synthesizer.py – LLM-based Clustering + Synthesis for Market Headlines.

Pipeline:
  1. Send all headlines to GPT-4o which groups them into thematic clusters
     (same market event/story → same cluster). Much more accurate than TF-IDF
     since the LLM understands semantic meaning, synonyms, and context.
  2. Synthesize each multi-article cluster into a single, well-formulated
     headline using GPT-4o (one batch API call).
  3. Return synthesized headlines sorted by max impact score, each carrying
     the list of original source {name, url} pairs.

Fallback: if OpenAI is unavailable, a naive text-overlap dedup is used.
"""

import os
import json
import logging
from typing import List, Dict, Any

try:
    from openai import OpenAI
    _OPENAI_OK = True
except ImportError:
    _OPENAI_OK = False

from dotenv import load_dotenv

_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(dotenv_path=os.path.join(_project_root, ".env"))

logger = logging.getLogger("analytics.headline_synthesizer")

MAX_ARTICLES_PER_CLUSTER = 10  # max articles shown to GPT in synthesis prompt
LLM_MODEL = "gpt-4o"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_openai_client():
    """Return an OpenAI client or None if unavailable."""
    if not _OPENAI_OK:
        logger.warning("openai package not installed.")
        return None
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key.startswith("sk-your"):
        logger.warning("OPENAI_API_KEY not configured.")
        return None
    return OpenAI(api_key=api_key)


def _naive_dedup(headlines: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """
    Fallback clustering using simple text-overlap dedup (first 60 chars).
    Used only when OpenAI is unavailable.
    """
    clusters: List[List[Dict[str, Any]]] = []
    seen_keys = set()
    for h in headlines:
        key = h.get("text", "")[:60].strip().lower()
        if key in seen_keys:
            # Try to attach to existing cluster
            for c in clusters:
                if c[0].get("text", "")[:60].strip().lower() == key:
                    c.append(h)
                    break
        else:
            seen_keys.add(key)
            clusters.append([h])
    return clusters


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 – LLM-based Clustering
# ─────────────────────────────────────────────────────────────────────────────

def cluster_headlines_with_llm(
    headlines: List[Dict[str, Any]],
) -> List[List[Dict[str, Any]]]:
    """
    Use GPT-4o to semantically cluster headlines about the same market event.

    Sends all headline texts (indexed) to the LLM and asks it to return
    a JSON mapping each headline index to a cluster ID. Headlines about
    the same story/event/topic get the same cluster ID.

    Returns a list of clusters, each cluster sorted by impact_score desc.
    Falls back to naive dedup if LLM is unavailable.
    """
    if not headlines:
        return []

    if len(headlines) == 1:
        return [[headlines[0]]]

    client = _get_openai_client()
    if client is None:
        logger.warning("OpenAI unavailable – falling back to naive dedup.")
        return _naive_dedup(headlines)

    # Build indexed list of headlines for the prompt
    indexed_lines = []
    for i, h in enumerate(headlines):
        text = h.get("text", "").strip()
        ticker = h.get("ticker", "")
        indexed_lines.append(f"{i}: [{ticker}] {text}")
    headlines_block = "\n".join(indexed_lines)

    system_prompt = (
        "You are a senior financial news analyst at a major bank's trading desk.\n"
        "You receive a numbered list of financial news headlines.\n"
        "Your task: identify which headlines cover the SAME market story, event, or theme,\n"
        "and assign each headline to a cluster.\n\n"
        "CLUSTERING RULES:\n"
        "1. Headlines about the same EVENT or STORY must be in the same cluster,\n"
        "   even if they use different words or focus on different angles.\n"
        "   Example: 'Stocks drop on Iran fears' and 'S&P 500 falls amid Middle East tensions'\n"
        "   → same cluster (both about market reaction to Middle East conflict).\n"
        "2. Headlines about DIFFERENT assets reacting to the SAME root cause should be\n"
        "   in the same cluster.\n"
        "   Example: 'Oil surges on Iran war' and 'Gold rises as Mideast conflict escalates'\n"
        "   → same cluster (same cause: Middle East conflict).\n"
        "3. Headlines about genuinely DIFFERENT stories must be in DIFFERENT clusters.\n"
        "4. Be aggressive in merging — if two headlines relate to the same broad event,\n"
        "   group them together. Err on the side of merging rather than splitting.\n"
        "5. Single unique headlines that don't match anything else stay in their own cluster.\n\n"
        "RESPONSE FORMAT:\n"
        "Return a JSON object with a single key \"clusters\" whose value is an array of arrays.\n"
        "Each inner array contains the headline indices (integers) that belong to that cluster.\n"
        "Every headline index must appear exactly once.\n\n"
        "Example: {\"clusters\": [[0, 3, 7], [1, 5], [2], [4, 6]]}\n"
    )

    user_prompt = f"Here are {len(headlines)} financial headlines to cluster:\n\n{headlines_block}"

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=3000,
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)

        # Extract the clusters array
        cluster_arrays = None
        if isinstance(parsed, dict):
            cluster_arrays = parsed.get("clusters", None)
            if cluster_arrays is None:
                # Try first list value
                for v in parsed.values():
                    if isinstance(v, list):
                        cluster_arrays = v
                        break
        elif isinstance(parsed, list):
            cluster_arrays = parsed

        if not isinstance(cluster_arrays, list):
            raise ValueError(f"Unexpected response format: {type(parsed)}")

        # Build clusters from index arrays
        used_indices = set()
        result: List[List[Dict[str, Any]]] = []

        for group in cluster_arrays:
            if not isinstance(group, list):
                continue
            cluster_items = []
            for idx in group:
                idx = int(idx)
                if 0 <= idx < len(headlines) and idx not in used_indices:
                    cluster_items.append(headlines[idx])
                    used_indices.add(idx)
            if cluster_items:
                cluster_items.sort(key=lambda h: h.get("impact_score", 0), reverse=True)
                result.append(cluster_items)

        # Add any missed headlines as single-item clusters
        for i in range(len(headlines)):
            if i not in used_indices:
                result.append([headlines[i]])

        # Sort clusters by best impact score
        result.sort(key=lambda g: g[0].get("impact_score", 0), reverse=True)

        multi_count = sum(1 for c in result if len(c) > 1)
        logger.info(
            "LLM clustered %d headlines → %d clusters (%d multi-article).",
            len(headlines), len(result), multi_count,
        )
        return result

    except Exception as exc:
        logger.error("LLM clustering failed, using naive dedup: %s", exc)
        return _naive_dedup(headlines)


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 – GPT-4o Batch Synthesis
# ─────────────────────────────────────────────────────────────────────────────

def synthesize_clusters(
    clusters: List[List[Dict[str, Any]]],
) -> List[str]:
    """
    Call GPT-4o ONCE with all multi-article clusters and return one
    synthesized headline per cluster (same order as input).

    Single-article clusters keep their original title (no LLM call needed).
    Falls back to the best-score article title if LLM is unavailable.
    """
    fallback = [cluster[0].get("text", "") for cluster in clusters]

    client = _get_openai_client()
    if client is None:
        return fallback

    # Identify which clusters need synthesis
    clusters_to_synthesize = []
    cluster_map = {}  # original index → batch position
    for orig_idx, cluster in enumerate(clusters):
        if len(cluster) > 1:
            cluster_map[orig_idx] = len(clusters_to_synthesize)
            clusters_to_synthesize.append(cluster)

    if not clusters_to_synthesize:
        return fallback

    # Build prompt with all multi-article clusters
    lines = []
    for batch_idx, cluster in enumerate(clusters_to_synthesize):
        articles = cluster[:MAX_ARTICLES_PER_CLUSTER]
        lines.append(f"CLUSTER {batch_idx}:")
        for i, a in enumerate(articles, 1):
            lines.append(f"  article_{i}: {a.get('text', '')}")
        lines.append("")
    cluster_prompt = "\n".join(lines)

    system_prompt = (
        "You are a senior financial news editor for a major bank's trading desk.\n"
        "You receive groups of similar news articles (clusters) about the same market event.\n"
        "For EACH cluster, write ONE concise, professional, English headline that:\n"
        "  • Synthesizes all articles into a single clear, informative statement\n"
        "  • Is factual and specific (not clickbait)\n"
        "  • Is max 120 characters\n"
        "  • Mentions the key actor/asset/event\n\n"
        "Return a JSON object with key \"headlines\" containing an array of strings,\n"
        "one per cluster, in the same order.\n"
        "Example: {\"headlines\": [\"Fed signals rates unchanged through mid-2025\", "
        "\"Oil tumbles as OPEC+ output surges\"]}"
    )

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": cluster_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=2000,
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)

        if isinstance(parsed, dict):
            for v in parsed.values():
                if isinstance(v, list):
                    parsed = v
                    break
        if not isinstance(parsed, list):
            raise ValueError(f"Unexpected LLM response shape: {type(parsed)}")

        logger.info("GPT-4o synthesized %d multi-article clusters.", len(parsed))

        # Merge back into results
        result = list(fallback)
        for orig_idx, batch_pos in cluster_map.items():
            if batch_pos < len(parsed):
                synthesized = str(parsed[batch_pos]).strip()
                if synthesized:
                    result[orig_idx] = synthesized
        return result

    except Exception as exc:
        logger.error("GPT-4o synthesis failed, using fallback: %s", exc)
        return fallback


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 – Public API
# ─────────────────────────────────────────────────────────────────────────────

def build_synthesized_headlines(
    raw_headlines: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Full pipeline: LLM cluster → LLM synthesize → build final output list.

    Each returned dict contains:
      - text          : synthesized (or best-score) headline text
      - impact_score  : max impact score in the cluster
      - impact_level  : HIGH / MEDIUM / LOW
      - sentiment     : dominant sentiment in the cluster
      - confidence    : FinBERT confidence of the top article
      - ticker        : ticker of the top article
      - created_at    : most recent article timestamp
      - sources       : list of {name, url, text, score} for each original article
      - is_synthesized: True if multiple articles were merged
      - article_count : total number of articles in the cluster
    """
    if not raw_headlines:
        return []

    # Step 1 – LLM Clustering
    clusters = cluster_headlines_with_llm(raw_headlines)
    logger.info("Clustered %d articles into %d groups.", len(raw_headlines), len(clusters))

    # Step 2 – LLM Synthesis
    synthesized_texts = synthesize_clusters(clusters)

    # Step 3 – Build output
    output = []
    for cluster, synth_text in zip(clusters, synthesized_texts):
        top = cluster[0]  # highest impact score article

        # Most recent timestamp in the cluster
        timestamps = [a.get("created_at", "") for a in cluster if a.get("created_at")]
        latest_ts = max(timestamps) if timestamps else ""

        # Dominant sentiment (majority vote)
        sentiments = [a.get("sentiment", "neutral") for a in cluster]
        sent_counts = {}
        for s in sentiments:
            sent_counts[s] = sent_counts.get(s, 0) + 1
        dominant_sentiment = max(sent_counts, key=sent_counts.get)

        # Build de-duplicated sources list
        seen_urls = set()
        sources = []
        for article in cluster:
            url = str(article.get("url", "")).strip()
            src_name = str(article.get("source", "")).strip()
            if url and url not in seen_urls:
                seen_urls.add(url)
                sources.append({
                    "name": src_name,
                    "url": url,
                    "text": str(article.get("text", "")),
                    "score": float(article.get("impact_score", 0)),
                })

        output.append({
            "text": synth_text,
            "impact_score": float(top.get("impact_score", 0)),
            "impact_level": str(top.get("impact_level", "LOW")),
            "sentiment": dominant_sentiment,
            "confidence": float(top.get("confidence", 0)),
            "ticker": str(top.get("ticker", "")),
            "created_at": latest_ts,
            "sources": sources,
            "is_synthesized": len(cluster) > 1,
            "article_count": len(cluster),
            "ahp_cr": float(top.get("ahp_cr", 0)),
        })

    # Final sort by impact score descending
    output.sort(key=lambda x: x["impact_score"], reverse=True)
    return output
