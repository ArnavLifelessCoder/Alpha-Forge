"""DuckDB feature store.

Tables
------
features     : one microstructure snapshot per (symbol, ts) with the 13 features,
               the order-book mid, and a reference price.
predictions  : every served prediction, later joined with the realized outcome
               for live accuracy / calibration monitoring.
drift        : per-feature PSI / KL divergence vs the training distribution.
train_runs   : a registry-friendly log of every training run.

Connections are short-lived with lock retry so the ingest writer and the
training / serving readers can share the single DuckDB file.
"""
from __future__ import annotations

import json
import time
from contextlib import contextmanager
from typing import Dict, Iterable, List, Optional

import duckdb
import pandas as pd

from .. import config
from ..features.schema import FEATURE_NAMES

_FEATURE_COLS = ", ".join(f"{name} DOUBLE" for name in FEATURE_NAMES)


@contextmanager
def connect(read_only: bool = False, retries: int = 40, backoff: float = 0.25):
    """Yield a DuckDB connection, retrying briefly if the file is locked."""
    config.ensure_dirs()
    last_err = None
    for _ in range(retries):
        try:
            con = duckdb.connect(str(config.DB_PATH), read_only=read_only)
            try:
                yield con
            finally:
                con.close()
            return
        except (duckdb.IOException, duckdb.Error) as e:
            last_err = e
            time.sleep(backoff)
    raise RuntimeError(f"could not open DuckDB at {config.DB_PATH}: {last_err}")


