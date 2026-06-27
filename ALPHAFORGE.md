# AlphaForge — MLOps Trading Intelligence Platform

This document covers the **MLOps layer** that sits on top of the base exchange
simulator: the architecture, every component, and exactly how to run and test it.

> The base exchange (matching engine, market data, React terminal, Streamlit) is
> documented in [README.md](README.md). AlphaForge adds a **real, trained,
> served, monitored, auto-retrained ML model** — plus a C++ feature/inference
> engine — replacing the old hard-coded "AI bot" heuristics.

## Live links

| What | URL | Notes |
|---|---|---|
| Frontend (deployed) | https://algo-portal-rg4ck4qma-arnav-gawade-s-projects.vercel.app/ | Vercel — base terminal |
| Backend (deployed) | https://algo-portal-final-1xvi.onrender.com | Render — base API |
| **MLOps stack** | runs locally (see [Run it](#run-it-locally)) | needs Python + the C++ engine; not deployed |

The deployed links run the **base** exchange. The full MLOps loop (training,
serving, drift, auto-retrain, the C++ engine) runs locally because it needs
Python, a feature store, and a compiled native binary.

---

## Table of contents
- [What makes it different](#what-makes-it-different)
- [Architecture](#architecture)
- [The MLOps lifecycle](#the-mlops-lifecycle)
- [The C++ engine](#the-c-engine)
- [Components](#components)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Test it](#test-it)
- [What to look for](#what-to-look-for-once-its-running)
- [ML API reference](#ml-api-reference)
- [Repo layout](#repo-layout)

---

## What makes it different

The original "AI Trading Bot" was a fixed weighted vote over RSI / EMA / Bollinger
rules — no learning, no ops. AlphaForge replaces it with a genuine ML system:

| | Before | AlphaForge |
|---|---|---|
| Signal | hard-coded indicator rules | **trained LightGBM model** |
| Features | inline JS | **C++ engine** (order-flow imbalance, micro-price, depth imbalance, realized vol, …) |
| Inference | — | **C++ GBDT traversal** of an exported LightGBM model (parity-tested to 5e-11) |
| Experiments | — | **MLflow** tracking + champion/challenger **registry** |
| Serving | — | **FastAPI** microservice, hot-swappable champion |
| Monitoring | — | **drift (PSI/KL)** + **live accuracy & calibration** |
| Retraining | — | **automated** retrain → evaluate → promote loop |
| Failure mode | crash | **graceful degradation** at every layer |

Graceful degradation: no C++ binary → NumPy features; serving down → bot uses
heuristics; empty feature store → neutral predictions. The exchange never stops.

---

## Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                  Node.js Exchange (TS)                    │
   React  ◄────► │  Matching engines · GBM market data · WebSocket · REST    │
   Terminal      │  AI bot ──(uses ML prediction, heuristic fallback)──┐     │
                 └───────────────▲──────────────────────────────────┬──┴─────┘
                     /api/ml/*    │ predictions                      │ REST snapshots
                   (proxy)        │                                  ▼
        ┌──────────────────────────────────────┐        ┌───────────────────────┐
        │     Python Serving (FastAPI :8090)    │        │   Feature Ingest      │
        │  /predict  /model/info  /monitoring   │        │  polls REST, writes   │
        │  ┌────────────────────────────────┐   │        │  the feature store    │
        │  │  C++ Engine (subprocess)       │   │        └──────────┬────────────┘
        │  │  features + GBDT inference     │◄──┼───────────────────┤
        │  └────────────────────────────────┘   │                   ▼
        │  Orchestrator: resolve·drift·retrain  │        ┌───────────────────────┐
        └───────────────▲───────────────────────┘        │  DuckDB Feature Store  │
                        │ champion model                  │  features/predictions/ │
        ┌───────────────┴───────────────┐                 │  drift/train_runs      │
        │  Training (LightGBM)           │◄────────────────┤                       │
        │  MLflow tracking + Registry    │  labelled data  └───────────────────────┘
        │  exports model.txt for C++     │
        └────────────────────────────────┘
```

**Why ingest polls REST (not the WebSocket):** the backend previously fought a
WS-triggered request flood, so the ML stack stays strictly read-only and off that
hot path.

---

## The MLOps lifecycle

1. **Ingest** — poll the backend's order book + trades into the DuckDB feature store.
2. **Feature engineering** — the C++ engine turns each snapshot into a 13-d
   microstructure vector (NumPy fallback if the binary is absent).
3. **Label** — sign of the forward mid-price return over a horizon (default 30s),
   with a deadband to drop near-flat noise.
4. **Train** — LightGBM, tracked in MLflow; export `model.txt` (for C++) + `model.pkl`.
5. **Register** — champion/challenger registry (`registry.json` mirrors MLflow).
6. **Serve** — FastAPI loads the champion; the C++ engine runs inference.
7. **Trade** — the Node bot polls predictions and trades on them (heuristic fallback).
8. **Monitor** — resolve each prediction against its realized outcome → rolling
   accuracy + calibration; PSI/KL drift of live features vs the training set.
9. **Auto-retrain** — on a schedule, train a challenger, evaluate it, and promote it
   if it beats the champion; serving hot-reloads. **Loop closes.**

---

## The C++ engine

`native/src/alphaforge_engine.cpp` — a dependency-free C++14 microservice the
Python serving layer drives over a stdio pipe. Two jobs:

1. **Feature extraction** — order book + trade window → 13-d microstructure vector.
2. **GBDT inference** — it **parses a LightGBM text model itself** and traverses the
   trees, so predictions need no LightGBM runtime.

It runs **out-of-process** (not a pybind11 extension) so it builds with a plain
`g++` and is decoupled from the Python ABI/bitness. Correctness is pinned by
parity tests:

```
feature   max |C++ − NumPy|     ≈ 5e-09
inference max |C++ − LightGBM|  ≈ 5e-11
```

Details: [native/README.md](native/README.md).

---

## Components

| Path | Role |
|---|---|
| `native/` | C++ feature + inference engine, build scripts (g++/make) |
| `ml/features/` | feature schema · native bridge · NumPy-fallback engine |
| `ml/store/` | DuckDB feature store (features / predictions / drift / train_runs) |
| `ml/ingest/` | REST poller → feature store |
| `ml/training/` | dataset builder · LightGBM + MLflow + model export |
| `ml/registry/` | champion/challenger registry |
| `ml/serving/` | FastAPI app · champion predictor (C++ / LightGBM) |
| `ml/monitoring/` | drift (PSI/KL) · live accuracy & calibration |
| `ml/orchestration/` | resolve-outcomes · drift-check · auto-retrain scheduler |
| `ml/tests/` | native parity + full-pipeline tests |
| `backend/src/ml/` | Node `MLClient` + `/api/ml/*` proxy |
| `frontend/src/components/ml/` | React "ML Intelligence" dashboard |

---

## Tech stack

- **C++14** — feature + inference engine
- **Python 3.12** — DuckDB, LightGBM, MLflow, FastAPI, APScheduler
- **Node.js + TypeScript** — exchange, matching engines, WebSocket, ML client/proxy
- **React + TypeScript + Recharts** — terminal + ML dashboard
- **Streamlit + Plotly** — analytics + MLOps panel
- **Docker Compose** — one-command full stack

---

## Run it locally

### Prerequisites
- Node 18+, Python 3.10+, and a C++ compiler (`g++` / MSVC).
  The C++ step is optional — without it, Python uses a NumPy fallback.

### 1. Build the native engine
```powershell
npm run native:build          # or:  cd native && make
```

### 2. Set up the ML stack (creates ml/.venv and installs deps)
```powershell
npm run ml:setup
```

### 3. Run the exchange
```powershell
npm run dev:backend           # backend on :8080
```
For the frontend, point it at the local backend, then start it:
```powershell
# frontend/.env.local
#   VITE_BACKEND_URL=http://localhost:8080
#   VITE_WS_URL=ws://localhost:8080
npm run dev:frontend          # terminal on http://localhost:3000
```

### 4. Run the MLOps stack (separate shells)
```powershell
npm run ml:ingest             # poll the backend into the feature store
# ...let it run ~1 min to collect data, then:
npm run ml:train              # train + register the first champion
npm run ml:serve              # FastAPI serving + monitoring + auto-retrain on :8090
```

### 5. (optional) MLflow UI
```powershell
npm run ml:mlflow             # http://localhost:5000
```

### Everything in Docker
```bash
docker-compose up --build
# terminal :3000 · backend :8080 · ml-serving :8090 · analytics :8501
```

### Ports
| Service | URL |
|---|---|
| Trading terminal | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| Model serving (FastAPI) | http://localhost:8090 |
| MLflow UI | http://localhost:5000 |
| Streamlit analytics | http://localhost:8501 |

---

## Test it

```powershell
# C++ vs NumPy / LightGBM parity (fast, safe, read-only)
npm run ml:test

# Backend matching-engine unit tests
cd backend && npm test

# Full pipeline on an isolated DB (seeds synthetic data, trains, predicts, drift).
# Uses its own data dir so it never touches your real feature store:
$env:ALPHAFORGE_DATA="ml/.data/testrun"; $env:ALPHAFORGE_HORIZON="2"; $env:ALPHAFORGE_DEADBAND="0"
ml/.venv/Scripts/python -m ml.tests.test_pipeline
```

Expected output:
- `ml:test` → `feature max abs diff ≈ 5e-09`, `inference max abs diff ≈ 5e-11`, `ALL PARITY TESTS PASSED`
- backend → `9 passed`
- pipeline → trains a model, registers a champion, predicts, runs a drift check, `PIPELINE TEST PASSED`

---

## What to look for once it's running

Open the terminal at http://localhost:3000 and click **ML Intelligence** in the header:

- **Champion model** card — version, validation AUC/accuracy, **C++ engine** for
  features and inference.
- **Live Predictions** — per-symbol direction (UP/DOWN), probability bar, confidence.
- **Feature Importance** — which microstructure features drive the model.
- **Data Drift (PSI)** — per-feature drift vs training, with warn/alert thresholds.
- **Live Performance** — rolling accuracy over resolved predictions + a calibration curve.
- **Experiments & Registry** — every training run + a one-click **Train challenger**.

On the **Terminal** view, the AI bot panel flips from *Heuristic mode* to
*ML model vN* and shows an `N ML / M TA` trade split.

---

## ML API reference

All ML routes are proxied through the Node backend so the frontend uses one origin.

| Endpoint | Description |
|---|---|
| `GET /api/ml/status` | Is the model server reachable? |
| `GET /api/ml/predictions` | Live per-symbol predictions |
| `GET /api/ml/prediction?symbol=X` | Single prediction |
| `GET /api/ml/model-info` | Champion version, metrics, backends, feature importance |
| `GET /api/ml/monitoring/drift` | Per-feature PSI/KL drift |
| `GET /api/ml/monitoring/performance` | Rolling accuracy + calibration |
| `GET /api/ml/experiments` | Training-run history |
| `GET /api/ml/registry` | Champion/challenger models |
| `POST /api/ml/retrain` | Trigger a retrain (`{ "promote": true }`) |

The serving layer (`:8090`) exposes the same data directly, plus
`/predict/{symbol}`, `/model/reload`, and `/orchestration/retrain`.

---

## Repo layout

```
native/        C++ feature + inference engine (g++/make, no cmake needed)
ml/
  features/    schema · native bridge · NumPy-fallback feature engine
  store/        DuckDB feature store
  ingest/       REST poller → feature store
  training/     dataset builder · LightGBM + MLflow + model export
  registry/     champion/challenger registry
  serving/      FastAPI app · champion predictor (C++ / LightGBM)
  monitoring/   drift (PSI/KL) · live accuracy & calibration
  orchestration/ resolve-outcomes · drift-check · auto-retrain scheduler
  tests/        native parity + full-pipeline tests
backend/       Node exchange + MLClient + /api/ml/* proxy
frontend/      React terminal + ML Intelligence dashboard
analytics/     Streamlit (market + MLOps panel)
```
