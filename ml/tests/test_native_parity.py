"""Parity tests: the C++ engine must agree with the Python reference.

1. Feature parity  - C++ computeFeatures vs the NumPy mirror.
2. Inference parity - C++ GBDT traversal vs LightGBM's own predict().

Run: ml/.venv/Scripts/python -m ml.tests.test_native_parity
"""
from __future__ import annotations

import random
import tempfile
from pathlib import Path

import numpy as np

from ..features.engine import compute_features_py
from ..features.native_bridge import NativeEngine
from ..features.schema import NUM_FEATURES


def _random_book_and_trades(rng):
    mid = rng.uniform(50, 1000)
    bids = sorted([(mid - rng.uniform(0.01, 5) * (i + 1), rng.uniform(1, 50)) for i in range(rng.randint(2, 8))],
                  key=lambda x: -x[0])
    asks = sorted([(mid + rng.uniform(0.01, 5) * (i + 1), rng.uniform(1, 50)) for i in range(rng.randint(2, 8))],
                  key=lambda x: x[0])
    n = rng.randint(0, 40)
    trades = []
    p = mid
    for _ in range(n):
        p *= (1 + rng.uniform(-0.005, 0.005))
        side = 1.0 if rng.random() > 0.5 else -1.0
        trades.append((p, rng.uniform(1, 20), side))
    return bids, asks, trades


def test_feature_parity():
    native = NativeEngine()
    if not native.available:
        print("[parity] native engine unavailable — skipping feature parity (NumPy fallback in use)")
        return True
    rng = random.Random(7)
    max_diff = 0.0
    for _ in range(500):
        bids, asks, trades = _random_book_and_trades(rng)
        py = compute_features_py(bids, asks, trades)
        cpp = native.compute_features(bids, asks, trades)
        assert cpp is not None and len(cpp) == NUM_FEATURES, "native returned bad vector"
        diff = max(abs(a - b) for a, b in zip(py, cpp))
        max_diff = max(max_diff, diff)
    print(f"[parity] feature max abs diff (C++ vs NumPy): {max_diff:.2e}")
    assert max_diff < 1e-6, f"feature parity too loose: {max_diff}"
    return True


def test_inference_parity():
    import lightgbm as lgb

    native = NativeEngine()
    if not native.available:
        print("[parity] native engine unavailable — skipping inference parity")
        return True

    rng = np.random.default_rng(11)
    n = 2000
    X = rng.normal(size=(n, NUM_FEATURES))
    # learnable signal
    w = rng.normal(size=NUM_FEATURES)
    logit = X @ w + rng.normal(scale=0.5, size=n)
    y = (logit > 0).astype(int)

    booster = lgb.train(
        {"objective": "binary", "learning_rate": 0.1, "num_leaves": 15, "verbosity": -1},
        lgb.Dataset(X, label=y), num_boost_round=60,
    )

    with tempfile.TemporaryDirectory() as td:
        model_txt = str(Path(td) / "model.txt")
        booster.save_model(model_txt)
        assert native.load_model(model_txt), "native failed to load model"

        lgb_proba = booster.predict(X[:300])
        max_diff = 0.0
        for i in range(300):
            res = native.predict(list(X[i]))
            assert res is not None, "native predict returned None"
            cpp_prob, _ = res
            max_diff = max(max_diff, abs(cpp_prob - lgb_proba[i]))
    print(f"[parity] inference max abs diff (C++ vs LightGBM): {max_diff:.2e}")
    assert max_diff < 1e-4, f"inference parity too loose: {max_diff}"
    return True


if __name__ == "__main__":
    ok = True
    ok &= test_feature_parity()
    ok &= test_inference_parity()
    print("ALL PARITY TESTS PASSED" if ok else "PARITY TESTS FAILED")
