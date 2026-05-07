import { Order, OrderSide, OrderStatus, OrderBookLevel, Trade } from '../types';

/**
 * Price level in the order book
 * Uses a queue for FIFO (Price-Time priority)
 */
class PriceLevel {
  public price: number;
  public orders: Order[] = [];
  public totalQuantity: number = 0;

  constructor(price: number) {
    this.price = price;
  }

  addOrder(order: Order): void {
    this.orders.push(order);
    this.totalQuantity += order.remainingQuantity;
  }

  removeOrder(orderId: string): boolean {
    const index = this.orders.findIndex(o => o.id === orderId);
    if (index !== -1) {
      const order = this.orders[index];
      this.totalQuantity -= order.remainingQuantity;
      this.orders.splice(index, 1);
      return true;
    }
    return false;
  }

  isEmpty(): boolean {
    return this.orders.length === 0;
  }

  getTopOrder(): Order | undefined {
    return this.orders[0];
  }
}

/**
 * High-performance Limit Order Book (LOB)
 * Implements Price-Time priority matching
 */
export class OrderBook {
  private bids: Map<number, PriceLevel> = new Map(); // Buy orders (descending)
  private asks: Map<number, PriceLevel> = new Map(); // Sell orders (ascending)
  private orderMap: Map<string, Order> = new Map(); // Fast order lookup
  private trades: Trade[] = [];
  private tradeIdCounter: number = 0;

  /**
   * Add a new order to the book
   */
  addOrder(order: Order): Trade[] {
    const trades: Trade[] = [];

    if (order.type === 'MARKET') {
      // Market orders are matched immediately
      const matchedTrades = this.matchMarketOrder(order);
      trades.push(...matchedTrades);
    } else {
      // Try to match limit order
      const matchedTrades = this.matchLimitOrder(order);
      trades.push(...matchedTrades);

      // If not fully filled, add to book
      if (order.remainingQuantity > 0) {
        this.addToBook(order);
      }
    }

    return trades;
  }

  /**
   * Cancel an existing order
   */
  cancelOrder(orderId: string): boolean {
    const order = this.orderMap.get(orderId);
    if (!order) return false;

    const book = order.side === OrderSide.BUY ? this.bids : this.asks;
    const level = book.get(order.price);

    if (level && level.removeOrder(orderId)) {
      if (level.isEmpty()) {
        book.delete(order.price);
      }
      order.status = OrderStatus.CANCELLED;
      this.orderMap.delete(orderId);
      return true;
    }

    return false;
  }

  /**
   * Match a market order against the book
   */
  private matchMarketOrder(order: Order): Trade[] {
    const trades: Trade[] = [];
    const book = order.side === OrderSide.BUY ? this.asks : this.bids;
    const sortedPrices = this.getSortedPrices(book, order.side === OrderSide.BUY);

    for (const price of sortedPrices) {
      if (order.remainingQuantity <= 0) break;

      const level = book.get(price);
      if (!level) continue;

      const levelTrades = this.matchAgainstLevel(order, level, price);
      trades.push(...levelTrades);

      if (level.isEmpty()) {
        book.delete(price);
      }
    }

    order.status = order.remainingQuantity === 0 ? OrderStatus.FILLED : OrderStatus.PARTIAL;
    return trades;
  }

  /**
   * Match a limit order against the book
   */
  private matchLimitOrder(order: Order): Trade[] {
    const trades: Trade[] = [];
    const book = order.side === OrderSide.BUY ? this.asks : this.bids;
    const sortedPrices = this.getSortedPrices(book, order.side === OrderSide.BUY);

    for (const price of sortedPrices) {
      if (order.remainingQuantity <= 0) break;

      // Check if price is acceptable
      if (order.side === OrderSide.BUY && price > order.price) break;
      if (order.side === OrderSide.SELL && price < order.price) break;

      const level = book.get(price);
      if (!level) continue;

      const levelTrades = this.matchAgainstLevel(order, level, price);
      trades.push(...levelTrades);

      if (level.isEmpty()) {
        book.delete(price);
      }
    }

    order.status = order.remainingQuantity === 0 ? OrderStatus.FILLED : 
                   trades.length > 0 ? OrderStatus.PARTIAL : OrderStatus.PENDING;
    return trades;
  }

