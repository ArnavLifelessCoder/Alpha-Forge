"""Build a labelled, point-in-time training set from the feature store.

Label = sign of the forward order-book mid return over `LABEL_HORIZON_SEC`. For
each feature row at time t we look up the first mid recorded at or after
t + horizon (per symbol) and label 1 if it is higher, else 0. A deadband drops
near-flat moves so the model learns direction, not micro-jitter.
"""
from __future__ import annotations

from typing import Optional, Tuple

import numpy as np
import pandas as pd

from .. import config
from ..features.schema import FEATURE_NAMES
from ..store import db


def build_dataset(symbol: Optional[str] = None) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Returns (X, y, meta). meta carries symbol/ts/mid/future_mid for inspection."""
    df = db.load_features(symbol)
    if df.empty:
        return pd.DataFrame(columns=FEATURE_NAMES), pd.Series(dtype=int), pd.DataFrame()

    horizon_ms = config.LABEL_HORIZON_SEC * 1000
    frames = []
    for sym, g in df.groupby("symbol"):
        g = g.sort_values("ts").reset_index(drop=True)
        ts = g["ts"].to_numpy()
        mid = g["mid"].to_numpy(dtype=float)
        # first index whose ts >= ts_i + horizon
        idx = np.searchsorted(ts, ts + horizon_ms, side="left")
        valid = idx < len(ts)
        future_mid = np.full(len(ts), np.nan)
        future_mid[valid] = mid[idx[valid]]
        g = g.assign(future_mid=future_mid)
        frames.append(g)

    full = pd.concat(frames, ignore_index=True)
    full = full.dropna(subset=["mid", "future_mid"])
    full = full[full["mid"] > 0]

    ret = full["future_mid"] / full["mid"] - 1.0
    # deadband: drop near-flat samples
    keep = ret.abs() >= config.LABEL_DEADBAND
    full = full[keep]
    ret = ret[keep]

    y = (ret > 0).astype(int)
    X = full[FEATURE_NAMES].astype(float).reset_index(drop=True)
    meta = full[["symbol", "ts", "mid", "future_mid"]].reset_index(drop=True)
    return X, y.reset_index(drop=True), meta
