import { TrendingUp, TrendingDown, Activity, Database } from 'lucide-react';

interface StatsBarProps {
  stats: any;
  currentPrice: number;
}

export default function StatsBar({ stats, currentPrice }: StatsBarProps) {
  if (!stats) return null;

  const spreadBps = stats.bestBid && stats.bestAsk 
    ? ((stats.bestAsk - stats.bestBid) / stats.bestBid * 10000).toFixed(1)
    : '0.0';

  return (
    <div className="bg-slate-800 border-b border-slate-700">
      <div className="container mx-auto px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <div>
              <div className="text-xs text-slate-400">Last Price</div>
              <div className="text-sm font-semibold">${currentPrice.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <div>
              <div className="text-xs text-slate-400">Best Bid</div>
              <div className="text-sm font-semibold text-green-400">
                ${stats.bestBid?.toFixed(2) || '-'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <div>
              <div className="text-xs text-slate-400">Best Ask</div>
              <div className="text-sm font-semibold text-red-400">
                ${stats.bestAsk?.toFixed(2) || '-'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-xs text-slate-400">Spread</div>
              <div className="text-sm font-semibold">{spreadBps} bps</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Total Orders</div>
            <div className="text-sm font-semibold">{stats.totalOrders || 0}</div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Total Trades</div>
            <div className="text-sm font-semibold">{stats.totalTrades || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
