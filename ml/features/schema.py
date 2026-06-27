"""Authoritative feature schema.

This ordering is the single source of truth shared by:
  * the C++ engine  (native/src/alphaforge_engine.cpp, computeFeatures)
  * the NumPy fallback (ml/features/engine.py)
  * training and serving

Changing the order or count here means updating the C++ engine too.
"""

FEATURE_NAMES = [
    "rel_spread",        # 0  (bestAsk-bestBid)/mid
    "micro_dev",         # 1  size-weighted micro-price deviation from mid
    "ofi_l1",            # 2  L1 order-flow imbalance
    "depth_imb_l5",      # 3  depth imbalance over 5 levels
    "bid_slope",         # 4  bid ladder steepness (norm by mid)
    "ask_slope",         # 5  ask ladder steepness (norm by mid)
    "realized_vol",      # 6  std of trade returns in window
    "rsi_14",            # 7  RSI(14) scaled 0..1
    "ema_ratio",         # 8  EMA(8)/EMA(21) - 1
    "trade_sign_imb",    # 9  signed trade-volume imbalance
    "trade_intensity",   # 10 normalized trade count
    "mean_trade_size",   # 11 mean trade quantity in window
    "price_momentum",    # 12 window price momentum
]

NUM_FEATURES = len(FEATURE_NAMES)
