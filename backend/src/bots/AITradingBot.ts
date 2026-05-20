import { MatchingEngine } from '../engine/MatchingEngine';
import { Trade, OrderType, OrderSide } from '../types';

/**
 * AI Trading Bot - Multi-Strategy Intelligent Trading System
 * 
 * Strategies:
 * 1. Mean Reversion (RSI-based)
 * 2. Momentum (MACD / EMA crossover)
 * 3. Breakout (Bollinger Band)
 * 4. Market Making (spread capture)
 * 
 * Risk: Kelly sizing, stop-loss, max drawdown circuit breaker
 */

interface BotTrade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  strategy: string;
  timestamp: number;
  status: 'OPEN' | 'CLOSED' | 'STOPPED';
}

interface StrategySignal {
  strategy: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
}

export class AITradingBot {
  private engines: Map<string, MatchingEngine> = new Map();
  private userId: string = 'AI_BOT';
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  // Price data - fed externally by server.ts
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();

  // State
  private positions: Map<string, number> = new Map();
  private capital: number = 100000;
  private initialCapital: number = 100000;
  private peakCapital: number = 100000;
  private tradeLog: BotTrade[] = [];
  private totalPnL: number = 0;
  private winCount: number = 0;
  private lossCount: number = 0;
  private paused: boolean = false;
  private activeStrategies: string[] = ['mean_reversion', 'momentum', 'breakout', 'market_making'];
  private cooldowns: Map<string, number> = new Map();

  constructor() {}

  /**
   * Register a symbol engine (call from server.ts)
   */
  registerSymbol(symbol: string, engine: MatchingEngine): void {
    this.engines.set(symbol, engine);
    this.priceHistory.set(symbol, []);
    this.volumeHistory.set(symbol, []);
    this.positions.set(symbol, 0);
  }

  /**
   * Feed trade data from server.ts (called externally when trades happen)
   */
  feedTrade(symbol: string, trade: Trade): void {
    const prices = this.priceHistory.get(symbol);
    const volumes = this.volumeHistory.get(symbol);
    if (!prices || !volumes) return;

    prices.push(trade.price);
    volumes.push(trade.quantity);

    // Keep bounded
    if (prices.length > 200) prices.shift();
    if (volumes.length > 200) volumes.shift();
  }

  /**
   * Start bot
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.paused = false;

    console.log(`🤖 AI Bot started | ${this.engines.size} symbols | Strategies: ${this.activeStrategies.join(', ')}`);

    this.intervalId = setInterval(() => {
      if (!this.paused) this.tick();
    }, 3000);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
    console.log(`🤖 AI Bot stopped | P&L: $${this.totalPnL.toFixed(2)}`);
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  /**
   * Main decision loop
   */
  private tick(): void {
    // Circuit breaker
    if (this.getDrawdown() > 10) {
      this.paused = true;
      return;
    }

    for (const [symbol] of this.engines) {
      const prices = this.priceHistory.get(symbol) || [];
      if (prices.length < 30) continue;

      // Cooldown check
      if (Date.now() < (this.cooldowns.get(symbol) || 0)) continue;

      // Get signals
      const signals = this.getSignals(symbol, prices);
      const decision = this.consensus(signals);

      if (decision.action !== 'HOLD' && decision.confidence >= 0.25) {
        this.trade(symbol, decision);
      }
    }

    // Check stop-loss / take-profit
    this.checkExits();
  }

  private getSignals(symbol: string, prices: number[]): StrategySignal[] {
    const signals: StrategySignal[] = [];
    if (this.activeStrategies.includes('mean_reversion')) signals.push(this.rsiStrategy(prices));
    if (this.activeStrategies.includes('momentum')) signals.push(this.momentumStrategy(prices));
    if (this.activeStrategies.includes('breakout')) signals.push(this.breakoutStrategy(symbol, prices));
    if (this.activeStrategies.includes('market_making')) signals.push(this.mmStrategy(symbol));
    return signals;
  }

  // ===== STRATEGIES =====

  private rsiStrategy(prices: number[]): StrategySignal {
    const rsi = this.rsi(prices, 14);
    if (rsi === null) return { strategy: 'mean_reversion', action: 'HOLD', confidence: 0, reason: 'no data' };

    if (rsi < 30) return { strategy: 'mean_reversion', action: 'BUY', confidence: (35 - rsi) / 35, reason: `RSI=${rsi.toFixed(0)} oversold` };
    if (rsi > 70) return { strategy: 'mean_reversion', action: 'SELL', confidence: (rsi - 65) / 35, reason: `RSI=${rsi.toFixed(0)} overbought` };
    return { strategy: 'mean_reversion', action: 'HOLD', confidence: 0, reason: `RSI=${rsi.toFixed(0)}` };
  }

