"""
sentiment_history.py – Accumulateur d'historique de sentiment quotidien.

Rôle :
  - Lit nlp_results.jsonl et agrège le net_sentiment par ticker et par jour.
  - Persiste le résultat dans data/sentiment_daily.csv (append-only).
  - Fournit get_dense_sentiment_series() pour obtenir une série temporelle
    dense utilisable par les tests statistiques (Spearman, Granger).

Stratégie de remplissage des lacunes :
  - Forward-fill limité à 3 jours consécutifs (on assume que le sentiment
    reste valide sur une courte période sans nouvelles).
  - Zero-fill au-delà (absence prolongée de news = sentiment neutre).
"""

import json
import logging
import os
import pandas as pd

logger = logging.getLogger(__name__)

# ── Chemins ──────────────────────────────────────────────────────────────────

_SRC_DIR     = os.path.dirname(__file__)
_ANALYTICS   = _SRC_DIR
_ROOT        = os.path.abspath(os.path.join(_SRC_DIR, "..", ".."))
DATA_DIR     = os.path.join(_ROOT, "data")
NLP_FILE     = os.path.join(DATA_DIR, "nlp_results.jsonl")
HISTORY_CSV  = os.path.join(DATA_DIR, "sentiment_4h.csv")


# ── 1. Consolidation quotidienne ─────────────────────────────────────────────

