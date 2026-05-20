import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { wsService } from '../services/WebSocketService';
import { apiService } from '../services/ApiService';

interface TradeItem {
  id: string;
  price: number;
  quantity: number;
  timestamp: number;
  buyUserId?: string;
  sellUserId?: string;
  symbol?: string;
}

interface RecentTradesProps {
  symbol?: string;
}

export default function RecentTrades({ symbol }: RecentTradesProps) {
  const [trades, setTrades] = useState<TradeItem[]>([]);

  useEffect(() => {
    // Fetch initial trades from API
    const fetchTrades = async () => {
      try {
        const data = await apiService.getTrades(30, symbol);
        const tradeList = data.trades || data;
        if (Array.isArray(tradeList)) {
          setTrades(tradeList.slice(0, 30));
        }
      } catch (error) {
        // Silent fail - trades will come via WebSocket
      }
    };

    fetchTrades();

    // Subscribe to real-time trade updates
    const handleTrade = (data: any) => {
      const newTrades = Array.isArray(data) ? data : (data.trades || [data]);
      
      setTrades(prev => {
        const updated = [...newTrades, ...prev].slice(0, 30);
        return updated;
      });
    };

    wsService.on('trade', handleTrade);

    return () => {
      wsService.off('trade', handleTrade);
    };
  }, [symbol]);

  const getPriceDirection = (trade: TradeItem, index: number): 'up' | 'down' | 'neutral' => {
    if (index >= trades.length - 1) return 'neutral';
    const nextTrade = trades[index + 1];
    if (trade.price > nextTrade.price) return 'up';
    if (trade.price < nextTrade.price) return 'down';
    return 'neutral';
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold">Recent Trades</h2>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] text-green-400 animate-pulse">●</span>
          <span className="text-[10px] text-slate-400">LIVE</span>
        </div>
      </div>

      <div className="space-y-0.5">
        <div className="grid grid-cols-3 text-[10px] text-slate-500 mb-1.5 px-2 font-medium uppercase tracking-wider">
          <div>Price</div>
          <div className="text-right">Size</div>
          <div className="text-right">Time</div>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-0.5 custom-scrollbar">
          {trades.length > 0 ? trades.map((trade, index) => {
            const direction = getPriceDirection(trade, index);
            const isNew = index === 0;
            
            return (
              <div
                key={trade.id || `${trade.timestamp}-${index}`}
                className={`grid grid-cols-3 text-xs py-1 px-2 rounded transition-all ${
                  isNew ? 'bg-slate-700/60' : 'hover:bg-slate-700/30'
                }`}
              >
                <div className={`font-mono font-medium ${
                  direction === 'up' ? 'text-green-400' : 
                  direction === 'down' ? 'text-red-400' : 'text-slate-300'
                }`}>
                  ${trade.price?.toFixed(2) || '0.00'}
                </div>
                <div className="text-right text-slate-300 font-mono">
                  {trade.quantity?.toFixed(3) || '0.000'}
                </div>
                <div className="text-right text-slate-500 text-[10px]">
                  {trade.timestamp 
                    ? new Date(trade.timestamp).toLocaleTimeString() 
                    : '—'
                  }
                </div>
              </div>
            );
          }) : (
            <div className="text-center text-slate-500 py-8 text-xs">
              Waiting for trades...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
