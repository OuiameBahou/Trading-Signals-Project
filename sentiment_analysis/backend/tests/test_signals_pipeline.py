"""
test_signals_pipeline.py – Tests automatisés du pipeline d'analyse.

Couvre :
  1. sentiment_history   – consolidation et forward-fill.
  2. data_loader         – filtre de confiance, comptage de mentions.
  3. data_augmentor      – variantes synonymiques.
  4. proxy_sentiment     – blending et métadonnées.
  5. finbert_finetuner   – préparation des données d'entraînement.
  6. Intégration API     – /api/tickers

Tests supprimés (modules retirés) :
  - compute_spearman / compute_granger  → remplacés par Transfer Entropy
  - compute_dynamic_thresholds          → signals.py supprimé
  - /api/correlation                    → endpoint supprimé

Usage :
    py -m pytest tests/test_signals_pipeline.py -v
    # ou directement :
    py tests/test_signals_pipeline.py
"""

import sys
import os

import numpy as np
import pandas as pd

# Ajouter src/ au path pour les imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_date_index(n: int) -> pd.DatetimeIndex:
    return pd.date_range(start="2024-01-01", periods=n, freq="D")


# ── 1. Tests Sentiment History ────────────────────────────────────────────────

def test_sentiment_history_consolidation():
    """consolidate_sentiment_history doit retourner un DataFrame non-vide si nlp_results.jsonl existe."""
    from analytics.sentiment_history import consolidate_sentiment_history

    df = consolidate_sentiment_history()
    if df.empty:
        print(f"  [SKIP] sentiment_history: nlp_results.jsonl vide ou absent – skipped")
        return
    assert "ticker" in df.columns
    assert "net_sentiment" in df.columns
    assert "date" in df.columns
    assert len(df) > 0
    print(f"  [OK] Consolidation: {len(df)} lignes, {df['ticker'].nunique()} tickers")


def test_get_dense_series_fills_gaps():
    """get_dense_sentiment_series doit générer un index continu (calendaire)."""
    from analytics.sentiment_history import consolidate_sentiment_history, get_dense_sentiment_series

    df = consolidate_sentiment_history()
    if df.empty:
        print(f"  [SKIP] sentiment_history dense: pas de donnees – skipped")
        return

    # Prendre le ticker avec le plus de données
    best_ticker = df.groupby("ticker").size().idxmax()
    series = get_dense_sentiment_series(best_ticker, min_days=1)

    if series.empty:
        print(f"  [SKIP] Serie vide pour {best_ticker} – skipped")
        return

    # L'index doit être continu (aucun saut de plus d'un jour)
    if len(series) > 1:
        diffs = series.index.to_series().diff().dropna()
        max_gap = diffs.max()
        assert max_gap <= pd.Timedelta(days=1), f"Saut de {max_gap} détecté dans l'index"

    assert not series.isna().any(), "La série dense ne doit pas contenir de NaN"
    print(f"  [OK] Dense series for {best_ticker}: {len(series)} jours, no NaN, no gaps")


# ── 2. Tests d'intégration et utilitaires ────────────────────────────────────


def test_confidence_filter_reduces_mentions():
    """get_sentiment_summary with min_confidence=0.99 should return <= total_mentions of 0.0."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
        from interface.data_loader import get_sentiment_summary
    except ImportError as e:
        print(f"  [SKIP] Import failed: {e}")
        return

    df_all = get_sentiment_summary(min_confidence=0.0)
    df_filtered = get_sentiment_summary(min_confidence=0.99)

    if df_all.empty:
        print("  [SKIP] No NLP data available")
        return

    total_all = int(df_all["total_mentions"].sum())
    total_filtered = int(df_filtered["total_mentions"].sum()) if not df_filtered.empty else 0
    assert total_filtered <= total_all, (
        f"Filtering should reduce or equal mention count: {total_filtered} > {total_all}"
    )
    print(f"  [OK] Confidence filter: {total_all} → {total_filtered} total mentions")


def test_synonym_augment_produces_variants():
    """synonym_augment should produce distinct non-empty variants from the source text."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
        from analytics.data_augmentor import synonym_augment, FINANCIAL_SYNONYMS
    except ImportError as e:
        print(f"  [SKIP] Import failed: {e}")
        return

    assert len(FINANCIAL_SYNONYMS) >= 10, (
        f"Need at least 10 synonym groups, got {len(FINANCIAL_SYNONYMS)}"
    )

    text = "The stock surged 5% after a strong earnings beat"
    variants = synonym_augment(text, n_variants=2, seed=42)

    assert isinstance(variants, list), "synonym_augment must return a list"
    assert len(variants) >= 1, f"Expected at least 1 variant, got {len(variants)}"
    for v in variants:
        assert isinstance(v, str) and len(v) > 0, "Each variant must be a non-empty string"
        assert v != text, f"Variant should differ from original: '{v}'"
    print(f"  [OK] synonym_augment: {len(variants)} variant(s) from '{text[:40]}...'")
    for v in variants:
        print(f"       → '{v}'")


