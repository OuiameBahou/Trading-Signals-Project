"""
ic_analysis.py – Analyse du Coefficient d'Information (IC) des signaux de sentiment.
"""

import logging
from typing import Dict, Any, List
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

def compute_ic(sentiment_ts: pd.Series, returns_ts: pd.Series, window: int = 42) -> Dict[str, Any]:
    """
    Calcule le Coefficient d'Information (IC) et l'ICIR (Information Ratio).
    IC = Corrélation de Spearman (roulante) entre le sentiment et les rendements futurs à 1 jour.
    
    Args:
        sentiment_ts: pd.Series du sentiment net quotidien
        returns_ts: pd.Series des rendements quotidiens
        window: Fenêtre glissante pour l'IC (défaut = 20 jours)
        
    Returns:
        Dict contenant la série temporelle IC, la moyenne IC, et l'ICIR.
    """
    if sentiment_ts.empty or returns_ts.empty:
        return {"error": "Séries temporelles vides"}

    # On aligne le sentiment décalé de 1 jour avec les rendements
    aligned = pd.concat(
        [sentiment_ts.shift(1).rename("sentiment"), returns_ts.rename("returns")],
        axis=1,
    ).dropna()
    
    if len(aligned) < window + 5:
        return {"error": "Pas assez de données pour une analyse IC significative"}

    # Calcul de la corrélation de Spearman roulante
    ic_series = aligned["sentiment"].rolling(window=window).corr(aligned["returns"], method="spearman").dropna()
    
    if ic_series.empty:
        return {"error": "Impossible de calculer l'IC"}

    mean_ic = float(ic_series.mean())
    std_ic = float(ic_series.std())
    
    if std_ic < 1e-6:
        icir = 0.0
    else:
        # Information Ratio = Mean / Std
        icir = mean_ic / std_ic

    # Conversion p_value / resultats en format affichable
    ic_chart = [
        {"date": str(d.date()) if hasattr(d, "date") else str(d), "value": round(float(v), 4)}
        for d, v in ic_series.items()
        if not np.isnan(v)
    ]
    
    return {
        "mean_ic": round(float(mean_ic), 4),
        "icir": round(float(icir), 4),
        "ic_ts": ic_chart,
        "n_obs": len(ic_series)
    }

def run_ic_analysis(ticker: str) -> Dict[str, Any]:
    """Lance l'analyse de l'Information Coefficient pour un actif."""
    from analytics.correlation import fetch_price_data, build_sentiment_timeseries
    try:
        from analytics.sentiment_history import get_dense_sentiment_series
        sentiment_ts = get_dense_sentiment_series(ticker, min_days=5, freq="4h")
    except Exception:
        sentiment_ts = build_sentiment_timeseries(ticker)

    start_date = sentiment_ts.index.min().strftime("%Y-%m-%d") if not sentiment_ts.empty else None
    price_ts = fetch_price_data(ticker, start=start_date, interval="1h")
    
    if sentiment_ts.empty or price_ts.empty:
        return {"error": "Données insuffisantes pour l'analyse IC"}
        
    result = compute_ic(sentiment_ts, price_ts)
    result["ticker"] = ticker.upper()
    return result
