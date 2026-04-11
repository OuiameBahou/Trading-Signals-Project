"""
main.py – Point d'entrée unique de la plateforme.

Lance les différents services selon l'argument passé :
  • scheduler  → Démarre le planificateur APScheduler
  • web        → Lance l'API FastAPI et le serveur Web (UI)
  • collect    → Exécute une collecte manuelle unique
  • nlp        → Exécute le pipeline NLP une fois

Exemples :
  python main.py scheduler
  python main.py web
  python main.py collect
  python main.py nlp
"""

import argparse
import logging
import os
import sys


from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)-8s %(name)s – %(message)s",
)
logger = logging.getLogger("main")


# Absolute path so this works regardless of CWD when the script is launched
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_SRC_PATH = os.path.join(_BASE_DIR, "src")
if _SRC_PATH not in sys.path:
    sys.path.insert(0, _SRC_PATH)

def cmd_scheduler():
    """Démarre le scheduler (APScheduler) en mode bloquant."""
    logger.info("Démarrage du scheduler…")
    from scheduler.main_scheduler import start_scheduler
    start_scheduler()

def cmd_web():
    """Lance l'API FastAPI et l'interface Web via Uvicorn."""
    logger.info("Lancement de l'API web et du frontend HTML/JS…")
    import uvicorn
    uvicorn.run("interface.api:app", host="0.0.0.0", port=8002, reload=False)



def cmd_collect():
    """Exécute une collecte manuelle unique (tous les collecteurs)."""
    logger.info("Collecte manuelle en cours…")
    from scheduler.main_scheduler import job_collect_all
    job_collect_all()


def cmd_collect_fx():
    """Exécute une collecte FX dédiée (RSS + ForexFactory + Investing.com)."""
    logger.info("Collecte FX dédiée en cours…")
    from collectors.fx_collector import fetch_fx_news, get_fx_coverage_stats
    n = fetch_fx_news()
    logger.info("Collecte FX terminée : %d nouveaux articles", n)
    stats = get_fx_coverage_stats()
    logger.info("Couverture FX par paire :")
    for ticker, count in sorted(stats.items(), key=lambda x: -x[1]):
        if count > 0:
            logger.info("  %-8s : %d articles", ticker, count)


def cmd_nlp():
    """Exécute le pipeline NLP une seule fois."""
    logger.info("Pipeline NLP en mode manuel…")
    from scheduler.main_scheduler import job_nlp_pipeline
    job_nlp_pipeline()


def cmd_aggregate():
    """Exécute l'agrégation quotidienne une seule fois."""
    logger.info("Agrégation manuelle en cours…")
    from scheduler.main_scheduler import job_daily_aggregation
    job_daily_aggregation()


def cmd_consolidate():
    """Exécute la consolidation du sentiment_daily.csv une seule fois."""
    logger.info("Consolidation de sentiment_daily.csv en cours…")
    from scheduler.main_scheduler import job_consolidate_sentiment
    job_consolidate_sentiment()


def main():
    parser = argparse.ArgumentParser(
        description="Market Intelligence Platform – Point d'entrée principal"
    )
    parser.add_argument(
        "command",
        choices=["scheduler", "web", "collect", "collect_fx", "nlp", "aggregate", "consolidate"],
        help=(
            "Service à lancer : "
            "scheduler (planificateur), "
            "web (API et UI HTML/JS), "
            "collect (collecte manuelle tous actifs), "
            "collect_fx (collecte FX dédiée : RSS + ForexFactory + Investing.com), "
            "nlp (pipeline NLP manuel), "
            "aggregate (agrégation manuelle)"
        ),
    )
    args = parser.parse_args()

    commands = {
        "scheduler": cmd_scheduler,
        "web": cmd_web,
        "collect": cmd_collect,
        "collect_fx": cmd_collect_fx,
        "nlp": cmd_nlp,
        "aggregate": cmd_aggregate,
        "consolidate": cmd_consolidate,
    }

    try:
        commands[args.command]()
    except KeyboardInterrupt:
        logger.info("Arrêt demandé par l'utilisateur")
    except Exception as exc:
        logger.error("Erreur fatale : %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
