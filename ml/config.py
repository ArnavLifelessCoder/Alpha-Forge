"""Central configuration for the AlphaForge MLOps stack.

All paths are derived from the repository layout so the stack works regardless of
the current working directory. Environment variables override the defaults so the
same code runs locally, in Docker, or in CI.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# --- Paths -----------------------------------------------------------------
ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent
DATA_DIR = Path(os.environ.get("ALPHAFORGE_DATA", ML_DIR / ".data")).resolve()
MODELS_DIR = DATA_DIR / "models"
DB_PATH = Path(os.environ.get("ALPHAFORGE_DB", DATA_DIR / "alphaforge.duckdb")).resolve()
REGISTRY_PATH = DATA_DIR / "registry.json"
MLRUNS_DIR = Path(os.environ.get("MLFLOW_DIR", ML_DIR / "mlruns")).resolve()

# Native C++ engine binary (optional — falls back to NumPy when absent).
_native_name = "alphaforge_engine.exe" if sys.platform.startswith("win") else "alphaforge_engine"
NATIVE_BIN = Path(os.environ.get("ALPHAFORGE_NATIVE", REPO_ROOT / "native" / "bin" / _native_name))

# --- Backend / serving -----------------------------------------------------
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080")
SERVING_HOST = os.environ.get("ALPHAFORGE_HOST", "0.0.0.0")
SERVING_PORT = int(os.environ.get("ALPHAFORGE_PORT", "8090"))

# --- Market / labelling ----------------------------------------------------
SYMBOLS = [
    "BTC/USD", "ETH/USD", "SOL/USD", "BNB/USD", "XRP/USD",
    "AAPL", "GOOGL", "MSFT", "TSLA", "AMZN", "NVDA", "META",
]

# How far ahead (seconds) we look to build the directional label.
LABEL_HORIZON_SEC = int(os.environ.get("ALPHAFORGE_HORIZON", "30"))
# A move smaller than this (fraction) is treated as "flat" and dropped from
# the binary up/down training set, reducing label noise from micro-jitter.
LABEL_DEADBAND = float(os.environ.get("ALPHAFORGE_DEADBAND", "0.0005"))

# Ingest cadence and how many recent trades to pull per feature snapshot.
POLL_INTERVAL_SEC = float(os.environ.get("ALPHAFORGE_POLL", "2.0"))
TRADE_WINDOW = int(os.environ.get("ALPHAFORGE_TRADE_WINDOW", "60"))
ORDERBOOK_DEPTH = 20

# Minimum rows before training will attempt to fit a model.
MIN_TRAIN_ROWS = int(os.environ.get("ALPHAFORGE_MIN_ROWS", "200"))

# Champion/challenger promotion: challenger must beat champion AUC by this margin.
PROMOTION_MARGIN = float(os.environ.get("ALPHAFORGE_PROMOTION_MARGIN", "0.005"))


def ensure_dirs() -> None:
    """Create the data/model/mlruns directories if they do not yet exist."""
    for d in (DATA_DIR, MODELS_DIR, MLRUNS_DIR):
        Path(d).mkdir(parents=True, exist_ok=True)
