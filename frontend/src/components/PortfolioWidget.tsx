import { Portfolio } from '../types';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';

interface PortfolioWidgetProps {
  portfolio: Portfolio | null;
  currentPrice: number;
}

export default function PortfolioWidget({ portfolio }: PortfolioWidgetProps) {
  if (!portfolio) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 shadow-xl">
        <div className="flex items-center space-x-2 mb-3">
          <Wallet className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold">Portfolio</h2>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-slate-700/50 rounded"></div>
          <div className="h-4 bg-slate-700/50 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const totalPnL = portfolio.totalPnL || 0;
  const pnlPercent = portfolio.pnlPercent || 0;
  const isProfitable = totalPnL >= 0;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700/50 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg">
            <Wallet className="w-4 h-4 text-indigo-400" />
          </div>
          <h2 className="text-sm font-bold">Portfolio</h2>
        </div>
        <PieChart className="w-4 h-4 text-slate-500" />
      </div>

      {/* Total Value */}
      <div className="mb-4">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Total Value</p>
        <p className="text-2xl font-bold text-white">
          ${(portfolio.totalValue || 100000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`flex items-center space-x-1 mt-1 text-xs ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
          {isProfitable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span className="font-medium">
            {isProfitable ? '+' : ''}{totalPnL.toFixed(2)} ({pnlPercent.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Cash & P&L Breakdown */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400 flex items-center">
            <DollarSign className="w-3 h-3 mr-1" />Cash
          </span>
          <span className="font-mono font-medium text-slate-200">
            ${(portfolio.cash || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Realized P&L</span>
          <span className={`font-mono font-medium ${(portfolio.realizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(portfolio.realizedPnL || 0) >= 0 ? '+' : ''}${(portfolio.realizedPnL || 0).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Unrealized P&L</span>
          <span className={`font-mono font-medium ${(portfolio.unrealizedPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(portfolio.unrealizedPnL || 0) >= 0 ? '+' : ''}${(portfolio.unrealizedPnL || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Positions */}
      {portfolio.positions && portfolio.positions.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2 font-medium">Open Positions</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
            {portfolio.positions.map((pos: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-2 bg-slate-700/20 rounded-lg border border-slate-700/30">
                <div>
                  <span className="text-xs font-semibold text-slate-200">{pos.symbol}</span>
                  <span className={`text-[10px] ml-1.5 ${pos.quantity > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {pos.quantity > 0 ? 'LONG' : 'SHORT'}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-slate-200">{Math.abs(pos.quantity).toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400">
                    ${(pos.marketValue || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
