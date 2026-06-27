"""Feature computation with a C++ fast path and a NumPy fallback.

`FeatureEngine.from_snapshot` takes the raw REST payloads the Node backend already
serves (`/api/orderbook`, `/api/trades`) and produces the 13-d feature vector in
`schema.FEATURE_NAMES` order. It prefers the native C++ engine and falls back to a
pure-Python implementation that mirrors the C++ math exactly, so a row computed by
either path is identical.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

from .schema import NUM_FEATURES
from .native_bridge import NativeEngine


# --------------------------------------------------------------------------
# Pure-Python mirror of native/src/alphaforge_engine.cpp::computeFeatures
# --------------------------------------------------------------------------
def _safe_div(a: float, b: float) -> float:
    return 0.0 if b == 0 else a / b


def _ema(prices: Sequence[float], period: int) -> Optional[float]:
    n = len(prices)
    if n < period or period <= 0:
        return None
    k = 2.0 / (period + 1.0)
    val = sum(prices[:period]) / period
    for i in range(period, n):
        val = prices[i] * k + val * (1.0 - k)
    return val


def _rsi(prices: Sequence[float], period: int = 14) -> float:
    n = len(prices)
    if n < period + 1:
        return 50.0
    gains = losses = 0.0
    for i in range(n - period, n):
        d = prices[i] - prices[i - 1]
        if d > 0:
            gains += d
        else:
            losses -= d
    if losses == 0:
        return 100.0
    rs = (gains / period) / (losses / period)
    return 100.0 - 100.0 / (1.0 + rs)


def compute_features_py(
    bids: Sequence[Tuple[float, float]],
    asks: Sequence[Tuple[float, float]],
    trades: Sequence[Tuple[float, float, float]],
) -> List[float]:
    f = [0.0] * NUM_FEATURES
    have_bid, have_ask = len(bids) > 0, len(asks) > 0
    best_bid = bids[0][0] if have_bid else 0.0
    best_ask = asks[0][0] if have_ask else 0.0

    if have_bid and have_ask:
        mid = 0.5 * (best_bid + best_ask)
    elif have_bid:
        mid = best_bid
    elif have_ask:
        mid = best_ask
    else:
        mid = 0.0

    spread = (best_ask - best_bid) if (have_bid and have_ask) else 0.0
    bid_q1 = bids[0][1] if have_bid else 0.0
    ask_q1 = asks[0][1] if have_ask else 0.0

    f[0] = _safe_div(spread, mid)
    if bid_q1 + ask_q1 > 0 and mid > 0:
        micro = (best_bid * ask_q1 + best_ask * bid_q1) / (bid_q1 + ask_q1)
        f[1] = (micro - mid) / mid
    f[2] = _safe_div(bid_q1 - ask_q1, bid_q1 + ask_q1)

    sum_bid5 = sum(q for _, q in bids[:5])
    sum_ask5 = sum(q for _, q in asks[:5])
    f[3] = _safe_div(sum_bid5 - sum_ask5, sum_bid5 + sum_ask5)

    if len(bids) >= 2 and mid > 0:
        f[4] = (bids[0][0] - bids[-1][0]) / (mid * (len(bids) - 1))
    if len(asks) >= 2 and mid > 0:
        f[5] = (asks[-1][0] - asks[0][0]) / (mid * (len(asks) - 1))

    prices = [t[0] for t in trades]
    if len(prices) >= 2:
        rets = [_safe_div(prices[i] - prices[i - 1], prices[i - 1]) for i in range(1, len(prices))]
        m = sum(rets) / len(rets)
        var = sum((r - m) ** 2 for r in rets) / len(rets)
        f[6] = math.sqrt(var)

    f[7] = _rsi(prices, 14) / 100.0

    e8, e21 = _ema(prices, 8), _ema(prices, 21)
    if e8 is not None and e21 is not None and e21 != 0:
        f[8] = e8 / e21 - 1.0

    signed = sum(t[2] * t[1] for t in trades)
    tot = sum(t[1] for t in trades)
    f[9] = _safe_div(signed, tot)

    f[10] = min(len(trades) / 50.0, 1.0)
    f[11] = _safe_div(tot, len(trades)) if trades else 0.0

    if len(prices) >= 2 and prices[0] != 0:
        f[12] = prices[-1] / prices[0] - 1.0

    return f


# --------------------------------------------------------------------------
# REST payload parsing
# --------------------------------------------------------------------------
def parse_book(orderbook: Dict) -> Tuple[List[Tuple[float, float]], List[Tuple[float, float]]]:
    """Backend snapshot: {bids:[{price,quantity}], asks:[...]} best-first."""
    def levels(side):
        out = []
        for lvl in (orderbook.get(side) or []):
            try:
                out.append((float(lvl["price"]), float(lvl["quantity"])))
            except (KeyError, TypeError, ValueError):
                continue
        return out
    return levels("bids"), levels("asks")


def parse_trades_with_sides(trades_raw: Sequence[Dict]) -> List[Tuple[float, float, float]]:
    """Order oldest->newest and infer aggressor side via the tick rule.

    The backend's Trade has no explicit aggressor flag, so we approximate side
    from the price change vs the previous trade (uptick=buy, downtick=sell).
    """
    rows = []
    for t in trades_raw:
        try:
            rows.append((float(t["price"]), float(t["quantity"]), int(t.get("timestamp", 0))))
        except (KeyError, TypeError, ValueError):
            continue
    rows.sort(key=lambda r: r[2])  # by timestamp ascending

    out: List[Tuple[float, float, float]] = []
    side = 1.0
    prev = None
    for price, qty, _ in rows:
        if prev is not None:
            if price > prev:
                side = 1.0
            elif price < prev:
                side = -1.0
            # equal price -> carry previous side
        out.append((price, qty, side))
        prev = price
    return out


def book_mid(bids, asks) -> Optional[float]:
    if bids and asks:
        return 0.5 * (bids[0][0] + asks[0][0])
    if bids:
        return bids[0][0]
    if asks:
        return asks[0][0]
    return None


# --------------------------------------------------------------------------
# Engine facade
# --------------------------------------------------------------------------
class FeatureEngine:
    def __init__(self, native: Optional[NativeEngine] = None):
        self.native = native if native is not None else NativeEngine()

    @property
    def backend(self) -> str:
        return "cpp" if (self.native and self.native.available) else "numpy"

    def compute(
        self,
        bids: Sequence[Tuple[float, float]],
        asks: Sequence[Tuple[float, float]],
        trades: Sequence[Tuple[float, float, float]],
    ) -> List[float]:
        if self.native and self.native.available:
            vec = self.native.compute_features(bids, asks, trades)
            if vec is not None and len(vec) == NUM_FEATURES:
                return vec
        return compute_features_py(bids, asks, trades)

    def from_snapshot(self, orderbook: Dict, trades_raw: Sequence[Dict]) -> Tuple[List[float], Optional[float]]:
        bids, asks = parse_book(orderbook)
        trades = parse_trades_with_sides(trades_raw)
        vec = self.compute(bids, asks, trades)
        return vec, book_mid(bids, asks)


# Convenience module-level engine + function
_default_engine: Optional[FeatureEngine] = None


def compute_features(orderbook: Dict, trades_raw: Sequence[Dict]) -> Tuple[List[float], Optional[float]]:
    global _default_engine
    if _default_engine is None:
        _default_engine = FeatureEngine()
    return _default_engine.from_snapshot(orderbook, trades_raw)
