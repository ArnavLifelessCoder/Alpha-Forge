import { Activity } from 'lucide-react';

interface HeaderProps {
  connected: boolean;
}

export default function Header({ connected }: HeaderProps) {
  return (
    <header className="bg-gradient-to-r from-indigo-900 to-purple-900 border-b border-indigo-700">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-2xl font-bold">S</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Synthetic Exchange</h1>
              <p className="text-sm text-indigo-300">Real-Time Trading Simulator</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
            <span className="text-sm">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <Activity className="w-5 h-5 text-indigo-300" />
          </div>
        </div>
      </div>
    </header>
  );
}
