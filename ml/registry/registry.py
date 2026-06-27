"""Lightweight model registry (champion/challenger).

A JSON file (`registry.json`) mirrors the MLflow registry so the Node backend,
serving layer, and dashboards can read the current champion without an MLflow
dependency. Each model has artifacts on disk under MODELS_DIR/<version>/:
    model.txt   - LightGBM text model (consumed by the C++ engine)
    model.pkl   - pickled LightGBM Booster (Python fallback inference)
    meta.json   - metrics, params, training stats, feature distribution summary
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Optional

from .. import config


def _load() -> Dict:
    if Path(config.REGISTRY_PATH).exists():
        try:
            return json.loads(Path(config.REGISTRY_PATH).read_text())
        except json.JSONDecodeError:
            pass
    return {"champion": None, "models": {}}


def _save(state: Dict) -> None:
    config.ensure_dirs()
    tmp = Path(str(config.REGISTRY_PATH) + ".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(config.REGISTRY_PATH)


def next_version() -> str:
    state = _load()
    n = len(state["models"]) + 1
    return f"v{n}"


def model_dir(version: str) -> Path:
    return config.MODELS_DIR / version


def register(version: str, meta: Dict, make_champion_if_first: bool = True) -> Dict:
    """Add/replace a model entry. The very first model becomes champion."""
    state = _load()
    entry = dict(meta)
    entry["version"] = version
    entry.setdefault("created", int(time.time() * 1000))
    entry["model_txt"] = str(model_dir(version) / "model.txt")
    entry["model_pkl"] = str(model_dir(version) / "model.pkl")
    entry.setdefault("role", "challenger")
    state["models"][version] = entry
    if make_champion_if_first and state["champion"] is None:
        state["champion"] = version
        entry["role"] = "champion"
    _save(state)
    return entry


def set_champion(version: str) -> None:
    state = _load()
    if version not in state["models"]:
        raise ValueError(f"unknown model version: {version}")
    prev = state.get("champion")
    if prev and prev in state["models"]:
        state["models"][prev]["role"] = "archived"
    state["champion"] = version
    state["models"][version]["role"] = "champion"
    state["models"][version]["promoted_at"] = int(time.time() * 1000)
    _save(state)


def get_champion() -> Optional[Dict]:
    state = _load()
    champ = state.get("champion")
    if champ and champ in state["models"]:
        return state["models"][champ]
    return None


def get_model(version: str) -> Optional[Dict]:
    return _load()["models"].get(version)


def list_models() -> List[Dict]:
    state = _load()
    return sorted(state["models"].values(), key=lambda m: m.get("created", 0), reverse=True)


def champion_version() -> Optional[str]:
    return _load().get("champion")
