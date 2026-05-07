import { MatchingEngine } from '../engine/MatchingEngine';
import { OrderType, OrderSide } from '../types';

/**
 * Market Maker Bot
 * Provides liquidity by placing limit orders around mid-price
 */
export class MarketMakerBot {
  private matchingEngine: MatchingEngine;
  private userId: string = 'MM_BOT';
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  
  // Strategy parameters
  private spreadBps: number = 15; // 15 basis points (0.15%)
  private orderSize: number = 5;
  private maxInventory: number = 50;
  private currentInventory: number = 0;
  private updateIntervalMs: number = 2000; // Update every 2 seconds
  
  // Active orders
  private activeOrders: Set<string> = new Set();

  constructor(matchingEngine: MatchingEngine) {
    this.matchingEngine = matchingEngine;
  }

  /**
   * Start the market maker bot
   */
  start(): void {
    if (this.isRunning) {
      console.log('Market maker bot already running');
      return;
    }

    this.isRunning = true;
    console.log('Market maker bot started');

    this.intervalId = setInterval(() => {
      this.updateQuotes();
    }, this.updateIntervalMs);
  }

  /**
   * Stop the market maker bot
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Cancel all active orders
    this.cancelAllOrders();
    console.log('Market maker bot stopped');
  }

  /**
   * Update quotes (cancel old orders and place new ones)
   */
  private updateQuotes(): void {
    // Get current mid price
    const midPrice = this.matchingEngine.getMidPrice();
    if (!midPrice) return;

    // Cancel existing orders
    this.cancelAllOrders();

    // Calculate spread
    const spread = midPrice * (this.spreadBps / 10000);
    const bidPrice = this.roundToTick(midPrice - spread / 2);
    const askPrice = this.roundToTick(midPrice + spread / 2);

    // Adjust order sizes based on inventory
    const bidSize = this.calculateBidSize();
    const askSize = this.calculateAskSize();

    // Place bid order
    if (bidSize > 0) {
      try {
        const result = this.matchingEngine.submitOrder({
          userId: this.userId,
          type: OrderType.LIMIT,
          side: OrderSide.BUY,
          price: bidPrice,
          quantity: bidSize,
        });
        this.activeOrders.add(result.order.id);
        
        // Update inventory based on fills
        if (result.trades.length > 0) {
          const filledQty = result.trades.reduce((sum, t) => sum + t.quantity, 0);
          this.currentInventory += filledQty;
        }
      } catch (error) {
        // Ignore errors
      }
    }

    // Place ask order
    if (askSize > 0) {
      try {
        const result = this.matchingEngine.submitOrder({
          userId: this.userId,
          type: OrderType.LIMIT,
          side: OrderSide.SELL,
          price: askPrice,
          quantity: askSize,
        });
        this.activeOrders.add(result.order.id);
        
        // Update inventory based on fills
        if (result.trades.length > 0) {
          const filledQty = result.trades.reduce((sum, t) => sum + t.quantity, 0);
          this.currentInventory -= filledQty;
        }
      } catch (error) {
        // Ignore errors
      }
    }
  }

  /**
   * Calculate bid size based on inventory risk
   */
  private calculateBidSize(): number {
    // Reduce bid size if inventory is too long
    if (this.currentInventory >= this.maxInventory) {
      return 0;
    }
    
    const inventoryRatio = this.currentInventory / this.maxInventory;
    return Math.max(1, Math.floor(this.orderSize * (1 - inventoryRatio)));
  }

  /**
   * Calculate ask size based on inventory risk
   */
  private calculateAskSize(): number {
    // Reduce ask size if inventory is too short
    if (this.currentInventory <= -this.maxInventory) {
      return 0;
    }
    
    const inventoryRatio = Math.abs(this.currentInventory) / this.maxInventory;
    return Math.max(1, Math.floor(this.orderSize * (1 - inventoryRatio)));
  }

  /**
   * Cancel all active orders
   */
  private cancelAllOrders(): void {
    for (const orderId of this.activeOrders) {
      try {
        this.matchingEngine.cancelOrder({ orderId, userId: this.userId });
      } catch (error) {
        // Order might already be filled
      }
    }
    this.activeOrders.clear();
  }

  /**
   * Round price to tick size
   */
  private roundToTick(price: number): number {
    const tickSize = 0.01;
    return Math.round(price / tickSize) * tickSize;
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      inventory: this.currentInventory,
      activeOrders: this.activeOrders.size,
      spreadBps: this.spreadBps,
    };
  }
}
