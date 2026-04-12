import os
import sys
import json
import logging
import math
from datetime import datetime, timedelta

# Ensure the project's src/ directory is always on sys.path regardless of
# how uvicorn imports this module (relative vs absolute paths in sys.path).
_SRC_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import urllib.parse

from interface.data_loader import (
    get_sentiment_summary,
    load_nlp_results,
    SENTIMENT_FALLBACK_WINDOWS,
)
from analytics.llm_summarizer import GPTMarketSummarizer
from analytics.headline_synthesizer import build_synthesized_headlines
from nlp.impact_scorer import get_top_headlines
from collectors.finviz_scraper import fetch_live_headlines
from nlp.preprocessor import FinancialPreprocessor

logger = logging.getLogger("api")


def _align_series(sentiment_ts, returns_ts):
    """
    Trim both series to start from the first date that has real (non-zero)
    sentiment data. This removes the leading gap where price history exists
    but no news has been processed yet, which would otherwise distort every
    statistical test with a flat-zero segment.

    End dates are intentionally left unmodified — the two series may stop at
    different dates (price often lags sentiment by a day or two). Callers that
    need a strict intersection (TE stats) must apply their own dropna();
    callers that build chart series should use the asymmetric ranges as-is so
    that the sentiment line correctly extends past the price line on the chart.
    """
    import pandas as pd
    real_data = sentiment_ts[sentiment_ts != 0]
    if real_data.empty:
        return sentiment_ts, returns_ts
    real_start = real_data.index.min()
    return (
        sentiment_ts[sentiment_ts.index >= real_start],
        returns_ts[returns_ts.index >= real_start],
    )

# ── FinBERT singleton ──────────────────────────────────────────────────────────────
# FinBERT is loaded once at module import time so the first /api/headlines
# call doesn’t incur the weight-loading overhead.
_preprocessor: Optional[FinancialPreprocessor] = None
_finbert = None  # SentimentAnalyzer instance


def _get_finbert():
    """Lazy singleton for SentimentAnalyzer (FinBERT)."""
    global _finbert, _preprocessor
    if _finbert is None:
        try:
            from nlp.sentiment_analyzer import SentimentAnalyzer
            _finbert = SentimentAnalyzer(use_gpu=False)
            _preprocessor = FinancialPreprocessor()
            logger.info("FinBERT singleton initialised successfully.")
        except Exception as exc:
            logger.error("Failed to load FinBERT: %s", exc)
            _finbert = None
    return _finbert


