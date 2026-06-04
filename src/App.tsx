import { useState } from 'react';
import { AgentRegistration } from './components/AgentRegistration';
import { Terminal } from './components/Terminal';
import { StatusDashboard } from './components/StatusDashboard';
import { ConnectionPanel } from './components/ConnectionPanel';

function App() {
  const [activeTab, setActiveTab] = useState<'registration' | 'terminal' | 'status' | 'connect'>('registration');

  return (
    <div className="min-h-screen bg-black text-gray-200 font-mono">
      {/* Top Bar */}
      <header className="border-b border-gray-800 bg-black">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 border-2 border-orange-500 flex items-center justify-center">
              <span className="text-orange-500 font-bold text-lg">&gt;_</span>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-orange-500">
                CLAWD TERMINAL
              </h1>
              <p className="text-xs text-gray-500">SOLANA // AGENT PROTOCOL</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-xl mx-8">
            <div className="flex items-center border border-gray-700 bg-gray-900 px-4 py-2">
              <span className="text-orange-500 mr-2">&gt;</span>
              <input
                type="text"
                placeholder="Search blockchain, tokens, agents..."
                className="flex-1 bg-transparent text-sm text-gray-300 outline-none placeholder-gray-600"
              />
              <span className="text-xs text-gray-500">GEMINI 1.5 FLASH</span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-green-500 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              LIVE
            </span>
            <button className="px-4 py-2 border border-gray-700 text-gray-400 text-sm hover:border-orange-500 hover:text-orange-500 transition-colors">
              ACCOUNT
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex h-[calc(100vh-60px)]">
        {/* Left Sidebar */}
        <aside className="w-56 border-r border-gray-800 bg-black">
          <nav className="p-4 space-y-2">
            {[
              { id: 'registration', label: 'AGENT REGISTRY' },
              { id: 'terminal', label: 'TERMINAL' },
              { id: 'status', label: 'SYSTEM STATUS' },
              { id: 'connect', label: 'CONNECT' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`w-full px-4 py-3 text-left text-sm tracking-wider transition-colors ${
                  activeTab === tab.id
                    ? 'bg-orange-500/10 text-orange-500 border-l-2 border-orange-500'
                    : 'text-gray-500 hover:text-gray-300 border-l-2 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Bottom Links */}
          <div className="absolute bottom-0 w-56 p-4 border-t border-gray-800">
            <div className="space-y-2 text-xs text-gray-600">
              <a href="#" className="block hover:text-gray-400">DOCUMENTATION</a>
              <a href="#" className="block hover:text-gray-400">GITHUB</a>
              <a href="#" className="block hover:text-gray-400">DISCORD</a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {activeTab === 'registration' && <AgentRegistration />}
          {activeTab === 'terminal' && <Terminal />}
          {activeTab === 'status' && <StatusDashboard />}
          {activeTab === 'connect' && <ConnectionPanel />}
        </main>
      </div>
    </div>
  );
}

export default App;
