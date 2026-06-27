import express from 'express';
import cors from 'cors';
import compression from 'compression';
import http from 'http';
import { MatchingEngine } from './engine/MatchingEngine';
import { MarketGenerator } from './market/MarketGenerator';
import { PortfolioManager } from './engine/PortfolioManager';
import { CandleGenerator } from './market/CandleGenerator';
import { WebSocketServer } from './websocket/WebSocketServer';
import { RealMarketDataService } from './market/RealMarketData';
import { AITradingBot } from './bots/AITradingBot';
import { MLClient } from './ml/MLClient';
import { OrderType, OrderSide } from './types';

const PORT = process.env.PORT || 8080;
const MARKET_GENERATOR_ENABLED = process.env.MARKET_GENERATOR_ENABLED !== 'false';
const ML_SERVING_URL = process.env.ML_SERVING_URL || 'http://localhost:8090';

// Initialize core components
const matchingEngine = new MatchingEngine();
const portfolioManager = new PortfolioManager();
const candleGenerator = new CandleGenerator(5); // 5-second candles
const marketGenerator = new MarketGenerator(matchingEngine);
const realMarketData = new RealMarketDataService();
const aiBot = new AITradingBot();

// Model-serving bridge (AlphaForge MLOps stack). Degrades gracefully if the
// Python serving layer isn't running — the bot falls back to heuristics.
const mlClient = new MLClient({
  servingUrl: ML_SERVING_URL,
  symbols: realMarketData.getSupportedSymbols(),
  pollMs: 2000,
});

// Multi-symbol engines
const symbolEngines: Map<string, { engine: MatchingEngine; generator: MarketGenerator; candleGen: CandleGenerator }> = new Map();

// Setup Express app
const app = express();
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.onrender\.com$/,
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);

// Initialize multi-symbol support
function initializeSymbolEngines() {
  const symbols = realMarketData.getSupportedSymbols();
  
  for (const symbol of symbols) {
    const engine = new MatchingEngine();
    const candleGen = new CandleGenerator(5);
    const generator = new MarketGenerator(engine);
    
    const config = realMarketData.getSymbolConfig(symbol);
    if (config) {
      generator.setParameters({
        sigma: config.volatility,
        ordersPerSecond: 20,
      });
    }

    // Setup trade processing for this symbol
    engine.onTrade((trades) => {
      trades.forEach(trade => {
        portfolioManager.processTradeForSymbol(symbol, trade);
        candleGen.processTrade(trade);
        // Feed AI bot with trade data
        aiBot.feedTrade(symbol, trade);
      });

      wsServer.broadcast({
        type: 'trade',
        data: { symbol, trades },
        timestamp: Date.now(),
      });

      const orderBook = engine.getOrderBookSnapshot(20);
      wsServer.broadcast({
        type: 'orderbook',
        data: { symbol, ...orderBook },
        timestamp: Date.now(),
      });
    });

    engine.onOrderUpdate((order) => {
      wsServer.broadcast({
        type: 'order_update',
        data: { symbol, ...order },
        timestamp: Date.now(),
      });
    });

    candleGen.onCandle((candle) => {
      wsServer.broadcast({
        type: 'candle',
        data: { symbol, ...candle },
        timestamp: Date.now(),
      });
    });

    symbolEngines.set(symbol, { engine, generator, candleGen });
  }
}

// Also keep the default engine for backward compatibility
matchingEngine.onTrade((trades) => {
  trades.forEach(trade => {
    portfolioManager.processTrade(trade);
    candleGenerator.processTrade(trade);
  });

  wsServer.broadcast({
    type: 'trade',
    data: trades,
    timestamp: Date.now(),
  });

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

// Broadcast market data updates
realMarketData.on('prices_updated', (quotes) => {
  wsServer.broadcast({
    type: 'market_data',
    data: quotes,
    timestamp: Date.now(),
  });

  // Update portfolio manager with latest prices
  for (const quote of quotes) {
    portfolioManager.updateSymbolPrice(quote.symbol, quote.price);
  }
});

// Periodic order book broadcast (every 500ms)
setInterval(() => {
  // Broadcast default engine order book
  const orderBook = matchingEngine.getOrderBookSnapshot(20);
  wsServer.broadcast({
    type: 'orderbook',
    data: orderBook,
    timestamp: Date.now(),
  });

  const midPrice = matchingEngine.getMidPrice();
  if (midPrice) {
    portfolioManager.updateCurrentPrice(midPrice);
  }

  // Broadcast all symbol order books
  for (const [symbol, { engine }] of symbolEngines) {
    const symbolOB = engine.getOrderBookSnapshot(20);
    wsServer.broadcast({
      type: 'orderbook',
      data: { symbol, ...symbolOB },
      timestamp: Date.now(),
    });
  }
}, 500);

// =============== REST API Endpoints ===============

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connections: wsServer.getClientCount(),
    symbols: realMarketData.getSupportedSymbols().length,
  });
});