  private momentumStrategy(prices: number[]): StrategySignal {
    if (prices.length < 26) return { strategy: 'momentum', action: 'HOLD', confidence: 0, reason: 'no data' };

    const ema8 = this.ema(prices, 8);
    const ema21 = this.ema(prices, 21);
    if (!ema8 || !ema21) return { strategy: 'momentum', action: 'HOLD', confidence: 0, reason: 'no data' };

    const diff = (ema8 - ema21) / ema21;

    if (diff > 0.002) return { strategy: 'momentum', action: 'BUY', confidence: Math.min(diff * 50, 0.9), reason: `EMA8 > EMA21 by ${(diff * 100).toFixed(2)}%` };
    if (diff < -0.002) return { strategy: 'momentum', action: 'SELL', confidence: Math.min(Math.abs(diff) * 50, 0.9), reason: `EMA8 < EMA21 by ${(Math.abs(diff) * 100).toFixed(2)}%` };
    return { strategy: 'momentum', action: 'HOLD', confidence: 0, reason: 'no trend' };
  }

  private breakoutStrategy(symbol: string, prices: number[]): StrategySignal {
    if (prices.length < 20) return { strategy: 'breakout', action: 'HOLD', confidence: 0, reason: 'no data' };

    const slice = prices.slice(-20);
    const mean = slice.reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(slice.reduce((s, p) => s + (p - mean) ** 2, 0) / 20);
    const upper = mean + 2 * std;
    const lower = mean - 2 * std;
    const current = prices[prices.length - 1];

    const volumes = this.volumeHistory.get(symbol) || [];
    const avgVol = volumes.length >= 10 ? volumes.slice(-10).reduce((a, b) => a + b, 0) / 10 : 1;
    const curVol = volumes.length > 0 ? volumes[volumes.length - 1] : 0;
    const volSpike = curVol > avgVol * 1.3;

    if (current > upper && volSpike) return { strategy: 'breakout', action: 'BUY', confidence: 0.7, reason: 'BB breakout up + volume' };
    if (current < lower && volSpike) return { strategy: 'breakout', action: 'SELL', confidence: 0.7, reason: 'BB breakdown + volume' };
    return { strategy: 'breakout', action: 'HOLD', confidence: 0, reason: 'in range' };
  }

  private mmStrategy(symbol: string): StrategySignal {
    const position = this.positions.get(symbol) || 0;
    // Lean against inventory
    if (position > 15) return { strategy: 'market_making', action: 'SELL', confidence: 0.5, reason: 'reduce long inventory' };
    if (position < -15) return { strategy: 'market_making', action: 'BUY', confidence: 0.5, reason: 'reduce short inventory' };

    // Random liquidity provision
    if (Math.random() < 0.3) {
      const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
      return { strategy: 'market_making', action: side, confidence: 0.3, reason: 'providing liquidity' };
    }
    return { strategy: 'market_making', action: 'HOLD', confidence: 0, reason: 'idle' };
  }

  // ===== CONSENSUS =====

  private consensus(signals: StrategySignal[]): StrategySignal {
    const weights: Record<string, number> = { mean_reversion: 0.3, momentum: 0.35, breakout: 0.25, market_making: 0.1 };
    let buyScore = 0, sellScore = 0, bestReason = '';

    for (const s of signals) {
      const w = weights[s.strategy] || 0.2;
      if (s.action === 'BUY') { buyScore += s.confidence * w; bestReason = s.reason; }
      if (s.action === 'SELL') { sellScore += s.confidence * w; bestReason = s.reason; }
    }

    if (buyScore > sellScore && buyScore > 0.1) return { strategy: 'consensus', action: 'BUY', confidence: buyScore, reason: bestReason };
    if (sellScore > buyScore && sellScore > 0.1) return { strategy: 'consensus', action: 'SELL', confidence: sellScore, reason: bestReason };
    return { strategy: 'consensus', action: 'HOLD', confidence: 0, reason: '' };
  }

  // ===== EXECUTION =====

