import { Trade, Portfolio } from '../types';

/**
 * Portfolio Manager
 * Tracks user positions, cash, and P&L
 */
export class PortfolioManager {
  private portfolios: Map<string, Portfolio> = new Map();
  private initialCapital: number = 100000; // $100,000
  private currentPrice: number = 100;

  /**
   * Initialize a new user portfolio
   */
  initializePortfolio(userId: string): Portfolio {
    const portfolio: Portfolio = {
      userId,
      cash: this.initialCapital,
      positions: new Map(),
      realizedPnL: 0,
      unrealizedPnL: 0,
    };

    this.portfolios.set(userId, portfolio);
    return portfolio;
  }

  /**
   * Get portfolio for a user
   */
  getPortfolio(userId: string): Portfolio {
    let portfolio = this.portfolios.get(userId);
    if (!portfolio) {
      portfolio = this.initializePortfolio(userId);
    }
    return portfolio;
  }

  /**
   * Update portfolio based on trade execution
   */
  processTrade(trade: Trade): void {
    // Update buyer portfolio
    const buyerPortfolio = this.getPortfolio(trade.buyUserId);
    this.updatePosition(buyerPortfolio, 'ASSET', trade.quantity);
    this.updateCash(buyerPortfolio, -trade.price * trade.quantity);

    // Update seller portfolio
    const sellerPortfolio = this.getPortfolio(trade.sellUserId);
    this.updatePosition(sellerPortfolio, 'ASSET', -trade.quantity);
    this.updateCash(sellerPortfolio, trade.price * trade.quantity);

    // Update current price for P&L calculation
    this.currentPrice = trade.price;

    // Recalculate unrealized P&L for all portfolios
    this.recalculateUnrealizedPnL();
  }

  /**
   * Update position
   */
  private updatePosition(portfolio: Portfolio, symbol: string, quantity: number): void {
    const currentPosition = portfolio.positions.get(symbol) || 0;
    const newPosition = currentPosition + quantity;

    if (newPosition === 0) {
      portfolio.positions.delete(symbol);
    } else {
      portfolio.positions.set(symbol, newPosition);
    }
  }

  /**
   * Update cash balance
   */
  private updateCash(portfolio: Portfolio, amount: number): void {
    portfolio.cash += amount;
  }

  /**
   * Recalculate unrealized P&L for all portfolios
   */
  private recalculateUnrealizedPnL(): void {
    for (const portfolio of this.portfolios.values()) {
      this.calculateUnrealizedPnL(portfolio);
    }
  }

  /**
   * Calculate unrealized P&L for a portfolio
   */
  private calculateUnrealizedPnL(portfolio: Portfolio): void {
    let unrealizedPnL = 0;

    for (const [, quantity] of portfolio.positions.entries()) {
      // For simplicity, assume all positions are in the same asset
      const marketValue = quantity * this.currentPrice;
      
      // Calculate cost basis (simplified - would need trade history for accuracy)
      const avgCost = this.initialCapital / 1000; // Rough estimate
      const costBasis = quantity * avgCost;
      
      unrealizedPnL += (marketValue - costBasis);
    }

    portfolio.unrealizedPnL = unrealizedPnL;
  }

  /**
   * Get total portfolio value
   */
  getPortfolioValue(userId: string): number {
    const portfolio = this.getPortfolio(userId);
    let totalValue = portfolio.cash;

    for (const [, quantity] of portfolio.positions.entries()) {
      totalValue += quantity * this.currentPrice;
    }

    return totalValue;
  }

  /**
   * Get total P&L
   */
  getTotalPnL(userId: string): number {
    const portfolio = this.getPortfolio(userId);
    return portfolio.realizedPnL + portfolio.unrealizedPnL;
  }

  /**
   * Check if user has sufficient buying power
   */
  hasSufficientBuyingPower(userId: string, requiredCash: number): boolean {
    const portfolio = this.getPortfolio(userId);
    return portfolio.cash >= requiredCash;
  }

  /**
   * Check if user can short sell
   */
  canShortSell(userId: string, quantity: number, price: number): boolean {
    // For simplicity, allow short selling up to portfolio value
    const portfolioValue = this.getPortfolioValue(userId);
    const shortValue = quantity * price;
    return shortValue <= portfolioValue;
  }

  /**
   * Get all portfolios
   */
  getAllPortfolios(): Portfolio[] {
    return Array.from(this.portfolios.values());
  }

  /**
   * Update current market price
   */
  updateCurrentPrice(price: number): void {
    this.currentPrice = price;
    this.recalculateUnrealizedPnL();
  }

  /**
   * Get portfolio summary
   */
  getPortfolioSummary(userId: string) {
    const portfolio = this.getPortfolio(userId);
    const totalValue = this.getPortfolioValue(userId);
    const totalPnL = this.getTotalPnL(userId);
    const pnlPercent = ((totalValue - this.initialCapital) / this.initialCapital) * 100;

    return {
      userId: portfolio.userId,
      cash: portfolio.cash,
      positions: Array.from(portfolio.positions.entries()).map(([symbol, quantity]) => ({
        symbol,
        quantity,
        marketValue: quantity * this.currentPrice,
      })),
      realizedPnL: portfolio.realizedPnL,
      unrealizedPnL: portfolio.unrealizedPnL,
      totalPnL,
      totalValue,
      pnlPercent,
      initialCapital: this.initialCapital,
    };
  }
}
