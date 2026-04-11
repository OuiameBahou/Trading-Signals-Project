"""
impact_scorer.py – Modèle de Score d'Impact pour classer les news par importance marché.

Calcule un Score d'Impact composite (0 à 1) pour chaque article de news en combinant
5 critères pondérés, dont les poids sont dérivés par la méthode AHP (Analytic Hierarchy
Process – Saaty, 1980) :

  Critère 1 : Intensité du sentiment FinBERT
  Critère 2 : Portée multi-actifs
  Critère 3 : Autorité de la source
  Critère 4 : Mots-clés d'impact
  Critère 5 : Fraîcheur

Les poids sont calculés automatiquement au démarrage via le vecteur propre principal
de la matrice de comparaison par paires AHP, avec vérification du Ratio de Cohérence
(CR doit être < 0.10 pour que la matrice soit considérée cohérente).

NOTE : Toutes les analyses de sentiment sont obligatoirement effectuées par FinBERT.
Les articles sans score FinBERT sont exclus du classement final.
"""

import re
import logging
import numpy as np
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("nlp.impact_scorer")


# ── AHP Weight Computation ────────────────────────────────────────────────────

# Matrice de comparaison par paires AHP (Saaty scale 1–9).
# Lignes/Colonnes : [intensité, portée, autorité, mots-clés, fraîcheur]
#
# Lecture : la cellule (i, j) représente « combien de fois le critère i est plus
# important que le critère j ? »
#
# Justification des choix :
#  - Intensité & Portée : les plus discriminants → égaux, chacun 2× > Autorité & Mots-clés
#  - Autorité & Mots-clés : égaux entre eux, 3× > Fraîcheur
#  - Fraîcheur : critère le moins décisif à lui seul (article récent ≠ important)
AHP_PAIRWISE_MATRIX = np.array([
    # Intens.  Portée   Autorité  Mots-cls  Fraîch.
    [1.0,      1.0,     2.0,      2.0,      4.0],   # Intensité
    [1.0,      1.0,     2.0,      2.0,      4.0],   # Portée
    [1/2,      1/2,     1.0,      1.0,      3.0],   # Autorité
    [1/2,      1/2,     1.0,      1.0,      3.0],   # Mots-clés
    [1/4,      1/4,     1/3,      1/3,      1.0],   # Fraîcheur
], dtype=float)

# Random Consistency Index (Saaty, 1980) pour n = 5 critères
_RI_5 = 1.12


def compute_ahp_weights(
    matrix: np.ndarray,
) -> Tuple[Dict[str, float], float]:
    """
    Calcule les poids AHP par la méthode du vecteur propre principal.

    Algorithme :
      1. Normaliser chaque colonne de la matrice (diviser par la somme de la colonne).
      2. Faire la moyenne de chaque ligne → vecteur des poids w.
      3. Calculer λ_max = moyenne de (A·w / w) pour chaque critère.
      4. Calculer l'Indice de Cohérence : CI = (λ_max − n) / (n − 1).
      5. Calculer le Ratio de Cohérence : CR = CI / RI.
      6. CR < 0.10 → matrice cohérente (Saaty, 1980).

    Returns:
        (weights_dict, cr) – dictionnaire {nom_critère: poids} et le CR calculé.
    """
    n = matrix.shape[0]
    criteria = ["intensity", "reach", "authority", "keywords", "freshness"]

    # Étape 1 : Normalisation par colonne
    col_sums = matrix.sum(axis=0)
    norm = matrix / col_sums

    # Étape 2 : Vecteur des poids (moyenne des lignes normalisées)
    w = norm.mean(axis=1)

    # Étape 3 : Calcul de λ_max
    aw = matrix @ w
    lambda_max = float(np.mean(aw / w))

    # Étape 4 & 5 : CI et CR
    ci = (lambda_max - n) / (n - 1)
    cr = ci / _RI_5

    weights = {criteria[i]: float(round(w[i], 6)) for i in range(n)}

    logger.info(
        "AHP weights computed: %s  |  λ_max=%.4f  CI=%.4f  CR=%.4f %s",
        {k: f"{v:.4f}" for k, v in weights.items()},
        lambda_max,
        ci,
        cr,
        "✓ coherent" if cr < 0.10 else "⚠ CR≥0.10 – review matrix",
    )
    if cr >= 0.10:
        logger.warning(
            "AHP Consistency Ratio CR=%.4f >= 0.10. "
            "The pairwise comparison matrix may not be sufficiently consistent. "
            "Weights will still be used but should be reviewed.",
            cr,
        )

    return weights, cr


