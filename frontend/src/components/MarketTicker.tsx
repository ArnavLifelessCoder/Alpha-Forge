import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wifi } from 'lucide-react';
import { wsService } from '../services/WebSocketService';
import { apiService } from '../services/ApiService';

interface MarketQuote {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: number;
}

interface MarketTickerProps {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}

export default function MarketTicker({ currentSymbol, onSymbolChange }: MarketTickerProps) {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    // Fetch initial market data
    const fetchData = async () => {
      try {
        const data = await apiService.getMarketData();
        if (Array.isArray(data)) {
          setQuotes(data);
          setIsLive(true);
        }
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };

    fetchData();

    // Subscribe to real-time market data updates
    const handleMarketData = (data: MarketQuote[]) => {
      if (Array.isArray(data)) {
        setQuotes(data);
        setIsLive(true);
      }
    };

    wsService.on('market_data', handleMarketData);

    // Fallback polling if WS doesn't deliver
    const pollInterval = setInterval(fetchData, 5000);

    return () => {
      wsService.off('market_data', handleMarketData);
      clearInterval(pollInterval);
    };
  }, []);

  const formatVolume = (vol: number): string => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  const formatPrice = (price: number): string => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const getType = (symbol: string): 'crypto' | 'stock' => {
    return symbol.includes('/') ? 'crypto' : 'stock';
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50 overflow-hidden">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center space-x-2 mb-2">
          <Wifi className={`w-3 h-3 ${isLive ? 'text-green-400' : 'text-yellow-400'}`} />
          <span className="text-xs text-slate-400">
            {isLive ? 'Live Market Data' : 'Connecting...'}
          </span>
          {isLive && <span className="text-xs text-green-400 animate-pulse">●</span>}
        </div>
        
        <div className="flex items-center space-x-3 overflow-x-auto scrollbar-hide pb-1">
          {quotes.map((quote) => {
            const type = getType(quote.symbol);
            const isSelected = currentSymbol === quote.symbol;
            
            return (
              <button
                key={quote.symbol}
                onClick={() => onSymbolChange(quote.symbol)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg transition-all duration-200 ${
                  isSelected
                    ? 'bg-indigo-600/80 text-white ring-1 ring-indigo-400/50 shadow-lg shadow-indigo-500/20'
                    : 'hover:bg-slate-700/60 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-[160px]">
                  <div className="text-left">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-sm font-bold">{quote.symbol}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                        type === 'crypto' 
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}>
                        {type === 'crypto' ? 'CRYPTO' : 'STOCK'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-auto">
                    <div className="text-sm font-bold">${formatPrice(quote.price)}</div>
                    <div className={`text-xs flex items-center justify-end ${
                      quote.changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {quote.changePercent24h >= 0 
                        ? <TrendingUp className="w-3 h-3 mr-0.5" /> 
                        : <TrendingDown className="w-3 h-3 mr-0.5" />
                      }
                      {quote.changePercent24h >= 0 ? '+' : ''}{quote.changePercent24h.toFixed(2)}%
                    </div>
                  </div>
                </div>
                {quote.volume24h > 0 && (
                  <div className="text-[10px] text-slate-400 text-right mt-0.5">
                    Vol: ${formatVolume(quote.volume24h)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
