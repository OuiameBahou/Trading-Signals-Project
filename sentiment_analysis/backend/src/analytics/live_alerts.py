"""
live_alerts.py – Script de notification en temps réel pour les signaux de trading.
"""

import os
import json
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)-8s %(name)s – %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
STATE_FILE = os.path.join(DATA_DIR, "last_signals_state.json")

# Tickers par défaut à surveiller (à adapter selon les besoins)
TARGET_TICKERS = ["AAPL", "TSLA", "GOLD", "WTI", "EURUSD", "BTCUSD"]

def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Impossible de charger l'état précédent : {e}")
        return {}

def save_state(state):
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f, indent=4)
    except Exception as e:
        logger.error(f"Impossible de sauvegarder l'état : {e}")

def send_email_alert(ticker, new_signal, net_sentiment):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT", "587")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    email_from = os.getenv("ALERT_EMAIL_FROM", smtp_user)
    email_to = os.getenv("ALERT_EMAIL_TO")

    subject = f"🚨 Alerte Trading : {ticker} en {new_signal}"
    body = f"Le signal pour l'actif {ticker} est passé à {new_signal}.\nScore de sentiment net actuel : {net_sentiment:.4f}\n\nL'équipe Market Intelligence."

    if not all([smtp_host, smtp_user, smtp_pass, email_to]):
        logger.info(f"Notification ignorée (configuration SMTP manquante). Email simulé :\nSujet: {subject}\nCorps : {body}")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = email_from
        msg['To'] = email_to
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain', 'utf-8'))

        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Email d'alerte envoyé avec succès pour {ticker}.")
    except Exception as e:
        logger.error(f"Échec de l'envoi de l'email via SMTP : {e}")

def check_signals(tickers=None):
    """
    Monitor sentiment extremes and fire email alerts on significant transitions.

    Uses raw net_sentiment from the data layer directly (no signal generation).
    An alert fires when sentiment crosses the ±0.3 threshold for the first time.
    """
    from interface.data_loader import get_sentiment_summary

    tickers = tickers or TARGET_TICKERS
    logger.info(f"Vérification du sentiment pour {len(tickers)} actifs...")

    state = load_state()
    new_state = state.copy()

    try:
        summary_df = get_sentiment_summary()
    except Exception as e:
        logger.error(f"Impossible de charger le résumé sentiment : {e}")
        return

    for ticker in tickers:
        try:
            row = summary_df[summary_df["ticker"].str.upper() == ticker.upper()]
            if row.empty:
                continue

            net_sentiment = float(row.iloc[0].get("net_sentiment", 0.0) or 0.0)

            # Classify into simple sentiment state
            if net_sentiment > 0.3:
                current_state = "Sentiment Positif Fort"
            elif net_sentiment < -0.3:
                current_state = "Sentiment Négatif Fort"
            else:
                current_state = "Sentiment Neutre"

            prev_state = state.get(ticker, {}).get("signal", "Sentiment Neutre")

            new_state[ticker] = {
                "signal": current_state,
                "net_sentiment": net_sentiment,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            if current_state != prev_state and current_state != "Sentiment Neutre":
                logger.warning(
                    f"TRANSITION SENTIMENT : {ticker} {prev_state} → {current_state} "
                    f"(net={net_sentiment:.4f})"
                )
                send_email_alert(ticker, current_state, net_sentiment)

        except Exception as e:
            logger.error(f"Erreur lors de la vérification de {ticker} : {e}")

    save_state(new_state)
    logger.info("Vérification terminée.")

if __name__ == "__main__":
    check_signals()
