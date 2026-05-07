import { MatchingEngine } from '../engine/MatchingEngine';
import { OrderType, OrderSide } from '../types';

/**
 * Geometric Brownian Motion (GBM) Market Generator
 * Generates synthetic market prices and liquidity
 * Formula: S_t = S_0 * exp((μ - σ²/2)t + σW_t)
 */
export class MarketGenerator {
  private matchingEngine: MatchingEngine;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  // GBM Parameters
  private S0: number = 100; // Initial price
  private mu: number = 0.0001; // Drift (expected return)
  private sigma: number = 0.02; // Volatility
  private dt: number = 0.001; // Time step (1ms in years)
  
  // Current state
  private currentPrice: number;
  private currentTime: number = 0;
  
  // Market making parameters
  private spreadBps: number = 10; // 10 basis points (0.1%)
  private orderSizeMin: number = 1;
  private orderSizeMax: number = 10;
  private ordersPerSecond: number = 75; // Target: 50-100 orders/sec
  private priceTickSize: number = 0.01;

  constructor(matchingEngine: MatchingEngine) {
    this.matchingEngine = matchingEngine;
    this.currentPrice = this.S0;
  }

  /**
   * Start generating market activity
   */
  start(): void {
    if (this.isRunning) {
      console.log('Market generator already running');
      return;
    }

    this.isRunning = true;
    this.currentPrice = this.S0;
    this.currentTime = 0;

    console.log(`Market generator started at price ${this.currentPrice}`);

    // Generate orders at specified rate
    const intervalMs = 1000 / this.ordersPerSecond;
    this.intervalId = setInterval(() => {
      this.generateMarketActivity();
    }, intervalMs);
  }

  /**
   * Stop generating market activity
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    console.log('Market generator stopped');
  }

  /**
   * Generate market activity for one tick
   */
  private generateMarketActivity(): void {
    // Update price using GBM
    this.updatePrice();

    // Generate random orders around current price
    this.generateOrders();
  }

  /**
   * Update price using Geometric Brownian Motion
   */
  private updatePrice(): void {
    // Increment time
    this.currentTime += this.dt;

    // Generate random normal variable (Box-Muller transform)
    const dW = this.randomNormal() * Math.sqrt(this.dt);

    // GBM formula: S_t = S_0 * exp((μ - σ²/2)t + σW_t)
    const drift = (this.mu - (this.sigma ** 2) / 2) * this.currentTime;
    const diffusion = this.sigma * dW;
    
    this.currentPrice = this.S0 * Math.exp(drift + diffusion);

    // Add some mean reversion to keep price reasonable
    if (this.currentPrice > this.S0 * 2) {
      this.currentPrice = this.S0 * 2;
      this.S0 = this.currentPrice;
      this.currentTime = 0;
    } else if (this.currentPrice < this.S0 * 0.5) {
      this.currentPrice = this.S0 * 0.5;
      this.S0 = this.currentPrice;
      this.currentTime = 0;
    }
  }

  /**
   * Generate random orders around current price
   */
  private generateOrders(): void {
    const spread = this.currentPrice * (this.spreadBps / 10000);
    const midPrice = this.currentPrice;

    // Randomly decide to place bid or ask (or both)
    const placeBid = Math.random() > 0.5;
    const placeAsk = Math.random() > 0.5;

    if (placeBid) {
      // Place bid below mid price
      const priceOffset = spread * (0.5 + Math.random() * 2); // 0.5x to 2.5x spread
      const bidPrice = this.roundToTick(midPrice - priceOffset);
      const quantity = this.randomQuantity();

      try {
        this.matchingEngine.submitOrder({
          userId: 'MARKET_MAKER',
          type: OrderType.LIMIT,
          side: OrderSide.BUY,
          price: bidPrice,
          quantity,
        });
      } catch (error) {
        // Ignore errors from market maker orders
      }
    }

    if (placeAsk) {
      // Place ask above mid price
      const priceOffset = spread * (0.5 + Math.random() * 2);
      const askPrice = this.roundToTick(midPrice + priceOffset);
      const quantity = this.randomQuantity();

      try {
        this.matchingEngine.submitOrder({
          userId: 'MARKET_MAKER',
          type: OrderType.LIMIT,
          side: OrderSide.SELL,
          price: askPrice,
          quantity,
        });
      } catch (error) {
        // Ignore errors from market maker orders
      }
    }

    // Occasionally place market orders to create trades
    if (Math.random() < 0.1) { // 10% chance
      const side = Math.random() > 0.5 ? OrderSide.BUY : OrderSide.SELL;
      const quantity = this.randomQuantity() * 0.5; // Smaller size for market orders

      try {
        this.matchingEngine.submitOrder({
          userId: 'MARKET_TAKER',
          type: OrderType.MARKET,
          side,
          quantity,
        });
      } catch (error) {
        // Ignore errors
      }
    }
  }

  /**
   * Generate random normal variable using Box-Muller transform
   */
  private randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Generate random order quantity
   */
  private randomQuantity(): number {
    return Math.floor(
      this.orderSizeMin + Math.random() * (this.orderSizeMax - this.orderSizeMin)
    );
  }

  /**
   * Round price to tick size
   */
  private roundToTick(price: number): number {
    return Math.round(price / this.priceTickSize) * this.priceTickSize;
  }

  /**
   * Get current theoretical price
   */
  getCurrentPrice(): number {
    return this.currentPrice;
  }

  /**
   * Get generator status
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Update parameters
   */
  setParameters(params: {
    mu?: number;
    sigma?: number;
    spreadBps?: number;
    ordersPerSecond?: number;
  }): void {
    if (params.mu !== undefined) this.mu = params.mu;
    if (params.sigma !== undefined) this.sigma = params.sigma;
    if (params.spreadBps !== undefined) this.spreadBps = params.spreadBps;
    if (params.ordersPerSecond !== undefined) {
      this.ordersPerSecond = params.ordersPerSecond;
      
      // Restart with new rate if running
      if (this.isRunning) {
        this.stop();
        this.start();
      }
    }
  }
}
