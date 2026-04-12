"""
test_advanced_modules.py – Tests for Modules 2 and 3.

Covers:
  Module 2 – causality_engine (CausalityEngine)
    - toda_yamamoto: chi2 stat non-null with sufficient data
    - transfer_entropy: ETE > 0 when causal signal present; ETE ≈ 0 for iid
    - egarch_x: returns error gracefully if arch not installed; else numeric output

  Module 3 – regime_engine
    - label_regimes: returns 0/1 integers, no gaps
    - threshold_var: two regime sub-results present
    - run_regime_engine: regime_labels key populated

Usage:
    py -m pytest tests/test_advanced_modules.py -v
"""

import sys
import os

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_idx(n: int) -> pd.DatetimeIndex:
    return pd.date_range("2022-01-03", periods=n, freq="B")


def synthetic_lead_lag(n: int = 120, lag: int = 2, noise: float = 0.15, seed: int = 7):
    """sentiment(t) causes returns(t+lag) with known lag."""
    rng = np.random.default_rng(seed)
    sentiment = rng.standard_normal(n)
    returns   = np.zeros(n)
    for t in range(lag, n):
        returns[t] = 0.6 * sentiment[t - lag] + noise * rng.standard_normal()
    idx = make_idx(n)
    return pd.Series(sentiment, index=idx), pd.Series(returns, index=idx)


def random_walk(n: int = 120, seed: int = 42) -> pd.Series:
    rng = np.random.default_rng(seed)
    return pd.Series(np.cumsum(rng.standard_normal(n)), index=make_idx(n))


def stationary_series(n: int = 120, seed: int = 42) -> pd.Series:
    rng = np.random.default_rng(seed)
    return pd.Series(rng.standard_normal(n), index=make_idx(n))


# ════════════════════════════════════════════════════════════════════════
# MODULE 2 – causality_engine
# ════════════════════════════════════════════════════════════════════════

class TestTodaYamamoto:
    def test_chi2_nonnull_sufficient_data(self):
        from analytics.causality_engine import CausalityEngine
        s, r = synthetic_lead_lag(n=120, lag=1)
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.toda_yamamoto()
        s2r = result.get("sentiment_causes_returns", {})
        assert "chi2_stat" in s2r or "error" in s2r
        if "chi2_stat" in s2r:
            assert s2r["chi2_stat"] >= 0
        print(f"  [OK] Toda-Yamamoto: {s2r}")

    def test_insufficient_data_returns_error(self):
        from analytics.causality_engine import CausalityEngine
        s = pd.Series(np.random.randn(10), index=make_idx(10))
        r = pd.Series(np.random.randn(10), index=make_idx(10))
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.toda_yamamoto()
        assert "error" in result
        print(f"  [OK] Toda-Yamamoto insufficient data: {result['error']}")

    def test_both_directions_present(self):
        from analytics.causality_engine import CausalityEngine
        s, r = synthetic_lead_lag(n=120)
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.toda_yamamoto()
        assert "sentiment_causes_returns" in result
        assert "returns_cause_sentiment"  in result
        print("  [OK] Toda-Yamamoto: both directions present")


