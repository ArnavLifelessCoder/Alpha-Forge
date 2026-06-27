"""Train a LightGBM directional model, track it in MLflow, export it for the C++
engine, and register it in the champion/challenger registry.

Run:
    python -m ml.training.train                # train a challenger (1st = champion)
    python -m ml.training.train --promote      # promote if it beats the champion
"""
from __future__ import annotations

import argparse
import json
import time
import uuid
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from .. import config
from ..features.schema import FEATURE_NAMES
from ..registry import registry
from ..store import db
from .dataset import build_dataset


def _time_split(X, y, valid_frac: float = 0.2):
    n = len(X)
    cut = int(n * (1 - valid_frac))
    return X.iloc[:cut], y.iloc[:cut], X.iloc[cut:], y.iloc[cut:]


def _feature_baseline(X) -> Dict:
    """Decile bin edges + proportions per feature, used as the drift reference."""
    baseline = {}
    for name in FEATURE_NAMES:
        col = X[name].to_numpy(dtype=float)
        edges = np.unique(np.quantile(col, np.linspace(0, 1, 11)))
        if len(edges) < 2:
            edges = np.array([col.min() - 1e-9, col.max() + 1e-9])
        counts, _ = np.histogram(col, bins=edges)
        props = counts / max(counts.sum(), 1)
        baseline[name] = {
            "edges": edges.tolist(),
            "props": props.tolist(),
            "mean": float(col.mean()),
            "std": float(col.std()),
        }
    return baseline


def train_once(promote: bool = False) -> Dict:
    config.ensure_dirs()
    db.init_db()

    X, y, meta = build_dataset()
    n_rows = len(X)
    if n_rows < config.MIN_TRAIN_ROWS or y.nunique() < 2:
        msg = (f"not enough data to train (rows={n_rows}, "
               f"classes={y.nunique()}, need>={config.MIN_TRAIN_ROWS})")
        print(f"[train] {msg}")
        return {"status": "skipped", "reason": msg, "n_rows": n_rows}

    import lightgbm as lgb
    from sklearn.metrics import roc_auc_score, accuracy_score

    Xtr, ytr, Xva, yva = _time_split(X, y)
    params = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 1,
        "min_child_samples": 20,
        "verbosity": -1,
    }
    dtrain = lgb.Dataset(Xtr, label=ytr)
    dvalid = lgb.Dataset(Xva, label=yva, reference=dtrain)
    booster = lgb.train(
        params, dtrain, num_boost_round=300, valid_sets=[dvalid],
        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)],
    )

    proba = booster.predict(Xva)
    try:
        auc = float(roc_auc_score(yva, proba))
    except ValueError:
        auc = float("nan")
    acc = float(accuracy_score(yva, (proba >= 0.5).astype(int)))

    version = registry.next_version()
    mdir = registry.model_dir(version)
    mdir.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(mdir / "model.txt"))  # text format for the C++ engine
    import joblib
    joblib.dump(booster, str(mdir / "model.pkl"))

    importance = dict(zip(FEATURE_NAMES,
                          [int(v) for v in booster.feature_importance(importance_type="gain")]))
    baseline = _feature_baseline(X)
    run_id = uuid.uuid4().hex[:12]
    meta_out = {
        "version": version,
        "run_id": run_id,
        "n_rows": n_rows,
        "auc": auc,
        "accuracy": acc,
        "params": params,
        "horizon_sec": config.LABEL_HORIZON_SEC,
        "feature_names": FEATURE_NAMES,
        "feature_importance": importance,
        "feature_baseline": baseline,
        "best_iteration": booster.best_iteration,
    }
    (mdir / "meta.json").write_text(json.dumps(meta_out, indent=2))

    # MLflow tracking (best-effort; never block training on it)
    _log_mlflow(version, run_id, params, auc, acc, n_rows, importance, mdir)

    entry = registry.register(version, {
        "run_id": run_id, "n_rows": n_rows, "auc": auc, "accuracy": acc,
        "params": params, "feature_importance": importance,
        "horizon_sec": config.LABEL_HORIZON_SEC,
    })

    promoted = entry.get("role") == "champion"  # first model auto-champion
    if promote and not promoted:
        champ = registry.get_champion()
        champ_auc = champ.get("auc", 0.0) if champ else 0.0
        if auc >= (champ_auc + config.PROMOTION_MARGIN):
            registry.set_champion(version)
            promoted = True
            print(f"[train] promoted {version} (AUC {auc:.4f} > champ {champ_auc:.4f})")
        else:
            print(f"[train] kept champion (challenger AUC {auc:.4f} <= "
                  f"{champ_auc:.4f}+{config.PROMOTION_MARGIN})")

    db.record_train_run({
        "run_id": run_id, "ts": int(time.time() * 1000), "model_version": version,
        "n_rows": n_rows, "auc": auc, "accuracy": acc, "params": params,
        "promoted": int(promoted),
    })

    print(f"[train] {version} rows={n_rows} AUC={auc:.4f} acc={acc:.4f} "
          f"role={'champion' if promoted else 'challenger'}")
    return {"status": "trained", "version": version, "auc": auc, "accuracy": acc,
            "n_rows": n_rows, "promoted": promoted, "feature_importance": importance}


def _log_mlflow(version, run_id, params, auc, acc, n_rows, importance, mdir: Path) -> None:
    try:
        import mlflow
        # Use the sqlite backend (the file store is deprecated/maintenance-mode in
        # mlflow >=3). Artifacts live alongside it under mlruns/artifacts.
        config.ensure_dirs()
        tracking_uri = f"sqlite:///{(config.MLRUNS_DIR / 'mlflow.db').as_posix()}"
        mlflow.set_tracking_uri(tracking_uri)
        if mlflow.get_experiment_by_name("alphaforge") is None:
            mlflow.create_experiment(
                "alphaforge", artifact_location=(config.MLRUNS_DIR / "artifacts").as_uri()
            )
        mlflow.set_experiment("alphaforge")
        with mlflow.start_run(run_name=version):
            mlflow.log_params(params)
            mlflow.log_param("horizon_sec", config.LABEL_HORIZON_SEC)
            mlflow.log_metric("auc", auc if auc == auc else 0.0)  # NaN guard
            mlflow.log_metric("accuracy", acc)
            mlflow.log_metric("n_rows", n_rows)
            mlflow.set_tag("version", version)
            mlflow.set_tag("run_id", run_id)
            mlflow.log_dict(importance, "feature_importance.json")
            mlflow.log_artifact(str(mdir / "model.txt"))
    except Exception as e:  # mlflow optional / may not be configured
        print(f"[train] mlflow logging skipped: {e}")


def main():
    ap = argparse.ArgumentParser(description="Train AlphaForge directional model")
    ap.add_argument("--promote", action="store_true",
                    help="promote challenger to champion if it beats the current champion")
    args = ap.parse_args()
    train_once(promote=args.promote)


if __name__ == "__main__":
    main()
