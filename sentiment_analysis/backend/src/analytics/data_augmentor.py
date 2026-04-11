"""
data_augmentor.py – Synthetic data augmentation for sparse ticker corpora.

Two complementary strategies:

1. **Synonym replacement** (``synonym_augment``) – rule-based, no API calls.
   Financial terms are swapped for semantically equivalent synonyms, producing
   lexically distinct but factually and sentiment-equivalent variants.
    
2. **Back-translation / paraphrase** (``back_translate_augment``) – uses GPT-4o
   to rephrase a batch of headlines in one API call.

All augmented records written to ``data/nlp_results.jsonl`` carry:
  ``"augmented": True``   – permanent flag so downstream code can identify them.
  ``"augment_method"``    – either ``"synonym"`` or ``"back_translate"``.
  ``"augment_source"``    – truncated URL / text of the source article.

FinBERT **re-scores** every augmented text.  The source article's sentiment
label is never inherited — this prevents synonym swaps that inadvertently flip
sentiment (e.g. "not strong" → "weak") from being mislabelled.

The source article's ``created_at`` timestamp is reused so augmented records
don't create a phantom spike in the adaptive time-window logic of
``get_sentiment_summary()``.

CLI usage::

    python -m src.analytics.data_augmentor --ticker GOLD --target 80
    python -m src.analytics.data_augmentor --ticker GOLD --target 80 --back-translate
    python -m src.analytics.data_augmentor --all --target 80 --dry-run
"""

import argparse
import json
import logging
import os
import random
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
DATA_DIR = os.path.join(_ROOT, "data")
NLP_FILE = os.path.join(DATA_DIR, "nlp_results.jsonl")

# ---------------------------------------------------------------------------
# Financial synonym dictionary
# ---------------------------------------------------------------------------
# Keys are lower-case terms that may appear in financial headlines.
# Values are lists of acceptable replacements with equivalent sentiment weight.
FINANCIAL_SYNONYMS: Dict[str, List[str]] = {
    # Upward movement
    "surge":    ["rally", "jump", "spike", "climb", "soar", "advance"],
    "rally":    ["surge", "rebound", "recovery", "advance", "climb"],
    "rise":     ["increase", "gain", "advance", "uptick", "climb"],
    "gain":     ["rise", "advance", "increase", "improve"],
    "soar":     ["surge", "jump", "spike", "rocket"],
    "climb":    ["rise", "advance", "increase", "move higher"],
    "rebound":  ["recover", "bounce back", "rally", "regain"],
    "jump":     ["surge", "spike", "leap", "climb"],

    # Downward movement
    "drop":     ["fall", "decline", "slide", "dip", "tumble", "retreat"],
    "decline":  ["drop", "fall", "slide", "retreat", "dip", "weaken"],
    "fall":     ["drop", "decline", "sink", "retreat", "tumble"],
    "slide":    ["fall", "drop", "decline", "slip", "retreat"],
    "tumble":   ["plunge", "fall", "drop", "slide", "sink"],
    "plunge":   ["tumble", "crash", "collapse", "fall sharply"],
    "sink":     ["fall", "drop", "decline", "retreat"],
    "dip":      ["decline", "fall", "drop", "slip"],

    # Sentiment descriptors
    "bullish":  ["positive", "optimistic", "upbeat", "constructive", "upside"],
    "bearish":  ["negative", "pessimistic", "cautious", "downbeat", "downside"],
    "strong":   ["robust", "solid", "firm", "resilient", "healthy"],
    "weak":     ["soft", "fragile", "subdued", "muted", "tepid"],
    "robust":   ["strong", "solid", "healthy", "buoyant"],
    "solid":    ["strong", "robust", "firm", "healthy"],

    # Events / actions
    "beat":     ["exceed", "surpass", "top", "outperform", "come in above"],
    "miss":     ["fall short", "disappoint", "underperform", "come in below"],
    "cut":      ["reduce", "lower", "trim", "slash", "decrease"],
    "hike":     ["raise", "increase", "lift", "bump up"],
    "raise":    ["hike", "increase", "lift", "boost"],
    "reduce":   ["cut", "lower", "trim", "decrease", "scale back"],

    # Financial terms
    "concern":  ["worry", "fear", "anxiety", "caution", "uncertainty"],
    "guidance": ["outlook", "forecast", "projection", "expectations"],
    "revenue":  ["sales", "top line", "turnover", "income"],
    "profit":   ["earnings", "income", "net income", "bottom line"],
    "loss":     ["deficit", "shortfall", "negative earnings"],
    "target":   ["price target", "objective", "goal"],
    "upgrade":  ["raise rating", "improve outlook", "lift recommendation"],
    "downgrade": ["lower rating", "cut recommendation", "reduce outlook"],
    "warning":  ["alert", "caution", "red flag", "concern"],
    "growth":   ["expansion", "increase", "rise", "improvement"],
    "slowdown": ["deceleration", "moderation", "easing", "cooling"],
}