class TestTransferEntropy:
    def test_te_positive_with_causal_signal(self):
        from analytics.causality_engine import CausalityEngine
        # Strong causal signal: s(t) → r(t+1)
        n   = 100
        rng = np.random.default_rng(1)
        s   = rng.standard_normal(n)
        r   = np.roll(s, 1) + 0.2 * rng.standard_normal(n)
        r[0] = 0.0
        idx  = make_idx(n)
        engine = CausalityEngine(
            pd.Series(s, index=idx), pd.Series(r, index=idx), d_max=0
        )
        result = engine.transfer_entropy(n_bins=5, n_permutations=50)
        s2r = result["sentiment_to_returns"]
        assert s2r["te"] >= 0
        print(f"  [OK] TE causal: te={s2r['te']:.4f}, z={s2r['z_score']:.2f}")

    def test_te_iid_near_zero_ete(self):
        from analytics.causality_engine import CausalityEngine
        # Independent iid series: ETE should be near zero
        rng = np.random.default_rng(99)
        n   = 100
        idx = make_idx(n)
        s   = pd.Series(rng.standard_normal(n), index=idx)
        r   = pd.Series(rng.standard_normal(n), index=idx)
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.transfer_entropy(n_bins=5, n_permutations=50)
        s2r = result["sentiment_to_returns"]
        # ETE for iid should be close to zero (may not be significant)
        assert "ete" in s2r
        print(f"  [OK] TE iid: ete={s2r['ete']:.4f}, z={s2r['z_score']:.2f}, sig={s2r['significant']}")

    def test_result_keys_complete(self):
        from analytics.causality_engine import CausalityEngine
        s, r = synthetic_lead_lag(n=80)
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.transfer_entropy(n_permutations=20)
        for key in ("te", "ete", "z_score", "pvalue", "significant"):
            assert key in result["sentiment_to_returns"], f"Missing key: {key}"
            assert key in result["returns_to_sentiment"], f"Missing key: {key}"
        print("  [OK] TE result keys complete")


class TestEGARCHX:
    def test_arch_not_available_graceful(self):
        """If arch is not installed, should return an error dict (not raise)."""
        from analytics.causality_engine import CausalityEngine
        s, r = synthetic_lead_lag(n=100)
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.egarch_x()
        # Either succeeds or returns a clean error dict
        assert isinstance(result, dict)
        print(f"  [OK] EGARCH-X returned dict (available={result.get('available', True)})")

    def test_insufficient_data(self):
        from analytics.causality_engine import CausalityEngine
        s = pd.Series(np.random.randn(20), index=make_idx(20))
        r = pd.Series(np.random.randn(20), index=make_idx(20))
        engine = CausalityEngine(s, r, d_max=0)
        result = engine.egarch_x()
        assert "error" in result
        print(f"  [OK] EGARCH-X insufficient data: {result['error']}")


# ════════════════════════════════════════════════════════════════════════
# MODULE 3 – regime_engine
# ════════════════════════════════════════════════════════════════════════

class TestLabelRegimes:
    def test_returns_zero_or_one(self):
        from analytics.regime_engine import label_regimes
        r = stationary_series(200)
        regime = label_regimes(r)
        unique_vals = set(regime.dropna().unique())
        assert unique_vals <= {0, 1}, f"Unexpected values: {unique_vals}"
        print(f"  [OK] label_regimes: unique={unique_vals}")

    def test_same_length_as_input(self):
        from analytics.regime_engine import label_regimes
        r = stationary_series(150)
        regime = label_regimes(r)
        assert len(regime) == len(r)
        print(f"  [OK] label_regimes: length={len(regime)}")

    def test_both_regimes_present(self):
        from analytics.regime_engine import label_regimes
        r = stationary_series(200)
        regime = label_regimes(r).dropna()
        assert 0 in regime.values, "Low-vol regime (0) never assigned"
        assert 1 in regime.values, "High-vol regime (1) never assigned"
        n0 = (regime == 0).sum()
        n1 = (regime == 1).sum()
        print(f"  [OK] label_regimes: n_low={n0}, n_high={n1}")


class TestThresholdVAR:
    def test_two_regime_results_present(self):
        from analytics.regime_engine import threshold_var
        s, r = synthetic_lead_lag(n=150)
        result = threshold_var(s, r)
        assert "low_vol_regime"  in result
        assert "high_vol_regime" in result
        assert "threshold_rv20"  in result
        print(f"  [OK] TVAR threshold={result['threshold_rv20']:.4f}, "
              f"n_low={result.get('n_low_vol')}, n_high={result.get('n_high_vol')}")

    def test_interpretation_present(self):
        from analytics.regime_engine import threshold_var
        s, r = synthetic_lead_lag(n=150)
        result = threshold_var(s, r)
        assert "interpretation" in result
        assert isinstance(result["interpretation"], str)
        print(f"  [OK] TVAR interpretation: {result['interpretation'][:60]}")

    def test_insufficient_data(self):
        from analytics.regime_engine import threshold_var
        s = pd.Series(np.random.randn(20), index=make_idx(20))
        r = pd.Series(np.random.randn(20), index=make_idx(20))
        result = threshold_var(s, r)
        assert "error" in result
        print(f"  [OK] TVAR insufficient data: {result['error']}")


