export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
}

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  side: OrderSide;
  price: number; // For limit orders, ignored for market orders
  quantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  timestamp: number;
}

export interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  price: number;
  quantity: number;
  timestamp: number;
  buyUserId: string;
  sellUserId: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Portfolio {
  userId: string;
  cash: number;
  positions: Map<string, number>; // symbol -> quantity (negative for short)
  realizedPnL: number;
  unrealizedPnL: number;
}

export interface WebSocketMessage {
  type: 'orderbook' | 'trade' | 'candle' | 'portfolio' | 'order_update';
  data: any;
  timestamp: number;
}

export interface OrderRequest {
  userId: string;
  type: OrderType;
  side: OrderSide;
  price?: number;
  quantity: number;
}

export interface CancelRequest {
  orderId: string;
  userId: string;
}
