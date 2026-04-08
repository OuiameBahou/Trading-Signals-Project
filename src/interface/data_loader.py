"""
data_loader.py – Charge les données JSONL pour le dashboard Streamlit.

Fournit des fonctions pour charger les tweets, messages StockTwits,
news et résultats NLP depuis les fichiers JSONL dans le dossier data/.

FX-specific fields supported:
  - impact       : event impact level (High / Medium / Low) from ForexFactory
  - currency     : base currency of the economic event
  - event_name   : name of the economic event
  - forecast     : analyst forecast value
  - previous     : previous period value
  - data_source  : origin of the data (finviz_fx, rss_fxstreet, forexfactory_calendar, etc.)
"""

import json
import os
import pandas as pd
from datetime import datetime, timezone, timedelta

# Fenêtre temporelle principale pour la Vue de Marché (justifications + pourcentages).
# Si aucune donnée n'est trouvée dans cette fenêtre, le système élargit progressivement
# via SENTIMENT_FALLBACK_WINDOWS (en heures) pour éviter un dashboard vide.
SENTIMENT_WINDOW_HOURS = 30 * 24  # 30 jours
SENTIMENT_FALLBACK_WINDOWS = [30 * 24, None]  # 30j → tout l'historique

# Chemin vers le dossier data/ (relatif à la racine du projet)
DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data"
)


def _load_jsonl(filename: str) -> list:
    """Charge un fichier JSONL et retourne une liste de dicts."""
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    documents = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                documents.append(json.loads(line))
    return documents


def load_news() -> pd.DataFrame:
    """Charge les articles de news dans un DataFrame pandas."""
    docs = _load_jsonl("news.jsonl")
    if not docs:
        return pd.DataFrame()
    df = pd.DataFrame(docs)
    if "published_at" in df.columns:
        df["published_at"] = pd.to_datetime(df["published_at"], utc=True, format="mixed", errors="coerce")
    # Ensure FX-specific columns exist (filled with NaN if absent)
    for col in ["impact", "currency", "event_name", "forecast", "previous", "data_source"]:
        if col not in df.columns:
            df[col] = None
    return df


def load_fx_news() -> pd.DataFrame:
    """
    Charge uniquement les articles FX depuis news.jsonl.

    Inclut les champs spécifiques FX :
      - impact       : niveau d'impact de l'événement (High/Medium/Low)
      - currency     : devise de l'événement économique
      - event_name   : nom de l'événement
      - forecast     : prévision des analystes
      - previous     : valeur de la période précédente
      - data_source  : source des données (finviz_fx, rss_fxstreet, forexfactory_calendar…)
    """
    df = load_news()
    if df.empty:
        return df
    fx_df = df[df["asset_type"] == "fx"].copy()
    return fx_df


def load_fx_calendar() -> pd.DataFrame:
    """
    Charge uniquement les événements du calendrier économique FX
    (source = forexfactory_calendar).
    """
    df = load_fx_news()
    if df.empty:
        return df
    cal_df = df[df["data_source"] == "forexfactory_calendar"].copy()
    # Sort by published_at descending
    if "published_at" in cal_df.columns:
        cal_df = cal_df.sort_values("published_at", ascending=False)
    return cal_df


def get_fx_coverage() -> pd.DataFrame:
    """
    Retourne un résumé de la couverture des données FX par paire et par source.
    Utile pour monitorer la qualité des données FX.
    """
    df = load_fx_news()
    if df.empty:
        return pd.DataFrame()

    coverage = df.groupby(["ticker", "data_source"]).agg(
        article_count=("url", "count"),
        latest_article=("published_at", "max"),
    ).reset_index()
    coverage = coverage.sort_values(["ticker", "article_count"], ascending=[True, False])
    return coverage


def load_nlp_results() -> pd.DataFrame:
    """Charge les résultats NLP dans un DataFrame pandas."""
    docs = _load_jsonl("nlp_results.jsonl")
    if not docs:
        return pd.DataFrame()
    df = pd.DataFrame(docs)
    
    # Sécurité supplémentaire: ignorer les lignes dont le ticker est "UNKNOWN" ou incomplet
    if "ticker" in df.columns:
        df = df[df["ticker"].str.upper() != "UNKNOWN"].reset_index(drop=True)

    if df.empty:
        return df

    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="mixed", errors="coerce")
    # Extraire les scores dans des colonnes séparées
    if "scores" in df.columns:
        # Use .tolist() to ensure pd.json_normalize gets a plain list and creates a
        # fresh 0-based RangeIndex that aligns correctly with the reset_index df above.
        scores_df = pd.json_normalize(df["scores"].tolist())
        df["score_positive"] = scores_df.get("positive", pd.Series(dtype=float)).fillna(0).values
        df["score_negative"] = scores_df.get("negative", pd.Series(dtype=float)).fillna(0).values
        df["score_neutral"] = scores_df.get("neutral", pd.Series(dtype=float)).fillna(0).values
        
        # Override the potentially incorrect pre-calculated 'sentiment'
        # by finding the label with the highest probability score
        scores_subset = df[["score_positive", "score_negative", "score_neutral"]]
        df["sentiment"] = scores_subset.idxmax(axis=1).str.replace("score_", "")
    else:
        # Defaults if no scores present
        df["score_positive"] = 0.0
        df["score_negative"] = 0.0
        df["score_neutral"] = 1.0
        df["sentiment"] = "neutral"
        
    return df


