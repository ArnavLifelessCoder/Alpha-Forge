# Synthetic Exchange

A production-grade, real-time multi-asset trading platform with live market data, a high-performance matching engine, an AI trading bot, and a Streamlit analytics dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2+-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.31-FF4B4B.svg)](https://streamlit.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed.svg)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Quick Start

```bash
# Requires Docker
docker-compose up --build

# Trading Terminal:     http://localhost:3000
# Analytics Dashboard:  http://localhost:8501
# Backend API:          http://localhost:8080

#Backend - https://algo-portal-final-1xvi.onrender.com - On Render
#Frontend - https://algo-portal-rg4ck4qma-arnav-gawade-s-projects.vercel.app/ - On Vercel
```

---

## What This Project Demonstrates

| Skill Area | Implementation |
|---|---|
| System Design | Event-driven architecture, real-time WebSocket streaming, multi-symbol engine |
| Data Structures | Limit Order Book with Price-Time priority, O(1) order lookup via hash map |
| Financial Engineering | GBM price simulation, P&L calculation, portfolio management, AI trading strategies |
| Real-Time Systems | WebSocket with 50ms message batching, live market data feeds |
| API Integration | CoinGecko live crypto prices, REST + WebSocket hybrid |
| Frontend Engineering | React 18, real-time charts with SMA overlays, responsive trading terminal |
| AI / Algorithmic Trading | Multi-strategy bot: RSI mean reversion, EMA momentum, Bollinger breakout, market making |
| DevOps | 3-service Docker Compose orchestration, health checks, graceful shutdown |
| Data Analytics | Streamlit dashboard with Plotly visualizations, auto-refresh |

---

## Architecture

```
FRONTEND (React + TypeScript)
  Market Ticker | Candlestick Chart | Order Book | Portfolio | AI Bot Panel
        |
        | WebSocket + REST
        |
BACKEND (Node.js + TypeScript)
  WebSocket Server (50ms batched broadcast)
  Multi-Symbol Matching Engines (12 independent LOBs)
  Real Market Data Service (CoinGecko API)
  GBM Market Generator (synthetic liquidity)
  AI Trading Bot (4 strategies, live P&L)
  Portfolio Manager (multi-symbol positions)
  Candle Generator (5s OHLCV)
  REST API (Express)
        |
ANALYTICS (Streamlit + Plotly)
  System Metrics | Market Overview | Portfolio | Trade Flow Analysis
```

---

## Features

### Trading Engine
- 12 tradeable assets: BTC, ETH, SOL, BNB, XRP (crypto) + AAPL, GOOGL, MSFT, TSLA, AMZN, NVDA, META (stocks)
- Live prices from CoinGecko API with GBM micro-updates between API calls
- Price-Time priority matching with sub-millisecond execution
- Limit orders, market orders, cancel support
- Partial fills with quantity tracking
- Independent order book per symbol

### AI Trading Bot
- Runs autonomously across all 12 symbols simultaneously
- Four strategies with weighted consensus voting:
  - Mean Reversion: RSI-based oversold/overbought detection
  - Momentum: EMA(8) vs EMA(21) crossover
  - Breakout: Bollinger Band breakout with volume confirmation
  - Market Making: Inventory-aware spread capture
- Kelly Criterion-inspired position sizing
- Stop-loss at 2%, take-profit at 3% per trade
- Circuit breaker pauses trading at 10% drawdown
- Live unrealized P&L tracking on open positions
- Fully controllable from the frontend panel (start, stop, pause, toggle strategies)

### Trading Terminal (React)
- Price chart with SMA(7) and SMA(20) overlays, volume bars, toggleable indicators
- Live order book with depth bars and spread display
- Order entry with quick-quantity buttons and slippage warnings
- Portfolio widget with realized and unrealized P&L, open positions
- Market ticker with live 24h change from real API data
- Recent trades feed connected to real WebSocket events
- Trade history connected to real backend data
- AI Bot panel with live metrics, positions, and recent bot trades
- Analytics dashboard link in header

### Analytics Dashboard (Streamlit)
- System health: uptime, WebSocket connections, order and trade counts
- Market data table with 24h change bar chart for all 12 symbols
- Portfolio summary with P&L breakdown
- Trade flow analysis: price over time, volume distribution, statistics
- Configurable auto-refresh

### Infrastructure
- 3-service Docker Compose: backend, frontend (nginx), analytics (Streamlit)
- WebSocket message batching at 50ms cycles
- Graceful shutdown on SIGTERM/SIGINT
- CORS and compression middleware

---

## Running Locally Without Docker

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

### Analytics
```bash
cd analytics
pip install -r requirements.txt
streamlit run app.py
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | System health and uptime |
| `/api/symbols` | GET | All supported symbols with live quotes |
| `/api/market-data` | GET | Live prices for all 12 assets |
| `/api/market-data/:symbol` | GET | Price data for a specific symbol |
| `/api/orderbook?symbol=X` | GET | Order book snapshot |
| `/api/trades?symbol=X` | GET | Recent trades |
| `/api/candles?symbol=X` | GET | OHLCV candle data |
| `/api/orders` | POST | Submit a limit or market order |
| `/api/orders/:id` | DELETE | Cancel an order |
| `/api/portfolio/:userId` | GET | Portfolio summary |
| `/api/orders/:userId` | GET | User trade history |
| `/api/stats?symbol=X` | GET | Engine statistics |
| `/api/bot/status` | GET | AI bot status, P&L, positions, recent trades |
| `/api/bot/start` | POST | Start the AI bot |
| `/api/bot/stop` | POST | Stop the AI bot |
| `/api/bot/pause` | POST | Pause the AI bot |
| `/api/bot/resume` | POST | Resume the AI bot |
| `/api/bot/strategies` | POST | Update active strategies |
| `/api/bot/trades` | GET | AI bot trade log |

### WebSocket Events (ws://localhost:8080/ws)

| Event | Direction | Description |
|---|---|---|
| `orderbook` | Server to Client | Order book updates every 500ms |
| `trade` | Server to Client | Trade executions in real time |
| `candle` | Server to Client | New OHLCV candles every 5s |
| `market_data` | Server to Client | All symbol prices every 2s |
| `order_update` | Server to Client | Order status changes |

---

## Technical Details

### Matching Engine
```
Price-Time Priority (FIFO):
  1. Incoming order checked against opposite book
  2. Best price matched first
  3. At same price, earliest order fills first
  4. Partial fills tracked via remainingQuantity
  5. Unfilled limit orders rest in the book

Complexity:
  Insert:  O(1) amortized
  Match:   O(k) where k = price levels crossed
  Cancel:  O(1) via order ID hash map
```

### GBM Price Simulation
```
S(t) = S0 * exp((mu - sigma^2/2)*t + sigma*sqrt(t)*Z)

Parameters per asset:
  mu (drift):     0.0001
  sigma (vol):    0.015 to 0.04 depending on asset
  dt:             per tick

Real CoinGecko prices anchor synthetic prices every 30s.
Micro-updates run every 2s between API calls.
```

### AI Bot Decision Cycle
```
Every 3 seconds per symbol:
  1. Poll latest 100 trades for price/volume history
  2. Run all active strategies, get signals with confidence scores
  3. Weighted consensus vote (momentum 35%, mean reversion 30%,
     breakout 25%, market making 10%)
  4. If consensus confidence >= 0.25, execute trade
  5. Position sizing via Kelly Criterion (half-Kelly)
  6. Check all open trades for stop-loss / take-profit exit
  7. Circuit breaker halts all trading at 10% drawdown
```

### WebSocket Batching
```
Problem: 12 symbols * 20 orders/sec = 240+ events/sec
Solution:
  - All events queued in memory buffer
  - Every 50ms, buffer flushed and grouped by type
  - Single JSON payload sent per client per cycle
  - Result: ~20 sends/sec instead of 240+
```

---

## Performance

| Metric | Value |
|---|---|
| Order matching latency | < 1ms |
| WebSocket broadcast cycle | 50ms |
| Synthetic order generation | 20 orders/sec per symbol |
| Frontend render rate | 60 FPS |
| API response time p99 | < 50ms |
| Backend memory usage | < 256MB |

---

## Project Structure

```
synthetic-exchange/
  backend/
    src/
      engine/         # MatchingEngine, OrderBook, PortfolioManager
      market/         # MarketGenerator (GBM), RealMarketData, CandleGenerator
      bots/           # AITradingBot (4 strategies)
      websocket/      # WebSocketServer with batching
      types/          # TypeScript interfaces
      server.ts       # Express app, service wiring, API routes
  frontend/
    src/
      components/     # 11 React components including AIBotPanel
      services/       # ApiService, WebSocketService
      types/          # Frontend type definitions
  analytics/
    app.py            # Streamlit dashboard
    requirements.txt
  docker-compose.yml
  README.md
  ARCHITECTURE_MAPPING.md
  METHODOLOGY.md
  TESTING_GUIDE.md
  INTERVIEW_QUESTIONS.md
```

---

## Design Decisions

| Decision | Rationale |
|---|---|
| In-memory order book | Sub-ms latency, appropriate for simulation scale |
| WebSocket over SSE | Bidirectional, lower overhead, native reconnect support |
| CoinGecko free tier | No API key required, reliable for crypto anchoring |
| Separate Streamlit service | Decoupled analytics, Python data science ecosystem |
| TypeScript full stack | Type safety, refactoring confidence, IDE support |
| Docker Compose | One-command reproducible deployment across environments |
| feedTrade pattern for AI bot | Avoids overwriting single-callback onTrade, gets data directly from server trade handler |
| Half-Kelly position sizing | Reduces variance vs full Kelly while maintaining edge |

---

## Future Enhancements

- PostgreSQL and TimescaleDB for trade persistence
- Redis for order book caching and WebSocket pub/sub scaling
- JWT authentication with multi-user accounts
- Stop-limit, IOC, and FOK order types
- Backtesting framework for bot strategy evaluation
- Kubernetes deployment with horizontal scaling
- Prometheus and Grafana monitoring
- Options pricing module (Black-Scholes)

---

## License

MIT License. Built as a production-grade portfolio project demonstrating full-stack engineering, financial systems, real-time architecture, and algorithmic trading.
