import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

interface RecentTrade {
  id: string;
  price: number;
  quantity: number;
  time: string;
  side: 'buy' | 'sell';
}

export default function RecentTrades() {
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  // Simulate live trades
  useEffect(() => {
    // Initial trades
    const initialTrades: RecentTrade[] = Array.from({ length: 15 }, (_, i) => ({
      id: `trade-${i}`,
      price: 99.5 + Math.random() * 2,
      quantity: Math.random() * 10 + 1,
      time: new Date(Date.now() - i * 5000).toLocaleTimeString(),
      side: Math.random() > 0.5 ? 'buy' : 'sell',
    }));
    setTrades(initialTrades);

    // Add new trades periodically
    const interval = setInterval(() => {
      const newTrade: RecentTrade = {
        id: `trade-${Date.now()}`,
        price: 99.5 + Math.random() * 2,
        quantity: Math.random() * 10 + 1,
        time: new Date().toLocaleTimeString(),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
      };

      setTrades(prev => [newTrade, ...prev].slice(0, 20));
    }, 2000 + Math.random() * 3000); // Random interval 2-5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Activity className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Recent Trades</h2>
        <span className="text-xs text-green-400 animate-pulse">● LIVE</span>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-3 text-xs text-slate-400 mb-2 px-2">
          <div>Price</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Time</div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-1">
          {trades.map((trade, index) => (
            <div
              key={trade.id}
              className={`grid grid-cols-3 text-sm py-1.5 px-2 rounded transition-all ${
                index === 0 ? 'bg-slate-700/50 animate-pulse' : 'hover:bg-slate-700/30'
              }`}
            >
              <div className={`font-medium ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                ${trade.price.toFixed(2)}
              </div>
              <div className="text-right text-slate-300">{trade.quantity.toFixed(3)}</div>
              <div className="text-right text-slate-400 text-xs">{trade.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