def _enrich_with_finbert(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Batch-analyse a list of article dicts with FinBERT and patch each dict
    in-place with 'sentiment', 'confidence', and 'scores' fields.

    Articles whose text is empty are left unchanged (they will be filtered
    downstream by get_top_headlines).

    Returns the same list (mutated) for convenience.
    """
    finbert = _get_finbert()
    if finbert is None:
        logger.warning("FinBERT unavailable – articles will have no sentiment scores.")
        return rows

    prep  = _preprocessor or FinancialPreprocessor()
    texts = [prep.clean_text(str(r.get("text", "") or "")) for r in rows]

    try:
        results = finbert.analyze_batch(texts)
    except Exception as exc:
        logger.error("FinBERT batch inference failed: %s", exc)
        return rows

    for row, res in zip(rows, results):
        row["sentiment"]  = res["sentiment"]
        row["confidence"] = res["confidence"]
        row["scores"]     = res["scores"]

    return rows

# ── Asset Classification Map ──────────────────────────────────────────────────
ASSET_TYPE_MAP = {
    # ── FOREX ──
    "EUR/USD": "Forex", "GBP/USD": "Forex", "USD/CAD": "Forex",
    "USD/MAD": "Forex", "EUR/MAD": "Forex", "USD/EGP": "Forex",
    "EURUSD": "Forex", "GBPUSD": "Forex", "USDCAD": "Forex",
    "USDJPY": "Forex", "USDCHF": "Forex", "AUDUSD": "Forex",
    "NZDUSD": "Forex", "USDZAR": "Forex", "USDEGP": "Forex",
    "DXY": "Forex",
    # ── COMMODITIES ──
    "GOLD": "Commodity", "SILVER": "Commodity", 
    "WTI": "Commodity", 
    "BNO": "Commodity", "BRENT": "Commodity", "BRN": "Commodity", "BZ=F": "Commodity",
    # ── BONDS / RATES ──
    "US10Y": "Bond", "US30Y": "Bond", "DE10Y": "Bond",
    "SHY": "Bond", "IEF": "Bond", "TLT": "Bond",
    "VGSH": "Bond", "BUND": "Bond", "OAT": "Bond",
    "EMB": "Bond", "RSX": "Bond",
    # ── EQUITY ETFs ── (keep as Stock)
    "SPY": "Stock", "QQQ": "Stock", "XLF": "Stock",
    # Default = Stock for all remaining equities
}

def get_asset_type(ticker: str) -> str:
    return ASSET_TYPE_MAP.get(ticker.upper(), "Stock")

app = FastAPI(title="Market Intelligence Platform")


# ── CORS (allow Next.js dev server and production frontend) ────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:5173",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Paths for static and template files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR, html=False), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

@app.get("/", response_class=HTMLResponse)
def read_home(request: Request):
    """Serve the homepage (Headlines du Marché)."""
    return templates.TemplateResponse("home.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
def read_dashboard(request: Request):
    """Serve the detailed market dashboard (Vue Marché)."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/summary", response_class=JSONResponse)