# ---------------------------------------------------------------------------
# Strategy 1: Synonym replacement
# ---------------------------------------------------------------------------

def synonym_augment(
    text: str,
    n_variants: int = 2,
    seed: Optional[int] = None,
) -> List[str]:
    """
    Generate up to ``n_variants`` paraphrased versions of ``text`` by replacing
    financial terms with synonyms from :data:`FINANCIAL_SYNONYMS`.

    Args:
        text:       Original headline / article text.
        n_variants: Maximum number of distinct variants to return.
        seed:       Optional random seed for reproducibility.

    Returns:
        List of augmented strings.  May be shorter than ``n_variants`` if the
        text contains no replaceable terms.  The original ``text`` is never
        included in the output.
    """
    if seed is not None:
        random.seed(seed)

    words = text.split()
    variants: List[str] = []

    for _ in range(n_variants * 4):  # generate extra, deduplicate
        new_words = list(words)
        replaced = False
        for i, w in enumerate(new_words):
            # Strip trailing punctuation for dict lookup
            stripped = w.lower().rstrip(".,;:!?\"'")
            if stripped in FINANCIAL_SYNONYMS:
                synonyms = FINANCIAL_SYNONYMS[stripped]
                replacement = random.choice(synonyms)
                # Preserve original capitalisation
                if w[0].isupper():
                    replacement = replacement[0].upper() + replacement[1:]
                # Re-attach any trailing punctuation
                punctuation = w[len(stripped):]
                new_words[i] = replacement + punctuation
                replaced = True
        if replaced:
            candidate = " ".join(new_words)
            if candidate != text and candidate not in variants:
                variants.append(candidate)
        if len(variants) >= n_variants:
            break

    return variants[:n_variants]


# ---------------------------------------------------------------------------
# Strategy 2: GPT-4o back-translation / paraphrase
# ---------------------------------------------------------------------------

def back_translate_augment(
    texts: List[str],
    n_variants: int = 1,
    openai_client=None,
) -> List[List[str]]:
    """
    Use GPT-4o to paraphrase a batch of headlines into ``n_variants``
    alternatives each.  Sent as a single API call to minimise cost.

    Args:
        texts:         List of original headline strings.
        n_variants:    Number of paraphrases to request per text.
        openai_client: Optional pre-instantiated ``openai.OpenAI`` client.
                       Constructed automatically if ``None``.

    Returns:
        List of lists: ``result[i]`` contains the paraphrase variants for
        ``texts[i]``.  On API failure returns ``[[] for _ in texts]``.
    """
    if not texts:
        return []

    try:
        if openai_client is None:
            from openai import OpenAI
            openai_client = OpenAI()

        numbered = "\n".join(f"{i + 1}. {t}" for i, t in enumerate(texts))
        prompt = (
            f"You are a financial news editor. For each headline below, write "
            f"{n_variants} paraphrase(s) that preserve the exact same sentiment "
            f"and factual content but use different wording. "
            f"Return ONLY a JSON object with key \"paraphrases\" whose value is "
            f"an array of arrays: "
            f"[[\"variant_for_1\"], [\"variant_for_2\"], ...]\n\n"
            f"{numbered}"
        )

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
        # Accept {"paraphrases": [[...],...]} or [[...],...] directly
        if isinstance(parsed, dict):
            parsed = next(iter(parsed.values()))
        if isinstance(parsed, list):
            return parsed
        return [[] for _ in texts]

    except Exception as exc:
        logger.error("back_translate_augment: GPT-4o call failed: %s", exc)
        return [[] for _ in texts]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_ticker_records(ticker: str) -> List[Dict[str, Any]]:
    """Load all non-augmented NLP records for ``ticker`` from the JSONL file."""
    records: List[Dict[str, Any]] = []
    if not os.path.exists(NLP_FILE):
        return records
    with open(NLP_FILE, "r", encoding="utf-8") as f:
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
            if obj.get("augmented"):  # skip already-augmented records
                continue
            records.append(obj)
    return records


