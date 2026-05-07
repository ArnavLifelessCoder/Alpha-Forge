import { useState } from 'react';
import { Clock, CheckCircle, XCircle } from 'lucide-react';

interface OrderHistoryItem {
  id: string;
  symbol: string;
  type: 'LIMIT' | 'MARKET';
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  filled: number;
  status: 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'PENDING';
  time: string;
}

export default function OrderHistory() {
  const [orders] = useState<OrderHistoryItem[]>([
    {
      id: 'ORD-001',
      symbol: 'BTC/USD',
      type: 'MARKET',
      side: 'BUY',
      price: 99.75,
      quantity: 3.0,
      filled: 3.0,
      status: 'FILLED',
      time: new Date(Date.now() - 300000).toLocaleTimeString(),
    },
    {
      id: 'ORD-002',
      symbol: 'ETH/USD',
      type: 'LIMIT',
      side: 'SELL',
      price: 45.50,
      quantity: 5.0,
      filled: 2.5,
      status: 'PARTIAL',
      time: new Date(Date.now() - 180000).toLocaleTimeString(),
    },
    {
      id: 'ORD-003',
      symbol: 'BTC/USD',
      type: 'LIMIT',
      side: 'BUY',
      price: 98.00,
      quantity: 2.0,
      filled: 0,
      status: 'PENDING',
      time: new Date(Date.now() - 60000).toLocaleTimeString(),
    },
  ]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'FILLED':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'PARTIAL':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED':
        return 'text-green-400';
      case 'CANCELLED':
        return 'text-red-400';
      case 'PARTIAL':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Order History</h2>
        </div>
        <button className="text-xs text-indigo-400 hover:text-indigo-300">
          View All
        </button>
      </div>

      <div className="space-y-2">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-slate-700/30 rounded-lg p-3 hover:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {getStatusIcon(order.status)}
                <span className="font-semibold text-sm">{order.symbol}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  order.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {order.side}
                </span>
                <span className="text-xs text-slate-400">{order.type}</span>
              </div>
              <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <div className="text-slate-400">Price</div>
                <div className="font-medium">${order.price.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-400">Quantity</div>
                <div className="font-medium">{order.quantity.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-400">Filled</div>
                <div className="font-medium">{order.filled.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-slate-400">Time</div>
                <div className="font-medium">{order.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
