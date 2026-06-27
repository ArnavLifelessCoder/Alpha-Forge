# AlphaForge Native Engine (C++)

A dependency-free C++14 engine that handles the two latency-sensitive jobs on the
Python ⇄ ML boundary:

1. **Feature extraction** — converts a raw order book + recent trade window into a
   fixed 13-dimensional microstructure feature vector (order-flow imbalance,
   micro-price deviation, depth imbalance, book slope, realized volatility, RSI,
   EMA ratio, signed trade-volume imbalance, trade intensity, momentum, …).
2. **GBDT inference** — parses a LightGBM model exported in text format
   (`model.txt`) and traverses the trees directly for fast predictions, with **no
   LightGBM runtime or Python dependency**.

It runs as a **subprocess** of the Python serving layer and talks a compact,
newline-delimited protocol over stdin/stdout. Running out-of-process (instead of a
pybind11 extension) means it builds with a plain `g++` and is completely decoupled
from the Python ABI / bitness — which is why it works even with an old MinGW
toolchain against a modern 64-bit CPython.

## Build

```powershell
# Windows (PowerShell) — uses g++ from PATH, statically linked
./build.ps1
```
```bash
# POSIX / MinGW make
make
```

Either produces `native/bin/alphaforge_engine(.exe)`. If `g++` is missing the
Python feature/inference layer transparently falls back to a NumPy implementation,
so the platform still runs end-to-end.

## Protocol

| Request | Response |
|---|---|
| `PING` | `OK pong` |
| `FEATURES <nb> b0p b0q.. <na> a0p a0q.. <nt> t0p t0q t0s..` | `OK <k> f0..f(k-1)` |
| `LOAD <path/to/model.txt>` | `OK <num_trees> <num_features>` or `ERR <msg>` |
| `PREDICT <k> f0..f(k-1)` | `OK <probability> <raw_margin>` or `ERR <msg>` |
| `QUIT` | exits |

Bids are best-first (descending price), asks best-first (ascending price), trades
oldest-first with `side = +1` (buy) / `-1` (sell). The feature order is defined
once in [`ml/features/schema.py`](../ml/features/schema.py) and mirrored in
[`src/alphaforge_engine.cpp`](src/alphaforge_engine.cpp) — keep them in lock-step.

## Optional: pybind11 / CMake path

The out-of-process design above is the default because it builds anywhere. If you
have CMake + MSVC and prefer an in-process Python extension, the same
`computeFeatures` / `GBDTModel` code can be wrapped with pybind11; this is left as
an opt-in and is not required to run the platform.