/**
 * Get all supported symbols
 */
app.get('/api/symbols', (_req, res) => {
  const symbols = realMarketData.getSupportedSymbols();
  const quotes = realMarketData.getAllQuotes();
  res.json({ symbols, quotes });
});

/**
 * Get real-time market data for all symbols
 */
app.get('/api/market-data', (_req, res) => {
  const quotes = realMarketData.getAllQuotes();
  res.json(quotes);
});

/**
 * Get market data for specific symbol
 */
app.get('/api/market-data/:symbol', (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const quote = realMarketData.getQuote(symbol);
  if (!quote) {
    res.status(404).json({ error: `Symbol ${symbol} not found` });
    return;
  }
  res.json(quote);
});

/**
 * Get order book snapshot (supports symbol query param)
 */
app.get('/api/orderbook', (req, res) => {
  const depth = parseInt(req.query.depth as string) || 20;
  const symbol = req.query.symbol as string;

  if (symbol) {
    const symbolData = symbolEngines.get(symbol);
    if (symbolData) {
      res.json({ symbol, ...symbolData.engine.getOrderBookSnapshot(depth) });
      return;
    }
  }

  const orderBook = matchingEngine.getOrderBookSnapshot(depth);
  res.json(orderBook);
});

/**
 * Get recent trades (supports symbol query param)
 */
app.get('/api/trades', (req, res) => {
  const count = parseInt(req.query.count as string) || 50;
  const symbol = req.query.symbol as string;

  if (symbol) {
    const symbolData = symbolEngines.get(symbol);
    if (symbolData) {
      res.json({ symbol, trades: symbolData.engine.getRecentTrades(count) });
      return;
    }
  }

  const trades = matchingEngine.getRecentTrades(count);
  res.json(trades);
});

/**
 * Get candles (supports symbol query param)
 */
