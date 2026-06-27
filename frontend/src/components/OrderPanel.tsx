import { useState, useEffect } from 'react';
import { apiService } from '../services/ApiService';
import { OrderType, OrderSide } from '../types';
import { Send, AlertCircle, CheckCircle, Zap, Shield } from 'lucide-react';

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
  const [quickQuantities] = useState([1, 5, 10, 25, 50]);

  useEffect(() => {
    if (orderType === OrderType.LIMIT && currentPrice > 0) {
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
        symbol: currentSymbol,
        ...(orderType === OrderType.LIMIT && { price: parseFloat(price) }),
      };

      const result = await apiService.submitOrder(orderRequest);
      
      const tradesCount = result.trades?.length || 0;
      const orderStatus = result.order?.status || 'SUBMITTED';
      
      setSuccess(`✓ Order ${orderStatus}! ${tradesCount} trade(s) for ${currentSymbol}`);
      onOrderSubmit();

      setTimeout(() => {
        setSuccess('');
      }, 4000);
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

  const slippageWarning = orderType === OrderType.MARKET && parseFloat(quantity || '0') > 10;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg">
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <h2 className="text-base font-bold">Place Order</h2>
        </div>
        <span className="text-xs font-medium text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg">
          {currentSymbol}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Order Type */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/50 rounded-lg">
          <button
            type="button"
            onClick={() => setOrderType(OrderType.LIMIT)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${
              orderType === OrderType.LIMIT
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-ink'
            }`}
          >
            <Shield className="w-3 h-3 inline mr-1" />Limit
          </button>
          <button
            type="button"
            onClick={() => setOrderType(OrderType.MARKET)}
            className={`py-2 px-3 rounded-md text-sm font-medium transition-all ${
              orderType === OrderType.MARKET
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-ink'
            }`}
          >
            <Zap className="w-3 h-3 inline mr-1" />Market
          </button>
        </div>

        {/* Buy/Sell */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setOrderSide(OrderSide.BUY)}
            className={`py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
              orderSide === OrderSide.BUY
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/20'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-ink'
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setOrderSide(OrderSide.SELL)}
            className={`py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
              orderSide === OrderSide.SELL
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-ink'
            }`}
          >
            SELL
          </button>
        </div>

        {/* Price */}
        {orderType === OrderType.LIMIT && (
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Price (USD)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-ink text-sm font-mono"
              required
            />
          </div>
        )}

        {/* Quantity */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-ink text-sm font-mono"
            required
          />
          {/* Quick quantity buttons */}
          <div className="flex space-x-1 mt-1.5">
            {quickQuantities.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuantity(q.toString())}
                className="flex-1 text-xs py-1 bg-slate-700/50 hover:bg-slate-600 text-slate-300 rounded transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-slate-900/30 rounded-lg p-3 space-y-1.5 text-xs border border-slate-700/30">
          <div className="flex justify-between">
            <span className="text-slate-400">Est. Total:</span>
            <span className="font-bold text-ink">${estimatedValue.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Market Price:</span>
            <span className="font-mono text-slate-200">${currentPrice.toFixed(2)}</span>
          </div>
          {orderType === OrderType.LIMIT && (
            <div className="flex justify-between">
              <span className="text-slate-400">Limit vs Market:</span>
              <span className={`font-medium ${
                parseFloat(price) > currentPrice ? 'text-red-400' : 'text-green-400'
              }`}>
                {((parseFloat(price) - currentPrice) / currentPrice * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Slippage Warning */}
        {slippageWarning && (
          <div className="flex items-center space-x-2 text-yellow-400 text-xs bg-yellow-500/10 p-2 rounded-lg">
            <AlertCircle className="w-3 h-3" />
            <span>Large market order may experience slippage</span>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="flex items-center space-x-2 text-red-400 text-xs bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center space-x-2 text-green-400 text-xs bg-green-500/10 p-2.5 rounded-lg border border-green-500/20 animate-pulse">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-all transform active:scale-[0.98] ${
            orderSide === OrderSide.BUY
              ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 shadow-lg shadow-green-600/20'
              : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-600/20'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''} text-white`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            `${orderSide === OrderSide.BUY ? '🟢' : '🔴'} ${orderSide} ${orderType} — $${estimatedValue.toFixed(2)}`
          )}
        </button>
      </form>
    </div>
  );
}