def consolidate_sentiment_history(freq: str = "4h") -> pd.DataFrame:
    """
    Lit nlp_results.jsonl, agrège par (date, ticker), fusionne avec
    l'historique CSV existant et sauvegarde.
    Si freq='H', on agrège par heure.

    Returns: DataFrame avec colonnes [date, ticker, net_sentiment, n_articles, avg_confidence].
    """
    if not os.path.exists(NLP_FILE):
        logger.warning("nlp_results.jsonl introuvable: %s", NLP_FILE)
        return pd.DataFrame()

    rows = []
    with open(NLP_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            ticker = obj.get("ticker", "UNKNOWN").upper()
            if ticker in ("", "UNKNOWN"):
                continue

            # Calcul du net_sentiment
            scores = obj.get("scores", {})
            if scores:
                net = scores.get("positive", 0.0) - scores.get("negative", 0.0)
                conf = max(scores.values()) if scores else 0.0
            else:
                s = obj.get("sentiment", "neutral")
                net = 1.0 if s == "positive" else (-1.0 if s == "negative" else 0.0)
                conf = obj.get("confidence", 0.5)

            created_at = obj.get("created_at")
            if not created_at:
                continue
            try:
                dt = pd.to_datetime(created_at, utc=True).tz_localize(None)
                if freq == "D":
                    dt = dt.normalize()
                else:
                    dt = dt.floor(freq)
                rows.append({"date": dt, "ticker": ticker, "net_sentiment": net, "confidence": float(conf)})
            except Exception:
                continue

    if not rows:
        return _load_existing_history()

    df_new = pd.DataFrame(rows)
    df_agg = (
        df_new
        .groupby(["date", "ticker"])
        .agg(
            net_sentiment=("net_sentiment", "mean"),
            n_articles=("net_sentiment", "count"),
            avg_confidence=("confidence", "mean"),
        )
        .reset_index()
    )

    # Fusionner avec l'historique existant
    df_old = _load_existing_history()
    if not df_old.empty:
        df_combined = pd.concat([df_old, df_agg], ignore_index=True)
        df_combined = (
            df_combined
            .sort_values(["ticker", "date"])
            .drop_duplicates(subset=["date", "ticker"], keep="last")
        )
    else:
        df_combined = df_agg

    df_combined["date"] = pd.to_datetime(df_combined["date"])
    df_combined = df_combined.sort_values(["ticker", "date"]).reset_index(drop=True)

    # Sauvegarde
    os.makedirs(DATA_DIR, exist_ok=True)
    df_combined.to_csv(HISTORY_CSV, index=False)
    logger.info(
        "sentiment_daily.csv mis à jour: %d lignes, %d tickers, %d jours",
        len(df_combined),
        df_combined["ticker"].nunique(),
        df_combined["date"].nunique(),
    )

    return df_combined


def _load_existing_history() -> pd.DataFrame:
    """Charge le CSV d'historique existant ou retourne un DataFrame vide."""
    if not os.path.exists(HISTORY_CSV):
        return pd.DataFrame(columns=["date", "ticker", "net_sentiment", "n_articles", "avg_confidence"])
    try:
        df = pd.read_csv(HISTORY_CSV, parse_dates=["date"])
        return df
    except Exception as e:
        logger.warning("Impossible de lire sentiment_daily.csv: %s", e)
        return pd.DataFrame(columns=["date", "ticker", "net_sentiment", "n_articles", "avg_confidence"])


# ── 2. Série temporelle dense ─────────────────────────────────────────────────

def get_dense_sentiment_series(
    ticker: str,
    min_days: int = 10,
    freq: str = "4h"
) -> pd.Series:
    """
    Retourne une série temporelle dense du net_sentiment pour un
    ticker donné, en remplissant les lacunes intelligemment.

    Args:
        ticker:        Symbole de l'actif (ex: 'AAPL', 'SPY').
        min_days:      Nombre minimum de jours de données réelles requis.
                       Si insuffisant, la série est retournée vide.

    Returns:
        pd.Series indexée par date, valeur = net_sentiment moyenné quotidien.
        Série vide si données insuffisantes.
    """
    if freq == "D":
        df = _load_existing_history()
        if df.empty:
            df = consolidate_sentiment_history(freq="D")
    else:
        rows = []
        if os.path.exists(NLP_FILE):
            with open(NLP_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip(): continue
                    try: obj = json.loads(line)
                    except: continue
                    t = obj.get("ticker", "").upper()
                    if t != ticker.upper(): continue
                    created_at = obj.get("created_at")
                    if not created_at: continue
                    scores = obj.get("scores", {})
                    if scores:
                        net = scores.get("positive", 0.0) - scores.get("negative", 0.0)
                    else:
                        s = obj.get("sentiment", "neutral")
                        net = 1.0 if s == "positive" else (-1.0 if s == "negative" else 0.0)
                    try:
                        dt = pd.to_datetime(created_at, utc=True).tz_localize(None).floor(freq)
                        rows.append({"date": dt, "net_sentiment": net, "ticker": t})
                    except: continue
        if rows:
            df_new = pd.DataFrame(rows)
            df = df_new.groupby(["date", "ticker"]).agg(net_sentiment=("net_sentiment", "mean")).reset_index()
        else:
            df = pd.DataFrame()

    if df.empty:
        return pd.Series(dtype=float, name="net_sentiment")

    ticker_upper = ticker.upper()
    df_t = df[df["ticker"] == ticker_upper].copy()

    if len(df_t) < min_days:
        logger.info(
            "Ticker %s: %d jours disponibles (min=%d) – utilisation directe.",
            ticker_upper, len(df_t), min_days
        )
        if df_t.empty:
            return pd.Series(dtype=float, name="net_sentiment")
        # On retourne quand même ce qu'on a, même si insuffisant
        df_t = df_t.sort_values("date").set_index("date")["net_sentiment"]
        df_t.index = pd.to_datetime(df_t.index)
        return df_t.sort_index()

    df_t = df_t.sort_values("date").set_index("date")["net_sentiment"]
    df_t.index = pd.to_datetime(df_t.index)

    # Créer un index complet pour avoir les bons gaps.
    # Cap at "now" so future zero-filled weekend buckets don't extend the
    # series beyond today and create a visual gap vs the returns line.
    now_floor = pd.Timestamp.utcnow().tz_localize(None).floor(freq)
    series_end = min(df_t.index.max(), now_floor)
    full_idx = pd.date_range(start=df_t.index.min(), end=series_end, freq=freq)
    df_dense = df_t.reindex(full_idx)
    # Forward-fill: 6 periods for 4H (= 24h), 72 units for raw hourly, 3 days for daily
    fill_limit = 6 if freq == "4h" else (72 if freq.lower() == "h" else 3)
    df_dense = df_dense.ffill(limit=fill_limit).fillna(0.0)

    df_dense.name = "net_sentiment"
    df_dense.index.name = "date"

    return df_dense


# ── 3. Statistiques de couverture ─────────────────────────────────────────────

def get_coverage_stats() -> pd.DataFrame:
    """
    Retourne un résumé de la couverture de données par ticker.

    Returns DataFrame avec:
      ticker, n_days (jours réels), first_date, last_date, data_quality
    """
    df = _load_existing_history()
    if df.empty:
        return pd.DataFrame(columns=["ticker", "n_days", "first_date", "last_date", "data_quality"])

    stats = (
        df.groupby("ticker")
        .agg(
            n_days=("date", "count"),
            first_date=("date", "min"),
            last_date=("date", "max"),
            avg_articles=("n_articles", "mean"),
        )
        .reset_index()
        .sort_values("n_days", ascending=False)
    )

    def quality(n):
        if n >= 30:
            return "HIGH"
        elif n >= 10:
            return "MEDIUM"
        else:
            return "LOW"

    stats["data_quality"] = stats["n_days"].apply(quality)
    return stats


# ── 4. Point d'entrée CLI ────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Consolidation de l'historique de sentiment…")
    df = consolidate_sentiment_history()
    print(f"\n✅ {len(df)} entrées consolidées.")

    stats = get_coverage_stats()
    print(f"\n📊 Couverture par ticker ({len(stats)} actifs) :")
    print(stats.to_string(index=False))