# Compute weights at module load time (once)
WEIGHTS, AHP_CR = compute_ahp_weights(AHP_PAIRWISE_MATRIX)

# ── Source Authority Scores ───────────────────────────────────────────────────
SOURCE_AUTHORITY: Dict[str, float] = {
    # Tier 1 - Top-tier financial media
    "reuters":          1.0,
    "bloomberg":        1.0,
    "financial times":  1.0,
    "ft.com":           1.0,
    "wsj":              1.0,
    "wall street journal": 1.0,
    "cnbc":             0.9,
    "the economist":    0.9,
    "barrons":          0.85,
    # Tier 2 - Solid financial news sites
    "marketwatch":      0.8,
    "investing.com":    0.8,
    "fxstreet":         0.8,
    "forexfactory":     0.75,
    "seekingalpha":     0.7,
    "thestreet":        0.7,
    "yahoo finance":    0.7,
    # Tier 3 - Aggregators / Screeners
    "finviz":           0.65,
    "benzinga":         0.65,
    "motley fool":      0.6,
    "zacks":            0.6,
    # Default for unknown sources
    "_default":         0.3,
}

# ── Impact Keywords ───────────────────────────────────────────────────────────
IMPACT_KEYWORDS: List[tuple] = [
    # (keyword_regex, impact_score)
    # ── Very High Impact (1.0) ────────────────────────────────────────────────
    (r"\bfed\b|\bfederal reserve\b",                          1.0),
    (r"\brate hike\b|\brate cut\b|\brate rise\b",             1.0),
    (r"\brecession\b|\bdepression\b",                         1.0),
    (r"\bcrash\b|\bcollapse\b|\bmeltdown\b",                  1.0),
    (r"\btrade war\b|\btariff war\b|\btariff escalation\b",   1.0),
    (r"\bdebt ceiling\b|\bfiscal cliff\b",                    1.0),
    (r"\bgovernment shutdown\b",                               1.0),
    (r"\btrump\b|\bdonald trump\b",                            1.0),
    (r"\bjerome powell\b|\bpowell\b",                          1.0),
    # ── High Impact (0.95) ────────────────────────────────────────────────────
    (r"\bwar\b|\bmilitary\b|\bconflict\b",                    0.95),
    (r"\bdefault\b|\bbankruptcy\b|\binsolvency\b",            0.95),
    (r"\bearnings miss\b|\bearnings beat\b",                  0.95),
    (r"\biran\b|\biran sanctions\b|\bhormuz\b",               0.95),
    (r"\bred sea\b|\bhouthi\b|\bsuez canal\b",                0.95),
    (r"\bchina tariffs\b|\bus.china trade\b|\bus-china\b",   0.95),
    # ── High Impact (0.90) ────────────────────────────────────────────────────
    (r"\binterest rate\b",                                     0.90),
    (r"\binflation\b|\bcpi\b|\bpce\b",                        0.90),
    (r"\bgdp\b|\bgross domestic\b",                            0.90),
    (r"\bunemployment\b|\bjobs report\b|\bnonfarm\b",         0.90),
    (r"\belon musk\b|\bmusk\b",                                0.90),
    (r"\bdoge\b|\bdepartment of government efficiency\b",     0.90),
    (r"\bukraine\b|\brussia ukraine\b|\bzelenskyy\b",         0.90),
    (r"\bnato\b|\bnato expansion\b",                          0.88),
    # ── High Impact (0.85) ────────────────────────────────────────────────────
    (r"\bbrics\b|\bde-dollarization\b|\bpetrodollar\b",       0.85),
    (r"\bchip war\b|\bsemiconductor ban\b|\bexport controls\b", 0.85),
    (r"\bai bubble\b|\bai regulation\b",                      0.85),
    (r"\bbank crisis\b|\bregional bank\b|\bcredit crunch\b", 0.85),
    # ── High Impact (0.80) ────────────────────────────────────────────────────
    (r"\bsanctions\b|\bembargo\b",                             0.80),
    (r"\btariffs?\b",                                          0.80),
    (r"\bmerger\b|\bacquisition\b|\btakeover\b",              0.80),
    (r"\bopec\b|\bopec\+|\bproduction cut\b|\boil output\b", 0.80),
    (r"\bcrypto\b|\bbitcoin\b|\bcbdc\b|\bcrypto regulation\b", 0.80),
    # ── Medium-High Impact (0.75) ─────────────────────────────────────────────
    (r"\bipo\b|\bfloat\b|\blisting\b",                        0.75),
    (r"\bpmi\b|\bmanufacturing\b|\bservices sector\b",        0.75),
    (r"\bnatural gas\b|\blng\b|\bgas prices\b",               0.75),
    (r"\bwti\b|\bbrent crude\b|\bcrude oil\b",                0.75),
    (r"\bfed minutes\b|\bfomc\b|\bfed statement\b",          0.75),
    # ── Medium Impact (0.60–0.65) ─────────────────────────────────────────────
    (r"\bforecast\b|\boutlook\b|\bguidance\b",                0.60),
    (r"\bupgrade\b|\bdowngrade\b",                             0.60),
    (r"\bdividend\b|\bbuyback\b",                              0.55),
    (r"\bquarterly results\b|\bearnings\b",                   0.65),
    (r"\bstrike\b|\bshutdown\b",                               0.65),
    (r"\bclimate\b|\bcarbon tax\b|\bcop30\b|\bnet zero\b",   0.60),
]



