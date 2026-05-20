import { useEffect, useState } from 'react';
import { wsService } from './services/WebSocketService';
import { apiService } from './services/ApiService';
import { OrderBook, Candle, Portfolio } from './types';
import Header from './components/Header';
import MarketTicker from './components/MarketTicker';
import CandlestickChart from './components/CandlestickChart';
import OrderBookWidget from './components/OrderBookWidget';
import OrderPanel from './components/OrderPanel';
import PortfolioWidget from './components/PortfolioWidget';
import RecentTrades from './components/RecentTrades';
import OrderHistory from './components/OrderHistory';
import AIBotPanel from './components/AIBotPanel';
import StatsBar from './components/StatsBar';

const USER_ID = 'USER_1';

function App() {
  const [connected, setConnected] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState('BTC/USD');
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] });
  const [candles, setCandles] = useState<Candle[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // Connect WebSocket
    wsService.connect().then(() => {
      setConnected(true);
    }).catch(error => {
      console.error('Failed to connect:', error);
    });

    // Subscribe to order book updates
    const handleOrderBook = (data: any) => {
      // Handle both symbol-specific and default updates
      if (data.symbol) {
        if (data.symbol === currentSymbol) {
          setOrderBook({ bids: data.bids || [], asks: data.asks || [] });
        }
      } else {
        setOrderBook(data);
      }
    };

    // Subscribe to candles
    const handleCandle = (data: any) => {
      const candleData = data.symbol ? data : data;
      if (data.symbol && data.symbol !== currentSymbol) return;
      
      setCandles(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex(c => c.timestamp === candleData.timestamp);
        
        if (existingIndex !== -1) {
          updated[existingIndex] = candleData;
        } else {
          updated.push(candleData);
        }
        
        return updated.slice(-100);
      });
    };

    wsService.on('orderbook', handleOrderBook);
    wsService.on('candle', handleCandle);

    // Fetch initial data
    const fetchInitialData = async () => {
      try {
        const [candlesData, portfolioData, statsData] = await Promise.all([
          apiService.getCandles(100, currentSymbol),
          apiService.getPortfolio(USER_ID),
          apiService.getStats(currentSymbol),
        ]);

        // Handle both array and object responses
        const candlesList = candlesData.candles || candlesData;
        if (Array.isArray(candlesList)) setCandles(candlesList);
        setPortfolio(portfolioData);
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();

    // Refresh portfolio
    const portfolioInterval = setInterval(async () => {
      try {
        const portfolioData = await apiService.getPortfolio(USER_ID);
        setPortfolio(portfolioData);
      } catch (error) {}
    }, 10000);

    // Refresh stats
    const statsInterval = setInterval(async () => {
      try {
        const statsData = await apiService.getStats(currentSymbol);
        setStats(statsData);
      } catch (error) {}
    }, 15000);

    return () => {
      wsService.off('orderbook', handleOrderBook);
      wsService.off('candle', handleCandle);
      clearInterval(portfolioInterval);
      clearInterval(statsInterval);
    };
  }, [currentSymbol]);

  const handleOrderSubmit = async () => {
    try {
      const portfolioData = await apiService.getPortfolio(USER_ID);
      setPortfolio(portfolioData);
    } catch (error) {}
  };

  const handleSymbolChange = (symbol: string) => {
    setCurrentSymbol(symbol);
    setCandles([]); // Clear candles for new symbol
    setOrderBook({ bids: [], asks: [] }); // Clear order book
  };

  const currentPrice = orderBook.asks?.[0]?.price || orderBook.bids?.[0]?.price || 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white">
      <Header connected={connected} />
      
      <MarketTicker currentSymbol={currentSymbol} onSymbolChange={handleSymbolChange} />
      
      <StatsBar stats={stats} currentPrice={currentPrice} />

      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Content - Chart & Trading */}
          <div className="lg:col-span-3 space-y-4">
            <CandlestickChart candles={candles} symbol={currentSymbol} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OrderPanel 
                userId={USER_ID} 
                onOrderSubmit={handleOrderSubmit} 
                currentPrice={currentPrice}
                currentSymbol={currentSymbol}
              />
              <OrderHistory userId={USER_ID} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <AIBotPanel />
            <PortfolioWidget portfolio={portfolio} currentPrice={currentPrice} />
            <OrderBookWidget orderBook={orderBook} />
            <RecentTrades symbol={currentSymbol} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-8 py-4">
        <div className="container mx-auto px-4 text-center text-xs text-slate-500">
          <p>Synthetic Exchange v2.0 — Real-Time Multi-Asset Trading Simulator</p>
          <p className="mt-1">Built with React, TypeScript, Node.js, WebSocket • Live market data via CoinGecko API</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
