import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Candle } from '../types';
import { BarChart3 } from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
}

export default function CandlestickChart({ candles }: CandlestickChartProps) {
  const chartData = useMemo(() => {
    return candles.map(candle => ({
      time: new Date(candle.timestamp).toLocaleTimeString(),
      price: candle.close,
      high: candle.high,
      low: candle.low,
      volume: candle.volume,
    }));
  }, [candles]);

  const latestCandle = candles[candles.length - 1];
  const priceChange = latestCandle && candles.length > 1
    ? latestCandle.close - candles[0].open
    : 0;
  const priceChangePercent = latestCandle && candles.length > 1
    ? (priceChange / candles[0].open) * 100
    : 0;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Price Chart</h2>
          <span className="text-sm text-slate-400">(5s intervals)</span>
        </div>
        
        {latestCandle && (
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-2xl font-bold">${latestCandle.close.toFixed(2)}</span>
            </div>
            <div className={`text-sm ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChangePercent.toFixed(2)}%)
            </div>
          </div>
        )}
      </div>

      <div className="h-80">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="time" 
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '0.5rem',
                }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#6366f1" 
                strokeWidth={2}
                dot={false}
                name="Price"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Waiting for market data...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
