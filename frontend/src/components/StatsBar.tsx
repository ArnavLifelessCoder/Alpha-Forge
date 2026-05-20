import { Activity, Zap, BarChart3, Users } from 'lucide-react';

interface StatsBarProps {
  stats: any;
  currentPrice: number;
}

export default function StatsBar({ stats, currentPrice }: StatsBarProps) {
  if (!stats) return null;

  const spread = stats.spread;
  const spreadBps = spread && stats.bestBid ? (spread / stats.bestBid * 10000).toFixed(1) : '—';

  return (
    <div className="bg-slate-800/50 border-b border-slate-700/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-1.5">
        <div className="flex items-center justify-between text-xs overflow-x-auto">
          <div className="flex items-center space-x-5">
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span className="text-slate-400">Last:</span>
              <span className="font-mono font-bold text-white">${currentPrice.toFixed(2)}</span>
            </div>
            
            {stats.bestBid && (
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Bid:</span>
                <span className="font-mono text-green-400">${stats.bestBid.toFixed(2)}</span>
              </div>
            )}
            
            {stats.bestAsk && (
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-400">Ask:</span>
                <span className="font-mono text-red-400">${stats.bestAsk.toFixed(2)}</span>
              </div>
            )}

            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Spread:</span>
              <span className="font-mono text-slate-200">{spreadBps} bps</span>
            </div>
          </div>

          <div className="flex items-center space-x-5">
            <div className="flex items-center space-x-1.5">
              <BarChart3 className="w-3 h-3 text-indigo-400" />
              <span className="text-slate-400">Orders:</span>
              <span className="font-mono text-slate-200">{(stats.totalOrders || 0).toLocaleString()}</span>
            </div>
            
            <div className="flex items-center space-x-1.5">
              <Activity className="w-3 h-3 text-purple-400" />
              <span className="text-slate-400">Trades:</span>
              <span className="font-mono text-slate-200">{(stats.totalTrades || 0).toLocaleString()}</span>
            </div>

            {stats.wsConnections !== undefined && (
              <div className="flex items-center space-x-1.5">
                <Users className="w-3 h-3 text-green-400" />
                <span className="text-slate-400">Clients:</span>
                <span className="font-mono text-slate-200">{stats.wsConnections}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