app.get('/api/candles', (req, res) => {
  const count = parseInt(req.query.count as string) || 100;
  const symbol = req.query.symbol as string;

  if (symbol) {
    const symbolData = symbolEngines.get(symbol);
    if (symbolData) {
      res.json({ symbol, candles: symbolData.candleGen.getCandles(count) });
      return;
    }
  }

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
 * Submit order (supports symbol in body)
 */
app.post('/api/orders', (req, res) => {
  try {
    const { userId, type, side, price, quantity, symbol } = req.body;

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

    // Check buying power
    if (side === OrderSide.BUY && type === OrderType.LIMIT) {
      const requiredCash = price * quantity;
      if (!portfolioManager.hasSufficientBuyingPower(userId, requiredCash)) {
        res.status(400).json({ error: 'Insufficient buying power' });
        return;
      }
    }

    // Route to symbol-specific engine or default
    let result;
    if (symbol && symbolEngines.has(symbol)) {
      const symbolData = symbolEngines.get(symbol)!;
      result = symbolData.engine.submitOrder({
        userId,
        type,
        side,
        price: type === OrderType.LIMIT ? price : undefined,
        quantity,
      });
    } else {
      result = matchingEngine.submitOrder({
        userId,
        type,
        side,
        price: type === OrderType.LIMIT ? price : undefined,
        quantity,
      });
    }

    res.json({
      symbol: symbol || 'DEFAULT',
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
    const { userId, symbol } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    let success = false;
    if (symbol && symbolEngines.has(symbol)) {
      success = symbolEngines.get(symbol)!.engine.cancelOrder({ orderId, userId });
    } else {
      success = matchingEngine.cancelOrder({ orderId, userId });
    }

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
app.get('/api/stats', (req, res) => {
  const symbol = req.query.symbol as string;

  if (symbol && symbolEngines.has(symbol)) {
    const symbolData = symbolEngines.get(symbol)!;
    const stats = symbolData.engine.getStats();
    const midPrice = symbolData.engine.getMidPrice();
    const bestPrices = symbolData.engine.getBestPrices();

    res.json({
      symbol,
      ...stats,
      midPrice,
      bestBid: bestPrices.bid,
      bestAsk: bestPrices.ask,
      spread: bestPrices.bid && bestPrices.ask ? bestPrices.ask - bestPrices.bid : null,
      marketGeneratorActive: symbolData.generator.isActive(),
      wsConnections: wsServer.getClientCount(),
    });
    return;
  }

  const stats = matchingEngine.getStats();
  const midPrice = matchingEngine.getMidPrice();
  const bestPrices = matchingEngine.getBestPrices();

  // Aggregate stats
  let totalOrders = stats.totalOrders;
  let totalTrades = stats.totalTrades;
  for (const [, { engine }] of symbolEngines) {
    const s = engine.getStats();
    totalOrders += s.totalOrders;
    totalTrades += s.totalTrades;
  }

  res.json({
    ...stats,
    totalOrders,
    totalTrades,
    midPrice,
    bestBid: bestPrices.bid,
    bestAsk: bestPrices.ask,
    spread: bestPrices.bid && bestPrices.ask ? bestPrices.ask - bestPrices.bid : null,
    marketGeneratorActive: marketGenerator.isActive(),
    wsConnections: wsServer.getClientCount(),
    symbolCount: symbolEngines.size,
  });
});

/**
 * Control market generator
 */
app.post('/api/market/control', (req, res) => {
  const { action } = req.body;

  if (action === 'start') {
    marketGenerator.start();
    for (const [symbol, { generator }] of symbolEngines) {
      const price = realMarketData.getPrice(symbol);
      generator.startAtPrice(price);
    }
    res.json({ success: true, message: 'All market generators started' });
  } else if (action === 'stop') {
    marketGenerator.stop();
    for (const { generator } of symbolEngines.values()) {
      generator.stop();
    }
    res.json({ success: true, message: 'All market generators stopped' });
  } else {
    res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
  }
});

/**
 * Get all user orders (order history)
 */
app.get('/api/orders/:userId', (req, res) => {
  const { userId } = req.params;
  const allTrades: any[] = [];
  
  for (const [symbol, { engine }] of symbolEngines) {
    const trades = engine.getRecentTrades(100);
    const userTrades = trades.filter(t => t.buyUserId === userId || t.sellUserId === userId);
    allTrades.push(...userTrades.map(t => ({ ...t, symbol })));
  }

  const defaultTrades = matchingEngine.getRecentTrades(100);
  const userDefaultTrades = defaultTrades.filter(t => t.buyUserId === userId || t.sellUserId === userId);
  allTrades.push(...userDefaultTrades.map(t => ({ ...t, symbol: 'BTC/USD' })));

  allTrades.sort((a, b) => b.timestamp - a.timestamp);
  res.json(allTrades.slice(0, 50));
});

// =============== AI BOT ENDPOINTS ===============

/**
 * Get AI bot status
 */
app.get('/api/bot/status', (_req, res) => {
  res.json(aiBot.getStatus());
});

/**
 * Start AI bot
 */
app.post('/api/bot/start', (_req, res) => {
  aiBot.start();
  res.json({ success: true, message: 'AI Trading Bot started', status: aiBot.getStatus() });
});

/**
 * Stop AI bot
 */
app.post('/api/bot/stop', (_req, res) => {
  aiBot.stop();
  res.json({ success: true, message: 'AI Trading Bot stopped', status: aiBot.getStatus() });
});

/**
 * Pause/Resume AI bot
 */
app.post('/api/bot/pause', (_req, res) => {
  aiBot.pause();
  res.json({ success: true, message: 'AI Trading Bot paused' });
});

app.post('/api/bot/resume', (_req, res) => {
  aiBot.resume();
  res.json({ success: true, message: 'AI Trading Bot resumed' });
});

/**
 * Get AI bot trades
 */
app.get('/api/bot/trades', (req, res) => {
  const count = parseInt(req.query.count as string) || 50;
  res.json(aiBot.getRecentTrades(count));
});

/**
 * Update AI bot strategies
 */
app.post('/api/bot/strategies', (req, res) => {
  const { strategies } = req.body;
  if (Array.isArray(strategies)) {
    aiBot.setStrategies(strategies);
    res.json({ success: true, strategies });
  } else {
    res.status(400).json({ error: 'strategies must be an array' });
  }
});

// =============== ML / MLOps ENDPOINTS ===============
// These proxy the AlphaForge model-serving layer so the frontend uses one origin.

/** Quick status: is the model server reachable? */
app.get('/api/ml/status', (_req, res) => {
  res.json({
    available: mlClient.available,
    servingUrl: mlClient.baseUrl,
    modelInfo: mlClient.getModelInfo(),
  });
});

/** All cached live predictions (one per symbol). */
app.get('/api/ml/predictions', (_req, res) => {
  res.json({
    available: mlClient.available,
    predictions: mlClient.getAllPredictions(),
  });
});

/** Single prediction (symbol via query param to allow "BTC/USD"). */
app.get('/api/ml/prediction', (req, res) => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    res.status(400).json({ error: 'symbol query param required' });
    return;
  }
  res.json(mlClient.getPrediction(symbol) || { symbol, available: false });
});

/** Model registry / champion info. */
app.get('/api/ml/model-info', async (_req, res) => {
  const info = mlClient.getModelInfo() || (await mlClient.proxy('/model/info'));
  res.json(info || { available: false, error: 'model server offline' });
});

/** Data-drift monitoring. */
app.get('/api/ml/monitoring/drift', async (_req, res) => {
  const d = await mlClient.proxy('/monitoring/drift');
  res.json(d || { available: false, error: 'model server offline' });
});

/** Live prediction accuracy / calibration. */
app.get('/api/ml/monitoring/performance', async (req, res) => {
  const window = req.query.window ? `?window=${parseInt(req.query.window as string)}` : '';
  const d = await mlClient.proxy(`/monitoring/performance${window}`);
  res.json(d || { available: false, error: 'model server offline' });
});

/** Experiment-tracking run history. */
app.get('/api/ml/experiments', async (_req, res) => {
  const d = await mlClient.proxy('/experiments');
  res.json(d || { available: false, error: 'model server offline' });
});

/** Champion/challenger registry. */
app.get('/api/ml/registry', async (_req, res) => {
  const d = await mlClient.proxy('/registry/models');
  res.json(d || { available: false, error: 'model server offline' });
});

/** Trigger a retrain (champion/challenger). */
app.post('/api/ml/retrain', async (req, res) => {
  const promote = req.body?.promote !== false;
  const d = await mlClient.proxyPost('/orchestration/retrain', { promote });
  res.json(d || { available: false, error: 'model server offline' });
});

// =============== Start Server ===============

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║      🚀 Synthetic Exchange Server v2.0 Started 🚀        ║
║                                                           ║
║  HTTP Server:       http://localhost:${PORT}              ║
║  WebSocket:         ws://localhost:${PORT}/ws             ║
║  Health Check:      http://localhost:${PORT}/health       ║
║                                                           ║
║  Market Generator:  ${MARKET_GENERATOR_ENABLED ? 'ENABLED ' : 'DISABLED'}                        ║
║  Real Market Data:  ENABLED (CoinGecko)                   ║
║  Multi-Symbol:      ENABLED                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Initialize multi-symbol engines
  initializeSymbolEngines();

  // Start real market data
  realMarketData.start().then(() => {
    console.log('✅ Real market data service started');
  });

  // Start polling the model-serving layer (no-op if it's offline).
  mlClient.start();

  // Start market generators if enabled
  if (MARKET_GENERATOR_ENABLED) {
    setTimeout(() => {
      marketGenerator.start();
      
      // Start symbol-specific generators
      for (const [symbol, { generator }] of symbolEngines) {
        const price = realMarketData.getPrice(symbol);
        generator.startAtPrice(price);
      }

      // Register AI bot with all symbol engines
      for (const [symbol, { engine }] of symbolEngines) {
        aiBot.registerSymbol(symbol, engine);
      }
      // Give the bot the model-serving client, then start it
      aiBot.setMLClient(mlClient);
      aiBot.start();

      console.log('✅ All market generators started');
      console.log('🤖 AI Trading Bot registered with all symbols');
      console.log(`🧠 ML signal source: ${ML_SERVING_URL} (heuristic fallback if offline)`);
    }, 2000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  aiBot.stop();
  mlClient.stop();
  marketGenerator.stop();
  realMarketData.stop();
  for (const { generator } of symbolEngines.values()) {
    generator.stop();
  }
  wsServer.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  aiBot.stop();
  mlClient.stop();
  marketGenerator.stop();
  realMarketData.stop();
  for (const { generator } of symbolEngines.values()) {
    generator.stop();
  }
  wsServer.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