def init_db() -> None:
    with connect() as con:
        con.execute(
            f"""
            CREATE TABLE IF NOT EXISTS features (
                ts BIGINT,
                symbol VARCHAR,
                mid DOUBLE,
                ref_price DOUBLE,
                feature_backend VARCHAR,
                {_FEATURE_COLS}
            );
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                ts BIGINT,
                symbol VARCHAR,
                model_version VARCHAR,
                prob DOUBLE,
                raw DOUBLE,
                pred_dir INTEGER,
                infer_backend VARCHAR,
                horizon_ts BIGINT,
                entry_price DOUBLE,
                outcome_price DOUBLE,
                realized_dir INTEGER,
                correct INTEGER
            );
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS drift (
                ts BIGINT,
                model_version VARCHAR,
                feature VARCHAR,
                psi DOUBLE,
                kl DOUBLE
            );
            """
        )
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS train_runs (
                run_id VARCHAR,
                ts BIGINT,
                model_version VARCHAR,
                n_rows BIGINT,
                auc DOUBLE,
                accuracy DOUBLE,
                params VARCHAR,
                promoted INTEGER
            );
            """
        )


# --- features --------------------------------------------------------------
def insert_features(rows: Iterable[Dict]) -> int:
    rows = list(rows)
    if not rows:
        return 0
    cols = ["ts", "symbol", "mid", "ref_price", "feature_backend"] + FEATURE_NAMES
    placeholders = ", ".join("?" for _ in cols)
    values = []
    for r in rows:
        values.append([r.get(c) for c in cols])
    with connect() as con:
        con.executemany(
            f"INSERT INTO features ({', '.join(cols)}) VALUES ({placeholders})", values
        )
    return len(rows)


def load_features(symbol: Optional[str] = None) -> pd.DataFrame:
    sql = "SELECT * FROM features"
    params: List = []
    if symbol:
        sql += " WHERE symbol = ?"
        params.append(symbol)
    sql += " ORDER BY symbol, ts"
    with connect(read_only=True) as con:
        return con.execute(sql, params).fetchdf()


def feature_count() -> int:
    with connect(read_only=True) as con:
        return con.execute("SELECT COUNT(*) FROM features").fetchone()[0]


def latest_feature_row(symbol: str) -> Optional[Dict]:
    """Most recent feature snapshot for a symbol as a dict (features + mid + ts)."""
    cols = ["ts", "symbol", "mid", "ref_price", "feature_backend"] + FEATURE_NAMES
    with connect(read_only=True) as con:
        row = con.execute(
            f"SELECT {', '.join(cols)} FROM features WHERE symbol = ? "
            "ORDER BY ts DESC LIMIT 1",
            [symbol],
        ).fetchone()
    if not row:
        return None
    return dict(zip(cols, row))


# --- predictions -----------------------------------------------------------
def insert_prediction(row: Dict) -> None:
    cols = [
        "ts", "symbol", "model_version", "prob", "raw", "pred_dir", "infer_backend",
        "horizon_ts", "entry_price", "outcome_price", "realized_dir", "correct",
    ]
    placeholders = ", ".join("?" for _ in cols)
    with connect() as con:
        con.execute(
            f"INSERT INTO predictions ({', '.join(cols)}) VALUES ({placeholders})",
            [row.get(c) for c in cols],
        )


def resolve_prediction_outcomes(now_ms: int) -> int:
    """Fill outcome for predictions whose horizon has elapsed, using the nearest
    later feature mid for the same symbol. Returns number resolved."""
    with connect() as con:
        pending = con.execute(
            "SELECT rowid, symbol, horizon_ts, entry_price, pred_dir FROM predictions "
            "WHERE outcome_price IS NULL AND horizon_ts <= ?",
            [now_ms],
        ).fetchall()
        resolved = 0
        for rowid, symbol, horizon_ts, entry, pred_dir in pending:
            row = con.execute(
                "SELECT mid FROM features WHERE symbol = ? AND ts >= ? AND mid IS NOT NULL "
                "ORDER BY ts ASC LIMIT 1",
                [symbol, horizon_ts],
            ).fetchone()
            if not row or row[0] is None or entry in (None, 0):
                continue
            outcome = row[0]
            realized_dir = 1 if outcome > entry else 0
            correct = 1 if realized_dir == pred_dir else 0
            con.execute(
                "UPDATE predictions SET outcome_price = ?, realized_dir = ?, correct = ? "
                "WHERE rowid = ?",
                [outcome, realized_dir, correct, rowid],
            )
            resolved += 1
    return resolved


def prediction_performance(window: int = 500) -> Dict:
    with connect(read_only=True) as con:
        df = con.execute(
            "SELECT symbol, prob, pred_dir, realized_dir, correct, ts FROM predictions "
            "WHERE correct IS NOT NULL ORDER BY ts DESC LIMIT ?",
            [window],
        ).fetchdf()
    if df.empty:
        return {"n": 0, "accuracy": None, "by_symbol": {}, "calibration": []}
    acc = float(df["correct"].mean())
    by_symbol = (
        df.groupby("symbol")["correct"].agg(["mean", "count"]).to_dict(orient="index")
    )
    by_symbol = {k: {"accuracy": float(v["mean"]), "n": int(v["count"])} for k, v in by_symbol.items()}
    # Reliability curve (predicted prob vs empirical frequency)
    calibration = []
    bins = [(i / 10.0, (i + 1) / 10.0) for i in range(10)]
    for lo, hi in bins:
        m = (df["prob"] >= lo) & (df["prob"] < hi)
        if m.sum() > 0:
            calibration.append({
                "bucket": round((lo + hi) / 2, 2),
                "predicted": round(float(df.loc[m, "prob"].mean()), 4),
                "empirical": round(float(df.loc[m, "realized_dir"].mean()), 4),
                "n": int(m.sum()),
            })
    return {"n": int(len(df)), "accuracy": acc, "by_symbol": by_symbol, "calibration": calibration}


# --- drift -----------------------------------------------------------------
def insert_drift(rows: Iterable[Dict]) -> None:
    rows = list(rows)
    if not rows:
        return
    with connect() as con:
        con.executemany(
            "INSERT INTO drift (ts, model_version, feature, psi, kl) VALUES (?, ?, ?, ?, ?)",
            [[r["ts"], r["model_version"], r["feature"], r["psi"], r["kl"]] for r in rows],
        )


def latest_drift() -> pd.DataFrame:
    with connect(read_only=True) as con:
        return con.execute(
            "SELECT * FROM drift WHERE ts = (SELECT MAX(ts) FROM drift)"
        ).fetchdf()


def drift_history(feature: Optional[str] = None, limit: int = 200) -> pd.DataFrame:
    sql = "SELECT * FROM drift"
    params: List = []
    if feature:
        sql += " WHERE feature = ?"
        params.append(feature)
    sql += " ORDER BY ts DESC LIMIT ?"
    params.append(limit)
    with connect(read_only=True) as con:
        return con.execute(sql, params).fetchdf()


# --- train runs ------------------------------------------------------------
def record_train_run(run: Dict) -> None:
    with connect() as con:
        con.execute(
            "INSERT INTO train_runs (run_id, ts, model_version, n_rows, auc, accuracy, params, promoted) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                run["run_id"], run["ts"], run["model_version"], run["n_rows"],
                run.get("auc"), run.get("accuracy"), json.dumps(run.get("params", {})),
                int(run.get("promoted", 0)),
            ],
        )


def train_runs(limit: int = 50) -> pd.DataFrame:
    with connect(read_only=True) as con:
        return con.execute(
            "SELECT * FROM train_runs ORDER BY ts DESC LIMIT ?", [limit]
        ).fetchdf()
