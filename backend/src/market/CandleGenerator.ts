import { Trade, Candle } from '../types';

/**
 * Candle Generator
 * Aggregates trades into OHLCV candles
 */
export class CandleGenerator {
  private candles: Candle[] = [];
  private currentCandle: Candle | null = null;
  private intervalMs: number;
  private onCandleCallback?: (candle: Candle) => void;

  constructor(intervalSeconds: number = 5) {
    this.intervalMs = intervalSeconds * 1000;
  }

  /**
   * Register callback for new candles
   */
  onCandle(callback: (candle: Candle) => void): void {
    this.onCandleCallback = callback;
  }

  /**
   * Process a new trade
   */
  processTrade(trade: Trade): void {
    const candleTimestamp = this.getCandleTimestamp(trade.timestamp);

    // Create new candle if needed
    if (!this.currentCandle || this.currentCandle.timestamp !== candleTimestamp) {
      if (this.currentCandle) {
        this.finalizeCandle(this.currentCandle);
      }

      this.currentCandle = {
        timestamp: candleTimestamp,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: 0,
      };
    }

    // Update current candle
    this.currentCandle.high = Math.max(this.currentCandle.high, trade.price);
    this.currentCandle.low = Math.min(this.currentCandle.low, trade.price);
    this.currentCandle.close = trade.price;
    this.currentCandle.volume += trade.quantity;
  }

  /**
   * Get candle timestamp (rounded down to interval)
   */
  private getCandleTimestamp(timestamp: number): number {
    return Math.floor(timestamp / this.intervalMs) * this.intervalMs;
  }

  /**
   * Finalize and store a candle
   */
  private finalizeCandle(candle: Candle): void {
    this.candles.push(candle);

    // Keep only last 1000 candles in memory
    if (this.candles.length > 1000) {
      this.candles.shift();
    }

    // Emit callback
    if (this.onCandleCallback) {
      this.onCandleCallback(candle);
    }
  }

  /**
   * Get recent candles
   */
  getCandles(count: number = 100): Candle[] {
    return this.candles.slice(-count);
  }

  /**
   * Get current (incomplete) candle
   */
  getCurrentCandle(): Candle | null {
    return this.currentCandle;
  }

  /**
   * Force finalize current candle (for testing or shutdown)
   */
  forceFinalize(): void {
    if (this.currentCandle) {
      this.finalizeCandle(this.currentCandle);
      this.currentCandle = null;
    }
  }
}