def api_summary():
    """Return the general sentiment summary for all available tickers."""
    try:
        df_summary = get_sentiment_summary()
        records = []
        if not df_summary.empty:
            df_summary = df_summary.where(df_summary.notnull(), None)
            records = json.loads(df_summary.to_json(orient="records"))
            
        # Normalize found tickers for matching (remove /)
        # We keep a mapping of normalized -> original record
        norm_records = {rec["ticker"].upper().replace("/", ""): rec for rec in records}

        final_records = []
        found_normalized = set()

        # Step 1: Process ASSET_TYPE_MAP (our primary list)
        for ticker in ASSET_TYPE_MAP.keys():
            norm_ticker = ticker.upper().replace("/", "")
            
            if norm_ticker in found_normalized:
                continue # Skip if already processed an equivalent ticker
                
            if norm_ticker in norm_records:
                rec = norm_records[norm_ticker]
                # Update ticker name if it was different
                rec["ticker"] = ticker
                final_records.append(rec)
                found_normalized.add(norm_ticker)
            else:
                final_records.append({
                    "ticker": ticker,
                    "total_mentions": 0,
                    "net_sentiment": 0.0,
                    "pct_bullish": 0.0,
                    "pct_bearish": 0.0,
                    "pct_neutral": 0.0,
                    "signal_strength": 0.0,
                    "avg_positive": 0.0,
                    "avg_negative": 0.0,
                    "avg_neutral": 0.0,
                    "asset_type": get_asset_type(ticker)
                })

        # Step 2: Add any extra tickers found in data but not in map
        for norm_ticker, rec in norm_records.items():
            if norm_ticker not in found_normalized:
                rec["asset_type"] = get_asset_type(rec["ticker"])
                final_records.append(rec)

        # Add asset_class field to every record (same value as asset_type, for frontend grouping)
        ASSET_CLASS_ORDER = ["Stock", "Forex", "Commodity", "Bond"]
        for rec in final_records:
            rec["asset_class"] = rec.get("asset_type") or get_asset_type(rec["ticker"])

        # Sort: group by asset class first, then by observation count desc, then net_sentiment desc
        final_records.sort(key=lambda x: (
            ASSET_CLASS_ORDER.index(x.get("asset_class", "Stock"))
            if x.get("asset_class") in ASSET_CLASS_ORDER else 99,
            -(x.get("total_mentions") or 0),
            -(x.get("net_sentiment") or 0.0),
        ))
        return final_records
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/headlines", response_class=JSONResponse)
def api_headlines():
    """Retourne les headlines les plus impactantes, déduplicées et synthétisées par LLM.

    Flux :
      1. Récupère les articles live depuis FinViz.
      2. Analyse FinBERT en batch pour les scores de sentiment.
      3. Calcule le Score d'Impact AHP pour chaque article.
      4. Regroupe les articles similaires via TF-IDF + cosine similarity.
      5. Synthétise chaque cluster en une headline via GPT-4o (un seul appel batch).
      6. Retourne les headlines triées par score d'impact décroissant,
         avec la liste des sources originales ({name, url}) par headline.

    Fallback : si FinViz est indisponible, utilise nlp_results.jsonl.
    Si GPT-4o échoue, la meilleure headline brute du cluster est utilisée.
    """
    try:
        # ─ Étape 1 : Récupération live ─────────────────────────────────────
        try:
            live_rows = fetch_live_headlines(max_articles=150)
            logger.info("Headlines: %d live articles fetched from FinViz", len(live_rows))
        except Exception as e1:
            logger.error("Headlines step1 (fetch) failed: %s", e1, exc_info=True)
            live_rows = []

        if live_rows:
            # ─ Étape 2 : Analyse FinBERT (batch) ───────────────────────────
            try:
                logger.info("Headlines: running FinBERT on %d articles...", len(live_rows))
                live_rows = _enrich_with_finbert(live_rows)
                logger.info("Headlines: FinBERT done, enriched %d rows", len(live_rows))
            except Exception as e2:
                logger.error("Headlines step2 (FinBERT) failed: %s", e2, exc_info=True)

            # ─ Étape 3 : Scoring AHP ─────────────────────────────────────
            try:
                scored = get_top_headlines(live_rows, n=80)
                logger.info("Headlines: %d headlines after AHP scoring", len(scored))
            except Exception as e3:
                logger.error("Headlines step3 (scoring) failed: %s", e3, exc_info=True)
                return []

            # ─ Étape 4 & 5 : Clustering + Synthèse LLM ───────────────────
            try:
                result = build_synthesized_headlines(scored)
                logger.info("Headlines: %d synthesized clusters returned", len(result))
                return result
            except Exception as e4:
                logger.error("Headlines step4 (synthesis) failed: %s", e4, exc_info=True)
                return scored  # fallback to raw scored list

        # ─ Fallback : nlp_results.jsonl (déjà analysé par FinBERT) ────────
        logger.warning("Headlines: FinViz returned nothing, falling back to nlp_results.jsonl")
        try:
            nlp_df = load_nlp_results()
            if nlp_df.empty:
                return []
            rows = nlp_df.to_dict(orient="records")

            # Enrich rows with URL from news.jsonl (joined by text) to populate sources
            try:
                from interface.data_loader import _load_jsonl
                news_docs = _load_jsonl("news.jsonl")
                url_by_text = {d.get("text", d.get("title", "")): d.get("url", "") for d in news_docs if d.get("url")}
                src_by_text = {d.get("text", d.get("title", "")): d.get("source", "") for d in news_docs if d.get("url")}
                for row in rows:
                    if not row.get("url"):
                        t = row.get("text", "")
                        row["url"] = url_by_text.get(t, "")
                        if not row.get("source") or row.get("source") in ("news", ""):
                            row["source"] = src_by_text.get(t, row.get("source", ""))
            except Exception as e_enrich:
                logger.warning("URL enrichment from news.jsonl failed: %s", e_enrich)

            scored = get_top_headlines(rows, n=80)
            result = build_synthesized_headlines(scored)
            return result
        except Exception as e5:
            logger.error("Headlines fallback failed: %s", e5, exc_info=True)
            return []

    except Exception as e:
        logger.error("Error computing headlines: %s", e, exc_info=True)
        return []

