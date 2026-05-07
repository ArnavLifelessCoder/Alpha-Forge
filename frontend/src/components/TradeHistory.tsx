import { Trade } from '../types';
import { History } from 'lucide-react';

interface TradeHistoryProps {
  trades: Trade[];
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <History className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Recent Trades</h2>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-3 text-xs text-slate-400 mb-2 px-2">
          <div>Price</div>
          <div className="text-right">Size</div>
          <div className="text-right">Time</div>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {trades.length > 0 ? (
            trades.map((trade) => {
              const time = new Date(trade.timestamp).toLocaleTimeString();
              
              return (
                <div
                  key={trade.id}
                  className="grid grid-cols-3 text-sm py-1 px-2 rounded hover:bg-slate-700/50"
                >
                  <div className="font-medium">${trade.price.toFixed(2)}</div>
                  <div className="text-right">{trade.quantity.toFixed(2)}</div>
                  <div className="text-right text-slate-400 text-xs">{time}</div>
                </div>
              );
            })
          ) : (
            <div className="text-center text-slate-400 py-8 text-sm">
              No trades yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
