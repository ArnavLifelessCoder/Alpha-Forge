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

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  symbol?: string;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol?: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  marketValue: number;
  currentPrice?: number;
}

export interface Portfolio {
  userId: string;
  cash: number;
  positions: Position[];
  realizedPnL: number;
  unrealizedPnL: number;
  totalPnL: number;
  totalValue: number;
  pnlPercent: number;
  initialCapital: number;
}

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  timestamp: number;
  buyUserId: string;
  sellUserId: string;
  symbol?: string;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
}

export interface OrderRequest {
  userId: string;
  type: OrderType;
  side: OrderSide;
  price?: number;
  quantity: number;
  symbol?: string;
}
