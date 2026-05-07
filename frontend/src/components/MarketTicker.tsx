import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Market {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: string;
  type: 'crypto' | 'stock';
}

interface MarketTickerProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

export default function MarketTicker({ currentSymbol, onSymbolChange }: MarketTickerProps) {
  const [markets, setMarkets] = useState<Market[]>([
    // Crypto
    { symbol: 'BTC/USD', name: 'Bitcoin', price: 99.78, change: -0.23, volume: '2.4M', type: 'crypto' },
    { symbol: 'ETH/USD', name: 'Ethereum', price: 45.32, change: 1.45, volume: '1.8M', type: 'crypto' },
    { symbol: 'SOL/USD', name: 'Solana', price: 125.67, change: 3.21, volume: '980K', type: 'crypto' },
    
    // Stocks
    { symbol: 'AAPL', name: 'Apple Inc.', price: 178.45, change: 2.15, volume: '52.3M', type: 'stock' },
    { symbol: 'GOOGL', name: 'Alphabet', price: 142.30, change: -0.87, volume: '28.1M', type: 'stock' },
    { symbol: 'MSFT', name: 'Microsoft', price: 415.20, change: 1.34, volume: '31.5M', type: 'stock' },
    { symbol: 'TSLA', name: 'Tesla', price: 248.50, change: -2.45, volume: '98.7M', type: 'stock' },
    { symbol: 'AMZN', name: 'Amazon', price: 178.90, change: 0.95, volume: '45.2M', type: 'stock' },
    { symbol: 'NVDA', name: 'NVIDIA', price: 875.30, change: 4.21, volume: '67.8M', type: 'stock' },
  ]);

  // Simulate price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMarkets(prev => prev.map(market => ({
        ...market,
        price: market.price * (1 + (Math.random() - 0.5) * 0.002),
        change: market.change + (Math.random() - 0.5) * 0.1,
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-800 border-b border-slate-700 overflow-hidden">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center space-x-6 overflow-x-auto scrollbar-hide">
          {markets.map((market) => (
            <button
              key={market.symbol}
              onClick={() => onSymbolChange(market.symbol)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg transition-all ${
                currentSymbol === market.symbol
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-700 text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold">{market.symbol}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      market.type === 'crypto' 
                        ? 'bg-purple-500/20 text-purple-300' 
                        : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {market.type === 'crypto' ? 'CRYPTO' : 'STOCK'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{market.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">${market.price.toFixed(2)}</div>
                  <div className={`text-xs flex items-center ${market.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {market.change >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Vol: {market.volume}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
