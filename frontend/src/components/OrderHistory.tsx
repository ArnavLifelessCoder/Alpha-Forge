import { useState, useEffect } from 'react';
import { Clock, CheckCircle, RefreshCw } from 'lucide-react';
import { apiService } from '../services/ApiService';
import { wsService } from '../services/WebSocketService';

interface OrderHistoryItem {
  id: string;
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  timestamp: number;
  buyUserId?: string;
  sellUserId?: string;
}

interface OrderHistoryProps {
  userId?: string;
}

export default function OrderHistory({ userId = 'USER_1' }: OrderHistoryProps) {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await apiService.getUserOrders(userId);
      if (Array.isArray(data)) {
        setOrders(data.slice(0, 20));
      }
    } catch (error) {
      // Silent fail
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    // Listen for order updates
    const handleOrderUpdate = () => {
      fetchOrders();
    };

    wsService.on('order_update', handleOrderUpdate);
    wsService.on('trade', handleOrderUpdate);

    // Poll every 5 seconds
    const interval = setInterval(fetchOrders, 5000);

    return () => {
      wsService.off('order_update', handleOrderUpdate);
      wsService.off('trade', handleOrderUpdate);
      clearInterval(interval);
    };
  }, [userId]);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold">My Trade History</h2>
        </div>
        <button 
          onClick={fetchOrders}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-1.5">
        {orders.length > 0 ? (
          <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar">
            {orders.map((order, index) => {
              const isBuyer = order.buyUserId === userId;
              const side = isBuyer ? 'BUY' : 'SELL';
              
              return (
                <div
                  key={order.id || `order-${index}`}
                  className="bg-slate-700/20 rounded-lg p-2.5 hover:bg-slate-700/40 transition-colors border border-slate-700/30"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      <span className="font-semibold text-xs">{order.symbol || 'BTC/USD'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        side === 'BUY' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {side}
                      </span>
                    </div>
                    <span className="text-[10px] text-green-400 font-medium">FILLED</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <div className="text-slate-500">Price</div>
                      <div className="font-mono font-medium text-slate-200">${order.price?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Qty</div>
                      <div className="font-mono font-medium text-slate-200">{order.quantity?.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Time</div>
                      <div className="font-medium text-slate-300">
                        {order.timestamp ? new Date(order.timestamp).toLocaleTimeString() : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 text-xs">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No trades yet</p>
            <p className="mt-1 text-slate-600">Place an order to start trading</p>
          </div>
        )}
      </div>
    </div>
  );
}