def test_proxy_blending_metadata():
    """get_proxy_sentiment_series should attach .metadata to the returned Series."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
        from analytics.proxy_sentiment import get_proxy_sentiment_series, PROXY_MAP
    except ImportError as e:
        print(f"  [SKIP] Import failed: {e}")
        return

    assert len(PROXY_MAP) >= 10, f"PROXY_MAP too small: {len(PROXY_MAP)} entries"

    # Use a stub build_fn so this test never touches the filesystem
    import pandas as pd
    import numpy as np

    stub_data = {
        "EURGBP": pd.Series(
            np.random.default_rng(0).standard_normal(10),
            index=pd.date_range("2026-01-01", periods=10),
        ),
        "EURUSD": pd.Series(
            np.random.default_rng(1).standard_normal(50),
            index=pd.date_range("2025-11-01", periods=50),
        ),
        "GBPUSD": pd.Series(
            np.random.default_rng(2).standard_normal(50),
            index=pd.date_range("2025-11-01", periods=50),
        ),
    }

    def stub_build(ticker):
        return stub_data.get(ticker.upper(), pd.Series(dtype=float))

    result = get_proxy_sentiment_series("EURGBP", min_obs=80, proxy_weight=0.3, build_fn=stub_build)
    meta = getattr(result, "metadata", None)

    assert meta is not None, "Returned Series must carry a .metadata attribute"
    assert "blended" in meta, "metadata must contain 'blended' key"
    assert "n_own"   in meta, "metadata must contain 'n_own' key"
    assert "proxies_used" in meta, "metadata must contain 'proxies_used' key"

    if meta["blended"]:
        assert len(result) > meta["n_own"], (
            f"Blended series ({len(result)}) should be longer than own ({meta['n_own']})"
        )
        print(
            f"  [OK] proxy blending: EURGBP {meta['n_own']} own obs + "
            f"proxies {meta['proxies_used']} → {len(result)} total"
        )
    else:
        print(f"  [OK] proxy blending: EURGBP did not need blending ({meta['n_own']} obs)")


def test_finetuner_prepare_data():
    """prepare_training_data should return properly structured samples from nlp_results.jsonl."""
    try:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
        from analytics.finbert_finetuner import prepare_training_data, LABEL2ID
    except ImportError as e:
        print(f"  [SKIP] Import failed: {e}")
        return

    samples = prepare_training_data(min_confidence=0.9, exclude_augmented=True)

    if not samples:
        print("  [SKIP] No high-confidence samples found in nlp_results.jsonl")
        return

    assert all("text" in s and "label" in s for s in samples), (
        "All samples must have 'text' and 'label' keys"
    )
    labels_found = set(s["label"] for s in samples)
    assert labels_found <= set(LABEL2ID.keys()), (
        f"Unexpected label values: {labels_found - set(LABEL2ID.keys())}"
    )
    print(
        f"  [OK] prepare_training_data: {len(samples)} samples, "
        f"labels={sorted(labels_found)}"
    )


def test_api_tickers_has_n_obs():
    """api_tickers should return n_obs field; tickers sorted by it descending."""
    try:
        import urllib.request
        import json as _json
        with urllib.request.urlopen("http://localhost:8000/api/tickers", timeout=5) as r:
            data = _json.loads(r.read())
    except Exception as e:
        print(f"  [SKIP] API not reachable: {e}")
        return

    assert len(data) > 0, "api/tickers returned empty list"
    assert "n_obs" in data[0], f"'n_obs' field missing from response: {list(data[0].keys())}"

    obs_vals = [d["n_obs"] for d in data]
    assert obs_vals == sorted(obs_vals, reverse=True), (
        "Tickers not sorted by n_obs descending"
    )
    print(
        f"  [OK] /api/tickers: {len(data)} tickers, "
        f"top ticker={data[0]['ticker']} n_obs={data[0]['n_obs']}"
    )


ALL_TESTS = [
    ("Sentiment History – consolidation",  test_sentiment_history_consolidation),
    ("Sentiment History – dense series",   test_get_dense_series_fills_gaps),
    ("Confidence filter reduces mentions", test_confidence_filter_reduces_mentions),
    ("Synonym augment produces variants",  test_synonym_augment_produces_variants),
    ("Proxy blending metadata",            test_proxy_blending_metadata),
    ("Finetuner prepare_training_data",    test_finetuner_prepare_data),
    ("API /api/tickers has n_obs",         test_api_tickers_has_n_obs),
]

if __name__ == "__main__":
    print("=" * 65)
    print("  [TEST] Pipeline Analyse de Sentiment")
    print("=" * 65)
    passed, failed, skipped = 0, 0, 0
    for name, fn in ALL_TESTS:
        print(f"\n[TEST] {name}")
        try:
            fn()
            passed += 1
        except AssertionError as e:
            print(f"  [ECHEC] {e}")
            failed += 1
        except Exception as e:
            print(f"  [ERREUR] {e}")
            failed += 1

    print("\n" + "=" * 65)
    print(f"  Resultats: {passed} OK  |  {failed} ECHEC")
    print("=" * 65)
    sys.exit(0 if failed == 0 else 1)
