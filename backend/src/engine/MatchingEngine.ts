import { v4 as uuidv4 } from 'uuid';
import { OrderBook } from './OrderBook';
import { Order, OrderType, OrderStatus, Trade, OrderRequest, CancelRequest } from '../types';

/**
 * Main Matching Engine
 * Coordinates order processing and maintains the order book
 */
export class MatchingEngine {
  private orderBook: OrderBook;
  private orderCounter: number = 0;
  private onTradeCallback?: (trades: Trade[]) => void;
  private onOrderUpdateCallback?: (order: Order) => void;

  constructor() {
    this.orderBook = new OrderBook();
  }

  /**
   * Register callback for trade events
   */
  onTrade(callback: (trades: Trade[]) => void): void {
    this.onTradeCallback = callback;
  }

  /**
   * Register callback for order updates
   */
  onOrderUpdate(callback: (order: Order) => void): void {
    this.onOrderUpdateCallback = callback;
  }

  /**
   * Submit a new order
   */
  submitOrder(request: OrderRequest): { order: Order, trades: Trade[] } {
    // Validate request
    if (request.quantity <= 0) {
      throw new Error('Order quantity must be positive');
    }

    if (request.type === OrderType.LIMIT && (!request.price || request.price <= 0)) {
      throw new Error('Limit order must have a valid price');
    }

    // Create order
    const order: Order = {
      id: `O${++this.orderCounter}-${uuidv4().slice(0, 8)}`,
      userId: request.userId,
      type: request.type,
      side: request.side,
      price: request.price || 0,
      quantity: request.quantity,
      remainingQuantity: request.quantity,
      status: OrderStatus.PENDING,
      timestamp: Date.now(),
    };

    // Process order through matching engine
    const trades = this.orderBook.addOrder(order);

    // Emit callbacks
    if (this.onOrderUpdateCallback) {
      this.onOrderUpdateCallback(order);
    }

    if (trades.length > 0 && this.onTradeCallback) {
      this.onTradeCallback(trades);
    }

    return { order, trades };
  }

  /**
   * Cancel an existing order
   */
  cancelOrder(request: CancelRequest): boolean {
    const order = this.orderBook.getOrder(request.orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.userId !== request.userId) {
      throw new Error('Unauthorized: Cannot cancel another user\'s order');
    }

    const success = this.orderBook.cancelOrder(request.orderId);

    if (success && this.onOrderUpdateCallback) {
      this.onOrderUpdateCallback(order);
    }

    return success;
  }

  /**
   * Get order book snapshot
   */
  getOrderBookSnapshot(depth: number = 10) {
    return this.orderBook.getSnapshot(depth);
  }

  /**
   * Get best bid and ask
   */
  getBestPrices() {
    return this.orderBook.getBestPrices();
  }

  /**
   * Get mid price
   */
  getMidPrice(): number | null {
    return this.orderBook.getMidPrice();
  }

  /**
   * Get recent trades
   */
  getRecentTrades(count: number = 50): Trade[] {
    return this.orderBook.getRecentTrades(count);
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return this.orderBook.getStats();
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): Order | undefined {
    return this.orderBook.getOrder(orderId);
  }
}
