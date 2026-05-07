import { OrderBook } from '../types';
import { BookOpen } from 'lucide-react';

interface OrderBookWidgetProps {
  orderBook: OrderBook;
}

export default function OrderBookWidget({ orderBook }: OrderBookWidgetProps) {
  const maxQuantity = Math.max(
    ...orderBook.bids.map(b => b.quantity),
    ...orderBook.asks.map(a => a.quantity),
    1
  );

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <BookOpen className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Order Book</h2>
      </div>

      <div className="space-y-4">
        {/* Asks (Sell Orders) */}
        <div>
          <div className="grid grid-cols-3 text-xs text-slate-400 mb-2 px-2">
            <div>Price</div>
            <div className="text-right">Size</div>
            <div className="text-right">Total</div>
          </div>
          
          <div className="space-y-1">
            {orderBook.asks.slice(0, 10).reverse().map((ask, idx) => (
              <div
                key={`ask-${idx}`}
                className="relative grid grid-cols-3 text-sm py-1 px-2 rounded hover:bg-slate-700/50"
              >
                <div
                  className="absolute inset-0 bg-red-500/10 rounded"
                  style={{ width: `${(ask.quantity / maxQuantity) * 100}%` }}
                />
                <div className="relative text-red-400">${ask.price.toFixed(2)}</div>
                <div className="relative text-right">{ask.quantity.toFixed(2)}</div>
                <div className="relative text-right text-slate-400">
                  {(ask.price * ask.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spread */}
        <div className="border-t border-b border-slate-600 py-2 text-center">
          <div className="text-xs text-slate-400">Spread</div>
          <div className="text-sm font-semibold">
            {orderBook.asks[0] && orderBook.bids[0]
              ? `$${(orderBook.asks[0].price - orderBook.bids[0].price).toFixed(2)}`
              : '-'}
          </div>
        </div>

        {/* Bids (Buy Orders) */}
        <div>
          <div className="space-y-1">
            {orderBook.bids.slice(0, 10).map((bid, idx) => (
              <div
                key={`bid-${idx}`}
                className="relative grid grid-cols-3 text-sm py-1 px-2 rounded hover:bg-slate-700/50"
              >
                <div
                  className="absolute inset-0 bg-green-500/10 rounded"
                  style={{ width: `${(bid.quantity / maxQuantity) * 100}%` }}
                />
                <div className="relative text-green-400">${bid.price.toFixed(2)}</div>
                <div className="relative text-right">{bid.quantity.toFixed(2)}</div>
                <div className="relative text-right text-slate-400">
                  {(bid.price * bid.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
