# Architecture Mapping - Synthetic Exchange

## Table of Contents
1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Backend Architecture](#backend-architecture)
5. [Frontend Architecture](#frontend-architecture)
6. [AI Bot Architecture](#ai-bot-architecture)
7. [Communication Protocols](#communication-protocols)
8. [Deployment Architecture](#deployment-architecture)

---

## System Overview

The platform follows a 3-tier event-driven architecture with real-time data streaming across three Docker services.

```
PRESENTATION TIER
  Trading Terminal (React + TypeScript)
  Analytics Dashboard (Streamlit + Plotly)

APPLICATION TIER
  Express REST API
  Multi-Symbol Matching Engines
  WebSocket Broadcast Server
  AI Trading Bot
  Real Market Data Service

DATA TIER
  In-Memory Limit Order Books (per symbol)
  Portfolio State (in-memory)
  CoinGecko API (external)
  Price History Buffers (in-memory, bounded)
```

---

## Component Architecture

### Backend Components

| Component | File | Responsibility |
|---|---|---|
| MatchingEngine | `engine/MatchingEngine.ts` | Order validation, routing, single-callback event emission |
| OrderBook | `engine/OrderBook.ts` | Price-Time priority LOB, trade generation, FIFO queues |
| PortfolioManager | `engine/PortfolioManager.ts` | Multi-symbol positions, realized and unrealized P&L, cost basis |
| MarketGenerator | `market/MarketGenerator.ts` | GBM-based synthetic liquidity, per-symbol price anchoring |
| RealMarketData | `market/RealMarketData.ts` | CoinGecko API polling, synthetic micro-updates, EventEmitter |
| CandleGenerator | `market/CandleGenerator.ts` | OHLCV aggregation from trade stream |
| AITradingBot | `bots/AITradingBot.ts` | 4-strategy autonomous trading, risk management, live P&L |
| WebSocketServer | `websocket/WebSocketServer.ts` | 50ms batched broadcasting, client lifecycle management |
| server.ts | `server.ts` | Service wiring, REST routes, bot feed integration |

### Frontend Components

| Component | Responsibility |
|---|---|
| Header | Branding, WebSocket connection status, Analytics link |
| MarketTicker | Live prices for all 12 symbols from backend WebSocket |
| CandlestickChart | Price line with SMA(7) and SMA(20) overlays, volume bars |
| OrderBookWidget | Bid/ask depth with quantity bars and spread display |
| OrderPanel | Order entry, quick-quantity buttons, slippage warning |
| PortfolioWidget | Account value, realized and unrealized P&L, open positions |
| RecentTrades | Real-time trade feed from WebSocket |
| OrderHistory | User trade history polled from REST API |
| StatsBar | System metrics: last price, bid, ask, spread, order count |
| AIBotPanel | Bot controls, live P&L, open trades, positions, strategy toggles |

---

## Data Flow Diagrams

### Order Lifecycle

```
User
  |
  | clicks Buy/Sell
  v
Frontend (OrderPanel)
  |
  | POST /api/orders { userId, type, side, price, quantity, symbol }
  v
server.ts route handler
  |
  | validates fields, checks buying power
  v
MatchingEngine.submitOrder()
  |
  | creates Order object
  v
OrderBook.addOrder()
  |
  |-- MARKET ORDER --> matchMarketOrder() --> walk asks/bids, fill immediately
  |-- LIMIT ORDER  --> matchLimitOrder()  --> check crossing, fill or rest in book
  |
  | returns Trade[]
  v
server.ts onTrade callback
  |
  |-- portfolioManager.processTradeForSymbol()
  |-- candleGen.processTrade()
  |-- aiBot.feedTrade()          <-- AI bot receives price data here
  |-- wsServer.broadcast(trade)
  |-- wsServer.broadcast(orderbook snapshot)
  v
WebSocketServer (50ms batch)
  |
  | sends grouped JSON to all connected clients
  v
Frontend WebSocketService
  |
  |-- RecentTrades component updates
  |-- OrderBookWidget updates
  |-- CandlestickChart updates
  |-- AIBotPanel polls /api/bot/status every 2s
```

### Real Market Data Flow

```
CoinGecko API
  |
  | HTTP GET every 30s (free tier rate limit)
  v
RealMarketDataService.fetchRealPrices()
  |
  | normalizes response to MarketQuote[]
  v
EventEmitter.emit('prices_updated', quotes)
  |
  |-- server.ts: portfolioManager.updateSymbolPrice()
  |-- server.ts: wsServer.broadcast({ type: 'market_data', data: quotes })
  |-- MarketGenerator.syncBasePrice() (gentle 10% convergence)
  |
  | every 2s between API calls:
  v
RealMarketDataService.applyMicroUpdates()
  |
  | GBM step per symbol (asset-specific volatility)
  v
EventEmitter.emit('prices_updated', quotes)
  |
  v
Frontend MarketTicker (updates live prices)
```

### AI Bot Decision Flow

```
server.ts onTrade callback
  |
  | aiBot.feedTrade(symbol, trade)
  v
AITradingBot price/volume history buffers (bounded at 200)
  |
  | every 3 seconds (setInterval):
  v
AITradingBot.tick()
  |
  | for each symbol with >= 30 data points:
  |
  |-- rsiStrategy()       --> RSI(14) signal + confidence
  |-- momentumStrategy()  --> EMA(8) vs EMA(21) signal + confidence
  |-- breakoutStrategy()  --> Bollinger Band(20,2) + volume spike
  |-- mmStrategy()        --> inventory lean + random liquidity
  |
  v
consensus() weighted vote
  momentum 35%, mean_reversion 30%, breakout 25%, market_making 10%
  |
  | if confidence >= 0.25 and not in cooldown:
  v
AITradingBot.trade()
  |
  | Kelly-sized quantity (half-Kelly, capped at 8 units)
  | MatchingEngine.submitOrder() MARKET order
  |
  v
checkExits() on all open trades
  |
  | stop-loss at -2%, take-profit at +3%
  | closes via MARKET order on opposite side
  | updates totalPnL, winCount, lossCount
```

---

## Backend Architecture

### OrderBook Data Structure

```
OrderBook
  bids: Map<number, PriceLevel>    sorted descending (best bid first)
  asks: Map<number, PriceLevel>    sorted ascending (best ask first)
  orderMap: Map<string, Order>     O(1) lookup by order ID
  trades: Trade[]                  bounded trade history

PriceLevel
  price: number
  orders: Order[]                  FIFO queue (time priority)
  totalQuantity: number            running sum for display
```

### Multi-Symbol Engine Wiring

```
server.ts initializeSymbolEngines()
  |
  | for each symbol in RealMarketData.getSupportedSymbols():
  |
  |-- new MatchingEngine()
  |-- new CandleGenerator(5s)
  |-- new MarketGenerator(engine)
  |     with asset-specific sigma
  |
  |-- engine.onTrade(callback)
  |     portfolioManager.processTradeForSymbol(symbol, trade)
  |     candleGen.processTrade(trade)
  |     aiBot.feedTrade(symbol, trade)
  |     wsServer.broadcast(trade, orderbook)
  |
  |-- symbolEngines.set(symbol, { engine, generator, candleGen })
  |
  | aiBot.registerSymbol(symbol, engine)
```

### Portfolio Manager State

```
portfolios: Map<userId, Portfolio>
  cash: number
  positions: Map<symbol, quantity>   positive = long, negative = short
  realizedPnL: number
  unrealizedPnL: number

symbolPrices: Map<symbol, price>     updated from trade events and market data
costBasis: Map<userId, Map<symbol, avgPrice>>
```

---

## Frontend Architecture

### Component Tree

```
App
  Header
  MarketTicker
  StatsBar
  Main Grid (4-column)
    Left (3 cols)
      CandlestickChart
      OrderPanel
      OrderHistory
    Right (1 col)
      AIBotPanel
      PortfolioWidget
      OrderBookWidget
      RecentTrades
```

### State Management

```
React hooks only (no Redux or Zustand):
  useState   local component state
  useEffect  WebSocket subscriptions, polling intervals, cleanup
  useMemo    SMA calculations, chart data transformation

Symbol change resets:
  candles state cleared
  orderBook state cleared
  new API fetches triggered
```

### WebSocket Service

```
WebSocketService (singleton, exported as wsService)
  ws: WebSocket
  handlers: Map<eventType, callback[]>   supports multiple handlers per type
  reconnect: exponential backoff, max 10 attempts (1s to 512s)

Message format from server:
  { timestamp, updates: { orderbook: [...], trade: [...], candle: [...] } }

Handler dispatch:
  for each type in updates:
    call all registered handlers for that type
```

---

## AI Bot Architecture

### Strategy Signals

Each strategy returns a StrategySignal:
```typescript
{
  strategy: string
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number   // 0 to 1
  reason: string
}
```

### Consensus Voting

```
buyScore  = sum(confidence * weight) for all BUY signals
sellScore = sum(confidence * weight) for all SELL signals

weights:
  momentum:       0.35
  mean_reversion: 0.30
  breakout:       0.25
  market_making:  0.10

if buyScore > sellScore and buyScore > 0.10: execute BUY
if sellScore > buyScore and sellScore > 0.10: execute SELL
else: HOLD
```

### Risk Controls

```
Per-trade:
  stop-loss:    -2% from entry price
  take-profit:  +3% from entry price
  max quantity: 8 units per trade
  cooldown:     5s per symbol after any trade

Portfolio-level:
  max position per symbol: 30 units (long or short)
  circuit breaker: pause all trading if drawdown > 10%

Position sizing (half-Kelly):
  f = (b*p - q) / b  where b=2 (2:1 reward/risk), p=confidence
  quantity = floor(capital * riskPerTrade * f / price)
  capped at 8 units
```

### Live P&L Calculation

```
getStatus() computes unrealized P&L on every call:
  for each OPEN trade in tradeLog:
    current = priceHistory[symbol].last
    if BUY:  livePnl = (current - entryPrice) * quantity
    if SELL: livePnl = (entryPrice - current) * quantity
    unrealizedPnL += livePnl

totalPnL returned = realizedPnL + unrealizedPnL
recentTrades enriched with currentPrice and live pnl per open trade
```

---

## Communication Protocols

### REST API

- Transport: HTTP/1.1
- Format: JSON
- Middleware: CORS (all origins), compression (gzip), express.json()
- Error format: `{ error: string }` with appropriate HTTP status

### WebSocket

- Library: ws (Node.js)
- Path: /ws
- Batching: 50ms flush interval
- Message format: `{ timestamp: number, updates: Record<type, data[]> }`
- Reconnection: client-side exponential backoff

### AI Bot API

- All bot endpoints under /api/bot/
- Frontend polls /api/bot/status every 2 seconds
- No WebSocket push for bot status (polling sufficient at 2s interval)

---

## Deployment Architecture

### Docker Services

```
docker-compose.yml
  backend   (Node.js 18 Alpine, port 8080)
    multi-stage build: builder installs all deps, production copies only dist + prod deps
    healthcheck: node HTTP request to /health every 10s
    restart: unless-stopped

  frontend  (Nginx Alpine, port 3000)
    multi-stage build: Vite builds React app, nginx serves static files
    depends_on: backend
    restart: unless-stopped

  analytics (Python 3.11 slim, port 8501)
    Streamlit app connecting to backend:8080 via Docker internal network
    BACKEND_URL env var set to http://backend:8080
    restart: unless-stopped
```

### Network

```
exchange-network (bridge driver)
  backend:   reachable as 'backend' from other containers
  frontend:  nginx proxies to backend for API calls
  analytics: connects to backend by hostname

Host port mapping:
  3000 -> frontend:80
  8080 -> backend:8080
  8501 -> analytics:8501
```

### Known Constraints

- In-memory state: all data lost on container restart
- Single Node.js process: no horizontal scaling
- CoinGecko free tier: 30s polling interval, no API key
- onTrade is a single callback per MatchingEngine: AI bot uses feedTrade pattern instead of subscribing directly

---

## Scalability Path

```
Current (simulation):
  Single process, in-memory, 12 symbols, ~240 events/sec

Production path:
  Load Balancer
    API Server cluster (stateless)
      Redis (shared order book snapshots, session state)
        Kafka (order queue)
          Matching Engine cluster (one process per symbol)
            PostgreSQL + TimescaleDB (trade history, candles)
  WebSocket cluster with Redis Pub/Sub fan-out
```

---

Document Version: 3.0
Last Updated: May 2026
