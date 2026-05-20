# Interview Questions and Answers - Synthetic Exchange

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Matching Engine and Backend](#matching-engine-and-backend)
3. [AI Trading Bot](#ai-trading-bot)
4. [Frontend and Real-Time Systems](#frontend-and-real-time-systems)
5. [Trading and Financial Concepts](#trading-and-financial-concepts)
6. [Performance and Scalability](#performance-and-scalability)
7. [Technical Implementation](#technical-implementation)
8. [Behavioral and Project Questions](#behavioral-and-project-questions)

---

## System Architecture

### Q1: Describe the overall architecture of your trading platform.

The platform has three tiers running as separate Docker services.

The frontend is a React 18 single-page application that connects to the backend via REST for commands and WebSocket for real-time streaming. It renders a trading terminal with live charts, order book, portfolio tracking, and an AI bot control panel.

The backend is a Node.js Express server that hosts 12 independent matching engines (one per symbol), a real market data service polling CoinGecko, a GBM-based synthetic market generator, a portfolio manager, a candle generator, and an AI trading bot. A WebSocket server batches all events and broadcasts them to connected clients every 50ms.

The analytics service is a Streamlit Python app that connects to the backend REST API and renders market data, portfolio, and trade flow charts with auto-refresh.

---

### Q2: Why did you choose this tech stack?

Node.js was chosen for the backend because its non-blocking event loop handles thousands of concurrent WebSocket connections without thread overhead. The single-threaded model avoids context switching costs that would add latency to order matching.

TypeScript was used throughout because strict type checking catches mismatches in order structures, trade objects, and API contracts at compile time rather than runtime.

React was chosen for the frontend because its virtual DOM efficiently handles high-frequency state updates from WebSocket messages. Components re-render only when their specific data changes.

Streamlit was chosen for analytics because it keeps the Python data science ecosystem (pandas, plotly) available without coupling it to the Node.js backend.

Docker Compose provides one-command reproducible deployment with service isolation.

---

### Q3: How does data flow through the system?

Order submission:
```
User -> Frontend -> POST /api/orders -> MatchingEngine -> OrderBook
                                                              |
                                                         Trade[]
                                                              |
                                              portfolioManager.processTradeForSymbol()
                                              candleGen.processTrade()
                                              aiBot.feedTrade()
                                              wsServer.broadcast(trade, orderbook)
                                                              |
                                                    All WebSocket clients
```

Market data:
```
CoinGecko API (every 30s) -> RealMarketDataService -> wsServer.broadcast(market_data)
                                                    -> MarketGenerator.syncBasePrice()
                                                    -> portfolioManager.updateSymbolPrice()

GBM micro-updates (every 2s) -> wsServer.broadcast(market_data)
```

AI bot:
```
Trade events -> aiBot.feedTrade() -> price/volume history buffers
                                          |
                                    every 3s: tick()
                                          |
                                    4 strategy signals
                                          |
                                    weighted consensus
                                          |
                                    MatchingEngine.submitOrder()
```

---

## Matching Engine and Backend

### Q4: How does your matching engine work?

The engine implements a Limit Order Book with Price-Time priority. The data structure uses two hash maps (bids and asks) keyed by price, each holding a PriceLevel with a FIFO queue of orders. A third hash map provides O(1) order lookup by ID.

For a limit buy order, the engine scans the ask side in ascending price order. It matches against each price level as long as the ask price is at or below the order's limit price. Within each price level, orders are filled in FIFO order (time priority). If the incoming order is not fully filled, the remainder rests in the bid book.

For a market order, the engine walks the opposite book without a price constraint until the order is fully filled or the book is exhausted.

Partial fills are tracked via a `remainingQuantity` field. When `remainingQuantity` reaches zero, the order status becomes FILLED. If it is reduced but not zero, the status is PARTIAL.

---

### Q5: How do you handle the single-callback limitation of MatchingEngine.onTrade?

The MatchingEngine exposes a single `onTrade` callback rather than a full EventEmitter. The server registers this callback to handle portfolio updates, candle generation, WebSocket broadcasting, and AI bot data feeding all in one place.

The AI bot cannot subscribe directly because that would overwrite the server's callback. Instead, the server explicitly calls `aiBot.feedTrade(symbol, trade)` inside its own onTrade handler. This is the feedTrade injection pattern — the bot receives data pushed to it rather than subscribing independently.

---

### Q6: Explain your GBM market simulation.

Geometric Brownian Motion models realistic price paths:

```
S(t) = S0 * exp((mu - sigma^2/2)*t + sigma*sqrt(t)*Z)
```

where Z is a standard normal random variable generated via the Box-Muller transform, mu is a small positive drift (0.0001), and sigma is asset-specific volatility (0.015 for AAPL, 0.040 for TSLA and SOL).

The simulation runs at 20 orders per second per symbol. Each tick generates bid and ask limit orders around the current synthetic price with a 10 basis point spread.

Real CoinGecko prices anchor the synthetic prices every 30 seconds using a 10% convergence factor, so the synthetic price gradually moves toward the real price without jumping. Between API calls, GBM micro-updates run every 2 seconds to keep prices moving.

---

### Q7: How does the multi-symbol architecture work?

Each of the 12 symbols gets its own independent MatchingEngine, MarketGenerator, and CandleGenerator created in a loop during server startup. They are stored in a `symbolEngines` map keyed by symbol string.

All REST endpoints accept an optional `symbol` query parameter or body field. If provided, the request is routed to the corresponding engine. If not, it falls back to a default engine for backward compatibility.

The portfolio manager is shared across all symbols. It tracks positions per symbol per user and calculates unrealized P&L using per-symbol current prices.

---

## AI Trading Bot

### Q8: Describe the AI trading bot's architecture.

The bot runs a decision cycle every 3 seconds across all 12 symbols. Each cycle:

1. Checks the circuit breaker (pauses if drawdown exceeds 10%)
2. For each symbol with at least 30 price data points and no active cooldown:
   - Runs four strategy functions, each returning a signal with a confidence score
   - Combines signals via weighted consensus voting
   - If the winning score exceeds 0.25, executes a market order
3. Checks all open trades for stop-loss (-2%) or take-profit (+3%) exit conditions

The bot receives price data via `feedTrade()`, which is called by the server's trade handler for every executed trade. This keeps the price history current without the bot needing to poll.

---

### Q9: Explain each trading strategy.

Mean Reversion uses RSI(14). RSI below 30 signals oversold (buy), above 70 signals overbought (sell). Confidence scales linearly with distance from the threshold. This strategy bets that extreme readings revert to the mean.

Momentum uses EMA(8) vs EMA(21) crossover. When the fast EMA exceeds the slow EMA by more than 0.2%, a bullish trend is confirmed. Confidence scales with the percentage difference. This strategy follows established trends.

Breakout uses 20-period Bollinger Bands (2 standard deviations). A price close above the upper band with a volume spike (1.3x average) signals a buy. This strategy trades range expansions confirmed by volume.

Market Making leans against inventory. If the bot holds more than 15 units long, it sells to reduce exposure. If more than 15 units short, it buys. Otherwise it randomly provides liquidity with low confidence. This strategy captures spread while managing inventory risk.

---

### Q10: How does the consensus voting work?

Each strategy returns a signal with an action (BUY, SELL, or HOLD) and a confidence score between 0 and 1. The consensus function computes weighted scores:

```
buyScore  = sum(confidence * weight) for all BUY signals
sellScore = sum(confidence * weight) for all SELL signals

weights: momentum 0.35, mean_reversion 0.30, breakout 0.25, market_making 0.10
```

If buyScore exceeds sellScore and buyScore exceeds 0.10, the bot executes a buy. The same logic applies for sell. If neither threshold is met, the bot holds.

Momentum gets the highest weight because trend-following tends to be more reliable in synthetic GBM markets. Market making gets the lowest weight because it is inventory-driven rather than signal-driven.

---

### Q11: How is position sizing calculated?

The bot uses a half-Kelly criterion approach:

```
kelly = (b*p - q) / b
  where b = 2 (2:1 reward/risk ratio from 3% TP vs 2% SL)
        p = signal confidence
        q = 1 - p

halfKelly = kelly * 0.5
quantity = floor(capital * riskPerTrade * halfKelly / currentPrice)
quantity = max(1, min(quantity, 8))
```

Half-Kelly is used instead of full Kelly to reduce variance. The 8-unit cap prevents any single trade from taking an outsized position. The 2% risk per trade limit ensures no single trade risks more than 2% of capital.

---

### Q12: How does the live P&L calculation work?

The `getStatus()` method computes unrealized P&L on every call by iterating all open trades:

```
for each OPEN trade:
  current = priceHistory[symbol].last
  if BUY:  livePnl = (current - entryPrice) * quantity
  if SELL: livePnl = (entryPrice - current) * quantity
  unrealizedPnL += livePnl

totalPnL = realizedPnL + unrealizedPnL
```

Each open trade in the `recentTrades` array is also enriched with its current live P&L and current price. The frontend polls this endpoint every 2 seconds, so the displayed numbers update continuously even before any trade is closed.

Realized P&L only updates when a trade is closed via stop-loss or take-profit.

---

## Frontend and Real-Time Systems

### Q13: How do you handle real-time updates in the frontend?

The WebSocketService is a singleton that maintains a single connection to the backend. It supports multiple handlers per event type via a `Map<string, callback[]>` structure, unlike the backend's single-callback pattern.

The server sends batched messages every 50ms in the format:
```json
{ "timestamp": 1234567890, "updates": { "orderbook": [...], "trade": [...] } }
```

The service iterates the updates object and dispatches each array to all registered handlers for that type.

Reconnection uses exponential backoff starting at 1 second, doubling up to a maximum of 10 attempts.

---

### Q14: How do you prevent memory leaks in React components?

Every `useEffect` that registers a WebSocket handler or sets an interval returns a cleanup function:

```typescript
useEffect(() => {
  const handler = (data) => setOrderBook(data);
  wsService.on('orderbook', handler);
  const interval = setInterval(fetchPortfolio, 2000);

  return () => {
    wsService.off('orderbook', handler);
    clearInterval(interval);
  };
}, []);
```

State arrays are bounded (100 candles, 30 trades) to prevent unbounded DOM growth. When the user switches symbols, stale state is cleared immediately before new data arrives.

---

## Trading and Financial Concepts

### Q15: What is Price-Time priority?

Price-Time priority is the standard matching algorithm used by most exchanges. It has two rules:

Price priority: better prices are matched first. Higher bids before lower bids, lower asks before higher asks.

Time priority: at the same price level, earlier orders are matched first (FIFO). This rewards liquidity providers who post orders early.

Example:
```
Bids: $100 (Order A, 10:00), $100 (Order B, 10:01), $99 (Order C)

New sell order: $100, 15 units

Result:
  Order A fills 10 units (same price, earlier time)
  Order B fills 5 units (same price, later time)
  Order C fills 0 units (worse price)
```

This is important because it creates predictable, fair execution and encourages market participants to provide liquidity early.

---

### Q16: What is the difference between realized and unrealized P&L?

Unrealized P&L is the mark-to-market value of open positions. It changes continuously as prices move but is not locked in until the position is closed.

```
Unrealized P&L = (current price - average entry price) * position size
```

Realized P&L is the profit or loss from closed positions. It is fixed once a trade is closed and does not change with subsequent price movements.

```
Realized P&L = (exit price - entry price) * quantity  for long
Realized P&L = (entry price - exit price) * quantity  for short
```

Total P&L = Realized + Unrealized. The AI bot panel shows both separately so you can distinguish locked-in gains from floating positions.

---

### Q17: What is the Kelly Criterion and why use half-Kelly?

The Kelly Criterion determines the optimal fraction of capital to bet to maximize long-term growth:

```
f = (b*p - q) / b
  where b = reward/risk ratio
        p = probability of winning
        q = 1 - p
```

Full Kelly maximizes expected log growth but produces high variance and large drawdowns. Half-Kelly (f * 0.5) sacrifices some expected return in exchange for significantly lower variance and drawdown. For a trading bot where the probability estimates are imperfect, half-Kelly is the standard practical choice.

---

## Performance and Scalability

### Q18: What are the current performance bottlenecks?

The main bottlenecks are:

Single Node.js process: CPU-bound operations (sorting price levels, computing indicators) block the event loop. Worker threads would help for heavy computation.

In-memory state: the order book and price history are lost on restart. Redis would provide persistence and allow multiple processes to share state.

Single onTrade callback: the MatchingEngine only supports one subscriber. A proper EventEmitter would allow cleaner multi-subscriber patterns.

WebSocket broadcasting is O(n) for n clients. Redis Pub/Sub would allow multiple WebSocket servers to fan out to their own client sets.

---

### Q19: How would you scale this to handle 1 million users?

```
Load Balancer (nginx or HAProxy)
  |
  API Server cluster (stateless, horizontal scale)
  |
  Redis (shared order book snapshots, session state, Pub/Sub)
  |
  Kafka (order queue, decouples submission from matching)
  |
  Matching Engine cluster (one process per symbol, isolated)
  |
  PostgreSQL + TimescaleDB (trade history, candles, user accounts)

WebSocket cluster:
  Multiple WS servers, each subscribed to Redis Pub/Sub
  Sticky sessions via load balancer for connection affinity
```

Expected targets at scale:
- 100,000+ orders per second
- 1M+ concurrent WebSocket connections
- < 10ms matching latency
- 99.99% uptime

---

## Technical Implementation

### Q20: Walk through your Docker setup.

The backend uses a multi-stage build. The builder stage installs all dependencies and compiles TypeScript. The production stage copies only the compiled dist folder and installs production dependencies only, resulting in a smaller image without build tools.

The frontend uses a similar pattern: Vite builds the React app in the builder stage, then nginx serves the static files in the production stage.

The analytics service uses a Python 3.11 slim base image with pip installing the requirements.

Docker Compose wires the three services on a bridge network called exchange-network. The analytics service connects to the backend using the hostname `backend` (Docker internal DNS). The health check uses a Node.js HTTP request rather than curl because curl is not available in the Alpine image.

---

### Q21: What was the hardest bug you fixed in this project?

The AI bot was not trading despite the system generating thousands of trades per second.

The root cause was that `MatchingEngine.onTrade` is a single callback, not an EventEmitter. When the bot called `engine.onTrade()` to subscribe, it overwrote the server's existing callback, breaking portfolio updates and WebSocket broadcasting. When the server's callback was registered first, the bot never received any data.

The fix was the feedTrade injection pattern. The server's onTrade callback explicitly calls `aiBot.feedTrade(symbol, trade)` for every trade. The bot does not subscribe to the engine at all — it receives data pushed to it. This keeps the server's callback intact and gives the bot a clean data feed without any subscription conflict.

---

### Q22: What would you improve with more time?

Short term:
- PostgreSQL for trade persistence across restarts
- Redis for order book caching and WebSocket scaling
- JWT authentication with multi-user accounts
- Stop-limit, IOC, and FOK order types
- Unit tests for AI bot indicator calculations

Medium term:
- Backtesting framework to evaluate bot strategies on historical data
- Prometheus metrics and Grafana dashboards
- Kubernetes deployment with horizontal pod autoscaling
- Bot strategy parameter tuning via API

Long term:
- Options pricing module using Black-Scholes
- Margin trading with leverage
- Algorithmic trading API with Python SDK
- Mobile app with push notifications for bot alerts

---

## Additional Resources

Recommended reading:
- Designing Data-Intensive Applications by Martin Kleppmann
- Flash Boys by Michael Lewis
- Algorithmic Trading by Ernest Chan

Technologies to explore next:
- Rust for ultra-low latency matching engines
- Apache Kafka for high-throughput order queuing
- Redis for distributed state and Pub/Sub
- Kubernetes for container orchestration at scale

---

Prepared by: Your Name
Project: Synthetic Exchange Trading Platform
Date: May 2026
