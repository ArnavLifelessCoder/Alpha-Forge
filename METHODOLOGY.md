# Development Methodology - Synthetic Exchange

## Table of Contents
1. [Development Phases](#development-phases)
2. [Technology Selection](#technology-selection)
3. [Design Patterns](#design-patterns)
4. [Algorithm Design](#algorithm-design)
5. [AI Bot Design](#ai-bot-design)
6. [Performance Engineering](#performance-engineering)
7. [Security Considerations](#security-considerations)
8. [Code Quality](#code-quality)
9. [Trade-offs and Decisions](#trade-offs-and-decisions)

---

## Development Phases

| Phase | Focus | Outcome |
|---|---|---|
| 1 | Core matching engine | Price-Time priority LOB, order types, partial fills |
| 2 | Market simulation | GBM generator at 75 orders/sec, synthetic liquidity |
| 3 | Real-time frontend | WebSocket streaming, React trading terminal |
| 4 | Multi-symbol support | 12 independent engines, real CoinGecko data |
| 5 | AI trading bot | 4-strategy autonomous system, risk management, live P&L |
| 6 | Analytics and polish | Streamlit dashboard, UI refinements, documentation |

### Design Principles Applied

- Separation of concerns: each module has one job
- Event-driven: loose coupling through callbacks and EventEmitter
- Type safety: TypeScript strict mode throughout
- Fail-safe defaults: graceful degradation when CoinGecko is unavailable
- Performance first: sub-millisecond matching, batched broadcasting

---

## Technology Selection

### Backend: Node.js + TypeScript

Node.js was chosen for its non-blocking event loop, which handles thousands of concurrent WebSocket connections without thread overhead. The single-threaded model avoids context switching costs that would add latency to order matching.

TypeScript adds compile-time safety across the entire backend, catching type mismatches in order structures, trade objects, and API responses before runtime.

Alternatives considered:
- Rust: better raw performance but significantly higher development complexity for a prototype
- Python: GIL limits true concurrency for WebSocket-heavy workloads
- Java: higher memory footprint and slower startup time

### Frontend: React 18 + Vite

React's virtual DOM efficiently handles the high-frequency state updates from WebSocket messages. Components re-render only when their specific data changes, keeping the UI at 60 FPS even with 100+ messages per second.

Vite provides near-instant hot module replacement during development and produces optimized production bundles.

### Analytics: Streamlit + Plotly

Streamlit was chosen to keep the analytics layer decoupled from the trading terminal. It runs as a separate Docker service and connects to the backend via REST. The Python ecosystem (pandas, plotly) provides richer data analysis capabilities than would be practical to build in React.

### Deployment: Docker Compose

Docker Compose provides one-command reproducible deployment. Each service runs in isolation with its own dependencies. The bridge network allows internal service-to-service communication by hostname while exposing only the necessary ports to the host.

---

## Design Patterns

### Observer Pattern (Trade Events)

The MatchingEngine exposes a single `onTrade` callback. The server registers this callback to handle portfolio updates, candle generation, AI bot data feeding, and WebSocket broadcasting. This decouples the engine from all downstream consumers.

```typescript
engine.onTrade((trades) => {
  trades.forEach(trade => {
    portfolioManager.processTradeForSymbol(symbol, trade);
    candleGen.processTrade(trade);
    aiBot.feedTrade(symbol, trade);
  });
  wsServer.broadcast({ type: 'trade', data: trades });
});
```

The limitation of a single callback (rather than a full EventEmitter) is why the AI bot uses the `feedTrade` injection pattern instead of subscribing directly.

### Producer-Consumer Pattern (WebSocket Batching)

Events are produced at up to 240/sec across 12 symbols. Broadcasting each individually would overwhelm clients. Instead, events are queued and flushed every 50ms in a single grouped payload.

```typescript
// Producer
broadcast(message) { this.messageQueue.push(message); }

// Consumer (runs every 50ms)
setInterval(() => {
  const batch = this.messageQueue.splice(0);
  const grouped = this.groupByType(batch);
  for (const client of this.clients) {
    client.send(JSON.stringify(grouped));
  }
}, 50);
```

### Factory Pattern (Multi-Symbol Engines)

Each symbol gets its own MatchingEngine, MarketGenerator, and CandleGenerator created in a loop. This ensures complete isolation between order books.

### Adapter Pattern (Real Market Data)

CoinGecko's response format is normalized into an internal `MarketQuote` interface. This decouples the rest of the system from the external API's schema, making it straightforward to swap data providers.

### Strategy Pattern (AI Bot)

Each trading strategy is a private method returning a `StrategySignal`. The consensus function combines them with weights. Adding a new strategy requires only implementing the method and adding it to the `getSignals` call — no changes to execution logic.

---

## Algorithm Design

### Price-Time Priority Matching

```
MATCH_LIMIT_ORDER(order):
  book = order.side == BUY ? asks : bids
  prices = sort(book.keys(), ascending if BUY else descending)

  for price in prices:
    if BUY  and price > order.price: break
    if SELL and price < order.price: break

    level = book[price]
    while order.remaining > 0 and level not empty:
      top = level.front()
      fill = min(order.remaining, top.remaining)
      emit Trade(price, fill)
      order.remaining -= fill
      top.remaining   -= fill
      if top.remaining == 0: level.dequeue()

  if order.remaining > 0:
    add order to book at order.price
```

Time complexity:
- Insert: O(1) amortized via hash map
- Match: O(k) where k is price levels crossed
- Cancel: O(1) via orderMap lookup
- Best price: O(n) scan of price keys

### Geometric Brownian Motion

```
S(t) = S0 * exp((mu - sigma^2/2)*t + sigma*sqrt(t)*Z)

Z ~ N(0,1) via Box-Muller transform:
  Z = sqrt(-2 * ln(U1)) * cos(2*pi*U2)
  where U1, U2 ~ Uniform(0,1)

Per-asset sigma values:
  BTC/USD: 0.025    AAPL:  0.015
  ETH/USD: 0.030    GOOGL: 0.018
  SOL/USD: 0.040    MSFT:  0.015
  BNB/USD: 0.025    TSLA:  0.040
  XRP/USD: 0.035    AMZN:  0.020
                    NVDA:  0.035
                    META:  0.025

Mean reversion guard: if price drifts beyond +/-100% of S0,
reset S0 to current price and restart time counter.

Real data anchoring: every 30s, apply 10% convergence toward CoinGecko price.
```

---

## AI Bot Design

### Strategy Implementations

**Mean Reversion (RSI)**

RSI is calculated over 14 periods. A reading below 30 signals oversold (buy), above 70 signals overbought (sell). Confidence scales linearly with distance from the threshold.

```
gains = sum of positive price changes over period
losses = sum of absolute negative changes over period
RS = (gains/period) / (losses/period)
RSI = 100 - 100/(1+RS)

BUY  if RSI < 30, confidence = (35 - RSI) / 35
SELL if RSI > 70, confidence = (RSI - 65) / 35
```

**Momentum (EMA Crossover)**

EMA(8) vs EMA(21). When the fast EMA is above the slow EMA by more than 0.2%, a bullish trend is confirmed. Confidence scales with the percentage difference.

```
EMA(n) = price * k + prev_EMA * (1-k)  where k = 2/(n+1)

diff = (EMA8 - EMA21) / EMA21
BUY  if diff > 0.002, confidence = min(diff * 50, 0.9)
SELL if diff < -0.002, confidence = min(abs(diff) * 50, 0.9)
```

**Breakout (Bollinger Bands)**

20-period Bollinger Bands with 2 standard deviations. A breakout above the upper band with a volume spike (1.3x average) signals a buy. Breakdown below lower band with volume signals a sell.

```
mean = SMA(prices, 20)
std  = sqrt(variance(prices, 20))
upper = mean + 2*std
lower = mean - 2*std

BUY  if current > upper and volume > avgVolume * 1.3
SELL if current < lower and volume > avgVolume * 1.3
```

**Market Making**

Inventory-aware liquidity provision. If the bot holds a long position above 15 units, it leans toward selling to reduce inventory. If short below -15, it leans toward buying. Otherwise, it randomly provides liquidity with low confidence.

### Consensus and Execution

```
buyScore  = sum(signal.confidence * weight[signal.strategy]) for BUY signals
sellScore = sum(signal.confidence * weight[signal.strategy]) for SELL signals

Execute if winning score > 0.10 and confidence >= 0.25

Position sizing:
  kelly = (2*p - (1-p)) / 2   where p = confidence
  halfKelly = kelly * 0.5
  quantity = floor(capital * 0.02 * halfKelly / price)
  quantity = max(1, min(quantity, 8))
```

### Risk Management

Stop-loss and take-profit are checked on every tick against all open trades:

```
pnlPct = (current - entry) / entry * 100  for long
pnlPct = (entry - current) / entry * 100  for short

close trade if pnlPct <= -2.0 (stop-loss)
close trade if pnlPct >= 3.0  (take-profit)
```

Circuit breaker:
```
drawdown = (peakCapital - capital) / peakCapital * 100
if drawdown > 10: pause = true, stop all new trades
```

---

## Performance Engineering

### WebSocket Optimization

| Technique | Effect |
|---|---|
| 50ms batch window | Reduces sends from 240/sec to ~20/sec |
| Group by message type | Client processes one array per type per batch |
| Bounded message queue | Prevents memory growth during client lag |
| Set-based client tracking | O(1) add/remove on connect/disconnect |

### Memory Management

| Structure | Bound | Reason |
|---|---|---|
| Price history per symbol | 200 entries | Sufficient for all indicators |
| Trade log per bot | 500 entries | Keeps recent history without unbounded growth |
| Candle history | 100 entries | Covers chart display window |
| WebSocket message queue | Flushed every 50ms | Never accumulates |

### Frontend Performance

- `useMemo` for SMA calculations: recomputes only when candle array changes
- Bounded candle state (100 entries): prevents DOM growth
- Symbol change clears stale state immediately
- AI bot panel polls independently at 2s, not tied to WebSocket cycle

---

## Security Considerations

### Input Validation

All order fields are validated before reaching the matching engine:
- Required fields checked (userId, type, side, quantity)
- Quantity must be positive
- Limit orders must have a valid price
- Buying power checked before limit buy orders
- Order cancellation requires matching userId

### Current Gaps (Acceptable for Simulation)

- No authentication: any client can submit orders as any userId
- No rate limiting: API accepts unlimited requests
- No HTTPS: plain HTTP and WS

### Recommended for Production

- JWT authentication on all order endpoints and WebSocket connections
- express-rate-limit middleware
- HTTPS with TLS termination at load balancer
- Input sanitization for string fields
- CORS restricted to known origins

---

## Code Quality

### TypeScript Configuration

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUnusedLocals": true,
  "noUnusedParameters": false
}
```

### Conventions

- PascalCase for classes and interfaces
- camelCase for functions, variables, and methods
- Underscore prefix for intentionally unused parameters (_symbol, _engine)
- JSDoc on all public methods
- Feature-based folder structure: engine/, market/, bots/, websocket/

### Error Handling Layers

```
Layer 1: Input validation at route handler (400 response)
Layer 2: Business logic errors thrown and caught in route handler (400 response)
Layer 3: Unexpected errors caught and logged (500 response)
Layer 4: Process signals (SIGTERM, SIGINT) trigger graceful shutdown
Layer 5: Bot and generator errors silently swallowed to avoid crashing the server
```

---

## Trade-offs and Decisions

| Decision | Trade-off | Rationale |
|---|---|---|
| In-memory order book | No persistence across restarts | Sub-ms latency, appropriate for simulation |
| Single onTrade callback | Cannot have multiple subscribers | Kept engine simple; bot uses feedTrade injection instead |
| feedTrade pattern for AI bot | Bot must be wired in server.ts | Avoids overwriting server's trade handler |
| Half-Kelly sizing | Lower returns than full Kelly | Reduces variance, more stable for demonstration |
| CoinGecko free tier | 30s polling, no real-time tick data | No API key required, sufficient for price anchoring |
| Polling for bot status (2s) | Slight delay vs WebSocket push | Simpler implementation, 2s is acceptable for dashboard |
| Array FIFO for price levels | O(n) shift on dequeue | n is small per level; simplicity outweighs micro-optimization |
| React without Redux | Less predictable state flow at scale | useState sufficient for this component count |
| Streamlit as separate service | Extra Docker container | Keeps Python analytics decoupled from Node.js backend |

---

Document Version: 3.0
Last Updated: May 2026
