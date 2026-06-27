"""Champion-model predictor with a C++ fast path and a LightGBM fallback.

Loads the current champion from the registry. Inference goes through the native
C++ engine when its binary is present (it parses the same model.txt); otherwise
it uses the pickled LightGBM Booster. `reload()` hot-swaps the champion after a
promotion without restarting the process.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Dict, List, Optional

from ..features.native_bridge import NativeEngine
from ..features.schema import FEATURE_NAMES, NUM_FEATURES
from ..registry import registry


class Predictor:
    def __init__(self):
        self._lock = threading.Lock()
        self.native = NativeEngine()
        self.version: Optional[str] = None
        self.meta: Dict = {}
        self._booster = None          # LightGBM fallback
        self._native_model = False    # whether native loaded the model
        self.reload()

    # -- model management ---------------------------------------------------
    def reload(self) -> bool:
        with self._lock:
            champ = registry.get_champion()
            if not champ:
                self.version = None
                return False
            version = champ["version"]
            mdir = registry.model_dir(version)
            model_txt = str(mdir / "model.txt")
            meta_path = mdir / "meta.json"

            # native path
            self._native_model = False
            if self.native and self.native.available and Path(model_txt).exists():
                self._native_model = self.native.load_model(model_txt)

            # python fallback
            self._booster = None
            try:
                import joblib
                pkl = mdir / "model.pkl"
                if pkl.exists():
                    self._booster = joblib.load(str(pkl))
            except Exception:
                self._booster = None

            import json
            self.meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
            self.version = version
            return self._native_model or self._booster is not None

    @property
    def ready(self) -> bool:
        return self.version is not None and (self._native_model or self._booster is not None)

    @property
    def infer_backend(self) -> str:
        if self._native_model:
            return "cpp"
        if self._booster is not None:
            return "python-lightgbm"
        return "none"

    # -- inference ----------------------------------------------------------
    def predict_vector(self, features: List[float]) -> Dict:
        if not self.ready:
            return {"prob": 0.5, "raw": 0.0, "backend": "none", "direction": "FLAT",
                    "confidence": 0.0, "model_version": None}
        feats = list(features)[:NUM_FEATURES]
        if len(feats) < NUM_FEATURES:
            feats += [0.0] * (NUM_FEATURES - len(feats))

        prob = raw = None
        backend = "none"
        if self._native_model:
            res = self.native.predict(feats)
            if res is not None:
                prob, raw = res
                backend = "cpp"
        if prob is None and self._booster is not None:
            prob = float(self._booster.predict([feats])[0])
            raw = 0.0
            backend = "python-lightgbm"
        if prob is None:
            prob, raw, backend = 0.5, 0.0, "none"

        direction = "UP" if prob >= 0.5 else "DOWN"
        return {
            "prob": prob,
            "raw": raw,
            "backend": backend,
            "direction": direction,
            "confidence": abs(prob - 0.5) * 2.0,
            "model_version": self.version,
        }

    def feature_importance(self) -> Dict:
        return self.meta.get("feature_importance", {})

    def info(self) -> Dict:
        champ = registry.get_champion() or {}
        return {
            "ready": self.ready,
            "champion_version": self.version,
            "infer_backend": self.infer_backend,
            "feature_backend": "cpp" if (self.native and self.native.available) else "numpy",
            "auc": champ.get("auc"),
            "accuracy": champ.get("accuracy"),
            "n_rows": champ.get("n_rows"),
            "horizon_sec": self.meta.get("horizon_sec"),
            "feature_names": FEATURE_NAMES,
            "feature_importance": self.feature_importance(),
            "models": registry.list_models(),
        }