@app.get("/api/tickers", response_class=JSONResponse)
async def api_tickers():
    """Return tickers sorted by observation count (descending), with n_obs and asset_type."""
    try:
        df_summary = get_sentiment_summary()

        # Build observation-count lookup: normalised_ticker -> n_obs
        obs_map: dict = {}
        if not df_summary.empty:
            for _, row in df_summary.iterrows():
                norm = str(row["ticker"]).upper().replace("/", "")
                obs_map[norm] = int(row.get("total_mentions", 0) or 0)

        # Union of known tickers + data-discovered tickers
        all_tickers: set = set(ASSET_TYPE_MAP.keys())
        if not df_summary.empty:
            all_tickers.update(df_summary["ticker"].dropna().tolist())

        result = []
        seen_norm: set = set()
        for t in all_tickers:
            norm = t.upper().replace("/", "")
            if norm in seen_norm:
                continue
            seen_norm.add(norm)
            result.append({
                "ticker": t,
                "asset_type": get_asset_type(t),
                "n_obs": obs_map.get(norm, 0),
            })

        # Sort by n_obs descending, then ticker name ascending as tiebreaker
        result.sort(key=lambda x: (-x["n_obs"], x["ticker"]))
        return result
    except Exception as e:
        logger.error(f"Error getting tickers: {e}")
        return [
            {"ticker": t, "asset_type": get_asset_type(t), "n_obs": 0}
            for t in sorted(ASSET_TYPE_MAP.keys())
        ]

@app.get("/api/top_tweets/{ticker:path}", response_class=JSONResponse)
async def api_top_tweets(ticker: str):
    """Return top 4-5 news/tweets for a specific ticker to justify its sentiment.
    
    Only articles from the last SENTIMENT_WINDOW_HOURS hours are considered,
    consistent with the percentages displayed in the Vue de Marché.
    """
    try:
        ticker = urllib.parse.unquote(ticker)
        
        nlp_df = load_nlp_results()
        if nlp_df.empty:
            return []

        # ── Filtrage temporel adaptatif : cohérent avec get_sentiment_summary ──
        # Essaie 24h d'abord, élargit progressivement si vide (7j, 30j, tout)
        if "created_at" in nlp_df.columns:
            from datetime import datetime, timezone, timedelta
            for w in SENTIMENT_FALLBACK_WINDOWS:
                if w is None:
                    break  # pas de filtre, on garde tout
                cutoff = datetime.now(timezone.utc) - timedelta(hours=w)
                if not nlp_df[nlp_df["created_at"] >= cutoff].empty:
                    nlp_df = nlp_df[nlp_df["created_at"] >= cutoff]
                    break

        # Case-insensitive ticker match
        ticker_data = nlp_df[nlp_df["ticker"].str.upper() == ticker.upper()].copy()
        if ticker_data.empty:
            return []

        # Ensure score columns exist with safe defaults
        for col in ["score_positive", "score_negative", "score_neutral"]:
            if col not in ticker_data.columns:
                ticker_data[col] = 0.0
            ticker_data[col] = ticker_data[col].fillna(0.0)

        # Determine dominant direction
        summary_df = get_sentiment_summary()
        net_sentiment = 0.0
        if not summary_df.empty:
            ts = summary_df[summary_df["ticker"].str.upper() == ticker.upper()]
            if not ts.empty:
                net_sentiment = float(ts.iloc[0].get("net_sentiment", 0) or 0)
        
        # Sort messages based on dominant sentiment direction
        sort_col = "score_positive" if net_sentiment >= 0 else "score_negative"
        sorted_data = ticker_data.sort_values(by=sort_col, ascending=False).head(5)
        
        result = []
        for _, row in sorted_data.iterrows():
            result.append({
                "source": str(row.get("source", "news")),
                "text": str(row.get("text", "")),
                "sentiment": str(row.get("sentiment", "neutral")),
                "score": float(row.get(sort_col, 0) or 0),
                "score_positive": float(row.get("score_positive", 0) or 0),
                "score_negative": float(row.get("score_negative", 0) or 0),
                "score_neutral": float(row.get("score_neutral", 0) or 0),
                "date": str(row.get("created_at", ""))
            })
            
        return result
    except Exception as e:
        logger.error(f"Error getting top tweets for {ticker}: {e}", exc_info=True)
        return []  # Return empty list instead of 500 to avoid dashboard crash

