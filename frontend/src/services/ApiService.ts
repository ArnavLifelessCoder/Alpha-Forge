import { OrderRequest, Portfolio } from '../types';

const API_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8080';

class ApiService {
  async submitOrder(order: OrderRequest): Promise<any> {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    
    if (!response.ok) {
      throw new Error('Failed to fetch portfolio');
    }

    return response.json();
  }

  async getStats(): Promise<any> {
    const response = await fetch(`${API_URL}/api/stats`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }

    return response.json();
  }

  async getCandles(count: number = 100): Promise<any> {
    const response = await fetch(`${API_URL}/api/candles?count=${count}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch candles');
    }

    return response.json();
  }
}

export const apiService = new ApiService();