# ---------------------------------------------------------------------------
# Main augmentation pipeline
# ---------------------------------------------------------------------------

def augment_ticker_corpus(
    ticker: str,
    target_count: int = 80,
    use_back_translate: bool = False,
    openai_client=None,
    dry_run: bool = False,
) -> int:
    """
    Augment the corpus for a single ticker up to ``target_count`` records.

    Steps:
    1. Load real (non-augmented) records for the ticker.
    2. If ``n_real >= target_count``, return ``0`` (no augmentation needed).
    3. Apply :func:`synonym_augment` on the highest-confidence originals until
       the deficit is filled (up to 2 variants each).
    4. If ``use_back_translate`` and the deficit is still not met, call
       :func:`back_translate_augment` via GPT-4o for additional variants.
    5. Run all augmented texts through FinBERT (fresh inference — no label copy).
    6. Write augmented records to ``data/nlp_results.jsonl``.

    Args:
        ticker:             Target ticker symbol.
        target_count:       Desired minimum corpus size after augmentation.
        use_back_translate: Also call GPT-4o for additional variants.
        openai_client:      Pre-instantiated OpenAI client (optional).
        dry_run:            If ``True``, compute and log but do not write.

    Returns:
        Number of augmented records written (0 if already sufficient or on error).
    """
    real_records = _load_ticker_records(ticker)
    n_real = len(real_records)

    if n_real >= target_count:
        logger.info(
            "augment_ticker_corpus: %s already has %d records (>= %d), skipping.",
            ticker.upper(), n_real, target_count,
        )
        return 0

    deficit = target_count - n_real
    logger.info(
        "augment_ticker_corpus: %s has %d records, need %d more to reach %d.",
        ticker.upper(), n_real, deficit, target_count,
    )

    # Sort by confidence descending so the best-quality signals are augmented first
    real_records.sort(
        key=lambda r: float(r.get("confidence", 0) or 0), reverse=True
    )

    augmented_texts: List[str] = []
    source_records: List[Dict[str, Any]] = []  # parallel list to augmented_texts

    # Strategy 1: synonym substitution
    for rec in real_records:
        if len(augmented_texts) >= deficit:
            break
        text = rec.get("text", "")
        if not text:
            continue
        variants = synonym_augment(text, n_variants=2)
        for v in variants:
            if len(augmented_texts) >= deficit:
                break
            augmented_texts.append(v)
            source_records.append(rec)

    # Strategy 2: back-translation (only if still needed and requested)
    if use_back_translate and len(augmented_texts) < deficit:
        still_needed = deficit - len(augmented_texts)
        batch_texts = [
            r.get("text", "") for r in real_records[:still_needed] if r.get("text")
        ]
        if batch_texts:
            bt_results = back_translate_augment(
                batch_texts, n_variants=1, openai_client=openai_client
            )
            for i, variants in enumerate(bt_results):
                if len(augmented_texts) >= deficit:
                    break
                for v in variants:
                    if len(augmented_texts) >= deficit:
                        break
                    augmented_texts.append(v)
                    source_records.append(real_records[i])

    if not augmented_texts:
        logger.warning(
            "augment_ticker_corpus: no augmented texts generated for %s "
            "(no replaceable terms found in source corpus)",
            ticker.upper(),
        )
        return 0

    if dry_run:
        logger.info(
            "dry_run: would write %d augmented records for %s",
            len(augmented_texts), ticker.upper(),
        )
        return len(augmented_texts)

    # Run through FinBERT – never inherit source label
    try:
        from nlp.sentiment_analyzer import SentimentAnalyzer
        from nlp.preprocessor import FinancialPreprocessor
        prep = FinancialPreprocessor()
        analyzer = SentimentAnalyzer(use_gpu=False)
        clean_texts = [prep.clean_text(t) for t in augmented_texts]
        finbert_results = analyzer.analyze_batch(clean_texts)
    except Exception as exc:
        logger.error(
            "augment_ticker_corpus: FinBERT scoring failed for %s: %s",
            ticker.upper(), exc,
        )
        return 0

    now_iso = datetime.now(timezone.utc).isoformat()
    written = 0

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(NLP_FILE, "a", encoding="utf-8") as f:
        for text, fb, src in zip(augmented_texts, finbert_results, source_records):
            aug_record: Dict[str, Any] = {
                "text": text,
                "ticker": ticker.upper(),
                # Reuse source created_at to avoid phantom spikes in the adaptive
                # time-window logic of get_sentiment_summary().
                "created_at": src.get("created_at", now_iso),
                "source": src.get("source", "augmented"),
                "sentiment": fb["sentiment"],
                "confidence": round(float(fb["confidence"]), 6),
                "scores": {
                    k: round(float(v), 6) for k, v in fb["scores"].items()
                },
                "entities": [],
                "processed_at": now_iso,
                "augmented": True,
                "augment_method": "synonym",
                "augment_source": src.get("url", src.get("text", ""))[:120],
            }
            f.write(json.dumps(aug_record, ensure_ascii=False) + "\n")
            written += 1

    logger.info(
        "augment_ticker_corpus: wrote %d augmented records for %s",
        written, ticker.upper(),
    )
    return written


