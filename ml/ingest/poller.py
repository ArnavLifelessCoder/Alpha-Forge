"""Feature-store ingest.

Polls the Node backend's existing REST endpoints at a controlled cadence and
writes one microstructure snapshot per symbol per tick into the DuckDB feature
store. Polling REST (rather than tapping the WebSocket hot path) is deliberate —
recent backend work fought a WS-triggered request flood, so the ML stack stays
strictly read-only and off that path.

Run:
    python -m ml.ingest.poller                 # run forever
    python -m ml.ingest.poller --minutes 10    # run for 10 minutes
"""
from __future__ import annotations

import argparse
import time
from typing import Dict, List

import requests

from .. import config
from ..features.engine import FeatureEngine
from ..features.schema import FEATURE_NAMES
from ..store import db


class Ingestor:
    def __init__(self, backend_url: str = None):
        self.backend_url = (backend_url or config.BACKEND_URL).rstrip("/")
        self.engine = FeatureEngine()
        self.session = requests.Session()
        db.init_db()

    def _get(self, path: str, params: Dict = None):
        try:
            r = self.session.get(f"{self.backend_url}{path}", params=params, timeout=5)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            return None
        return None

    def _ref_prices(self) -> Dict[str, float]:
        data = self._get("/api/market-data")
        out: Dict[str, float] = {}
        if isinstance(data, list):
            for q in data:
                try:
                    out[q["symbol"]] = float(q["price"])
                except (KeyError, TypeError, ValueError):
                    continue
        return out

    def tick(self) -> int:
        ts = int(time.time() * 1000)
        ref_prices = self._ref_prices()
        rows: List[Dict] = []

        for symbol in config.SYMBOLS:
            ob = self._get("/api/orderbook", {"symbol": symbol, "depth": config.ORDERBOOK_DEPTH})
            tr = self._get("/api/trades", {"symbol": symbol, "count": config.TRADE_WINDOW})
            if ob is None:
                continue
            trades_raw = tr.get("trades", tr) if isinstance(tr, dict) else (tr or [])
            vec, mid = self.engine.from_snapshot(ob, trades_raw)
            ref = ref_prices.get(symbol)
            # Use book mid when available, else reference price (so labels exist
            # even before the synthetic book is populated).
            if mid is None:
                mid = ref
            row = {
                "ts": ts,
                "symbol": symbol,
                "mid": mid,
                "ref_price": ref,
                "feature_backend": self.engine.backend,
            }
            row.update({name: vec[i] for i, name in enumerate(FEATURE_NAMES)})
            rows.append(row)

        return db.insert_features(rows)

    def run(self, minutes: float = None) -> None:
        deadline = None if minutes is None else time.time() + minutes * 60
        print(f"[ingest] backend={self.backend_url} feature_backend={self.engine.backend} "
              f"interval={config.POLL_INTERVAL_SEC}s")
        n_total = 0
        while True:
            start = time.time()
            try:
                n = self.tick()
                n_total += n
                if n:
                    print(f"[ingest] +{n} rows (total {n_total})", flush=True)
            except Exception as e:  # never let one bad tick kill ingest
                print(f"[ingest] tick error: {e}", flush=True)
            if deadline and time.time() >= deadline:
                print(f"[ingest] done, {n_total} rows written")
                break
            elapsed = time.time() - start
            time.sleep(max(0.0, config.POLL_INTERVAL_SEC - elapsed))


def main():
    ap = argparse.ArgumentParser(description="AlphaForge feature-store ingest")
    ap.add_argument("--minutes", type=float, default=None, help="run duration (default: forever)")
    ap.add_argument("--backend", type=str, default=None, help="backend base URL")
    args = ap.parse_args()
    Ingestor(args.backend).run(minutes=args.minutes)


if __name__ == "__main__":
    main()
