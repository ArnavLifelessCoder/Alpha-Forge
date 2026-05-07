import { MatchingEngine } from '../engine/MatchingEngine';
import { Trade, OrderType, OrderSide } from '../types';

/**
 * Alpha Bot - Directional Trading Bot
 * Uses Moving Average Crossover strategy
 */
export class AlphaBot {
  private matchingEngine: MatchingEngine;
  private userId: string = 'ALPHA_BOT';
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  // Strategy parameters
  private fastPeriod: number = 5;
  private slowPeriod: number = 20;
  private orderSize: number = 3;
  private checkIntervalMs: number = 5000; // Check every 5 seconds
  
  // Price history
  private priceHistory: number[] = [];
  private maxHistoryLength: number = 100;
  
  // Position tracking
  private currentPosition: number = 0;
  private maxPosition: number = 20;
  private lastSignal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';

  constructor(matchingEngine: MatchingEngine) {
    this.matchingEngine = matchingEngine;
    
    // Subscribe to trades to update price history
    this.matchingEngine.onTrade((trades) => {
      this.updatePriceHistory(trades);
    });
  }

  /**
   * Start the alpha bot
   */
  start(): void {
    if (this.isRunning) {
      console.log('Alpha bot already running');
      return;
    }

    this.isRunning = true;
    console.log('Alpha bot started');

    this.intervalId = setInterval(() => {
      this.evaluateStrategy();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the alpha bot
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    console.log('Alpha bot stopped');
  }

  /**
   * Update price history from trades
   */
  private updatePriceHistory(trades: Trade[]): void {
    for (const trade of trades) {
      this.priceHistory.push(trade.price);
      
      // Keep history limited
      if (this.priceHistory.length > this.maxHistoryLength) {
        this.priceHistory.shift();
      }
    }
  }

  /**
   * Evaluate trading strategy
   */
  private evaluateStrategy(): void {
    // Need enough data for slow MA
    if (this.priceHistory.length < this.slowPeriod) {
      return;
    }

    // Calculate moving averages
    const fastMA = this.calculateMA(this.fastPeriod);
    const slowMA = this.calculateMA(this.slowPeriod);

    if (fastMA === null || slowMA === null) return;

    // Generate signal
    let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';

    if (fastMA > slowMA * 1.001) { // 0.1% threshold to avoid noise
      signal = 'BUY';
    } else if (fastMA < slowMA * 0.999) {
      signal = 'SELL';
    }

    // Execute trades based on signal changes
    if (signal !== this.lastSignal && signal !== 'NEUTRAL') {
      this.executeTrade(signal);
      this.lastSignal = signal;
    }
  }

  /**
   * Calculate moving average
   */
  private calculateMA(period: number): number | null {
    if (this.priceHistory.length < period) return null;

    const recentPrices = this.priceHistory.slice(-period);
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * Execute trade based on signal
   */
  private executeTrade(signal: 'BUY' | 'SELL'): void {
    try {
      // Check position limits
      if (signal === 'BUY' && this.currentPosition >= this.maxPosition) {
        return; // Already at max long position
      }
      if (signal === 'SELL' && this.currentPosition <= -this.maxPosition) {
        return; // Already at max short position
      }

      // Determine order side and size
      const side = signal === 'BUY' ? OrderSide.BUY : OrderSide.SELL;
      let quantity = this.orderSize;

      // If reversing position, double the size
      if ((signal === 'BUY' && this.currentPosition < 0) ||
          (signal === 'SELL' && this.currentPosition > 0)) {
        quantity = this.orderSize * 2;
      }

      // Submit market order
      const result = this.matchingEngine.submitOrder({
        userId: this.userId,
        type: OrderType.MARKET,
        side,
        quantity,
      });

      // Update position
      if (result.trades.length > 0) {
        const filledQty = result.trades.reduce((sum, t) => sum + t.quantity, 0);
        this.currentPosition += side === OrderSide.BUY ? filledQty : -filledQty;
        
        console.log(`Alpha Bot: ${signal} ${filledQty} @ avg ${this.getAvgPrice(result.trades)} | Position: ${this.currentPosition}`);
      }
    } catch (error) {
      console.error('Alpha bot trade error:', error);
    }
  }

  /**
   * Calculate average execution price
   */
  private getAvgPrice(trades: Trade[]): number {
    if (trades.length === 0) return 0;
    
    const totalValue = trades.reduce((sum, t) => sum + t.price * t.quantity, 0);
    const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
    return totalValue / totalQty;
  }

  /**
   * Get bot status
   */
  getStatus() {
    const fastMA = this.calculateMA(this.fastPeriod);
    const slowMA = this.calculateMA(this.slowPeriod);

    return {
      isRunning: this.isRunning,
      position: this.currentPosition,
      lastSignal: this.lastSignal,
      fastMA,
      slowMA,
      priceHistoryLength: this.priceHistory.length,
    };
  }
}
