import { MatchingEngine } from './MatchingEngine';
import { PortfolioManager } from './PortfolioManager';
import { CandleGenerator } from '../market/CandleGenerator';
import { MarketGenerator } from '../market/MarketGenerator';
import { RealMarketDataService, MarketQuote } from '../market/RealMarketData';
import { Trade, OrderRequest } from '../types';

/**
 * Multi-Symbol Trading Engine
 * Manages separate order books for each trading symbol
 * Integrates real market data with synthetic liquidity generation
 */
export class MultiSymbolEngine {
  private engines: Map<string, MatchingEngine> = new Map();
  private generators: Map<string, MarketGenerator> = new Map();
  private candleGenerators: Map<string, CandleGenerator> = new Map();
  private portfolioManager: PortfolioManager;
  private marketData: RealMarketDataService;
  
  private onTradeCallback?: (symbol: string, trades: Trade[]) => void;
  private onCandleCallback?: (symbol: string, candle: any) => void;

  constructor(portfolioManager: PortfolioManager) {
    this.portfolioManager = portfolioManager;
    this.marketData = new RealMarketDataService();
  }

  /**
   * Initialize engines for all supported symbols
   */
  async initialize(): Promise<void> {
    const symbols = this.marketData.getSupportedSymbols();

    for (const symbol of symbols) {
      const engine = new MatchingEngine();
      const candleGen = new CandleGenerator(5);
      
      // Setup trade processing
      engine.onTrade((trades) => {
        trades.forEach(trade => {
          this.portfolioManager.processTradeForSymbol(symbol, trade);
          candleGen.processTrade(trade);
        });

        if (this.onTradeCallback) {
          this.onTradeCallback(symbol, trades);
        }
      });

      candleGen.onCandle((candle) => {
        if (this.onCandleCallback) {
          this.onCandleCallback(symbol, candle);
        }
      });

      this.engines.set(symbol, engine);
      this.candleGenerators.set(symbol, candleGen);

      // Create market generator with realistic price for this symbol
      const config = this.marketData.getSymbolConfig(symbol);
      if (config) {
        const generator = new MarketGenerator(engine);
        generator.setParameters({
          sigma: config.volatility,
          ordersPerSecond: 25, // Lower per-symbol rate since we have many symbols
        });
        this.generators.set(symbol, generator);
      }
    }

    // Start real market data service
    await this.marketData.start();

    // Sync generator base prices with real market data
    this.marketData.on('prices_updated', (quotes: MarketQuote[]) => {
      for (const quote of quotes) {
        const generator = this.generators.get(quote.symbol);
        if (generator) {
          generator.syncBasePrice(quote.price);
        }
      }
    });

    console.log(`Multi-symbol engine initialized with ${symbols.length} symbols`);
  }

  /**
   * Start all market generators
   */
  startGenerators(): void {
    for (const [symbol, generator] of this.generators) {
      const price = this.marketData.getPrice(symbol);
      generator.startAtPrice(price);
    }
    console.log('All market generators started');
  }

  /**
   * Stop all market generators
   */
  stopGenerators(): void {
    for (const generator of this.generators.values()) {
      generator.stop();
    }
  }

  /**
   * Submit order for a specific symbol
   */
  submitOrder(symbol: string, request: OrderRequest) {
    const engine = this.engines.get(symbol);
    if (!engine) {
      throw new Error(`Symbol ${symbol} not supported`);
    }
    return engine.submitOrder(request);
  }

  /**
   * Cancel order for a specific symbol
   */
  cancelOrder(symbol: string, request: { orderId: string; userId: string }) {
    const engine = this.engines.get(symbol);
    if (!engine) {
      throw new Error(`Symbol ${symbol} not supported`);
    }
    return engine.cancelOrder(request);
  }

  /**
   * Get order book snapshot for symbol
   */
  getOrderBook(symbol: string, depth: number = 20) {
    const engine = this.engines.get(symbol);
    if (!engine) return { bids: [], asks: [] };
    return engine.getOrderBookSnapshot(depth);
  }

  /**
   * Get recent trades for symbol
   */
  getRecentTrades(symbol: string, count: number = 50) {
    const engine = this.engines.get(symbol);
    if (!engine) return [];
    return engine.getRecentTrades(count);
  }

  /**
   * Get candles for symbol
   */
  getCandles(symbol: string, count: number = 100) {
    const candleGen = this.candleGenerators.get(symbol);
    if (!candleGen) return [];
    return candleGen.getCandles(count);
  }

  /**
   * Get mid price for symbol
   */
  getMidPrice(symbol: string): number | null {
    const engine = this.engines.get(symbol);
    if (!engine) return null;
    return engine.getMidPrice();
  }

  /**
   * Get best prices for symbol
   */
  getBestPrices(symbol: string) {
    const engine = this.engines.get(symbol);
    if (!engine) return { bid: null, ask: null };
    return engine.getBestPrices();
  }

  /**
   * Get stats for symbol
   */
  getStats(symbol: string) {
    const engine = this.engines.get(symbol);
    if (!engine) return { bidLevels: 0, askLevels: 0, totalOrders: 0, totalTrades: 0 };
    return engine.getStats();
  }

  /**
   * Get aggregate stats across all symbols
   */
  getAggregateStats() {
    let totalOrders = 0;
    let totalTrades = 0;
    const symbolStats: Record<string, any> = {};

    for (const [symbol, engine] of this.engines) {
      const stats = engine.getStats();
      totalOrders += stats.totalOrders;
      totalTrades += stats.totalTrades;
      symbolStats[symbol] = {
        ...stats,
        midPrice: engine.getMidPrice(),
        bestPrices: engine.getBestPrices(),
      };
    }

    return { totalOrders, totalTrades, symbolStats, symbolCount: this.engines.size };
  }

  /**
   * Get all market quotes (real + synthetic)
   */
  getMarketQuotes(): MarketQuote[] {
    return this.marketData.getAllQuotes();
  }

  /**
   * Get supported symbols
   */
  getSupportedSymbols(): string[] {
    return this.marketData.getSupportedSymbols();
  }

  // Event registration
  onTrade(callback: (symbol: string, trades: Trade[]) => void) {
    this.onTradeCallback = callback;
  }

  onCandle(callback: (symbol: string, candle: any) => void) {
    this.onCandleCallback = callback;
  }

  onMarketData(callback: (quotes: MarketQuote[]) => void) {
    this.marketData.on('prices_updated', callback);
  }
}
