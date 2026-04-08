"""
main_scheduler.py – Planificateur central des tâches automatisées.

Utilise APScheduler pour orchestrer :
  • Collecte Twitter / StockTwits / News   → toutes les 15 minutes
  • Pipeline NLP (analyse de sentiment)    → toutes les heures
  • Agrégation & résumé LLM               → une fois par jour (08h00 UTC)

Le scheduler fonctionne en mode dégradé : si un collecteur ou le pipeline NLP
est indisponible, il log l'erreur et continue les autres tâches normalement.
"""

import logging
import os
import sys
from datetime import datetime, timezone

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Configuration du logging
# ---------------------------------------------------------------------------
LOG_DIR = os.getenv("LOG_DIR", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)-8s %(name)s – %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(LOG_DIR, "scheduler.log"), encoding="utf-8"
        ),
    ],
)
logger = logging.getLogger("scheduler")


# ---------------------------------------------------------------------------
# Fonctions de tâches planifiées
# ---------------------------------------------------------------------------

def job_collect_all():
    """Tâche planifiée : collecte toutes les news via FinViz Elite API."""
    logger.info("═══ DÉBUT - Collecte FinViz Elite ═══")

    try:
        from collectors.finviz_scraper import fetch_finviz_news
        n = fetch_finviz_news()
        logger.info("✓ Collecte FinViz Elite terminée : %d nouveaux articles", n)
    except Exception as exc:
        logger.error("✗ Collecte FinViz échouée : %s", exc, exc_info=True)

    logger.info("═══ FIN - Collecte ═══")


def job_nlp_pipeline():
    """Tâche planifiée : exécute le pipeline NLP sur les textes JSONL non analysés."""
    logger.info("═══ DÉBUT - Pipeline NLP (FinBERT + NER) ═══")
    try:
        from nlp.pipeline import NLPPipeline
        from interface.data_loader import load_news, load_nlp_results
        import json
        import os

        pipeline = NLPPipeline(use_gpu=False, enable_explainability=False)

        # 1. Charger les textes existants et les résultats NLP
        nlp_df = load_nlp_results()
        processed_texts = set()
        if not nlp_df.empty and "text" in nlp_df.columns:
            processed_texts = set(nlp_df["text"].dropna().tolist())

        # 2. Collecter tous les nouveaux textes
        news_df = load_news()

        unprocessed_docs = []
        
        # Helper pour ajouter les docs non traités
        def add_unprocessed(df, text_col, date_col, source_val):
            import pandas as pd
            try:
                # We reuse the FinViz heuristic to map textual data to a ticker
                from collectors.finviz_scraper import _map_title_to_ticker
            except ImportError:
                _map_title_to_ticker = lambda t, c: None

            if df.empty or text_col not in df.columns:
                return
            for _, row in df.iterrows():
                text = row[text_col]
                if pd.isna(text) or not str(text).strip():
                    continue
                text = str(text)
                if text not in processed_texts:
                    ticker = row.get("ticker")
                    # If we don't have a valid ticker, try to map it using heuristics
                    if not ticker or str(ticker).strip().upper() == "UNKNOWN":
                        mapped = _map_title_to_ticker(text, source_val)
                        if mapped:
                            ticker = mapped
                        else:
                            # If we still don't know the ticker, don't run NLP at all
                            continue

                    unprocessed_docs.append({
                        "text": text,
                        "ticker": ticker.upper(),
                        "created_at": str(row.get(date_col, "")),
                        "source": source_val,
                        "url": str(row.get("url", "")),
                    })
                    processed_texts.add(text) # Éviter les doublons dans le même batch

        # Les news ont parfois "text", ou "title" + "description"
        if not news_df.empty:
            if "text" not in news_df.columns:
                news_df["text"] = news_df["title"].fillna("") + " . " + news_df["description"].fillna("")
            add_unprocessed(news_df, "text", "published_at", "news")

        logger.info("Textes non analysés trouvés : %d", len(unprocessed_docs))

        # 3. Traiter par batch et sauvegarder
        if unprocessed_docs:
            BATCH_SIZE = 10
            nlp_results_file = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "data", "nlp_results.jsonl"
            )
            
            from datetime import datetime, timezone
            
            for i in range(0, len(unprocessed_docs), BATCH_SIZE):
                batch_docs = unprocessed_docs[i:i+BATCH_SIZE]
                texts = [doc["text"] for doc in batch_docs]
                logger.info(f"Traitement du lot {i//BATCH_SIZE + 1}/{(len(unprocessed_docs)-1)//BATCH_SIZE + 1} ({len(batch_docs)} textes)...")
                
                results = pipeline.process_batch(texts)
                
                with open(nlp_results_file, "a", encoding="utf-8") as f:
                    for doc, result in zip(batch_docs, results):
                        sentiment_data = result.get("sentiment", {})
                        
                        # Fix labels depending on what the analyzer outputs
                        out_doc = {
                            "text": doc["text"],
                            "ticker": doc["ticker"],
                            "created_at": doc["created_at"],
                            "source": doc["source"],
                            "url": doc.get("url", ""),
                            "sentiment": sentiment_data.get("sentiment", "neutral"),
                            "confidence": sentiment_data.get("confidence", 0),
                            "scores": sentiment_data.get("scores", {"positive":0, "negative":0, "neutral":0}),
                            "entities": result.get("entities", []),
                            "processed_at": datetime.now(timezone.utc).isoformat()
                        }
                        f.write(json.dumps(out_doc) + "\n")

            logger.info("✓ %d nouveaux textes analysés et ajoutés à nlp_results.jsonl", len(unprocessed_docs))

    except Exception as exc:
        logger.error("✗ Pipeline NLP échouée : %s", exc, exc_info=True)

    logger.info("═══ FIN - Pipeline NLP ═══")


