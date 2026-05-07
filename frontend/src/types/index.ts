export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  timestamp: number;
  buyUserId: string;
  sellUserId: string;
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
  positions: Array<{
    symbol: string;
    quantity: number;
    marketValue: number;
  }>;
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalValue: number;
  pnlPercent: number;
  initialCapital: number;
}

export interface OrderRequest {
  userId: string;
  type: OrderType;
  side: OrderSide;
  price?: number;
  quantity: number;
}
