"""
causality_engine.py – Module 2: Advanced Causality Analysis

Unified CausalityEngine class implementing:
  2a. Toda-Yamamoto procedure (Wald chi2, tests only first p lags)
  2b. Johansen cointegration → VECM (short-run chi2 + long-run ECT t-test)
  2c. Transfer Entropy via permutation test (no external pyinform dependency)
  2d. EGARCH-X / GARCH-X volatility channel (2-step: arch + OLS on log-variance)
"""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import statsmodels.api as sm

logger = logging.getLogger(__name__)


class CausalityEngine:
    """
    Unified causality analysis for sentiment ↔ returns.

    Parameters
    ----------
    sentiment_ts : pd.Series   Daily FinBERT sentiment scores.
    returns_ts   : pd.Series   Daily log-returns.
    d_max        : int | None  Integration order from Module 1. Estimated if None.
    """

    def __init__(
        self,
        sentiment_ts: pd.Series,
        returns_ts: pd.Series,
        d_max: Optional[int] = None,
    ) -> None:
        aligned = pd.concat(
            [sentiment_ts.rename("sentiment"), returns_ts.rename("returns")],
            axis=1,
        ).dropna()
        self.sentiment: pd.Series = aligned["sentiment"]
        self.returns: pd.Series   = aligned["returns"]
        self.n: int                = len(aligned)
        self.d_max: int            = d_max if d_max is not None else self._estimate_d_max()

    def _estimate_d_max(self) -> int:
        from statsmodels.tsa.stattools import adfuller
        def _nonstat(s: pd.Series) -> bool:
            try:
                _, pval, *_ = adfuller(s.dropna(), autolag="AIC")
                return pval >= 0.05
            except Exception:
                return False
        return 1 if (_nonstat(self.returns) or _nonstat(self.sentiment)) else 0

    # ── 2a. Toda-Yamamoto ────────────────────────────────────────────────────

    def toda_yamamoto(self, max_p: int = 10) -> Dict[str, Any]:
        """
        Toda-Yamamoto (1995) Granger causality.

        Steps:
          1. Select VAR(p) order via AIC on levels (p ∈ 1..max_p).
          2. Fit VAR(p + d_max) on levels.
          3. Wald chi2 test on the FIRST p sentiment/return lag coefficients only
             in each equation (OLS + restriction matrix).

        Returns chi2 stat, p-value, df for both directions.
        """
        from statsmodels.tsa.vector_ar.var_model import VAR

        if self.n < 30:
            return {"error": f"Insufficient data ({self.n} obs, need 30)"}

        data = pd.DataFrame({"returns": self.returns, "sentiment": self.sentiment})
        eff_max_p = min(max_p, max(1, (self.n - self.d_max) // 10))

        # Step 1 – select p via AIC
        try:
            sel = VAR(data).select_order(maxlags=eff_max_p)
            p_aic = max(1, int(sel.aic) if sel.aic is not None else 1)
            p_bic = max(1, int(sel.bic) if sel.bic is not None else 1)
        except Exception as exc:
            logger.warning("VAR order selection failed: %s", exc)
            p_aic = p_bic = 1

        p = p_aic
        p_aug = p + self.d_max

        # Ensure enough observations
        while p_aug > 1 and self.n < p_aug * 4 + 10:
            p_aug -= 1
            p = max(1, p_aug - self.d_max)

        result: Dict[str, Any] = {
            "p_aic": p_aic, "p_bic": p_bic,
            "p_used": p, "p_augmented": p_aug,
            "d_max": self.d_max, "n_obs": self.n,
        }

        # Step 2 – build lagged design matrix for both equations
        try:
            y_ret, y_sent, X = _build_lagged_design(
                self.returns.values, self.sentiment.values, p_aug
            )
        except Exception as exc:
            return {**result, "error": f"Design matrix construction failed: {exc}"}

        # Step 3 – OLS + Wald test for each direction
        result["sentiment_causes_returns"] = _wald_granger_test(
            y_ret, X, p_aug, causing_var_idx=1, p_test=p,
            label="sentiment->returns"
        )
        result["returns_cause_sentiment"] = _wald_granger_test(
            y_sent, X, p_aug, causing_var_idx=0, p_test=p,
            label="returns->sentiment"
        )

        s2r = result["sentiment_causes_returns"]
        r2s = result["returns_cause_sentiment"]
        both = s2r.get("significant") and r2s.get("significant")
        none = not s2r.get("significant") and not r2s.get("significant")

        if both:
            result["interpretation"] = "Bidirectional causality: sentiment <-> returns"
        elif s2r.get("significant"):
            result["interpretation"] = (
                f"Sentiment->returns (chi2={s2r.get('chi2_stat')}, p={s2r.get('pvalue')})"
            )
        elif r2s.get("significant"):
            result["interpretation"] = "Returns->sentiment only (feedback loop)"
        else:
            result["interpretation"] = "No significant Granger causality in either direction"

        return result

    # ── 2b. Cointegration + VECM ─────────────────────────────────────────────

    def cointegration_vecm(self, max_p: int = 5) -> Dict[str, Any]:
        """
        Johansen cointegration test; if cointegrated, fit VECM.

        Extracts:
          - Short-run Granger causality (chi2 on lagged diff coefficients)
          - Long-run causality (t-test on ECT loading α)
          - Speed of adjustment (α value + half-life in days)
        """
        from statsmodels.tsa.vector_ar.vecm import coint_johansen, VECM

        if self.n < 40:
            return {"error": f"Insufficient data ({self.n} obs, need 40)"}

        data = pd.DataFrame({"returns": self.returns, "sentiment": self.sentiment})
        k_ar_diff = max(1, min(max_p, self.n // 10))
        result: Dict[str, Any] = {"n_obs": self.n, "k_ar_diff": k_ar_diff}

        # Johansen test
        try:
            joh = coint_johansen(data, det_order=0, k_ar_diff=k_ar_diff)
            johansen_results = []
            coint_rank = 0
            for r in range(len(joh.lr1)):
                trace_sig = bool(joh.lr1[r] > joh.cvt[r, 1])   # 5 % CV
                max_sig   = bool(joh.lr2[r] > joh.cvm[r, 1])
                johansen_results.append({
                    "r": r,
                    "trace_stat":    round(float(joh.lr1[r]), 4),
                    "trace_cv_5pct": round(float(joh.cvt[r, 1]), 4),
                    "trace_sig":     trace_sig,
                    "max_eig_stat":  round(float(joh.lr2[r]), 4),
                    "max_eig_cv_5pct": round(float(joh.cvm[r, 1]), 4),
                    "max_eig_sig":   max_sig,
                })
                if trace_sig:
                    coint_rank = r + 1
            result["johansen"] = {
                "results": johansen_results,
                "coint_rank": coint_rank,
                "cointegrated": coint_rank > 0,
            }
        except Exception as exc:
            logger.warning("Johansen test failed: %s", exc)
            result["johansen"] = {"error": str(exc), "cointegrated": False, "coint_rank": 0}
            return result

        if not result["johansen"]["cointegrated"]:
            result["recommendation"] = (
                "Series are NOT cointegrated -> use Toda-Yamamoto (Module 2a)"
            )
            return result

        # Fit VECM
        try:
            vecm_fit = VECM(
                data, k_ar_diff=k_ar_diff,
                coint_rank=coint_rank, deterministic="ci"
            ).fit()

            alpha = vecm_fit.alpha          # ECT loadings: (k, r)
            alpha_ret  = float(alpha[0, 0])
            alpha_sent = float(alpha[1, 0]) if alpha.shape[0] > 1 else None

            # Half-life of mean-reversion
            half_life = (
                round(-np.log(2) / alpha_ret, 1)
                if alpha_ret < 0 else None
            )

            result["vecm"] = {
                "alpha_returns":   round(alpha_ret, 6),
                "alpha_sentiment": round(alpha_sent, 6) if alpha_sent is not None else None,
                "half_life_days":  half_life,
                "speed_of_adjustment": {
                    "value": round(alpha_ret, 6),
                    "sign":  "negative (error-correcting)" if alpha_ret < 0 else "positive (diverging)",
                },
            }

            # Long-run significance of α_returns via t-stat
            try:
                se_alpha = vecm_fit.stderr_alpha
                t_stat   = alpha_ret / float(se_alpha[0, 0])
                p_lr     = float(2 * (1 - __import__("scipy.stats", fromlist=["t"]).t.cdf(
                    abs(t_stat), df=self.n - k_ar_diff - 2
                )))
                result["vecm"]["long_run_causality"] = {
                    "alpha_tstat":  round(float(t_stat), 4),
                    "alpha_pvalue": round(float(p_lr), 4),
                    "significant":  bool(p_lr < 0.05),
                }
            except Exception:
                pass

            # Short-run causality (chi2 on lagged Γ coefficients)
            try:
                sr = vecm_fit.test_granger_causality(
                    caused=0, causing=1, signif=0.05
                )
                result["vecm"]["short_run_causality_s2r"] = {
                    "chi2_stat": round(float(sr.test_statistic), 4),
                    "pvalue":    round(float(sr.pvalue), 4),
                    "significant": bool(sr.pvalue < 0.05),
                }
            except Exception as exc:
                result["vecm"]["short_run_causality_s2r"] = {"error": str(exc)}

        except Exception as exc:
            logger.warning("VECM fit failed: %s", exc)
            result["vecm"] = {"error": str(exc)}

        return result

    # ── 2c. Transfer Entropy ─────────────────────────────────────────────────

    def transfer_entropy(
        self,
        k: int = 2,
        n_bins: int = 5,
        n_permutations: int = 200,
    ) -> Dict[str, Any]:
        """
        Nonlinear Granger causality via Schreiber (2000) Transfer Entropy.

        TE(X→Y) = Σ p(y', y, x) · log₂[ p(y'|y,x) / p(y'|y) ]

        Discretise continuous series into n_bins quantile bins.
        Significance via permutation test (200 shuffles of source).
        ETE = TE_observed − mean(TE_shuffled).
        Z-score = ETE / std(TE_shuffled).  Significant if Z > 1.96.
        """
        if self.n < 30:
            return {"error": f"Insufficient data ({self.n} obs, need 30)"}

        s_disc = _quantile_discretize(self.sentiment.values, n_bins)
        r_disc = _quantile_discretize(self.returns.values, n_bins)

        def _run_permutation(source: np.ndarray, dest: np.ndarray) -> Dict[str, Any]:
            te_obs = _transfer_entropy(source, dest, k=k)
            rng = np.random.default_rng(42)
            te_shuf = np.array([
                _transfer_entropy(rng.permutation(source), dest, k=k)
                for _ in range(n_permutations)
            ])
            mu_shuf  = float(np.mean(te_shuf))
            std_shuf = float(np.std(te_shuf, ddof=1))
            ete      = te_obs - mu_shuf
            z_score  = ete / std_shuf if std_shuf > 1e-12 else 0.0
            p_emp    = float(np.mean(te_shuf >= te_obs))
            return {
                "te":            round(float(te_obs), 6),
                "ete":           round(float(ete), 6),
                "z_score":       round(float(z_score), 4),
                "pvalue":        round(float(p_emp), 4),
                "significant":   bool(z_score > 1.96),
                "mean_shuffled": round(float(mu_shuf), 6),
                "std_shuffled":  round(float(std_shuf), 6),
            }

        s2r = _run_permutation(s_disc, r_disc)
        r2s = _run_permutation(r_disc, s_disc)

        if s2r["significant"] and r2s["significant"]:
            interp = "Bidirectional nonlinear information flow (sentiment <-> returns)"
        elif s2r["significant"]:
            interp = f"Nonlinear: sentiment->returns (TE={s2r['te']:.4f}, Z={s2r['z_score']:.2f})"
        elif r2s["significant"]:
            interp = f"Nonlinear: returns->sentiment (feedback, TE={r2s['te']:.4f})"
        else:
            interp = "No significant nonlinear information flow detected"

        return {
            "sentiment_to_returns": s2r,
            "returns_to_sentiment": r2s,
            "n_bins": n_bins,
            "k": k,
            "n_permutations": n_permutations,
            "n_obs": self.n,
            "interpretation": interp,
        }

    # ── 2d. EGARCH-X / GARCH-X ───────────────────────────────────────────────

    def egarch_x(self) -> Dict[str, Any]:
        """
        Two-step volatility channel test.

        Step 1: Fit EGARCH(1,1,t) / GARCH(1,1,t) to extract σ²_t.
        Step 2: OLS — log(σ²_t) = α + γ·sentiment_{t-1} + ε
                γ = direct effect of lagged sentiment on log-conditional-variance.

        Also tests leverage: are negative sentiment shocks more volatility-amplifying
        than positive ones?

        Note: arch_model(x=...) adds the regressor to the MEAN equation;
        the γ here (step 2) explicitly targets the VARIANCE equation.
        """
        try:
            from arch import arch_model as _arch_model
        except ImportError:
            return {
                "error": "arch library not installed. Run: pip install arch>=5.4.0",
                "available": False,
            }

        if self.n < 50:
            return {"error": f"Insufficient data ({self.n} obs, need 50)"}

        r_pct = self.returns.values * 100.0          # arch convention: percent
        s_lag = self.sentiment.shift(1).reindex(self.returns.index).values
        valid = ~np.isnan(s_lag)
        r_v   = r_pct[valid]
        s_v   = s_lag[valid]

        if len(r_v) < 40:
            return {"error": f"Insufficient data after lag ({len(r_v)} obs)"}

        result: Dict[str, Any] = {"n_obs": int(len(r_v))}

        def _fit_vol_model(vol_type: str) -> Dict[str, Any]:
            try:
                am  = _arch_model(r_v, vol=vol_type, p=1, q=1, dist="t", rescale=False)
                fit = am.fit(disp="off", show_warning=False)
                log_cv = np.log(fit.conditional_volatility ** 2 + 1e-12)
                n_cv = min(len(log_cv), len(s_v))
                X = sm.add_constant(s_v[:n_cv])
                ols = sm.OLS(log_cv[:n_cv], X).fit()
                gamma     = float(ols.params[1])
                gamma_t   = float(ols.tvalues[1])
                gamma_p   = float(ols.pvalues[1])
                out = {
                    "gamma_sentiment":  round(gamma, 6),
                    "gamma_tstat":      round(gamma_t, 4),
                    "gamma_pvalue":     round(gamma_p, 4),
                    "significant":      bool(gamma_p < 0.05),
                    "direction":        (
                        "sentiment amplifies volatility" if gamma > 0
                        else "sentiment dampens volatility"
                    ),
                    "aic": round(float(fit.aic), 2),
                    "bic": round(float(fit.bic), 2),
                }
                params_dict = dict(fit.params)
                if vol_type == "EGARCH":
                    out["egarch_alpha"] = round(float(params_dict.get("alpha[1]", 0)), 6)
                    out["egarch_beta"]  = round(float(params_dict.get("beta[1]", 0)), 6)
                    out["egarch_gamma"] = round(float(params_dict.get("gamma[1]", 0)), 6)
                    out["leverage_effect"] = _leverage_effect(s_v[:n_cv], log_cv[:n_cv])
                return out
            except Exception as exc:
                return {"error": str(exc)}

        result["egarch"] = _fit_vol_model("EGARCH")
        result["garch"]  = _fit_vol_model("GARCH")

        eg = result["egarch"]
        if not eg.get("error"):
            result["interpretation"] = (
                f"gamma(sentiment->log-var) = {eg.get('gamma_sentiment', 0):.4f}, "
                f"t = {eg.get('gamma_tstat', 0):.2f}, "
                f"p = {eg.get('gamma_pvalue', 1):.4f}"
            )
        else:
            result["interpretation"] = "EGARCH-X estimation failed"

        return result

    # ── Combined runner ──────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all four causality tests and return combined results."""
        results: Dict[str, Any] = {"n_obs": self.n, "d_max": self.d_max}
        for key, method in [
            ("toda_yamamoto",      self.toda_yamamoto),
            ("cointegration_vecm", self.cointegration_vecm),
            ("transfer_entropy",   self.transfer_entropy),
            ("egarch_x",           self.egarch_x),
        ]:
            try:
                results[key] = method()
            except Exception as exc:
                logger.warning("CausalityEngine[%s] failed: %s", key, exc)
                results[key] = {"error": str(exc)}
        return results


# ── Private helpers ──────────────────────────────────────────────────────────

def _build_lagged_design(
    returns: np.ndarray, sentiment: np.ndarray, p_aug: int
) -> tuple:
    """
    Build OLS design matrices for a bivariate lag-augmented regression.

    Layout (per row): [1, ret_lag1, sent_lag1, ret_lag2, sent_lag2, ..., ret_lagP, sent_lagP]
    Variable index 0 = returns, 1 = sentiment.
    Causing variable for sentiment→returns: sentiment columns at indices 2, 4, ..., 2*i
    Causing variable for returns→sentiment: returns  columns at indices 1, 3, ..., 2*i-1
    """
    n = len(returns)
    n_obs = n - p_aug
    if n_obs < 5:
        raise ValueError(f"Not enough obs: {n} - {p_aug} = {n_obs}")

    rows: List[list] = []
    for t in range(p_aug, n):
        row = [1.0]
        for lag in range(1, p_aug + 1):
            row.append(returns[t - lag])
            row.append(sentiment[t - lag])
        rows.append(row)

    X = np.array(rows)
    y_ret  = returns[p_aug:]
    y_sent = sentiment[p_aug:]
    return y_ret, y_sent, X


def _wald_granger_test(
    y: np.ndarray,
    X: np.ndarray,
    p_aug: int,
    causing_var_idx: int,
    p_test: int,
    label: str,
) -> Dict[str, Any]:
    """
    OLS Wald chi2 test for Granger non-causality.

    causing_var_idx: 0=returns, 1=sentiment (column stride in X).
    Tests the FIRST p_test lags of the causing variable only (Toda-Yamamoto).
    Column layout: intercept, ret_lag1, sent_lag1, ret_lag2, sent_lag2, ...
    Causing var columns: 1 + causing_var_idx, 1+2+causing_var_idx, ...
               i.e.: 1 + causing_var_idx + (i-1)*2  for i=1..p_aug
    """
    try:
        ols = sm.OLS(y, X).fit()

        # Indices of the first p_test lags of the causing variable
        restrict_cols = [
            1 + causing_var_idx + (i - 1) * 2
            for i in range(1, p_test + 1)
        ]
        # Safety: cap at available columns
        restrict_cols = [c for c in restrict_cols if c < X.shape[1]]
        if not restrict_cols:
            return {"error": "No restriction columns found", "label": label}

        R = np.zeros((len(restrict_cols), X.shape[1]))
        for row_i, col_i in enumerate(restrict_cols):
            R[row_i, col_i] = 1.0

        wald = ols.wald_test(R, use_f=False, scalar=True)
        chi2  = float(wald.statistic)
        pval  = float(wald.pvalue)
        df    = len(restrict_cols)

        return {
            "chi2_stat":   round(chi2, 4),
            "pvalue":      round(pval, 4),
            "df":          df,
            "significant": bool(pval < 0.05),
            "label":       label,
        }
    except Exception as exc:
        return {"error": str(exc), "label": label}


def _quantile_discretize(x: np.ndarray, n_bins: int = 5) -> np.ndarray:
    """Map continuous array to integer bin labels 0..n_bins-1 via quantiles."""
    boundaries = np.percentile(x, np.linspace(0, 100, n_bins + 1))
    boundaries = np.unique(boundaries)
    if len(boundaries) < 2:
        return np.zeros(len(x), dtype=int)
    return np.digitize(x, boundaries[1:-1], right=True).astype(int)


def _transfer_entropy(source: np.ndarray, dest: np.ndarray, k: int = 1) -> float:
    """
    TE(source→dest) with history length k (Schreiber 2000).

    TE = Σ p(y', y_k, x_k) · log₂[ p(y'|y_k, x_k) / p(y'|y_k) ]

    For k > 1 only the most-recent lag is used (standard k=1 simplification;
    for k=2 we use the concatenated tuple of the two most-recent values).
    """
    n = len(source)
    if n < k + 2:
        return 0.0

    # Build lagged tuples
    y_next = dest[k:]
    # history tuples of length k
    y_hist = [tuple(int(dest[t - j]) for j in range(1, k + 1)) for t in range(k, n)]
    x_hist = [tuple(int(source[t - j]) for j in range(1, k + 1)) for t in range(k, n)]

    N = len(y_next)
    cnt3: defaultdict = defaultdict(int)   # (y', y_hist, x_hist)
    cnt2: defaultdict = defaultdict(int)   # (y', y_hist)
    cnt_yx: defaultdict = defaultdict(int) # (y_hist, x_hist)
    cnt_y: defaultdict  = defaultdict(int) # y_hist

    for i in range(N):
        yn1 = int(y_next[i])
        yh  = y_hist[i]
        xh  = x_hist[i]
        cnt3[(yn1, yh, xh)] += 1
        cnt2[(yn1, yh)]      += 1
        cnt_yx[(yh, xh)]     += 1
        cnt_y[yh]            += 1

    te = 0.0
    for (yn1, yh, xh), c3 in cnt3.items():
        p3  = c3 / N
        p2  = cnt2.get((yn1, yh), 1) / N
        pyx = cnt_yx.get((yh, xh), 1) / N
        py  = cnt_y.get(yh, 1) / N
        if p3 > 0 and p2 > 0 and pyx > 0 and py > 0:
            te += p3 * np.log2(p3 * py / (p2 * pyx))

    return max(0.0, float(te))


def _leverage_effect(sentiment_lag: np.ndarray, log_var: np.ndarray) -> Dict[str, Any]:
    """
    Test whether negative sentiment shocks amplify volatility more than positive.

    Splits sentiment deviations from the mean into positive (bullish) and
    negative (bearish) components and runs OLS:
      log(σ²_t) = c + γ_pos · pos_t + γ_neg · neg_t + ε
    """
    try:
        mu = sentiment_lag.mean()
        pos = np.where(sentiment_lag > mu, sentiment_lag - mu, 0.0)
        neg = np.where(sentiment_lag < mu, mu - sentiment_lag, 0.0)
        X   = sm.add_constant(np.column_stack([pos, neg]))
        ols = sm.OLS(log_var, X).fit()
        g_pos = float(ols.params[1])
        g_neg = float(ols.params[2])
        return {
            "gamma_positive_sentiment": round(g_pos, 6),
            "gamma_negative_sentiment": round(g_neg, 6),
            "leverage_present": bool(g_neg > g_pos),
            "interpretation": (
                "Negative sentiment shocks raise volatility more (leverage effect)"
                if g_neg > g_pos
                else "No asymmetric volatility response to sentiment shocks"
            ),
        }
    except Exception as exc:
        return {"error": str(exc)}
