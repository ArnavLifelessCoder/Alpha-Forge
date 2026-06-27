import { useMemo, useState } from 'react';
import { 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Area
} from 'recharts';
import { Candle } from '../types';
import { BarChart3, TrendingUp, Layers } from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
  symbol?: string;
}

export default function CandlestickChart({ candles, symbol = 'BTC/USD' }: CandlestickChartProps) {
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA, setShowSMA] = useState(true);
  const [timeframe] = useState('5s');

  const chartData = useMemo(() => {
    if (candles.length === 0) return [];

    // Calculate SMA
    const smaWindow = 20;
    
    return candles.map((candle, index) => {
      // Calculate SMA-20
      let sma20 = null;
      if (index >= smaWindow - 1) {
        const window = candles.slice(index - smaWindow + 1, index + 1);
        sma20 = window.reduce((sum, c) => sum + c.close, 0) / smaWindow;
      }

      // Calculate SMA-7
      let sma7 = null;
      if (index >= 6) {
        const window = candles.slice(index - 6, index + 1);
        sma7 = window.reduce((sum, c) => sum + c.close, 0) / 7;
      }

      const bullish = candle.close >= candle.open;

      return {
        time: new Date(candle.timestamp).toLocaleTimeString(),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        sma7,
        sma20,
        // For candlestick visualization
        bodyBottom: Math.min(candle.open, candle.close),
        bodyTop: Math.max(candle.open, candle.close),
        bodyHeight: Math.abs(candle.close - candle.open),
        wickHigh: candle.high,
        wickLow: candle.low,
        bullish,
        color: bullish ? '#1A7F4B' : '#D23B3B',
      };
    });
  }, [candles]);

  const latestCandle = candles[candles.length - 1];
  const firstCandle = candles[0];
  const priceChange = latestCandle && firstCandle
    ? latestCandle.close - firstCandle.open
    : 0;
  const priceChangePercent = firstCandle && firstCandle.open !== 0
    ? (priceChange / firstCandle.open) * 100
    : 0;

  const totalVolume = candles.reduce((sum, c) => sum + c.volume, 0);
  const highPrice = Math.max(...candles.map(c => c.high), 0);
  const lowPrice = Math.min(...candles.filter(c => c.low > 0).map(c => c.low), Infinity);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-6 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold">{symbol}</h2>
              <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                {timeframe}
              </span>
            </div>
            {latestCandle && (
              <div className="flex items-center space-x-3 mt-0.5">
                <span className="text-2xl font-bold">${latestCandle.close.toFixed(2)}</span>
                <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                  priceChange >= 0 
                    ? 'bg-green-500/10 text-green-400' 
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowSMA(!showSMA)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showSMA ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <TrendingUp className="w-3 h-3 inline mr-1" />SMA
          </button>
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showVolume ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3 inline mr-1" />VOL
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center space-x-6 mb-4 text-xs">
        <div>
          <span className="text-slate-400">H: </span>
          <span className="text-green-400 font-medium">${highPrice === Infinity ? '—' : highPrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-slate-400">L: </span>
          <span className="text-red-400 font-medium">${lowPrice === Infinity ? '—' : lowPrice.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-slate-400">Vol: </span>
          <span className="text-slate-200 font-medium">{totalVolume.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-slate-400">Candles: </span>
          <span className="text-slate-200 font-medium">{candles.length}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D6" />
              <XAxis 
                dataKey="time" 
                stroke="#C2B6A2"
                tick={{ fontSize: 10, fill: '#9A8F7E' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                yAxisId="price"
                stroke="#C2B6A2"
                tick={{ fontSize: 10, fill: '#9A8F7E' }}
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toFixed(0)}`}
                orientation="right"
              />
              {showVolume && (
                <YAxis 
                  yAxisId="volume"
                  orientation="left"
                  stroke="#C2B6A2"
                  tick={{ fontSize: 10, fill: '#9A8F7E' }}
                  domain={[0, 'auto']}
                  tickFormatter={(value) => value.toFixed(0)}
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E8E1D6',
                  borderRadius: '0.75rem',
                  padding: '12px',
                }}
                labelStyle={{ color: '#5E564A', marginBottom: '8px' }}
                formatter={(value: number, name: string) => {
                  if (name === 'volume') return [value.toFixed(2), 'Volume'];
                  return [`$${value.toFixed(2)}`, name.toUpperCase()];
                }}
              />
              
              {/* Volume Bars */}
              {showVolume && (
                <Bar 
                  yAxisId="volume"
                  dataKey="volume" 
                  fill="#0E7C86" 
                  opacity={0.2}
                  name="volume"
                />
              )}

              {/* Price Line */}
              <Line 
                yAxisId="price"
                type="monotone" 
                dataKey="close" 
                stroke="#0E7C86" 
                strokeWidth={2}
                dot={false}
                name="close"
              />

              {/* High-Low Area */}
              <Area
                yAxisId="price"
                type="monotone"
                dataKey="high"
                stroke="transparent"
                fill="#1A7F4B"
                fillOpacity={0.05}
                name="high"
              />

              {/* SMA Lines */}
              {showSMA && (
                <>
                  <Line 
                    yAxisId="price"
                    type="monotone" 
                    dataKey="sma7" 
                    stroke="#C77D11"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                    name="SMA(7)"
                    connectNulls
                  />
                  <Line 
                    yAxisId="price"
                    type="monotone" 
                    dataKey="sma20" 
                    stroke="#D2557A"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                    name="SMA(20)"
                    connectNulls
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Waiting for market data...</p>
              <p className="text-sm mt-1">Candles will appear once trading begins</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {showSMA && chartData.length > 0 && (
        <div className="flex items-center space-x-4 mt-3 text-xs text-slate-400">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-0.5 bg-indigo-500"></div>
            <span>Price</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-0.5 bg-amber-500 border-dashed"></div>
            <span>SMA(7)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-0.5 bg-pink-500 border-dashed"></div>
            <span>SMA(20)</span>
          </div>
        </div>
      )}
    </div>
  );
}
