"""Data-drift monitoring.

Compares the live feature distribution against the champion model's training
distribution using Population Stability Index (PSI) and KL divergence, per
feature. Results are written to the `drift` table and surfaced on the dashboard.
"""
from __future__ import annotations

import time
from typing import Dict, List, Optional

import numpy as np

from .. import config
from ..features.schema import FEATURE_NAMES
from ..registry import registry
from ..store import db

_EPS = 1e-6


def psi(expected: np.ndarray, actual: np.ndarray) -> float:
    e = np.clip(expected, _EPS, None)
    a = np.clip(actual, _EPS, None)
    return float(np.sum((a - e) * np.log(a / e)))


def kl_divergence(p: np.ndarray, q: np.ndarray) -> float:
    p = np.clip(p, _EPS, None)
    q = np.clip(q, _EPS, None)
    return float(np.sum(p * np.log(p / q)))


def _props_for(col: np.ndarray, edges: List[float]) -> np.ndarray:
    edges = np.asarray(edges, dtype=float)
    counts, _ = np.histogram(col, bins=edges)
    total = counts.sum()
    return counts / total if total > 0 else np.zeros(len(counts))


def compute_drift(baseline: Dict, live_df) -> List[Dict]:
    """baseline: champion meta['feature_baseline']; live_df: recent feature rows."""
    out = []
    for name in FEATURE_NAMES:
        if name not in baseline or live_df.empty:
            continue
        ref = baseline[name]
        col = live_df[name].to_numpy(dtype=float)
        actual = _props_for(col, ref["edges"])
        expected = np.asarray(ref["props"], dtype=float)
        if len(actual) != len(expected):
            continue
        out.append({
            "feature": name,
            "psi": round(psi(expected, actual), 6),
            "kl": round(kl_divergence(expected, actual), 6),
        })
    return out


def run_drift_check(window: int = 300, model_version: Optional[str] = None) -> Dict:
    """Compute drift for the most recent `window` live feature rows vs champion."""
    import json
    from pathlib import Path

    champ = registry.get_champion()
    if not champ:
        return {"status": "no_champion"}
    version = model_version or champ["version"]
    meta_path = Path(registry.model_dir(version) / "meta.json")
    if not meta_path.exists():
        return {"status": "no_baseline"}
    baseline = json.loads(meta_path.read_text()).get("feature_baseline", {})

    df = db.load_features()
    if df.empty:
        return {"status": "no_data"}
    live = df.tail(window)
    rows = compute_drift(baseline, live)
    if not rows:
        return {"status": "no_features"}

    ts = int(time.time() * 1000)
    for r in rows:
        r["ts"] = ts
        r["model_version"] = version
    db.insert_drift(rows)

    max_psi = max(r["psi"] for r in rows)
    status = "ok" if max_psi < 0.1 else ("warning" if max_psi < 0.25 else "alert")
    return {"status": status, "max_psi": max_psi, "n_features": len(rows), "drift": rows}


# PSI interpretation thresholds (industry convention):
#   < 0.1  : no significant shift
#   0.1-0.25: moderate shift (monitor)
#   > 0.25 : major shift (retrain)
