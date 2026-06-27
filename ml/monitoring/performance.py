"""Live model-performance monitoring.

Resolves predictions whose horizon has elapsed (joining each with the realized
forward mid) and reports rolling accuracy, per-symbol accuracy, and a calibration
(reliability) curve.
"""
from __future__ import annotations

import time
from typing import Dict

from ..store import db


def resolve_due(now_ms: int = None) -> int:
    now_ms = now_ms or int(time.time() * 1000)
    return db.resolve_prediction_outcomes(now_ms)


def report(window: int = 500) -> Dict:
    resolve_due()
    return db.prediction_performance(window=window)