def _has_finbert_scores(row: Dict[str, Any]) -> bool:
    """Retourne True si l'article dispose de scores FinBERT valides."""
    scores = row.get("scores", {})
    if isinstance(scores, dict):
        pos = float(scores.get("positive", 0) or 0)
        neg = float(scores.get("negative", 0) or 0)
        return pos > 0 or neg > 0
    pos = float(row.get("score_positive", 0) or 0)
    neg = float(row.get("score_negative", 0) or 0)
    return pos > 0 or neg > 0


def _score_intensity(row: Dict[str, Any]) -> float:
    """
    Critère 1 : Intensité du sentiment FinBERT.

    Retourne max(P(positive), P(negative)) selon la distribution FinBERT.
    Si aucun score FinBERT n'est disponible, retourne 0.0 (l'article sera
    écarté en amont par get_top_headlines).
    """
    scores = row.get("scores", {})
    if isinstance(scores, dict):
        pos = float(scores.get("positive", 0) or 0)
        neg = float(scores.get("negative", 0) or 0)
    else:
        pos = float(row.get("score_positive", 0) or 0)
        neg = float(row.get("score_negative", 0) or 0)
    return max(pos, neg)


def _score_reach(row: Dict[str, Any], max_tickers: int) -> float:
    """Critère 2 : Portée multi-actifs (nombre d'actifs mentionnés)."""
    if max_tickers <= 1:
        return 1.0
    tickers = row.get("tickers", [])
    if isinstance(tickers, list):
        n = len(tickers)
    else:
        n = 1
    return min(1.0, n / max(1, max_tickers))


def _score_authority(row: Dict[str, Any]) -> float:
    """Critère 3 : Autorité de la source."""
    source = str(row.get("source", "")).lower()
    for key, score in SOURCE_AUTHORITY.items():
        if key in source:
            return score
    return SOURCE_AUTHORITY["_default"]


def _score_keywords(text: str) -> float:
    """Critère 4 : Mots-clés d'impact dans le titre."""
    text_lower = text.lower()
    best_score = 0.0
    for pattern, score in IMPACT_KEYWORDS:
        if re.search(pattern, text_lower):
            best_score = max(best_score, score)
    return best_score


def _score_freshness(row: Dict[str, Any]) -> float:
    """Critère 5 : Fraîcheur de l'article (décroissance sur 48h)."""
    now = datetime.now(timezone.utc)
    date_str = row.get("created_at") or row.get("published_at") or row.get("processed_at")
    if not date_str:
        return 0.0
    try:
        if isinstance(date_str, datetime):
            dt = date_str
        else:
            dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_hours = (now - dt).total_seconds() / 3600
        return max(0.0, 1.0 - (age_hours / 48.0))
    except Exception:
        return 0.0


