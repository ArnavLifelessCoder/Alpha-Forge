"""MLOps orchestration loop.

Closes the loop with three periodic jobs:
  * resolve_outcomes - label served predictions once their horizon elapses
  * drift_check      - PSI/KL of live features vs the champion's training data
  * retrain          - train a challenger and promote it if it beats the champion;
                       on promotion the in-process predictor hot-reloads.

It runs inside the serving process (APScheduler BackgroundScheduler) so a single
`uvicorn` command gives you serving + monitoring + continuous training. It can
also run standalone: `python -m ml.orchestration.scheduler`.
"""
from __future__ import annotations

import os
import time
from typing import Callable, Optional

from .. import config
from ..monitoring import drift as drift_mod
from ..monitoring import performance as perf_mod
from ..training.train import train_once

# Intervals (seconds); overridable via env.
RESOLVE_INTERVAL = int(os.environ.get("ALPHAFORGE_RESOLVE_INTERVAL", "30"))
DRIFT_INTERVAL = int(os.environ.get("ALPHAFORGE_DRIFT_INTERVAL", "60"))
RETRAIN_INTERVAL = int(os.environ.get("ALPHAFORGE_RETRAIN_INTERVAL", "300"))
AUTO_RETRAIN = os.environ.get("ALPHAFORGE_AUTO_RETRAIN", "true").lower() != "false"


def job_resolve_outcomes():
    try:
        n = perf_mod.resolve_due()
        if n:
            print(f"[orch] resolved {n} prediction outcomes", flush=True)
    except Exception as e:
        print(f"[orch] resolve error: {e}", flush=True)


def job_drift_check():
    try:
        res = drift_mod.run_drift_check()
        if res.get("status") not in (None, "no_champion", "no_data", "no_baseline"):
            print(f"[orch] drift {res.get('status')} max_psi={res.get('max_psi')}", flush=True)
    except Exception as e:
        print(f"[orch] drift error: {e}", flush=True)


def make_retrain_job(on_promote: Optional[Callable[[], None]] = None):
    def job_retrain():
        try:
            res = train_once(promote=True)
            if res.get("promoted") and on_promote:
                on_promote()
                print(f"[orch] champion promoted -> {res.get('version')}, predictor reloaded",
                      flush=True)
        except Exception as e:
            print(f"[orch] retrain error: {e}", flush=True)
    return job_retrain


def start_scheduler(on_promote: Optional[Callable[[], None]] = None):
    """Start the background scheduler; returns the scheduler instance."""
    from apscheduler.schedulers.background import BackgroundScheduler

    sched = BackgroundScheduler(daemon=True)
    sched.add_job(job_resolve_outcomes, "interval", seconds=RESOLVE_INTERVAL,
                  id="resolve", max_instances=1)
    sched.add_job(job_drift_check, "interval", seconds=DRIFT_INTERVAL,
                  id="drift", max_instances=1)
    if AUTO_RETRAIN:
        sched.add_job(make_retrain_job(on_promote), "interval", seconds=RETRAIN_INTERVAL,
                      id="retrain", max_instances=1)
    sched.start()
    print(f"[orch] scheduler started resolve={RESOLVE_INTERVAL}s drift={DRIFT_INTERVAL}s "
          f"retrain={'off' if not AUTO_RETRAIN else str(RETRAIN_INTERVAL) + 's'}", flush=True)
    return sched


def main():
    """Standalone blocking scheduler (no in-process predictor reload)."""
    from apscheduler.schedulers.blocking import BlockingScheduler

    sched = BlockingScheduler()
    sched.add_job(job_resolve_outcomes, "interval", seconds=RESOLVE_INTERVAL)
    sched.add_job(job_drift_check, "interval", seconds=DRIFT_INTERVAL)
    if AUTO_RETRAIN:
        sched.add_job(make_retrain_job(), "interval", seconds=RETRAIN_INTERVAL)
    print("[orch] standalone scheduler running (Ctrl-C to stop)")
    try:
        sched.start()
    except (KeyboardInterrupt, SystemExit):
        pass


if __name__ == "__main__":
    main()