@app.get("/api/llm_report/{ticker:path}", response_class=JSONResponse)
async def api_llm_report(ticker: str):
    """Generate or retrieve LLM report for a specific ticker."""
    try:
        ticker = urllib.parse.unquote(ticker)
        
        summary_df = get_sentiment_summary()
        if summary_df.empty:
            return {"error": "No data available"}
            
        ticker_summary = summary_df[summary_df["ticker"] == ticker]
        if ticker_summary.empty:
            return {"error": f"No data for ticker {ticker}"}
            
        sentiment_data = ticker_summary.iloc[0].to_dict()
        
        # Get top news/tweets to feed the LLM
        tweets_data = await api_top_tweets(ticker)
        top_news = [t["text"] for t in tweets_data]
        
        summarizer = GPTMarketSummarizer()
        report = summarizer.generate_daily_report(ticker, sentiment_data, top_news)
        
        return report
    except Exception as e:
        logger.error(f"Error generating LLM report for {ticker}: {e}")
        return {"error": str(e)}


@app.get("/signals", response_class=HTMLResponse)
def read_signals(request: Request):
    """Serve the Sentiment-Price Correlation Analysis page."""
    return templates.TemplateResponse("signals.html", {"request": request})

def clean_nans(obj):
    """Recursively replaces float('nan') and math.inf with None for valid JSON serialization."""
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


@app.get("/api/te_analysis/{ticker:path}", response_class=JSONResponse)
async def api_te_analysis(ticker: str):
    """
    Transfer Entropy analysis — directed information flow from sentiment to price.

    Returns TE lag profile (both S→R and R→S), optimal lag, significance,
    directionality score, and the aligned sentiment / returns time series
    for charting.
    """
    try:
        ticker = urllib.parse.unquote(ticker).upper()
        import pandas as pd
        from analytics.correlation import (
            fetch_price_data,
            build_sentiment_timeseries,
            build_chart_series,
        )
        from analytics.transfer_entropy import run_transfer_entropy_analysis

        # ── Sentiment series ──────────────────────────────────────────
        n_real_days = 0
        data_quality = "LOW"
        try:
            from analytics.sentiment_history import (
                get_dense_sentiment_series,
                get_coverage_stats,
            )
            sentiment_ts = get_dense_sentiment_series(ticker, min_days=5, freq="4h")
            stats = get_coverage_stats()
            ts_row = stats[stats["ticker"] == ticker]
            if not ts_row.empty:
                n_real_days  = int(ts_row["n_days"].iloc[0])
                data_quality = str(ts_row["data_quality"].iloc[0])
            else:
                n_real_days  = len(sentiment_ts)
                data_quality = ("HIGH" if n_real_days >= 30
                                else "MEDIUM" if n_real_days >= 10 else "LOW")
        except Exception as _e:
            logger.warning("Fallback to build_sentiment_timeseries: %s", _e)
            sentiment_ts = build_sentiment_timeseries(ticker)
            n_real_days  = len(sentiment_ts)
            data_quality = ("HIGH" if n_real_days >= 30
                            else "MEDIUM" if n_real_days >= 10 else "LOW")

        # ── Price series ──────────────────────────────────────────────
        # Cap the look-back at 90 days so Polygon forex pairs (which have
        # 24/5 continuous bars) never require multi-page pagination.
        if not sentiment_ts.empty:
            sentiment_start = sentiment_ts.index.min().strftime("%Y-%m-%d")
            max_lookback = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
            start_date = max(sentiment_start, max_lookback)
        else:
            start_date = None
        returns_ts = fetch_price_data(ticker, start=start_date, interval="1h")

        if sentiment_ts.empty or returns_ts.empty:
            return JSONResponse(
                status_code=400,
                content={"error": f"No data available for {ticker}"},
            )

        # ── Align: trim to first date with real (non-zero) sentiment ──
        sentiment_ts, returns_ts = _align_series(sentiment_ts, returns_ts)

        # ── Transfer Entropy (primary analysis) ───────────────────────
        te_result = run_transfer_entropy_analysis(sentiment_ts, returns_ts)

        # ── Chart series ──────────────────────────────────────────────
        sentiment_chart, returns_chart = build_chart_series(sentiment_ts, returns_ts)

        return clean_nans({
            "ticker": ticker,
            "n_real_days": int(n_real_days),
            "data_quality": data_quality,
            "te_analysis": te_result,
            "sentiment_ts": sentiment_chart,
            "returns_ts":   returns_chart,
        })
    except Exception as e:
        logger.error("Erreur /api/te_analysis/%s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/backtest/{ticker:path}", response_class=JSONResponse)
