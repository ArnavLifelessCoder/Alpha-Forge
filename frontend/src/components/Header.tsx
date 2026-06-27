import { Wifi, WifiOff, BarChart3, Globe, ExternalLink, PieChart, LineChart, Brain } from 'lucide-react';

export type AppView = 'terminal' | 'ml';

interface HeaderProps {
  connected: boolean;
  view: AppView;
  onViewChange: (v: AppView) => void;
}

export default function Header({ connected, view, onViewChange }: HeaderProps) {
  return (
    <header className="bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              {connected && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-slate-900 animate-pulse"></div>
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-ink to-brand bg-clip-text text-transparent">
                AlphaForge
              </h1>
              <p className="text-[10px] text-slate-400 -mt-0.5 flex items-center space-x-1">
                <Globe className="w-2.5 h-2.5" />
                <span>MLOps Trading Intelligence Platform</span>
              </p>
            </div>
          </div>

          {/* Nav + Status */}
          <div className="flex items-center space-x-3">
            {/* View tabs */}
            <div className="flex items-center bg-slate-800/80 rounded-lg border border-slate-700/50 p-0.5">
              <button
                onClick={() => onViewChange('terminal')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'terminal' ? 'bg-indigo-600/30 text-indigo-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <LineChart className="w-3.5 h-3.5" />
                <span>Terminal</span>
              </button>
              <button
                onClick={() => onViewChange('ml')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === 'ml' ? 'bg-indigo-600/30 text-indigo-200' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>ML Intelligence</span>
              </button>
            </div>

            {/* Analytics Dashboard Button */}
            <a
              href="http://localhost:8501"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 hover:text-purple-200 border border-purple-500/30 hover:border-purple-400/50 rounded-lg text-xs font-medium transition-all duration-200 group"
            >
              <PieChart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Analytics</span>
              <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
            </a>

            {/* Connection Status */}
            <div className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              connected
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {connected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span className="hidden sm:inline">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span className="hidden sm:inline">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
