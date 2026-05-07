import { useState, useEffect } from 'react';
import { apiService } from '../services/ApiService';
import { OrderType, OrderSide } from '../types';
import { Send, AlertCircle, CheckCircle } from 'lucide-react';

interface OrderPanelProps {
  userId: string;
  onOrderSubmit: () => void;
  currentPrice: number;
  currentSymbol?: string;
}

export default function OrderPanel({ userId, onOrderSubmit, currentPrice, currentSymbol = 'BTC/USD' }: OrderPanelProps) {
  const [orderType, setOrderType] = useState<OrderType>(OrderType.LIMIT);
  const [orderSide, setOrderSide] = useState<OrderSide>(OrderSide.BUY);
  const [price, setPrice] = useState<string>(currentPrice.toFixed(2));
  const [quantity, setQuantity] = useState<string>('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // Update price when current price changes
  useEffect(() => {
    if (orderType === OrderType.LIMIT) {
      setPrice(currentPrice.toFixed(2));
    }
  }, [currentPrice, orderType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const orderRequest = {
        userId,
        type: orderType,
        side: orderSide,
        quantity: parseFloat(quantity),
        ...(orderType === OrderType.LIMIT && { price: parseFloat(price) }),
      };

      const result = await apiService.submitOrder(orderRequest);
      
      const tradesCount = result.trades?.length || 0;
      const orderStatus = result.order?.status || 'SUBMITTED';
      
      setSuccess(`✓ Order ${orderStatus}! ${tradesCount} trade(s) executed for ${currentSymbol}`);
      onOrderSubmit();

      // Reset form after 3 seconds
      setTimeout(() => {
        setSuccess('');
        setQuantity('1');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit order');
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  const estimatedValue = orderType === OrderType.LIMIT 
    ? parseFloat(price || '0') * parseFloat(quantity || '0')
    : currentPrice * parseFloat(quantity || '0');

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Send className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Place Order</h2>
        <span className="text-xs text-slate-400">({currentSymbol})</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium mb-2">Order Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrderType(OrderType.LIMIT)}
              className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                orderType === OrderType.LIMIT
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Limit
            </button>
            <button
              type="button"
              onClick={() => setOrderType(OrderType.MARKET)}
              className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                orderType === OrderType.MARKET
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Market
            </button>
          </div>
        </div>

        {/* Order Side */}
        <div>
          <label className="block text-sm font-medium mb-2">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOrderSide(OrderSide.BUY)}
              className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                orderSide === OrderSide.BUY
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setOrderSide(OrderSide.SELL)}
              className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                orderSide === OrderSide.SELL
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Price (for limit orders) */}
        {orderType === OrderType.LIMIT && (
          <div>
            <label className="block text-sm font-medium mb-2">Price ($)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
              required
            />
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium mb-2">Quantity</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white"
            required
          />
        </div>

        {/* Order Summary */}
        <div className="bg-slate-700/50 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Estimated Value:</span>
            <span className="font-medium text-white">
              ${estimatedValue.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Current Price:</span>
            <span className="font-medium text-white">
              ${currentPrice.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="flex items-center space-x-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center space-x-2 text-green-400 text-sm bg-green-500/10 p-3 rounded-lg border border-green-500/20">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-lg font-semibold transition-all ${
            orderSide === OrderSide.BUY
              ? 'bg-green-600 hover:bg-green-700 active:scale-95'
              : 'bg-red-600 hover:bg-red-700 active:scale-95'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''} text-white shadow-lg`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            `${orderSide} ${orderType}`
          )}
        </button>
      </form>
    </div>
  );
}