  private trade(symbol: string, decision: StrategySignal): void {
    const engine = this.engines.get(symbol);
    if (!engine) return;

    const position = this.positions.get(symbol) || 0;
    if (decision.action === 'BUY' && position >= 30) return;
    if (decision.action === 'SELL' && position <= -30) return;

    const prices = this.priceHistory.get(symbol) || [];
    const price = prices[prices.length - 1];
    if (!price) return;

    const quantity = Math.max(1, Math.min(Math.floor(decision.confidence * 5) + 1, 8));
    const side = decision.action === 'BUY' ? OrderSide.BUY : OrderSide.SELL;

    try {
      const result = engine.submitOrder({
        userId: this.userId,
        type: OrderType.MARKET,
        side,
        quantity,
      });

      if (result.trades.length > 0) {
        const filledQty = result.trades.reduce((s, t) => s + t.quantity, 0);
        const avgPrice = result.trades.reduce((s, t) => s + t.price * t.quantity, 0) / filledQty;

        const newPos = position + (side === OrderSide.BUY ? filledQty : -filledQty);
        this.positions.set(symbol, newPos);

        this.tradeLog.push({
          id: `AI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          symbol,
          side: decision.action as 'BUY' | 'SELL',
          quantity: filledQty,
          entryPrice: avgPrice,
          strategy: decision.reason,
          timestamp: Date.now(),
          status: 'OPEN',
        });

        this.cooldowns.set(symbol, Date.now() + 5000);
        if (this.tradeLog.length > 500) this.tradeLog = this.tradeLog.slice(-500);
      }
    } catch (_) {}
  }

  private checkExits(): void {
    for (const trade of this.tradeLog) {
      if (trade.status !== 'OPEN') continue;

      const prices = this.priceHistory.get(trade.symbol) || [];
      const current = prices[prices.length - 1];
      if (!current) continue;

      const pnlPct = trade.side === 'BUY'
        ? ((current - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - current) / trade.entryPrice) * 100;

      if (pnlPct <= -2.0 || pnlPct >= 3.0) {
        this.closeTrade(trade, current, pnlPct <= -2.0 ? 'STOPPED' : 'CLOSED');
      }
    }
  }

  private closeTrade(trade: BotTrade, exitPrice: number, status: 'CLOSED' | 'STOPPED'): void {
    const engine = this.engines.get(trade.symbol);
    if (!engine) return;

    try {
      engine.submitOrder({
        userId: this.userId,
        type: OrderType.MARKET,
        side: trade.side === 'BUY' ? OrderSide.SELL : OrderSide.BUY,
        quantity: trade.quantity,
      });

      trade.exitPrice = exitPrice;
      trade.status = status;
      trade.pnl = trade.side === 'BUY'
        ? (exitPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - exitPrice) * trade.quantity;

      this.totalPnL += trade.pnl;
      this.capital += trade.pnl;
      this.peakCapital = Math.max(this.peakCapital, this.capital);
      if (trade.pnl >= 0) this.winCount++; else this.lossCount++;

      const pos = this.positions.get(trade.symbol) || 0;
      this.positions.set(trade.symbol, pos + (trade.side === 'BUY' ? -trade.quantity : trade.quantity));
    } catch (_) {}
  }

  // ===== INDICATORS =====

  private rsi(prices: number[], period: number): number | null {
    if (prices.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - 100 / (1 + rs);
  }

  private ema(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) val = prices[i] * k + val * (1 - k);
    return val;
  }

  // ===== PUBLIC API =====

  getDrawdown(): number {
    return this.peakCapital > 0 ? ((this.peakCapital - this.capital) / this.peakCapital) * 100 : 0;
  }

  getStatus() {
    // Calculate unrealized P&L from open positions
    let unrealizedPnL = 0;
    for (const trade of this.tradeLog) {
      if (trade.status !== 'OPEN') continue;
      const prices = this.priceHistory.get(trade.symbol) || [];
      const current = prices[prices.length - 1];
      if (!current) continue;
      const pnl = trade.side === 'BUY'
        ? (current - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - current) * trade.quantity;
      unrealizedPnL += pnl;
    }

    const openTrades = this.tradeLog.filter(t => t.status === 'OPEN').length;

    return {
      isRunning: this.isRunning,
      paused: this.paused,
      capital: this.capital,
      totalPnL: this.totalPnL + unrealizedPnL,
      realizedPnL: this.totalPnL,
      unrealizedPnL,
      pnlPercent: ((this.capital + unrealizedPnL - this.initialCapital) / this.initialCapital) * 100,
      winRate: (this.winCount + this.lossCount) > 0 ? (this.winCount / (this.winCount + this.lossCount)) * 100 : 0,
      totalTrades: this.winCount + this.lossCount,
      openTrades,
      wins: this.winCount,
      losses: this.lossCount,
      drawdown: this.getDrawdown(),
      peakCapital: this.peakCapital,
      activeStrategies: this.activeStrategies,
      positions: Object.fromEntries(this.positions),
      recentTrades: this.tradeLog.slice(-20).reverse().map(t => {
        if (t.status === 'OPEN') {
          const prices = this.priceHistory.get(t.symbol) || [];
          const current = prices[prices.length - 1];
          if (current) {
            const livePnl = t.side === 'BUY'
              ? (current - t.entryPrice) * t.quantity
              : (t.entryPrice - current) * t.quantity;
            return { ...t, pnl: livePnl, currentPrice: current };
          }
        }
        return t;
      }),
    };
  }

  getRecentTrades(count: number = 20): BotTrade[] {
    return this.tradeLog.slice(-count).reverse();
  }

  setStrategies(strategies: string[]): void { this.activeStrategies = strategies; }
}
