import { OrderBook } from '../types';
import { BookOpen } from 'lucide-react';

interface OrderBookWidgetProps {
  orderBook: OrderBook;
}

export default function OrderBookWidget({ orderBook }: OrderBookWidgetProps) {
  const { bids = [], asks = [] } = orderBook;

  const maxBidQty = Math.max(...bids.map(b => b.quantity), 1);
  const maxAskQty = Math.max(...asks.map(a => a.quantity), 1);

  const spread = asks.length > 0 && bids.length > 0
    ? asks[0].price - bids[0].price
    : null;
  
  const spreadBps = spread && bids[0]?.price
    ? (spread / bids[0].price * 10000).toFixed(1)
    : null;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold">Order Book</h2>
        </div>
        {spread !== null && (
          <span className="text-[10px] text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
            Spread: {spreadBps} bps
          </span>
        )}
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 text-[10px] text-slate-500 mb-1.5 px-1 font-medium uppercase tracking-wider">
        <div>Price</div>
        <div className="text-right">Size</div>
        <div className="text-right">Total</div>
      </div>

      {/* Asks (reversed, lowest at bottom) */}
      <div className="space-y-0.5 mb-2 max-h-32 overflow-hidden">
        {asks.slice(0, 8).reverse().map((level, index) => (
          <div key={`ask-${index}`} className="relative grid grid-cols-3 text-xs py-0.5 px-1 rounded">
            <div 
              className="absolute inset-0 bg-red-500/8 rounded" 
              style={{ width: `${(level.quantity / maxAskQty) * 100}%`, right: 0, left: 'auto' }}
            />
            <div className="relative text-red-400 font-mono">${level.price.toFixed(2)}</div>
            <div className="relative text-right text-slate-300 font-mono">{level.quantity.toFixed(2)}</div>
            <div className="relative text-right text-slate-500 font-mono">{level.orderCount}</div>
          </div>
        ))}
      </div>

      {/* Spread Indicator */}
      {spread !== null && (
        <div className="flex items-center justify-center py-1.5 my-1 border-y border-slate-700/50">
          <span className="text-xs font-bold text-white">${((asks[0]?.price || 0 + (bids[0]?.price || 0)) / 2).toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 ml-2">±${(spread / 2).toFixed(3)}</span>
        </div>
      )}

      {/* Bids */}
      <div className="space-y-0.5 mt-2 max-h-32 overflow-hidden">
        {bids.slice(0, 8).map((level, index) => (
          <div key={`bid-${index}`} className="relative grid grid-cols-3 text-xs py-0.5 px-1 rounded">
            <div 
              className="absolute inset-0 bg-green-500/8 rounded" 
              style={{ width: `${(level.quantity / maxBidQty) * 100}%`, right: 0, left: 'auto' }}
            />
            <div className="relative text-green-400 font-mono">${level.price.toFixed(2)}</div>
            <div className="relative text-right text-slate-300 font-mono">{level.quantity.toFixed(2)}</div>
            <div className="relative text-right text-slate-500 font-mono">{level.orderCount}</div>
          </div>
        ))}
      </div>

      {bids.length === 0 && asks.length === 0 && (
        <div className="text-center py-6 text-slate-500 text-xs">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Waiting for orders...</p>
        </div>
      )}
    </div>
  );
}