  /**
   * Match an order against a specific price level
   */
  private matchAgainstLevel(order: Order, level: PriceLevel, matchPrice: number): Trade[] {
    const trades: Trade[] = [];

    while (order.remainingQuantity > 0 && !level.isEmpty()) {
      const topOrder = level.getTopOrder();
      if (!topOrder) break;

      const matchQuantity = Math.min(order.remainingQuantity, topOrder.remainingQuantity);

      // Create trade
      const trade: Trade = {
        id: `T${++this.tradeIdCounter}`,
        buyOrderId: order.side === OrderSide.BUY ? order.id : topOrder.id,
        sellOrderId: order.side === OrderSide.SELL ? order.id : topOrder.id,
        price: matchPrice,
        quantity: matchQuantity,
        timestamp: Date.now(),
        buyUserId: order.side === OrderSide.BUY ? order.userId : topOrder.userId,
        sellUserId: order.side === OrderSide.SELL ? order.userId : topOrder.userId,
      };

      trades.push(trade);
      this.trades.push(trade);

      // Update quantities
      order.remainingQuantity -= matchQuantity;
      topOrder.remainingQuantity -= matchQuantity;
      level.totalQuantity -= matchQuantity;

      // Update statuses
      if (topOrder.remainingQuantity === 0) {
        topOrder.status = OrderStatus.FILLED;
        level.orders.shift();
        this.orderMap.delete(topOrder.id);
      } else {
        topOrder.status = OrderStatus.PARTIAL;
      }
    }

    return trades;
  }

  /**
   * Add order to the book (for unfilled limit orders)
   */
  private addToBook(order: Order): void {
    const book = order.side === OrderSide.BUY ? this.bids : this.asks;
    
    let level = book.get(order.price);
    if (!level) {
      level = new PriceLevel(order.price);
      book.set(order.price, level);
    }

    level.addOrder(order);
    this.orderMap.set(order.id, order);
  }

  /**
   * Get sorted prices for matching
   */
  private getSortedPrices(book: Map<number, PriceLevel>, ascending: boolean): number[] {
    const prices = Array.from(book.keys());
    return ascending ? prices.sort((a, b) => a - b) : prices.sort((a, b) => b - a);
  }

  /**
   * Get order book snapshot for visualization
   */
  getSnapshot(depth: number = 10): { bids: OrderBookLevel[], asks: OrderBookLevel[] } {
    const bids = this.getLevels(this.bids, depth, false);
    const asks = this.getLevels(this.asks, depth, true);
    return { bids, asks };
  }

  /**
   * Get aggregated levels for display
   */
  private getLevels(book: Map<number, PriceLevel>, depth: number, ascending: boolean): OrderBookLevel[] {
    const prices = this.getSortedPrices(book, ascending);
    const levels: OrderBookLevel[] = [];

    for (let i = 0; i < Math.min(depth, prices.length); i++) {
      const price = prices[i];
      const level = book.get(price);
      if (level) {
        levels.push({
          price,
          quantity: level.totalQuantity,
          orderCount: level.orders.length,
        });
      }
    }

    return levels;
  }

  /**
   * Get best bid and ask prices
   */
  getBestPrices(): { bid: number | null, ask: number | null } {
    const bidPrices = Array.from(this.bids.keys());
    const askPrices = Array.from(this.asks.keys());

    return {
      bid: bidPrices.length > 0 ? Math.max(...bidPrices) : null,
      ask: askPrices.length > 0 ? Math.min(...askPrices) : null,
    };
  }

  /**
   * Get mid price
   */
  getMidPrice(): number | null {
    const { bid, ask } = this.getBestPrices();
    if (bid === null || ask === null) return null;
    return (bid + ask) / 2;
  }

  /**
   * Get recent trades
   */
  getRecentTrades(count: number = 50): Trade[] {
    return this.trades.slice(-count);
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): Order | undefined {
    return this.orderMap.get(orderId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      bidLevels: this.bids.size,
      askLevels: this.asks.size,
      totalOrders: this.orderMap.size,
      totalTrades: this.trades.length,
    };
  }
}
