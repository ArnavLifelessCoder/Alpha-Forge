# Testing Guide - Synthetic Exchange

## Table of Contents
1. [Testing Strategy](#testing-strategy)
2. [Running Tests](#running-tests)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [Manual Testing Scenarios](#manual-testing-scenarios)
6. [AI Bot Testing](#ai-bot-testing)
7. [Performance Testing](#performance-testing)
8. [Test Coverage](#test-coverage)
9. [Troubleshooting](#troubleshooting)

---

## Testing Strategy

| Level | Scope | Tools |
|---|---|---|
| Unit | OrderBook, MatchingEngine, AI bot indicators | Jest + ts-jest |
| Integration | REST API endpoints, WebSocket flow, bot API | Jest + supertest |
| Manual | Full user workflows, bot behavior, analytics | Browser + DevTools |
| Performance | Throughput, latency, memory | curl scripts, docker stats |

---

## Running Tests

### Backend Unit Tests

```bash
cd backend
npm test
npm test -- --watch
npm test -- --coverage
npm test -- --verbose
```

### Type Checking (Both Services)

```bash
cd backend
npx tsc --noEmit

cd frontend
npx tsc --noEmit
```

### Production Build Verification

```bash
cd backend
npm run build

cd frontend
npm run build
```

### Full System Smoke Test

```bash
docker-compose up --build

# Windows PowerShell
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:8080/api/bot/status" -UseBasicParsing
```

---

## Unit Tests

### OrderBook Tests

File: `backend/src/engine/__tests__/OrderBook.test.ts`

Test cases:

```typescript
describe('OrderBook', () => {
  // Basic operations
  it('should add a limit buy order to the book')
  it('should add a limit sell order to the book')
  it('should return empty snapshot for empty book')

  // Matching
  it('should match crossing limit orders')
  it('should match market buy against asks')
  it('should match market sell against bids')
  it('should match at best available price')

  // Price-Time Priority
  it('should fill earlier orders first at same price')
  it('should match better prices first')

  // Partial fills
  it('should handle partial fills correctly')
  it('should keep partially filled orders in book')
  it('should update remainingQuantity after partial fill')

  // Cancellation
  it('should cancel existing orders')
  it('should not cancel filled orders')
  it('should clean up empty price levels after cancellation')

  // Edge cases
  it('should handle zero-quantity book gracefully')
  it('should maintain book integrity after many operations')
});
```

Key test patterns:

```typescript
// Price-Time Priority
it('should fill earlier orders first at same price', () => {
  const book = new OrderBook();
  const order1 = createOrder({ side: 'BUY', price: 100, quantity: 5 });
  const order2 = createOrder({ side: 'BUY', price: 100, quantity: 5 });
  book.addOrder(order1);
  book.addOrder(order2);

  const sell = createOrder({ side: 'SELL', price: 100, quantity: 3 });
  const trades = book.addOrder(sell);

  expect(trades[0].buyOrderId).toBe(order1.id);
  expect(order1.remainingQuantity).toBe(2);
  expect(order2.remainingQuantity).toBe(5);
});

// Multi-level matching
it('should walk multiple price levels for large orders', () => {
  const book = new OrderBook();
  book.addOrder(createOrder({ side: 'SELL', price: 101, quantity: 5 }));
  book.addOrder(createOrder({ side: 'SELL', price: 102, quantity: 5 }));
  book.addOrder(createOrder({ side: 'SELL', price: 103, quantity: 5 }));

  const buy = createOrder({ side: 'BUY', price: 103, quantity: 12 });
  const trades = book.addOrder(buy);

  expect(trades.length).toBe(3);
  expect(trades[0].price).toBe(101);
  expect(buy.remainingQuantity).toBe(0);
});
```

---

## Integration Tests

### REST API

```typescript
describe('POST /api/orders', () => {
  it('should accept valid limit order', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({
        userId: 'TEST_USER',
        type: 'LIMIT',
        side: 'BUY',
        price: 100,
        quantity: 5,
        symbol: 'BTC/USD',
      });
    expect(response.status).toBe(200);
    expect(response.body.order.status).toMatch(/PENDING|FILLED|PARTIAL/);
  });

  it('should reject order with missing fields', async () => {
    const response = await request(app)
      .post('/api/orders')
      .send({ userId: 'TEST_USER' });
    expect(response.status).toBe(400);
  });
});

describe('GET /api/portfolio/:userId', () => {
  it('should return default portfolio for new user', async () => {
    const response = await request(app).get('/api/portfolio/NEW_USER');
    expect(response.status).toBe(200);
    expect(response.body.cash).toBe(100000);
  });
});

describe('GET /api/bot/status', () => {
  it('should return bot status with required fields', async () => {
    const response = await request(app).get('/api/bot/status');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('isRunning');
    expect(response.body).toHaveProperty('totalPnL');
    expect(response.body).toHaveProperty('unrealizedPnL');
    expect(response.body).toHaveProperty('positions');
    expect(response.body).toHaveProperty('activeStrategies');
  });
});
```

### WebSocket

```typescript
describe('WebSocket Server', () => {
  it('should accept connections on /ws', (done) => {
    const ws = new WebSocket('ws://localhost:8080/ws');
    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });
  });

  it('should broadcast orderbook updates within 1 second', (done) => {
    const ws = new WebSocket('ws://localhost:8080/ws');
    const timeout = setTimeout(() => done(new Error('No orderbook received')), 1000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.updates && msg.updates.orderbook) {
        clearTimeout(timeout);
        ws.close();
        done();
      }
    });
  });
});
```

---

## Manual Testing Scenarios

### Scenario 1: Basic Trade Execution

```
1. Open http://localhost:3000
2. Confirm green "Connected" indicator in header
3. Confirm Market Ticker shows 12 symbols with live prices
4. Select BTC/USD from ticker
5. In Order Panel:
   - Type: Limit
   - Side: Buy
   - Price: current market price
   - Quantity: 5
6. Click BUY LIMIT
7. Verify:
   - Success message appears
   - Portfolio cash decreases
   - Trade appears in Order History
   - Order book updates
```

### Scenario 2: Multi-Symbol Portfolio

```
1. Buy BTC/USD (Limit, qty 3)
2. Switch to AAPL, buy (Market, qty 10)
3. Switch to ETH/USD, sell (Limit, qty 2)
4. Check Portfolio Widget:
   - BTC/USD LONG position shown
   - AAPL LONG position shown
   - ETH/USD SHORT position shown
   - Cash decreased appropriately
```

### Scenario 3: Market Order Slippage

```
1. Place Market Buy for qty 50
2. Verify slippage warning appears in Order Panel
3. Submit order
4. Verify fills at multiple price levels in Recent Trades
5. Verify Portfolio updates immediately
```

### Scenario 4: Error Handling

```
1. Submit order with quantity 0 -> expect error message
2. Submit buy order exceeding $100,000 -> expect "Insufficient buying power"
3. Disable network in browser DevTools -> expect reconnection attempts
4. Re-enable network -> expect automatic reconnection and data resync
```

### Scenario 5: Analytics Dashboard

```
1. Open http://localhost:8501
2. Verify "System Online" status in header
3. Confirm System Metrics show non-zero orders and trades
4. Confirm Market Data table shows all 12 symbols
5. Confirm Trade Flow Analysis charts render
6. Toggle auto-refresh off and on
7. Click Refresh button manually
```

---

## AI Bot Testing

### Scenario 1: Bot Startup and Data Collection

```
1. Start system with docker-compose up --build
2. Open http://localhost:3000
3. Locate AI Bot Panel in right sidebar
4. Verify status shows "LIVE" (green indicator)
5. Wait 30 seconds for price history to accumulate
6. Verify Bot Positions section shows non-zero positions
7. Verify Recent AI Trades section shows trade entries
```

### Scenario 2: Live P&L Verification

```
1. Observe AI Bot Panel with open positions
2. Verify Total P&L updates every 2 seconds
3. Verify Unrealized P&L changes as market prices move
4. Verify Open Trades count changes as bot opens and closes positions
5. Confirm P&L sign matches position direction (long profits when price rises)
```

### Scenario 3: Strategy Toggle

```
1. Click "Momentum" strategy button to disable it
2. Verify green dot turns off
3. Wait 10 seconds
4. Verify bot continues trading with remaining strategies
5. Re-enable Momentum
6. Disable all strategies except Market Making
7. Verify bot only executes market making trades
```

### Scenario 4: Pause and Resume

```
1. Click Pause button
2. Verify status changes to "PAUSED" (yellow)
3. Wait 15 seconds
4. Verify no new trades appear in Recent AI Trades
5. Click Resume
6. Verify status returns to "LIVE"
7. Verify new trades appear within 10 seconds
```

### Scenario 5: Stop and Restart

```
1. Click Stop button
2. Verify status shows "OFF"
3. Verify no new trades appear
4. Click Start button
5. Verify status returns to "LIVE"
6. Verify bot begins trading again after data accumulation
```

### Scenario 6: Circuit Breaker (Simulated)

```
Via API:
POST http://localhost:8080/api/bot/status
Check drawdown field

If drawdown approaches 10%, bot should auto-pause.
To test: monitor status endpoint during volatile market conditions.
```

### Verifying Bot via API

```powershell
# Check full status
Invoke-WebRequest -Uri "http://localhost:8080/api/bot/status" -UseBasicParsing | ConvertFrom-Json

# Check recent bot trades
Invoke-WebRequest -Uri "http://localhost:8080/api/bot/trades?count=10" -UseBasicParsing | ConvertFrom-Json

# Pause bot
Invoke-WebRequest -Uri "http://localhost:8080/api/bot/pause" -Method POST -UseBasicParsing

# Update strategies
Invoke-WebRequest -Uri "http://localhost:8080/api/bot/strategies" -Method POST `
  -ContentType "application/json" `
  -Body '{"strategies":["momentum","breakout"]}' -UseBasicParsing
```

---

## Performance Testing

### Order Throughput

```powershell
# Windows: submit 100 orders and check stats
1..100 | ForEach-Object {
  Invoke-WebRequest -Uri "http://localhost:8080/api/orders" -Method POST `
    -ContentType "application/json" `
    -Body '{"userId":"LOAD_TEST","type":"LIMIT","side":"BUY","price":100,"quantity":1,"symbol":"BTC/USD"}' `
    -UseBasicParsing | Out-Null
}
Invoke-WebRequest -Uri "http://localhost:8080/api/stats" -UseBasicParsing | ConvertFrom-Json
```

### Memory and CPU

```bash
docker stats --no-stream
```

### Expected Targets

| Metric | Target |
|---|---|
| Order submission response | < 10ms |
| WebSocket message latency | < 100ms end-to-end |
| Backend memory | < 256MB |
| Backend CPU at idle | < 20% |
| Frontend render rate | 60 FPS |
| Bot decision cycle | 3s interval, < 10ms execution |

---

## Test Coverage

| Module | Unit | Integration | Manual |
|---|---|---|---|
| OrderBook | covered | covered | covered |
| MatchingEngine | covered | covered | covered |
| PortfolioManager | not covered | covered | covered |
| MarketGenerator | not covered | covered | covered |
| RealMarketData | not covered | covered | covered |
| AITradingBot | not covered | covered | covered |
| WebSocket Server | not covered | covered | covered |
| REST API routes | not covered | covered | covered |
| React components | not covered | not covered | covered |
| Streamlit dashboard | not covered | not covered | covered |

### Recommended Additions

- Property-based tests for OrderBook: generate random order sequences, verify no negative quantities, verify book integrity
- Snapshot tests for React components: catch unintended UI regressions
- Load tests with k6 or Artillery: sustained 1000 req/sec for 60 seconds
- Bot strategy unit tests: verify RSI, EMA, Bollinger Band calculations against known values
- Chaos tests: kill backend container, verify frontend reconnects and recovers state

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "Cannot connect to WebSocket" | Backend container not running | `docker-compose up backend` |
| Empty order book | Market generator not started | Verify `MARKET_GENERATOR_ENABLED=true` in docker-compose |
| "Insufficient buying power" | Portfolio cash depleted | Restart backend container to reset state |
| Stale market prices | CoinGecko rate limited | Wait 30s; synthetic GBM prices continue independently |
| Frontend shows blank page | Build error or nginx misconfiguration | Run `npm run build` locally to check for errors |
| Analytics shows "Backend not reachable" | BACKEND_URL env var not set correctly | Verify `BACKEND_URL=http://backend:8080` in docker-compose analytics service |
| AI bot shows 0 trades after 60s | Price history not accumulating | Check that symbolEngines are initialized before bot.start() is called |
| Bot P&L stuck at 0 | Only open trades, no closed trades yet | P&L includes unrealized; wait for stop-loss or take-profit to trigger |
| Bot positions not updating in UI | Frontend polling interval | AIBotPanel polls every 2s; wait up to 2s for update |

---

Document Version: 3.0
Last Updated: May 2026
