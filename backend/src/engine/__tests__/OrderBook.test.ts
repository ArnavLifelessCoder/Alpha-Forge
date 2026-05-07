import { OrderBook } from '../OrderBook';
import { Order, OrderType, OrderSide, OrderStatus } from '../../types';

describe('OrderBook', () => {
  let orderBook: OrderBook;

  beforeEach(() => {
    orderBook = new OrderBook();
  });

  describe('Limit Orders', () => {
    it('should add a limit buy order to the book', () => {
      const order: Order = {
        id: 'O1',
        userId: 'USER1',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        price: 100,
        quantity: 10,
        remainingQuantity: 10,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
      };

      const trades = orderBook.addOrder(order);

      expect(trades).toHaveLength(0);
      expect(order.status).toBe(OrderStatus.PENDING);
      
      const snapshot = orderBook.getSnapshot(10);
      expect(snapshot.bids).toHaveLength(1);
      expect(snapshot.bids[0].price).toBe(100);
      expect(snapshot.bids[0].quantity).toBe(10);
    });

    it('should match crossing limit orders', () => {
      const buyOrder: Order = {
        id: 'O1',
        userId: 'USER1',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        price: 100,
        quantity: 10,
        remainingQuantity: 10,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
      };

      const sellOrder: Order = {
        id: 'O2',
        userId: 'USER2',
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        price: 100,
        quantity: 5,
        remainingQuantity: 5,
        status: OrderStatus.PENDING,
        timestamp: Date.now() + 1,
      };

      orderBook.addOrder(buyOrder);
      const trades = orderBook.addOrder(sellOrder);

      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(5);
      expect(trades[0].price).toBe(100);
      expect(buyOrder.remainingQuantity).toBe(5);
      expect(sellOrder.remainingQuantity).toBe(0);
    });

    it('should maintain price-time priority', () => {
      const order1: Order = {
        id: 'O1',
        userId: 'USER1',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        price: 100,
        quantity: 5,
        remainingQuantity: 5,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
      };

      const order2: Order = {
        id: 'O2',
        userId: 'USER2',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        price: 100,
        quantity: 5,
        remainingQuantity: 5,
        status: OrderStatus.PENDING,
        timestamp: Date.now() + 1,
      };

      const sellOrder: Order = {
        id: 'O3',
        userId: 'USER3',
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        price: 100,
        quantity: 7,
        remainingQuantity: 7,
        status: OrderStatus.PENDING,
        timestamp: Date.now() + 2,
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      const trades = orderBook.addOrder(sellOrder);

      expect(trades).toHaveLength(2);
      expect(trades[0].buyOrderId).toBe('O1'); // First order matched first
      expect(trades[0].quantity).toBe(5);
      expect(trades[1].buyOrderId).toBe('O2');
      expect(trades[1].quantity).toBe(2);
    });
  });

  describe('Market Orders', () => {
    it('should execute market buy order against best asks', () => {
      const askOrder: Order = {
        id: 'O1',
        userId: 'USER1',
        type: OrderType.LIMIT,
        side: OrderSide.SELL,
        price: 100,
        quantity: 10,
        remainingQuantity: 10,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
      };

      const marketOrder: Order = {
        id: 'O2',
        userId: 'USER2',
        type: OrderType.MARKET,
        side: OrderSide.BUY,
        price: 0,
        quantity: 5,
        remainingQuantity: 5,
        status: OrderStatus.PENDING,
        timestamp: Date.now() + 1,
      };

      orderBook.addOrder(askOrder);
      const trades = orderBook.addOrder(marketOrder);

      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe(5);
      expect(trades[0].price).toBe(100);
      expect(marketOrder.status).toBe(OrderStatus.FILLED);
    });
  });

  describe('Order Cancellation', () => {
    it('should cancel an existing order', () => {
      const order: Order = {
        id: 'O1',
        userId: 'USER1',
        type: OrderType.LIMIT,
        side: OrderSide.BUY,
        price: 100,
        quantity: 10,
        remainingQuantity: 10,
        status: OrderStatus.PENDING,
        timestamp: Date.now(),
      };

      orderBook.addOrder(order);
      const success = orderBook.cancelOrder('O1');

      expect(success).toBe(true);
      expect(order.status).toBe(OrderStatus.CANCELLED);
      
      const snapshot = orderBook.getSnapshot(10);
      expect(snapshot.bids).toHaveLength(0);
    });

    it('should return false for non-existent order', () => {
      const success = orderBook.cancelOrder('NONEXISTENT');
      expect(success).toBe(false);
    });
  });

  describe('Order Book Snapshot', () => {
    it('should return correct bid/ask levels', () => {
      const orders: Order[] = [
        {
          id: 'O1',
          userId: 'USER1',
          type: OrderType.LIMIT,
          side: OrderSide.BUY,
          price: 99,
          quantity: 10,
          remainingQuantity: 10,
          status: OrderStatus.PENDING,
          timestamp: Date.now(),
        },
        {
          id: 'O2',
          userId: 'USER2',
          type: OrderType.LIMIT,
          side: OrderSide.BUY,
          price: 98,
          quantity: 5,
          remainingQuantity: 5,
          status: OrderStatus.PENDING,
          timestamp: Date.now() + 1,
        },
        {
          id: 'O3',
          userId: 'USER3',
          type: OrderType.LIMIT,
          side: OrderSide.SELL,
          price: 101,
          quantity: 8,
          remainingQuantity: 8,
          status: OrderStatus.PENDING,
          timestamp: Date.now() + 2,
        },
      ];

      orders.forEach(order => orderBook.addOrder(order));
      const snapshot = orderBook.getSnapshot(10);

      expect(snapshot.bids).toHaveLength(2);
      expect(snapshot.bids[0].price).toBe(99); // Best bid first
      expect(snapshot.asks).toHaveLength(1);
      expect(snapshot.asks[0].price).toBe(101);
    });
  });

  describe('Best Prices', () => {
    it('should return correct best bid and ask', () => {
      const orders: Order[] = [
        {
          id: 'O1',
          userId: 'USER1',
          type: OrderType.LIMIT,
          side: OrderSide.BUY,
          price: 99,
          quantity: 10,
          remainingQuantity: 10,
          status: OrderStatus.PENDING,
          timestamp: Date.now(),
        },
        {
          id: 'O2',
          userId: 'USER2',
          type: OrderType.LIMIT,
          side: OrderSide.SELL,
          price: 101,
          quantity: 10,
          remainingQuantity: 10,
          status: OrderStatus.PENDING,
          timestamp: Date.now() + 1,
        },
      ];

      orders.forEach(order => orderBook.addOrder(order));
      const { bid, ask } = orderBook.getBestPrices();

      expect(bid).toBe(99);
      expect(ask).toBe(101);
    });

    it('should return null for empty book', () => {
      const { bid, ask } = orderBook.getBestPrices();
      expect(bid).toBeNull();
      expect(ask).toBeNull();
    });
  });
});