def load_all_texts() -> pd.DataFrame:
    """Charge tous les textes (uniquement News désormais) dans un seul DataFrame."""
    news = load_news()

    frames = []
    if not news.empty:
        # Standardize news to match the old format for the frontend if needed
        news_clean = news[["title", "ticker", "published_at"]].copy()
        news_clean.rename(columns={"title": "text", "published_at": "created_at"}, inplace=True)
        news_clean["source"] = "news"
        news_clean["engagement"] = 0
        frames.append(news_clean)

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def _filter_by_window(df: pd.DataFrame, window_hours) -> pd.DataFrame:
    """Filtre un DataFrame sur les dernières `window_hours` heures.
    Si window_hours est None, retourne tout le DataFrame sans filtre.
    """
    if window_hours is None or "created_at" not in df.columns:
        return df
    cutoff = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    return df[df["created_at"] >= cutoff].copy()


def get_sentiment_by_ticker(
    ticker: str = None,
    window_hours: int = SENTIMENT_WINDOW_HOURS,
    min_confidence: float = 0.0,
) -> pd.DataFrame:
    """Retourne les résultats NLP filtrés par ticker.

    Utilise une fenêtre glissante adaptative : si aucun article n'est trouvé
    dans `window_hours`, la fenêtre s'élargit automatiquement selon
    SENTIMENT_FALLBACK_WINDOWS pour éviter un résultat vide.

    Args:
        min_confidence: Exclude articles whose FinBERT confidence is below this
                        threshold. Prevents low-confidence neutrals from inflating
                        pct_neutral and distorting net_sentiment. Default 0.55.
    """
    df = load_nlp_results()
    if df.empty:
        return df
    # Fenêtre adaptative : on cherche la fenêtre la plus courte ayant au moins 1 article avec scores
    for w in SENTIMENT_FALLBACK_WINDOWS:
        filtered = _filter_by_window(df, w)
        # On valide la fenêtre si elle n'est pas vide ET contient au moins un score valide
        if not filtered.empty:
            if "score_positive" in filtered.columns and filtered["score_positive"].notna().any():
                df = filtered
                break
            # Cas particulier : c'est la dernière fenêtre possible (le 'None'/tout l'historique)
            # ou on n'a rien trouvé de mieux, on accepte même sans scores si c'est tout ce qu'on a.
            if w is None or w == SENTIMENT_FALLBACK_WINDOWS[-1]:
                df = filtered
                break
    # Filter out low-confidence predictions to reduce noisy neutrals
    if min_confidence > 0 and "confidence" in df.columns:
        df = df[df["confidence"].fillna(1.0) >= min_confidence].copy()
    if ticker:
        df = df[df["ticker"] == ticker].copy()
    return df


def get_sentiment_summary(
    window_hours: int = SENTIMENT_WINDOW_HOURS,
    min_confidence: float = 0.0,
) -> pd.DataFrame:
    """Retourne un résumé du sentiment par ticker.

    Utilise une fenêtre glissante adaptative : si aucun article n'est trouvé
    dans `window_hours`, la fenêtre s'élargit automatiquement selon
    SENTIMENT_FALLBACK_WINDOWS (24h → 7j → 30j → tout l'historique).

    Args:
        min_confidence: Exclude articles whose FinBERT confidence is below this
                        threshold before computing pct_bullish/pct_bearish/pct_neutral.
                        Prevents low-confidence neutrals from inflating pct_neutral.
                        Default 0.55. Pass 0.0 to disable filtering.
    """
    df_raw = load_nlp_results()
    if df_raw.empty:
        return pd.DataFrame()

    df = pd.DataFrame()
    # Fenêtre adaptative
    for w in SENTIMENT_FALLBACK_WINDOWS:
        filtered = _filter_by_window(df_raw, w)
        if not filtered.empty:
            # We want at least one record that has some decent FinBERT scores
            # (ignoring purely empty/null placeholders if possible)
            if "score_positive" in filtered.columns and (filtered["score_positive"] > 0).any():
                df = filtered
                break
            if w is None or w == SENTIMENT_FALLBACK_WINDOWS[-1]:
                df = filtered
                break

    if df.empty:
        return pd.DataFrame()

    # Filter out low-confidence predictions to reduce noisy neutrals in aggregation
    if min_confidence > 0 and "confidence" in df.columns:
        df = df[df["confidence"].fillna(1.0) >= min_confidence].copy()

    if df.empty:
        return pd.DataFrame()

    summary = df.groupby("ticker").agg(
        total_mentions=("text", "count"),
        avg_positive=("score_positive", "mean"),
        avg_negative=("score_negative", "mean"),
        avg_neutral=("score_neutral", "mean"),
        pct_bullish=("sentiment", lambda x: (x == "positive").mean() * 100),
        pct_bearish=("sentiment", lambda x: (x == "negative").mean() * 100),
        pct_neutral=("sentiment", lambda x: (x == "neutral").mean() * 100),
    ).round(2).reset_index()

    # Net sentiment derives from bullish/bearish classification percentages
    summary["net_sentiment"] = ((summary["pct_bullish"] - summary["pct_bearish"]) / 100).round(4)
    # Signal strength: how decisive the FinBERT signal is
    summary["signal_strength"] = (1 - summary["pct_neutral"] / 100).round(4)
    summary.sort_values("net_sentiment", ascending=False, inplace=True)

    return summary
