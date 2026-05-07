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
import StatsBar from './components/StatsBar';

const USER_ID = 'USER_1'; // Default user

function App() {
  const [connected, setConnected] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState('BTC/USD');
  const [orderBook, setOrderBook] = useState<OrderBook>({ bids: [], asks: [] });
  const [candles, setCandles] = useState<Candle[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // Connect to WebSocket
    wsService.connect().then(() => {
      setConnected(true);
    }).catch(error => {
      console.error('Failed to connect:', error);
    });

    // Subscribe to order book updates
    const handleOrderBook = (data: OrderBook) => {
      setOrderBook(data);
    };

    // Subscribe to candles
    const handleCandle = (data: Candle) => {
      setCandles(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex(c => c.timestamp === data.timestamp);
        
        if (existingIndex !== -1) {
          updated[existingIndex] = data;
        } else {
          updated.push(data);
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
          apiService.getCandles(100),
          apiService.getPortfolio(USER_ID),
          apiService.getStats(),
        ]);

        setCandles(candlesData);
        setPortfolio(portfolioData);
        setStats(statsData);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();

    // Refresh portfolio periodically
    const portfolioInterval = setInterval(async () => {
      try {
        const portfolioData = await apiService.getPortfolio(USER_ID);
        setPortfolio(portfolioData);
      } catch (error) {
        console.error('Error refreshing portfolio:', error);
      }
    }, 2000);

    // Refresh stats periodically
    const statsInterval = setInterval(async () => {
      try {
        const statsData = await apiService.getStats();
        setStats(statsData);
      } catch (error) {
        console.error('Error refreshing stats:', error);
      }
    }, 5000);

    return () => {
      wsService.off('orderbook', handleOrderBook);
      wsService.off('candle', handleCandle);
      clearInterval(portfolioInterval);
      clearInterval(statsInterval);
    };
  }, []);

  const handleOrderSubmit = async () => {
    // Refresh portfolio after order
    try {
      const portfolioData = await apiService.getPortfolio(USER_ID);
      setPortfolio(portfolioData);
    } catch (error) {
      console.error('Error refreshing portfolio:', error);
    }
  };

  const currentPrice = orderBook.asks[0]?.price || orderBook.bids[0]?.price || 100;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Header connected={connected} />
      
      <MarketTicker currentSymbol={currentSymbol} onSymbolChange={setCurrentSymbol} />
      
      <StatsBar stats={stats} currentPrice={currentPrice} />

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Chart and Order Panel */}
          <div className="lg:col-span-3 space-y-6">
            <CandlestickChart candles={candles} />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <OrderPanel 
                userId={USER_ID} 
                onOrderSubmit={handleOrderSubmit} 
                currentPrice={currentPrice}
                currentSymbol={currentSymbol}
              />
              <OrderHistory />
            </div>
          </div>

          {/* Right Column - Order Book, Portfolio, Trades */}
          <div className="space-y-6">
            <PortfolioWidget portfolio={portfolio} currentPrice={currentPrice} />
            <OrderBookWidget orderBook={orderBook} />
            <RecentTrades />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
