import { useState, useEffect } from 'react';
import { Bot, Play, Pause, Square, TrendingUp, TrendingDown, Brain, Shield, Zap, BarChart3, RefreshCw } from 'lucide-react';

interface BotStatus {
  isRunning: boolean;
  paused: boolean;
  capital: number;
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  pnlPercent: number;
  winRate: number;
  totalTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  drawdown: number;
  peakCapital: number;
  activeStrategies: string[];
  positions: Record<string, number>;
  recentTrades: any[];
}

const STRATEGY_INFO: Record<string, { name: string; icon: any; description: string; color: string }> = {
  'mean_reversion': { name: 'Mean Reversion', icon: TrendingDown, description: 'RSI oversold/overbought', color: 'text-blue-400' },
  'momentum': { name: 'Momentum', icon: TrendingUp, description: 'MACD trend following', color: 'text-green-400' },
  'breakout': { name: 'Breakout', icon: Zap, description: 'Bollinger Band breaks', color: 'text-yellow-400' },
  'market_making': { name: 'Market Making', icon: BarChart3, description: 'Spread capture', color: 'text-purple-400' },
};

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || 'https://algo-portal-final-1xvi.onrender.com';

export default function AIBotPanel() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${BACKEND}/api/bot/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      // Silent fail
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: 'start' | 'stop' | 'pause' | 'resume') => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${BACKEND}/api/bot/${action}`, { method: 'POST' });
      if (response.ok) {
        await fetchStatus();
      } else {
        setError(`Failed to ${action} bot`);
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
    setLoading(false);
  };

  const toggleStrategy = async (strategy: string) => {
    if (!status) return;
    const current = status.activeStrategies;
    const updated = current.includes(strategy)
      ? current.filter(s => s !== strategy)
      : [...current, strategy];

    try {
      await fetch(`${BACKEND}/api/bot/strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategies: updated }),
      });
      await fetchStatus();
    } catch (err) {}
  };

  if (!status) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5 shadow-xl">
        <div className="flex items-center space-x-2 mb-4">
          <Bot className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold">AI Trading Bot</h2>
        </div>
        <div className="text-center py-6 text-slate-500 text-xs">
          <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
          <p>Connecting to bot...</p>
        </div>
      </div>
    );
  }

  const pnlColor = status.totalPnL >= 0 ? 'text-green-400' : 'text-red-400';
  const isActive = status.isRunning && !status.paused;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-5 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className={`p-1.5 rounded-lg ${isActive ? 'bg-green-500/10' : 'bg-slate-700/50'}`}>
            <Bot className={`w-5 h-5 ${isActive ? 'text-green-400' : 'text-slate-400'}`} />
          </div>
          <div>
            <h2 className="text-base font-bold">AI Trading Bot</h2>
            <p className="text-[10px] text-slate-400">Multi-Strategy Autonomous System</p>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-bold ${
          isActive ? 'bg-green-500/15 text-green-400 animate-pulse' :
          status.paused ? 'bg-yellow-500/15 text-yellow-400' :
          'bg-slate-700 text-slate-400'
        }`}>
          {isActive ? '● LIVE' : status.paused ? '⏸ PAUSED' : '○ OFF'}
        </div>
      </div>

      {/* Controls */}
      <div className="flex space-x-2 mb-4">
        {!status.isRunning ? (
          <button
            onClick={() => handleAction('start')}
            disabled={loading}
            className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start</span>
          </button>
        ) : (
          <>
            <button
              onClick={() => handleAction(status.paused ? 'resume' : 'pause')}
              disabled={loading}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-500/30 rounded-lg text-xs font-medium transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{status.paused ? 'Resume' : 'Pause'}</span>
            </button>
            <button
              onClick={() => handleAction('stop')}
              disabled={loading}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium transition-all"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop</span>
            </button>
          </>
        )}
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className="text-[10px] text-slate-400">Total P&L</p>
          <p className={`text-sm font-bold font-mono ${pnlColor}`}>
            {status.totalPnL >= 0 ? '+' : ''}${status.totalPnL.toFixed(2)}
          </p>
          <p className={`text-[10px] ${pnlColor}`}>
            {status.pnlPercent >= 0 ? '+' : ''}{status.pnlPercent.toFixed(2)}%
          </p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className="text-[10px] text-slate-400">Win Rate</p>
          <p className="text-sm font-bold font-mono text-slate-200">{status.winRate.toFixed(1)}%</p>
          <p className="text-[10px] text-slate-400">{status.wins}W / {status.losses}L</p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className="text-[10px] text-slate-400">Capital</p>
          <p className="text-sm font-bold font-mono text-slate-200">${status.capital.toFixed(0)}</p>
          <p className="text-[10px] text-slate-400">Peak: ${status.peakCapital.toFixed(0)}</p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
          <p className="text-[10px] text-slate-400">Open Trades</p>
          <p className="text-sm font-bold font-mono text-indigo-300">{status.openTrades}</p>
          <p className={`text-[10px] ${status.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            Unreal: {status.unrealizedPnL >= 0 ? '+' : ''}${status.unrealizedPnL.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Active Strategies */}
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <Brain className="w-3.5 h-3.5 text-indigo-400" />
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Strategies</p>
        </div>
        <div className="space-y-1.5">
          {Object.entries(STRATEGY_INFO).map(([key, info]) => {
            const Icon = info.icon;
            const isActive = status.activeStrategies.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleStrategy(key)}
                className={`w-full flex items-center justify-between p-2 rounded-lg border transition-all text-left ${
                  isActive
                    ? 'bg-slate-700/30 border-slate-600/50'
                    : 'bg-slate-900/20 border-slate-700/20 opacity-50'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className={`w-3.5 h-3.5 ${isActive ? info.color : 'text-slate-500'}`} />
                  <div>
                    <p className="text-xs font-medium text-slate-200">{info.name}</p>
                    <p className="text-[10px] text-slate-500">{info.description}</p>
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-slate-600'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Open Positions */}
      {Object.entries(status.positions).some(([_, qty]) => qty !== 0) && (
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Bot Positions</p>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
            {Object.entries(status.positions)
              .filter(([_, qty]) => qty !== 0)
              .map(([symbol, qty]) => (
                <div key={symbol} className="flex items-center justify-between text-xs p-1.5 bg-slate-900/30 rounded">
                  <span className="font-medium text-slate-300">{symbol}</span>
                  <span className={qty > 0 ? 'text-green-400' : 'text-red-400'}>
                    {qty > 0 ? '+' : ''}{qty.toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Bot Trades */}
      {status.recentTrades.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-2">Recent AI Trades</p>
          <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
            {status.recentTrades.slice(0, 5).map((trade: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[10px] p-1.5 bg-slate-900/30 rounded">
                <div className="flex items-center space-x-1.5">
                  <span className={trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>
                    {trade.side}
                  </span>
                  <span className="text-slate-300">{trade.symbol}</span>
                  <span className="text-slate-500">×{trade.quantity}</span>
                </div>
                <div className="text-right">
                  {trade.pnl !== undefined ? (
                    <span className={trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-slate-400">${trade.entryPrice?.toFixed(2)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-[10px] mt-2">{error}</p>
      )}
    </div>
  );
}
