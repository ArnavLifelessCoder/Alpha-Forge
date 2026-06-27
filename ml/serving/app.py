"""AlphaForge model-serving API (FastAPI).

A single `uvicorn ml.serving.app:app` process gives you:
  * low-latency directional predictions (C++ inference, LightGBM fallback)
  * model registry / experiment introspection
  * live drift & performance monitoring
  * a background orchestration loop (resolve outcomes, drift, auto-retrain)

The Node backend proxies the prediction + monitoring routes so the React app
talks to a single origin.
"""
from __future__ import annotations

import time
from typing import List, Optional

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .. import config
from ..features.schema import FEATURE_NAMES
from ..monitoring import drift as drift_mod
from ..monitoring import performance as perf_mod
from ..registry import registry
from ..store import db
from ..training.train import train_once
from .predictor import Predictor

app = FastAPI(title="AlphaForge Model Serving", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

predictor = Predictor()
_scheduler = None


@app.on_event("startup")
def _startup():
    global _scheduler
    db.init_db()
    try:
        from ..orchestration.scheduler import start_scheduler
        _scheduler = start_scheduler(on_promote=predictor.reload)
    except Exception as e:  # serving must work even if orchestration can't start
        print(f"[serving] scheduler not started: {e}")


@app.on_event("shutdown")
def _shutdown():
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:
            pass


# --- models ---------------------------------------------------------------
class PredictBody(BaseModel):
    features: List[float]
    symbol: Optional[str] = None


class RetrainBody(BaseModel):
    promote: bool = True


# --- endpoints -------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "healthy",
        "ready": predictor.ready,
        "champion": predictor.version,
        "infer_backend": predictor.infer_backend,
        "feature_count": db.feature_count(),
        "timestamp": int(time.time() * 1000),
    }


@app.get("/model/info")
def model_info():
    return predictor.info()


@app.post("/model/reload")
def model_reload():
    ok = predictor.reload()
    return {"reloaded": ok, "champion": predictor.version, "backend": predictor.infer_backend}


@app.get("/predict/{symbol:path}")
def predict_symbol(symbol: str):
    row = db.latest_feature_row(symbol)
    if not row:
        return {"symbol": symbol, "status": "no_data", "direction": "FLAT",
                "prob": 0.5, "confidence": 0.0, "model_version": predictor.version}

    feats = [row[name] for name in FEATURE_NAMES]
    pred = predictor.predict_vector(feats)
    entry = row.get("mid") or row.get("ref_price")
    ts = int(time.time() * 1000)

    # Log the prediction for later outcome resolution / monitoring.
    if predictor.ready and entry:
        db.insert_prediction({
            "ts": ts, "symbol": symbol, "model_version": pred["model_version"],
            "prob": pred["prob"], "raw": pred["raw"],
            "pred_dir": 1 if pred["direction"] == "UP" else 0,
            "infer_backend": pred["backend"],
            "horizon_ts": ts + config.LABEL_HORIZON_SEC * 1000,
            "entry_price": entry, "outcome_price": None,
            "realized_dir": None, "correct": None,
        })

    return {
        "symbol": symbol,
        "status": "ok",
        "direction": pred["direction"],
        "prob": pred["prob"],
        "confidence": pred["confidence"],
        "raw": pred["raw"],
        "backend": pred["backend"],
        "model_version": pred["model_version"],
        "features": dict(zip(FEATURE_NAMES, feats)),
        "feature_importance": predictor.feature_importance(),
        "entry_price": entry,
        "horizon_sec": config.LABEL_HORIZON_SEC,
        "ts": ts,
    }


@app.post("/predict")
def predict_body(body: PredictBody):
    return predictor.predict_vector(body.features)


@app.get("/monitoring/drift")
def monitoring_drift():
    latest = drift_mod.db.latest_drift()
    records = latest.to_dict(orient="records") if not latest.empty else []
    max_psi = max([r["psi"] for r in records], default=0.0)
    status = "ok" if max_psi < 0.1 else ("warning" if max_psi < 0.25 else "alert")
    return {"status": status, "max_psi": max_psi, "features": records,
            "thresholds": {"warning": 0.1, "alert": 0.25}}


@app.get("/monitoring/performance")
def monitoring_performance(window: int = 500):
    return perf_mod.report(window=window)


@app.get("/registry/models")
def registry_models():
    return {"champion": registry.champion_version(), "models": registry.list_models()}


@app.get("/experiments")
def experiments(limit: int = 50):
    runs = db.train_runs(limit=limit)
    return runs.to_dict(orient="records") if not runs.empty else []


@app.post("/orchestration/retrain")
async def orchestration_retrain(body: RetrainBody = RetrainBody()):
    result = await run_in_threadpool(train_once, body.promote)
    if result.get("promoted"):
        predictor.reload()
    return result


def main():
    import uvicorn
    uvicorn.run("ml.serving.app:app", host=config.SERVING_HOST, port=config.SERVING_PORT,
                reload=False)


if __name__ == "__main__":
    main()