async def api_backtest(ticker: str):
    """
    Sentiment-Threshold Momentum Backtest.

    Strategy:
      - Daily signal derived from a 3-day rolling mean of the 4h sentiment series.
      - LONG  (+1) when rolling sentiment > +0.12
      - SHORT (-1) when rolling sentiment < -0.12
      - FLAT  ( 0) otherwise
      - Position is applied to the *next* day's log-return (no look-ahead bias).

    Metrics returned:
      strategy_return   – total compounded return of the strategy
      buyhold_return    – total compounded return of buy-and-hold
      sharpe_ratio      – annualised Sharpe (252 trading days, risk-free = 0)
      max_drawdown      – maximum peak-to-trough drawdown of the strategy equity curve
      win_rate          – fraction of closed non-flat trades that were profitable
      n_trades          – number of direction changes (entries)
      equity_curve      – [{date, value}] normalised to 1.0 at start
      buyhold_curve     – [{date, value}] normalised to 1.0 at start
    """
    try:
        ticker = urllib.parse.unquote(ticker).upper()
        import pandas as pd
        import numpy as np
        from analytics.correlation import fetch_price_data, build_sentiment_timeseries
        from analytics.sentiment_history import get_dense_sentiment_series

        # ── Load sentiment ────────────────────────────────────────────
        try:
            sentiment_ts = get_dense_sentiment_series(ticker, min_days=5, freq="4h")
        except Exception:
            sentiment_ts = build_sentiment_timeseries(ticker)

        if sentiment_ts.empty:
            return JSONResponse(status_code=400, content={"error": f"No sentiment data for {ticker}"})

        # ── Load price (capped at 60-day look-back — yfinance 1h max) ─
        max_lookback = (datetime.utcnow() - timedelta(days=60)).strftime("%Y-%m-%d")
        start_date   = max(sentiment_ts.index.min().strftime("%Y-%m-%d"), max_lookback)
        returns_ts   = fetch_price_data(ticker, start=start_date, interval="1h")

        if returns_ts.empty:
            return JSONResponse(status_code=400, content={"error": f"No price data for {ticker}"})

        # ── Align series to first date with non-zero sentiment ─────────
        sentiment_ts, returns_ts = _align_series(sentiment_ts, returns_ts)

        # ── Strict intersection on the 4h index (no daily resampling) ──
        # Both series are already at 4h frequency from the pipeline.
        # Working at 4h gives 6× more bars than daily and avoids the
        # common-date alignment problem that arose from resampling.
        aligned = pd.concat(
            [sentiment_ts.rename("s"), returns_ts.rename("r")], axis=1
        ).dropna()

        if len(aligned) < 20:
            return JSONResponse(
                status_code=400,
                content={"error": f"Insufficient aligned data for {ticker} ({len(aligned)} bars)"},
            )

        ds = aligned["s"]
        dr = aligned["r"]

        # ── Generate signal with 18-bar (≈3-day) rolling mean ─────────
        # 18 × 4h = 72h ≈ 3 calendar days.
        THRESHOLD = 0.12
        rolling   = ds.rolling(18, min_periods=3).mean()
        signal    = pd.Series(0, index=ds.index, dtype=float)
        signal[rolling >  THRESHOLD] =  1.0
        signal[rolling < -THRESHOLD] = -1.0

        # Shift by 1 bar (4h) — no look-ahead bias
        signal_lagged = signal.shift(1).fillna(0)

        # ── Strategy P&L ───────────────────────────────────────────────
        strat_returns = signal_lagged * dr

        # ── Equity curves (starting at 1.0) ───────────────────────────
        equity_curve  = (1 + strat_returns).cumprod()
        buyhold_curve = (1 + dr).cumprod()

        # ── Metrics ────────────────────────────────────────────────────
        strategy_return = float(equity_curve.iloc[-1] - 1.0)
        buyhold_return  = float(buyhold_curve.iloc[-1] - 1.0)

        # Sharpe annualised: 6 bars/day × 252 trading days = 1512 bars/year
        BARS_PER_YEAR = 6 * 252
        if strat_returns.std() > 0:
            sharpe = float(strat_returns.mean() / strat_returns.std() * (BARS_PER_YEAR ** 0.5))
        else:
            sharpe = 0.0

        # Max drawdown
        roll_max  = equity_curve.cummax()
        drawdowns = (equity_curve - roll_max) / roll_max
        max_dd    = float(drawdowns.min())

        # Win rate among active (non-flat) bars
        active_mask = signal_lagged != 0
        active_ret  = strat_returns[active_mask]
        win_rate    = float((active_ret > 0).sum() / len(active_ret)) if len(active_ret) > 0 else None
        n_trades    = int((signal.diff().abs() > 0).sum())

        # ── Serialise curves (one point per day — take last bar of each day) ─
        def _to_curve(series: pd.Series) -> list:
            daily = series.resample("1D").last().dropna()
            return [
                {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 6)}
                for d, v in daily.items()
                if not (math.isnan(v) or math.isinf(v))
            ]

        return clean_nans({
            "ticker":          ticker,
            "strategy_return": strategy_return,
            "buyhold_return":  buyhold_return,
            "sharpe_ratio":    sharpe,
            "max_drawdown":    max_dd,
            "win_rate":        win_rate,
            "n_trades":        n_trades,
            "equity_curve":    _to_curve(equity_curve),
            "buyhold_curve":   _to_curve(buyhold_curve),
        })
    except Exception as e:
        logger.error("Erreur /api/backtest/%s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ic/{ticker:path}", response_class=JSONResponse)
