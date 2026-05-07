import express from 'express';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { MatchingEngine } from './engine/MatchingEngine';
import { MarketGenerator } from './market/MarketGenerator';
import { PortfolioManager } from './engine/PortfolioManager';
import { CandleGenerator } from './market/CandleGenerator';
import { WebSocketServer } from './websocket/WebSocketServer';
import { OrderType, OrderSide } from './types';

const PORT = process.env.PORT || 8080;
const MARKET_GENERATOR_ENABLED = process.env.MARKET_GENERATOR_ENABLED !== 'false';

// Initialize core components
const matchingEngine = new MatchingEngine();
const portfolioManager = new PortfolioManager();
const candleGenerator = new CandleGenerator(5); // 5-second candles
const marketGenerator = new MarketGenerator(matchingEngine);

// Setup Express app
const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);

// Setup event handlers
matchingEngine.onTrade((trades) => {
  // Process trades for portfolio updates
  trades.forEach(trade => {
    portfolioManager.processTrade(trade);
    candleGenerator.processTrade(trade);
  });

  // Broadcast trades
  wsServer.broadcast({
    type: 'trade',
    data: trades,
    timestamp: Date.now(),
  });

  // Broadcast updated order book
  const orderBook = matchingEngine.getOrderBookSnapshot(20);
  wsServer.broadcast({
    type: 'orderbook',
    data: orderBook,
    timestamp: Date.now(),
  });
});

matchingEngine.onOrderUpdate((order) => {
  wsServer.broadcast({
    type: 'order_update',
    data: order,
    timestamp: Date.now(),
  });
});

candleGenerator.onCandle((candle) => {
  wsServer.broadcast({
    type: 'candle',
    data: candle,
    timestamp: Date.now(),
  });
});

// Periodic order book broadcast (every 500ms)
setInterval(() => {
  const orderBook = matchingEngine.getOrderBookSnapshot(20);
  wsServer.broadcast({
    type: 'orderbook',
    data: orderBook,
    timestamp: Date.now(),
  });

  // Update portfolio manager with current mid price
  const midPrice = matchingEngine.getMidPrice();
  if (midPrice) {
    portfolioManager.updateCurrentPrice(midPrice);
  }
}, 500);

// REST API Endpoints

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: wsServer.getClientCount(),
  });
});

/**
 * Get order book snapshot
 */
app.get('/api/orderbook', (req, res) => {
  const depth = parseInt(req.query.depth as string) || 20;
  const orderBook = matchingEngine.getOrderBookSnapshot(depth);
  res.json(orderBook);
});

/**
 * Get recent trades
 */
app.get('/api/trades', (req, res) => {
  const count = parseInt(req.query.count as string) || 50;
  const trades = matchingEngine.getRecentTrades(count);
  res.json(trades);
});

/**
 * Get candles
 */
app.get('/api/candles', (req, res) => {
  const count = parseInt(req.query.count as string) || 100;
  const candles = candleGenerator.getCandles(count);
  res.json(candles);
});

/**
 * Get portfolio
 */
app.get('/api/portfolio/:userId', (req, res) => {
  const { userId } = req.params;
  const portfolio = portfolioManager.getPortfolioSummary(userId);
  res.json(portfolio);
});

/**
 * Submit order
 */
app.post('/api/orders', (req, res) => {
  try {
    const { userId, type, side, price, quantity } = req.body;

    // Validate request
    if (!userId || !type || !side || !quantity) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!Object.values(OrderType).includes(type)) {
      res.status(400).json({ error: 'Invalid order type' });
      return;
    }

    if (!Object.values(OrderSide).includes(side)) {
      res.status(400).json({ error: 'Invalid order side' });
      return;
    }

    // Check buying power for buy orders
    if (side === OrderSide.BUY && type === OrderType.LIMIT) {
      const requiredCash = price * quantity;
      if (!portfolioManager.hasSufficientBuyingPower(userId, requiredCash)) {
        res.status(400).json({ error: 'Insufficient buying power' });
        return;
      }
    }

    // Submit order
    const result = matchingEngine.submitOrder({
      userId,
      type,
      side,
      price: type === OrderType.LIMIT ? price : undefined,
      quantity,
    });

    res.json({
      order: result.order,
      trades: result.trades,
      portfolio: portfolioManager.getPortfolioSummary(userId),
    });
  } catch (error: any) {
    console.error('Error submitting order:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Cancel order
 */
app.delete('/api/orders/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const success = matchingEngine.cancelOrder({ orderId, userId });

    if (success) {
      res.json({ success: true, message: 'Order cancelled' });
    } else {
      res.status(404).json({ error: 'Order not found or already filled' });
    }
  } catch (error: any) {
    console.error('Error cancelling order:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get engine statistics
 */
app.get('/api/stats', (_req, res) => {
  const stats = matchingEngine.getStats();
  const midPrice = matchingEngine.getMidPrice();
  const bestPrices = matchingEngine.getBestPrices();

  res.json({
    ...stats,
    midPrice,
    bestBid: bestPrices.bid,
    bestAsk: bestPrices.ask,
    spread: bestPrices.bid && bestPrices.ask ? bestPrices.ask - bestPrices.bid : null,
    marketGeneratorActive: marketGenerator.isActive(),
    wsConnections: wsServer.getClientCount(),
  });
});

/**
 * Control market generator
 */
app.post('/api/market/control', (req, res) => {
  const { action } = req.body;

  if (action === 'start') {
    marketGenerator.start();
    res.json({ success: true, message: 'Market generator started' });
  } else if (action === 'stop') {
    marketGenerator.stop();
    res.json({ success: true, message: 'Market generator stopped' });
  } else {
    res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        🚀 Synthetic-Bull Exchange Server Started 🚀       ║
║                                                           ║
║  HTTP Server:       http://localhost:${PORT}              ║
║  WebSocket:         ws://localhost:${PORT}/ws             ║
║  Health Check:      http://localhost:${PORT}/health       ║
║                                                           ║
║  Market Generator:  ${MARKET_GENERATOR_ENABLED ? 'ENABLED ' : 'DISABLED'}                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Start market generator if enabled
  if (MARKET_GENERATOR_ENABLED) {
    setTimeout(() => {
      marketGenerator.start();
      console.log('✅ Market generator started - generating synthetic liquidity');
    }, 1000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  marketGenerator.stop();
  wsServer.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  marketGenerator.stop();
  wsServer.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