def compute_impact_score(row: Dict[str, Any], max_tickers: int = 5) -> float:
    """
    Calcule le Score d'Impact composite pour un article donné.

    Args:
        row: Dictionnaire représentant un article NLP analysé.
        max_tickers: Nombre max d'actifs observé dans le dataset (pour normaliser la portée).

    Returns:
        Score d'Impact entre 0.0 et 1.0.
    """
    text = str(row.get("text", ""))

    intensity  = _score_intensity(row)
    reach      = _score_reach(row, max_tickers)
    authority  = _score_authority(row)
    keywords   = _score_keywords(text)
    freshness  = _score_freshness(row)

    score = (
        WEIGHTS["intensity"]  * intensity +
        WEIGHTS["reach"]      * reach +
        WEIGHTS["authority"]  * authority +
        WEIGHTS["keywords"]  * keywords +
        WEIGHTS["freshness"]  * freshness
    )
    return round(min(1.0, score), 4)


def get_impact_level(score: float) -> str:
    """Retourne le niveau d'impact textuel basé sur le score."""
    if score >= 0.75:
        return "HIGH"
    elif score >= 0.50:
        return "MEDIUM"
    else:
        return "LOW"


def get_top_headlines(nlp_rows: List[Dict[str, Any]], n: int = 10) -> List[Dict[str, Any]]:
    """
    Retourne les N articles avec le plus grand Score d'Impact.

    Exige que chaque article ait été analysé par FinBERT (champ `scores` avec
    des probabilités positives/négatives valides). Les articles sans score FinBERT
    sont systématiquement écartés.

    Les poids utilisés pour le calcul sont dérivés par la méthode AHP (Saaty).
    Le CR de la matrice est vérifié au démarrage du module.

    Args:
        nlp_rows: Liste de dictionnaires (nlp_results.jsonl ou articles live
                  pré-analysés par FinBERT via NLPPipeline.analyze_batch).
        n: Nombre de headlines à retourner.

    Returns:
        Liste triée des N headlines avec leur score d'impact AHP et leur niveau.
    """
    if not nlp_rows:
        return []

    # Calculer le max de tickers pour normaliser la portée
    max_tickers = max(len(r.get("tickers", [r.get("ticker")])) for r in nlp_rows) or 1

    results = []
    for row in nlp_rows:
        text = str(row.get("text", "")).strip()
        if not text:
            continue

        # ── Exigence FinBERT : écarter tout article sans scores valides ──────
        if not _has_finbert_scores(row):
            safe_text = text[:60].encode("ascii", "replace").decode("ascii")
            logger.debug("Article sans score FinBERT écarté : %s...", safe_text)
            continue

        sentiment  = row.get("sentiment", "neutral")
        confidence = float(row.get("confidence", 0) or 0)
        scores     = row.get("scores", {})

        # Ignorer les articles neutres à faible confiance FinBERT
        if sentiment == "neutral" and confidence < 0.85:
            continue

        impact = compute_impact_score(row, max_tickers)

        # Écarter les articles à impact négligeable (< 0.10)
        if impact < 0.10:
            continue

        results.append({
            "text":         text,
            "url":          str(row.get("url", "")),
            "ticker":       str(row.get("ticker", "")),
            "source":       str(row.get("source", row.get("data_source", "news"))),
            "sentiment":    sentiment,
            "confidence":   confidence,
            "impact_score": impact,
            "impact_level": get_impact_level(impact),
            "created_at":   str(row.get("created_at", row.get("published_at", ""))),
            "scores":       scores if isinstance(scores, dict) else {},
            "ahp_cr":       round(AHP_CR, 4),
        })

    # Trier par impact décroissant (score AHP pondéré)
    results.sort(key=lambda x: x["impact_score"], reverse=True)

    # Dédupliquer les titres similaires (premiers 80 caractères)
    seen = set()
    unique = []
    for item in results:
        key = item["text"][:80].strip().lower()
        if key not in seen:
            seen.add(key)
            unique.append(item)

    return unique[:n]