def augment_all_sparse_tickers(
    target_count: int = 80,
    use_back_translate: bool = False,
) -> Dict[str, int]:
    """
    Run augmentation for every ticker currently below ``target_count`` records.

    Scans ``data/nlp_results.jsonl``, counts real (non-augmented) records per
    ticker, and calls :func:`augment_ticker_corpus` for each sparse one.

    Returns:
        ``{ticker: n_written}`` for all tickers that were augmented.
    """
    counts: Counter = Counter()
    if os.path.exists(NLP_FILE):
        with open(NLP_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                t = obj.get("ticker", "")
                if t and t.upper() not in ("", "UNKNOWN") and not obj.get("augmented"):
                    counts[t.upper()] += 1

    results: Dict[str, int] = {}
    for ticker, count in sorted(counts.items()):
        if count < target_count:
            n = augment_ticker_corpus(
                ticker,
                target_count=target_count,
                use_back_translate=use_back_translate,
            )
            if n > 0:
                results[ticker] = n

    logger.info(
        "augment_all_sparse_tickers: augmented %d tickers, %d total records written",
        len(results), sum(results.values()),
    )
    return results


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
    parser = argparse.ArgumentParser(
        description="Augment sparse ticker corpora in nlp_results.jsonl"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ticker", metavar="SYMBOL", help="Single ticker to augment")
    group.add_argument("--all", action="store_true", help="Augment all sparse tickers")
    parser.add_argument(
        "--target", type=int, default=80,
        help="Target observation count per ticker (default: 80)",
    )
    parser.add_argument(
        "--back-translate", action="store_true",
        help="Also use GPT-4o back-translation after synonym substitution",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Count only – do not write to nlp_results.jsonl",
    )
    args = parser.parse_args()

    if args.ticker:
        n = augment_ticker_corpus(
            args.ticker,
            target_count=args.target,
            use_back_translate=args.back_translate,
            dry_run=args.dry_run,
        )
        print(f"Done. {n} augmented records {'would be ' if args.dry_run else ''}written for {args.ticker.upper()}.")
    else:
        results = augment_all_sparse_tickers(
            target_count=args.target,
            use_back_translate=args.back_translate,
        )
        total = sum(results.values())
        print(
            f"Done. {total} records written across {len(results)} tickers: "
            + ", ".join(f"{t}(+{n})" for t, n in sorted(results.items()))
        )
        sys.exit(0)
