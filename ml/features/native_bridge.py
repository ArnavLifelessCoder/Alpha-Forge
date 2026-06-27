"""Thin client for the C++ `alphaforge_engine` subprocess.

The native engine speaks a line protocol over stdin/stdout (see native/README.md).
This wrapper manages the process lifecycle and is resilient: if the binary is
missing or misbehaves it marks itself unavailable and callers transparently fall
back to the NumPy implementation in engine.py.
"""
from __future__ import annotations

import subprocess
import threading
from typing import List, Optional, Sequence, Tuple

from .. import config


class NativeEngine:
    """Manages a single long-lived native-engine subprocess (thread-safe)."""

    def __init__(self, binary=None):
        self._binary = str(binary or config.NATIVE_BIN)
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._available = False
        self._model_loaded = False
        self._start()

    # -- lifecycle ----------------------------------------------------------
    def _start(self) -> None:
        from pathlib import Path
        if not Path(self._binary).exists():
            self._available = False
            return
        try:
            self._proc = subprocess.Popen(
                [self._binary],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                bufsize=1,  # line buffered
            )
            self._available = self._ping()
        except Exception:
            self._available = False

    def _ping(self) -> bool:
        resp = self._send("PING")
        return resp == "OK pong"

    @property
    def available(self) -> bool:
        return self._available and self._proc is not None and self._proc.poll() is None

    @property
    def model_loaded(self) -> bool:
        return self._model_loaded

    # -- low level ----------------------------------------------------------
    def _send(self, line: str) -> Optional[str]:
        """Send one request line, return one response line (or None on failure)."""
        with self._lock:
            if self._proc is None or self._proc.poll() is not None:
                return None
            try:
                self._proc.stdin.write(line + "\n")
                self._proc.stdin.flush()
                resp = self._proc.stdout.readline()
                if resp == "":  # process died
                    self._available = False
                    return None
                return resp.strip()
            except Exception:
                self._available = False
                return None

    # -- API ----------------------------------------------------------------
    def compute_features(
        self,
        bids: Sequence[Tuple[float, float]],
        asks: Sequence[Tuple[float, float]],
        trades: Sequence[Tuple[float, float, float]],
    ) -> Optional[List[float]]:
        """trades: iterable of (price, qty, side) with side in {+1, -1}."""
        if not self.available:
            return None
        parts = ["FEATURES", str(len(bids))]
        for p, q in bids:
            parts += [repr(float(p)), repr(float(q))]
        parts.append(str(len(asks)))
        for p, q in asks:
            parts += [repr(float(p)), repr(float(q))]
        parts.append(str(len(trades)))
        for p, q, s in trades:
            parts += [repr(float(p)), repr(float(q)), repr(float(s))]
        resp = self._send(" ".join(parts))
        return self._parse_vector(resp)

    def load_model(self, model_txt_path: str) -> bool:
        if not self.available:
            return False
        resp = self._send(f"LOAD {model_txt_path}")
        self._model_loaded = bool(resp and resp.startswith("OK"))
        return self._model_loaded

    def predict(self, features: Sequence[float]) -> Optional[Tuple[float, float]]:
        """Returns (probability, raw_margin) or None."""
        if not self.available or not self._model_loaded:
            return None
        parts = ["PREDICT", str(len(features))] + [repr(float(x)) for x in features]
        resp = self._send(" ".join(parts))
        if not resp or not resp.startswith("OK"):
            return None
        toks = resp.split()
        try:
            return float(toks[1]), float(toks[2])
        except (IndexError, ValueError):
            return None

    @staticmethod
    def _parse_vector(resp: Optional[str]) -> Optional[List[float]]:
        if not resp or not resp.startswith("OK"):
            return None
        toks = resp.split()
        try:
            k = int(toks[1])
            return [float(x) for x in toks[2:2 + k]]
        except (IndexError, ValueError):
            return None

    def close(self) -> None:
        with self._lock:
            if self._proc is not None:
                try:
                    self._proc.stdin.write("QUIT\n")
                    self._proc.stdin.flush()
                    self._proc.wait(timeout=2)
                except Exception:
                    self._proc.kill()
                self._proc = None
        self._available = False