def job_consolidate_sentiment():
    """Tâche planifiée : consolide l'historique quotidien de sentiment dans sentiment_daily.csv."""
    logger.info("═══ DÉBUT - Consolidation sentiment_daily.csv ═══")
    try:
        from analytics.sentiment_history import consolidate_sentiment_history
        df = consolidate_sentiment_history(freq="4h")
        logger.info("✔ sentiment_4h.csv mis à jour (%d lignes, %d tickers)",
                    len(df), df["ticker"].nunique() if not df.empty else 0)
    except Exception as exc:
        logger.error("✗ Consolidation sentiment échouée : %s", exc, exc_info=True)
    logger.info("═══ FIN - Consolidation sentiment ═══")


def job_daily_aggregation():
    """Tâche planifiée : agrège les signaux et génère le résumé LLM."""
    logger.info("═══ DÉBUT - Agrégation quotidienne + Résumé LLM ═══")

    try:
        from interface.data_loader import get_sentiment_summary
        summary = get_sentiment_summary()
        logger.info("Agrégation quotidienne effectuée via data_loader. %d actifs résumés.", len(summary))
    except Exception as exc:
        logger.error("✗ Agrégation échouée : %s", exc, exc_info=True)

    # -- Résumé LLM (optionnel, si la clé OpenAI est configurée) --
    try:
        api_key = os.getenv("OPENAI_API_KEY", "")
        if api_key and api_key != "sk-your-openai-key-here":
            from analytics.llm_summarizer import GPTMarketSummarizer
            from interface.data_loader import get_sentiment_summary, load_nlp_results
            summarizer = GPTMarketSummarizer(api_key=api_key)

            summary_df = get_sentiment_summary()
            nlp_df = load_nlp_results()

            # Generate LLM reports for the top 5 most-mentioned assets
            top_assets = summary_df.sort_values("total_mentions", ascending=False).head(5)
            for _, row in top_assets.iterrows():
                asset = row["ticker"]
                sentiment_data = row.to_dict()

                # Fetch real top news for this asset
                top_news = []
                if not nlp_df.empty and "ticker" in nlp_df.columns:
                    asset_news = nlp_df[nlp_df["ticker"].str.upper() == asset.upper()]
                    top_news = asset_news["text"].dropna().head(5).tolist()

                report = summarizer.generate_daily_report(asset, sentiment_data, top_news)
                logger.info("Résumé LLM pour %s : %s", asset, report)
        else:
            logger.info("Clé OPENAI_API_KEY non configurée – résumé LLM ignoré")

    except Exception as exc:
        logger.error("✗ Résumé LLM échoué : %s", exc, exc_info=True)

    logger.info("═══ FIN - Agrégation quotidienne ═══")


def job_live_alerts():
    """Tâche planifiée : détecte les nouveaux signaux et envoie des alertes email."""
    logger.info("═══ DÉBUT - Live Alerts ═══")
    try:
        from analytics.live_alerts import check_signals
        check_signals()
    except Exception as exc:
        logger.error("✗ Live Alerts échouée : %s", exc, exc_info=True)
    logger.info("═══ FIN - Live Alerts ═══")