async def api_ic(ticker: str):
    """Information Coefficient (IC) et ICIR pour un actif."""
    try:
        ticker = urllib.parse.unquote(ticker).upper()
        from analytics.ic_analysis import run_ic_analysis
        result = run_ic_analysis(ticker)
        if "error" in result:
            return JSONResponse(status_code=400, content=clean_nans(result))
        return clean_nans(result)
    except Exception as e:
        logger.error("Erreur /api/ic/%s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/event_study/{ticker:path}", response_class=JSONResponse)
async def api_event_study(ticker: str):
    """Event Study (AAR/CAAR) lors des extrêmes de sentiment."""
    try:
        ticker = urllib.parse.unquote(ticker).upper()
        from analytics.event_study import analyze_ticker_events
        result = analyze_ticker_events(ticker)
        if "error" in result:
            return JSONResponse(status_code=400, content=clean_nans(result))
        return clean_nans(result)
    except Exception as e:
        logger.error("Erreur /api/event_study/%s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Polymarket ────────────────────────────────────────────────────────────────

@app.get("/polymarket", response_class=HTMLResponse)
def read_polymarket(request: Request):
    """Serve the Polymarket Crowd Intelligence page."""
    return templates.TemplateResponse("polymarket.html", {"request": request})


@app.get("/api/polymarket/signals", response_class=JSONResponse)
def api_polymarket_signals():
    """
    Top markets across economics/crypto/politics/business sorted by volume.
    Enriched with OpenAI GPT-4o interpretation and ticker detection.
    Returns up to 12 markets.
    """
    try:
        from collectors.polymarket_scraper import fetch_top_macro_signals
        markets = fetch_top_macro_signals(n=12, with_ai=True)
        return markets
    except Exception as exc:
        logger.error("Polymarket signals error: %s", exc)
        return []


@app.get("/api/polymarket/markets", response_class=JSONResponse)
def api_polymarket_markets(category: str = "all", limit: int = 60):
    """
    Fetch Polymarket markets by category with AI enrichment.

    Query params:
        category – "all" | "economics" | "crypto" | "politics" | "business"
        limit    – max markets to return (default 60, max 120)
    """
    try:
        limit = min(max(1, limit), 120)
        from collectors.polymarket_scraper import fetch_markets_by_category
        markets = fetch_markets_by_category(category=category, limit=limit, with_ai=True)
        return markets
    except Exception as exc:
        logger.error("Polymarket markets error: %s", exc)
        return []


@app.get("/api/polymarket/summary", response_class=JSONResponse)
def api_polymarket_summary():
    """
    Aggregate sentiment summary across all Polymarket prediction markets.
    Returns overall bias, ticker heatmap data, and category breakdown.
    """
    try:
        from collectors.polymarket_scraper import (
            fetch_financial_markets,
            get_sentiment_summary,
        )
        markets = fetch_financial_markets(limit=80, with_ai=True)
        summary = get_sentiment_summary(markets)
        return summary
    except Exception as exc:
        logger.error("Polymarket summary error: %s", exc)
        return {"total_markets": 0, "avg_sentiment": 0, "overall_bias": "neutral"}


@app.get("/api/advanced_analysis/{ticker:path}", response_class=JSONResponse)
async def api_advanced_analysis(ticker: str):
    """
    Full advanced analysis: causality_engine, regime_engine.

    Returns engine result dicts under keys:
      causality_engine, regime_engine
    """
    try:
        ticker = urllib.parse.unquote(ticker).upper()
        from analytics.correlation import fetch_price_data, build_sentiment_timeseries
        from analytics.causality_engine import CausalityEngine
        from analytics.regime_engine import run_regime_engine

        try:
            from analytics.sentiment_history import get_dense_sentiment_series
            sentiment_ts = get_dense_sentiment_series(ticker, min_days=5, freq="4h")
        except Exception:
            sentiment_ts = build_sentiment_timeseries(ticker)

        start_date = sentiment_ts.index.min().strftime("%Y-%m-%d") if not sentiment_ts.empty else None
        returns_ts = fetch_price_data(ticker, start=start_date, interval="1h")

        if sentiment_ts.empty or returns_ts.empty:
            return JSONResponse(
                status_code=400,
                content={"error": f"No data available for {ticker}"},
            )

        # ── Align: trim to first date with real (non-zero) sentiment ──
        sentiment_ts, returns_ts = _align_series(sentiment_ts, returns_ts)

        engine      = CausalityEngine(sentiment_ts, returns_ts)
        caus_result = engine.run_all()

        reg_result  = run_regime_engine(sentiment_ts, returns_ts)

        return clean_nans({
            "ticker":             ticker,
            "causality_engine":   caus_result,
            "regime_engine":      reg_result,
        })
    except Exception as e:
        logger.error("Erreur /api/advanced_analysis/%s: %s", ticker, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
