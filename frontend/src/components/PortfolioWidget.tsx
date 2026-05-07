import { Portfolio } from '../types';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';

interface PortfolioWidgetProps {
  portfolio: Portfolio | null;
  currentPrice: number;
}

export default function PortfolioWidget({ portfolio, currentPrice }: PortfolioWidgetProps) {
  if (!portfolio) {
    return (
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Wallet className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold">Portfolio</h2>
        </div>
        <div className="text-center text-slate-400 py-8">
          Loading portfolio...
        </div>
      </div>
    );
  }

  const pnlPositive = portfolio.totalPnL >= 0;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Wallet className="w-5 h-5 text-indigo-400" />
        <h2 className="text-lg font-semibold">Portfolio</h2>
      </div>

      <div className="space-y-4">
        {/* Total Value */}
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Total Value</div>
          <div className="text-2xl font-bold">${portfolio.totalValue.toFixed(2)}</div>
          <div className={`flex items-center space-x-1 text-sm mt-1 ${pnlPositive ? 'text-green-400' : 'text-red-400'}`}>
            {pnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>
              {pnlPositive ? '+' : ''}{portfolio.totalPnL.toFixed(2)} ({portfolio.pnlPercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Cash Balance */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-400">Cash Balance</span>
            <span className="font-medium">${portfolio.cash.toFixed(2)}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full"
              style={{ width: `${(portfolio.cash / portfolio.initialCapital) * 100}%` }}
            />
          </div>
        </div>

        {/* Positions */}
        <div>
          <div className="text-sm text-slate-400 mb-2">Positions</div>
          {portfolio.positions.length > 0 ? (
            <div className="space-y-2">
              {portfolio.positions.map((position, idx) => (
                <div key={idx} className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{position.symbol}</div>
                      <div className="text-xs text-slate-400">
                        {position.quantity > 0 ? 'Long' : 'Short'} {Math.abs(position.quantity).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${position.marketValue.toFixed(2)}</div>
                      <div className="text-xs text-slate-400">
                        @ ${currentPrice.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-4 text-sm">
              No open positions
            </div>
          )}
        </div>

        {/* P&L Breakdown */}
        <div className="border-t border-slate-700 pt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Realized P&L</span>
            <span className={portfolio.realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
              ${portfolio.realizedPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Unrealized P&L</span>
            <span className={portfolio.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}>
              ${portfolio.unrealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
