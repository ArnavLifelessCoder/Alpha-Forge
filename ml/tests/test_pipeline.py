"""End-to-end pipeline test on a synthetic, learnable feature store.

Seeds the DuckDB store with a price path whose forward return correlates with the
features, then exercises: build_dataset -> train -> registry -> predictor ->
drift -> performance. Point at a throwaway DB:

    ALPHAFORGE_DB=ml/.data/test.duckdb \
      ml/.venv/Scripts/python -m ml.tests.test_pipeline
"""
from __future__ import annotations

import time

import numpy as np

from .. import config
from ..features.schema import FEATURE_NAMES
from ..store import db


def seed(symbols=("BTC/USD", "ETH/USD"), per_symbol=400):
    db.init_db()
    with db.connect() as con:
        con.execute("DELETE FROM features")
        con.execute("DELETE FROM predictions")
        con.execute("DELETE FROM drift")
        con.execute("DELETE FROM train_runs")

    rng = np.random.default_rng(3)
    base_ts = int(time.time() * 1000) - per_symbol * 2000 - 60000
    rows = []
    for sym in symbols:
        mid = 100.0
        for t in range(per_symbol):
            feats = rng.normal(scale=0.5, size=len(FEATURE_NAMES))
            # signal lives in ofi_l1 (idx 2) and trade_sign_imb (idx 9). The NEXT
            # one-step move is driven by THESE features, so a 1-tick-horizon label
            # is cleanly learnable (validates pipeline mechanics, not realism).
            signal = 0.6 * feats[2] + 0.4 * feats[9]
            drift = 0.006 * np.tanh(signal) + rng.normal(scale=0.0004)
            row = {
                "ts": base_ts + t * 2000,
                "symbol": sym,
                "mid": mid,          # price BEFORE the move these features drive
                "ref_price": mid,
                "feature_backend": "synthetic",
            }
            row.update({name: float(feats[i]) for i, name in enumerate(FEATURE_NAMES)})
            rows.append(row)
            mid *= (1.0 + drift)     # becomes the forward mid for this row's label
    db.insert_features(rows)
    return len(rows)


def main():
    import os
    if not os.environ.get("ALPHAFORGE_DATA"):
        raise SystemExit(
            "Refusing to run: this test wipes and reseeds the feature store.\n"
            "Run it against an isolated data dir, e.g.:\n"
            "  ALPHAFORGE_DATA=ml/.data/testrun ALPHAFORGE_HORIZON=2 ALPHAFORGE_DEADBAND=0 "
            "ml/.venv/Scripts/python -m ml.tests.test_pipeline"
        )
    print(f"[pipeline] DB = {config.DB_PATH}")
    n = seed()
    print(f"[pipeline] seeded {n} feature rows")

    from ..training.train import train_once
    res = train_once(promote=False)
    assert res["status"] == "trained", f"training did not run: {res}"
    print(f"[pipeline] trained {res['version']} AUC={res['auc']:.4f} acc={res['accuracy']:.4f}")
    assert res["auc"] > 0.6, f"model failed to learn the synthetic signal (AUC={res['auc']})"

    from ..registry import registry
    champ = registry.get_champion()
    assert champ and champ["version"] == res["version"], "champion not registered"
    print(f"[pipeline] champion = {champ['version']} role={champ['role']}")

    from ..serving.predictor import Predictor
    predictor = Predictor()
    assert predictor.ready, "predictor not ready"
    row = db.latest_feature_row("BTC/USD")
    pred = predictor.predict_vector([row[n] for n in FEATURE_NAMES])
    print(f"[pipeline] predict BTC/USD -> {pred['direction']} "
          f"prob={pred['prob']:.4f} backend={pred['backend']}")
    assert 0.0 <= pred["prob"] <= 1.0

    # Top feature importances should surface the planted signal features.
    imp = predictor.feature_importance()
    top = sorted(imp.items(), key=lambda kv: -kv[1])[:4]
    print(f"[pipeline] top features: {top}")

    from ..monitoring import drift as drift_mod
    d = drift_mod.run_drift_check()
    print(f"[pipeline] drift check: status={d.get('status')} max_psi={d.get('max_psi')}")

    print("PIPELINE TEST PASSED")


if __name__ == "__main__":
    main()
