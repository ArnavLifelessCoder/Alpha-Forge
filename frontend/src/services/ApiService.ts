import { OrderRequest, Portfolio } from '../types';

const API_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'https://algo-portal.onrender.com';

class ApiService {
  async submitOrder(order: OrderRequest & { symbol?: string }): Promise<any> {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit order');
    }

    return response.json();
  }

  async getPortfolio(userId: string): Promise<Portfolio> {
    const response = await fetch(`${API_URL}/api/portfolio/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch portfolio');
    return response.json();
  }

  async getStats(symbol?: string): Promise<any> {
    const url = symbol 
      ? `${API_URL}/api/stats?symbol=${encodeURIComponent(symbol)}`
      : `${API_URL}/api/stats`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch stats');
    return response.json();
  }

  async getCandles(count: number = 100, symbol?: string): Promise<any> {
    const params = new URLSearchParams({ count: count.toString() });
    if (symbol) params.set('symbol', symbol);
    const response = await fetch(`${API_URL}/api/candles?${params}`);
    if (!response.ok) throw new Error('Failed to fetch candles');
    return response.json();
  }

  async getOrderBook(depth: number = 20, symbol?: string): Promise<any> {
    const params = new URLSearchParams({ depth: depth.toString() });
    if (symbol) params.set('symbol', symbol);
    const response = await fetch(`${API_URL}/api/orderbook?${params}`);
    if (!response.ok) throw new Error('Failed to fetch order book');
    return response.json();
  }

  async getMarketData(): Promise<any> {
    const response = await fetch(`${API_URL}/api/market-data`);
    if (!response.ok) throw new Error('Failed to fetch market data');
    return response.json();
  }

  async getSymbols(): Promise<any> {
    const response = await fetch(`${API_URL}/api/symbols`);
    if (!response.ok) throw new Error('Failed to fetch symbols');
    return response.json();
  }

  async getTrades(count: number = 50, symbol?: string): Promise<any> {
    const params = new URLSearchParams({ count: count.toString() });
    if (symbol) params.set('symbol', symbol);
    const response = await fetch(`${API_URL}/api/trades?${params}`);
    if (!response.ok) throw new Error('Failed to fetch trades');
    return response.json();
  }

  async getUserOrders(userId: string): Promise<any> {
    const response = await fetch(`${API_URL}/api/orders/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch orders');
    return response.json();
  }

  async cancelOrder(orderId: string, userId: string, symbol?: string): Promise<any> {
    const response = await fetch(`${API_URL}/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, symbol }),
    });
    if (!response.ok) throw new Error('Failed to cancel order');
    return response.json();
  }
}

export const apiService = new ApiService();