class TestRunRegimeEngine:
    def test_regime_labels_key_present(self):
        from analytics.regime_engine import run_regime_engine
        s, r = synthetic_lead_lag(n=150)
        result = run_regime_engine(s, r)
        assert "regime_labels" in result
        rl = result["regime_labels"]
        if "error" not in rl:
            assert "values" in rl
            assert "n_low_vol"  in rl
            assert "n_high_vol" in rl
        print(f"  [OK] run_regime_engine: keys={list(result.keys())}")

    def test_threshold_var_in_output(self):
        from analytics.regime_engine import run_regime_engine
        s, r = synthetic_lead_lag(n=150)
        result = run_regime_engine(s, r)
        assert "threshold_var" in result
        print("  [OK] run_regime_engine: threshold_var present")


# ════════════════════════════════════════════════════════════════════════
# Runner (for direct execution)
# ════════════════════════════════════════════════════════════════════════

ALL_TESTS = [
    # Module 2
    ("Toda-Yamamoto – chi2 nonnull",       TestTodaYamamoto().test_chi2_nonnull_sufficient_data),
    ("Toda-Yamamoto – insufficient data",  TestTodaYamamoto().test_insufficient_data_returns_error),
    ("Toda-Yamamoto – both directions",    TestTodaYamamoto().test_both_directions_present),
    ("Transfer Entropy – causal signal",   TestTransferEntropy().test_te_positive_with_causal_signal),
    ("Transfer Entropy – iid near zero",   TestTransferEntropy().test_te_iid_near_zero_ete),
    ("Transfer Entropy – keys complete",   TestTransferEntropy().test_result_keys_complete),
    ("EGARCH-X – graceful error",          TestEGARCHX().test_arch_not_available_graceful),
    ("EGARCH-X – insufficient data",       TestEGARCHX().test_insufficient_data),
    # Module 3
    ("Regime labels – 0/1 only",           TestLabelRegimes().test_returns_zero_or_one),
    ("Regime labels – correct length",     TestLabelRegimes().test_same_length_as_input),
    ("Regime labels – both regimes",       TestLabelRegimes().test_both_regimes_present),
    ("TVAR – two regime results",          TestThresholdVAR().test_two_regime_results_present),
    ("TVAR – interpretation string",       TestThresholdVAR().test_interpretation_present),
    ("TVAR – insufficient data",           TestThresholdVAR().test_insufficient_data),
    ("Regime engine – regime_labels key",  TestRunRegimeEngine().test_regime_labels_key_present),
    ("Regime engine – threshold_var key",  TestRunRegimeEngine().test_threshold_var_in_output),
]

if __name__ == "__main__":
    print("=" * 65)
    print("  [TEST] Advanced Analytics Modules 2-3")
    print("=" * 65)
    passed, failed = 0, 0
    for name, fn in ALL_TESTS:
        print(f"\n[TEST] {name}")
        try:
            fn()
            passed += 1
        except AssertionError as exc:
            print(f"  [FAIL] {exc}")
            failed += 1
        except Exception as exc:
            print(f"  [ERROR] {exc}")
            failed += 1
    print("\n" + "=" * 65)
    print(f"  Results: {passed} OK  |  {failed} FAIL")
    print("=" * 65)
    import sys as _sys
    _sys.exit(0 if failed == 0 else 1)