def job_price_cache_cleanup():
    """
    Tâche planifiée : purge les fichiers de cache prix dont les données
    s'arrêtent à plus de 24 h avant maintenant (stale-end guard proactif).

    Sans ce nettoyage, yfinance peut écrire un cache "récent" (TTL ok) mais
    contenant des données tronquées.  En supprimant ces fichiers toutes les
    4 heures, on force un refetch complet au prochain appel d'endpoint.
    """
    import glob
    from datetime import datetime, timezone, timedelta

    logger.info("═══ DÉBUT - Nettoyage cache prix ═══")
    try:
        data_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "data", "price_cache",
        )
        stale_cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=24)
        removed = 0
        for path in glob.glob(os.path.join(data_dir, "*.json")):
            try:
                import json
                with open(path, "r") as f:
                    cached = json.load(f)
                dates = cached.get("dates", [])
                if not dates:
                    os.remove(path)
                    removed += 1
                    continue
                last_ts = max(datetime.fromisoformat(d) for d in dates)
                if last_ts.tzinfo is None:
                    last_ts = last_ts.replace(tzinfo=timezone.utc)
                if last_ts < stale_cutoff:
                    os.remove(path)
                    removed += 1
                    logger.debug("Cache supprimé (stale-end %s): %s", last_ts.date(), os.path.basename(path))
            except Exception:
                pass  # fichier corrompu ou inaccessible — ignorer
        logger.info("✓ Cache prix nettoyé : %d fichiers stale supprimés", removed)
    except Exception as exc:
        logger.error("✗ Nettoyage cache prix échoué : %s", exc, exc_info=True)
    logger.info("═══ FIN - Nettoyage cache prix ═══")


# ---------------------------------------------------------------------------
# Gestion des événements du scheduler
# ---------------------------------------------------------------------------

def job_listener(event):
    """Écoute les événements du scheduler (succès / erreurs)."""
    if event.exception:
        logger.error(
            "⚠ La tâche '%s' a échoué : %s",
            event.job_id, event.exception
        )
    else:
        logger.info("✓ Tâche '%s' terminée avec succès", event.job_id)


# ---------------------------------------------------------------------------
# Point d'entrée du scheduler
# ---------------------------------------------------------------------------

def start_scheduler():
    """Configure et lance le planificateur APScheduler."""
    scheduler = BlockingScheduler(timezone="UTC")

    # Collecte FinViz Elite toutes les 15 minutes
    scheduler.add_job(
        job_collect_all,
        "interval",
        minutes=15,
        id="collect_all",
        name="Collecte FinViz Elite (All Assets)",
        max_instances=1,
        coalesce=True,
    )

    # Pipeline NLP toutes les 15 minutes
    scheduler.add_job(
        job_nlp_pipeline,
        "interval",
        minutes=15,
        id="nlp_pipeline",
        name="Pipeline NLP FinBERT",
        max_instances=1,
        coalesce=True,
    )

    # Agrégation quotidienne à 08h00 UTC
    scheduler.add_job(
        job_daily_aggregation,
        "cron",
        hour=8,
        minute=0,
        id="daily_aggregation",
        name="Agrégation quotidienne + Résumé LLM",
        max_instances=1,
    )

    # Consolidation de l'historique de sentiment toutes les 4 heures
    scheduler.add_job(
        job_consolidate_sentiment,
        "interval",
        hours=4,
        id="consolidate_sentiment",
        name="Consolidation sentiment_4h.csv",
        max_instances=1,
        coalesce=True,
    )

    # Live alerts toutes les heures (pour vérifier les transitions de signal)
    scheduler.add_job(
        job_live_alerts,
        "interval",
        hours=1,
        id="live_alerts",
        name="Vérification des signaux et alertes email",
        max_instances=1,
    )

    # Nettoyage des caches prix stale toutes les 4 heures
    scheduler.add_job(
        job_price_cache_cleanup,
        "interval",
        hours=4,
        id="price_cache_cleanup",
        name="Nettoyage cache prix stale",
        max_instances=1,
        coalesce=True,
    )

    # Écoute des événements
    scheduler.add_listener(job_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)

    logger.info("╔═══════════════════════════════════════════════════╗")
    logger.info("║  Scheduler démarré – Tâches planifiées :         ║")
    logger.info("║  • Collecte FinViz Elite → toutes les 15 min     ║")
    logger.info("║  • NLP FinBERT           → toutes les 15 min     ║")
    logger.info("║  • Agrégation            → chaque jour 08h00 UTC ║")
    logger.info("║  • Consolidation sent    → chaque jour 08h30 UTC ║")
    logger.info("║  • Live Alerts           → toutes les heures     ║")
    logger.info("║  • Cache prix cleanup    → toutes les 4 heures   ║")
    logger.info("╚═══════════════════════════════════════════════════╝")

    try:
        scheduler.start()
    except KeyboardInterrupt:
        logger.info("Scheduler arrêté par l'utilisateur")
        scheduler.shutdown()


if __name__ == "__main__":
    start_scheduler()
