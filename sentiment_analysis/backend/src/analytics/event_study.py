"""
event_study.py – Méthodologie d'étude d'événements (Event Study).

Analyse la réaction des prix autour d'extrêmes de sentiment.
Fenêtre standard : [-3 jours, +5 jours].
Calcule le Rendement Anormal Moyen (AAR) et le Rendement Anormal Cumulé (CAAR).
"""

import logging
from typing import Dict, Any, List
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

def run_event_study(sentiment_ts: pd.Series, returns_ts: pd.Series, threshold_sigma: float = 1.5, window_before: int = 6, window_after: int = 12) -> Dict[str, Any]:
    """
    Identifie les "événements" (sentiment extrême) et calcule AAR / CAAR.
    
    Args:
        sentiment_ts: pd.Series du net_sentiment
        returns_ts: pd.Series des log-returns quotidiens
        threshold_sigma: L'événement est déclenché si |sentiment - μ| > threshold_sigma * σ
        
    Returns:
        Dict contenant les courbes CAAR, événements identifiés, etc.
    """
    if sentiment_ts.empty or returns_ts.empty:
        return {"error": "Séries temporelles vides"}

    # Alignement (sans décalage car on veut observer t-3 à t+5 AUTOUR du jour t de l'événement)
    aligned = pd.concat(
        [sentiment_ts.rename("sentiment"), returns_ts.rename("returns")],
        axis=1,
    ).dropna()
    
    if len(aligned) < 30:
        return {"error": "Pas assez de données pour l'Event Study"}

    mu = float(aligned["sentiment"].mean())
    sigma = float(aligned["sentiment"].std())
    if sigma < 1e-6:
        return {"error": "Variance du sentiment trop faible"}

    upper_bound = mu + threshold_sigma * sigma
    lower_bound = mu - threshold_sigma * sigma

    # Identifier les événements haussiers et baissiers
    events_up = aligned[aligned["sentiment"] > upper_bound].index
    events_down = aligned[aligned["sentiment"] < lower_bound].index

    def compute_caar_for_events(event_dates, returns_series, direction="UP"):
        event_windows = []
        for d in event_dates:
            pos = returns_series.index.get_loc(d)
            start = pos - window_before
            end = pos + window_after + 1
            if start >= 0 and end <= len(returns_series):
                window_rets = returns_series.iloc[start:end].values
                # Si l'event est down, on inverse les retours espérés pour symétrie du CAAR
                if direction == "DOWN":
                    window_rets = -window_rets
                event_windows.append(window_rets)
                
        if not event_windows:
            return [], []
            
        matrix = np.vstack(event_windows)
        aar = matrix.mean(axis=0)  # Average Abnormal Return
        caar = aar.cumsum()        # Cumulative Average Abnormal Return
        return aar.tolist(), caar.tolist()

    aar_up, caar_up = compute_caar_for_events(events_up, aligned["returns"], "UP")
    aar_down, caar_down = compute_caar_for_events(events_down, aligned["returns"], "DOWN")

    # Combine all events (direction adjusted)
    all_events_windows = []
    
    for d in events_up:
        pos = aligned.index.get_loc(d)
        start = pos - window_before
        end = pos + window_after + 1
        if start >= 0 and end <= len(aligned):
            all_events_windows.append(aligned["returns"].iloc[start:end].values)
            
    for d in events_down:
        pos = aligned.index.get_loc(d)
        start = pos - window_before
        end = pos + window_after + 1
        if start >= 0 and end <= len(aligned):
            all_events_windows.append(-aligned["returns"].iloc[start:end].values)

    if not all_events_windows:
         return {"error": "Aucun événement valide avec fenêtre complète."}
         
    matrix_all = np.vstack(all_events_windows)
    aar_all = matrix_all.mean(axis=0)
    caar_all = aar_all.cumsum()
    
    days = list(range(-window_before, window_after + 1))
    
    caar_chart = [{"day": d, "value": round(float(v), 4)} for d, v in zip(days, caar_all)]

    return {
        "n_events": len(all_events_windows),
        "n_events_up": len(events_up),
        "n_events_down": len(events_down),
        "caar_chart": caar_chart,
        "caar_final": round(float(caar_all[-1]), 4),
        "window": f"[-{window_before}, +{window_after}]",
    }


def analyze_ticker_events(ticker: str) -> Dict[str, Any]:
    """Point d'entrée pour l'API."""
    from analytics.correlation import fetch_price_data, build_sentiment_timeseries
    try:
        from analytics.sentiment_history import get_dense_sentiment_series
        sentiment_ts = get_dense_sentiment_series(ticker, min_days=5)
    except Exception:
        sentiment_ts = build_sentiment_timeseries(ticker)
        
    start_date = sentiment_ts.index.min().strftime("%Y-%m-%d") if not sentiment_ts.empty else None
    price_ts = fetch_price_data(ticker, start=start_date)
    
    result = run_event_study(sentiment_ts, price_ts)
    result["ticker"] = ticker.upper()
    return result
