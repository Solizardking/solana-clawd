import { useState, useEffect } from 'react';

interface StatusData {
  agentStatus: string;
  network: string;
  rpc: string;
  memory: string;
  registeredAgents: number;
  uptime: string;
}

export function StatusDashboard() {
  const [status] = useState<StatusData>({
    agentStatus: 'Active',
    network: 'Solana Mainnet',
    rpc: 'Helius',
    memory: 'Honcho v3',
    registeredAgents: 1,
    uptime: '99.9%',
  });

  const [prices, setPrices] = useState({ sol: 145.23, clawd: 0.00001234 });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPrices((prev) => ({
        sol: prev.sol + (Math.random() - 0.5) * 0.5,
        clawd: prev.clawd + (Math.random() - 0.5) * 0.0000001,
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-orange-500 tracking-wider">SYSTEM STATUS</h2>
          <p className="text-xs text-gray-500 mt-1">Real-time metrics for Solana Clawd</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono text-white">{time.toLocaleTimeString()}</div>
          <div className="text-xs text-gray-500">{time.toLocaleDateString()}</div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 tracking-wider">AGENT STATUS</span>
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </div>
          <div className="text-xl font-bold text-green-400">{status.agentStatus}</div>
          <div className="text-xs text-gray-600 mt-1">ERC-8004 Registry</div>
        </div>

        <div className="border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 tracking-wider">NETWORK</span>
            <span className="text-gray-400">[#]</span>
          </div>
          <div className="text-xl font-bold text-white">{status.network.split(' ')[0]}</div>
          <div className="text-xs text-gray-600 mt-1">{status.network}</div>
        </div>

        <div className="border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 tracking-wider">RPC PROVIDER</span>
            <span className="text-gray-400">[*]</span>
          </div>
          <div className="text-xl font-bold text-orange-400">{status.rpc}</div>
          <div className="text-xs text-gray-600 mt-1">DAS + WebSocket</div>
        </div>

        <div className="border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 tracking-wider">MEMORY</span>
            <span className="text-gray-400">[@]</span>
          </div>
          <div className="text-xl font-bold text-cyan-400">{status.memory}</div>
          <div className="text-xs text-gray-600 mt-1">3-Tier System</div>
        </div>
      </div>

      {/* Price Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="border border-gray-800 bg-gray-950 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-purple-500 flex items-center justify-center">
                <span className="text-purple-400">◎</span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">SOL</div>
                <div className="text-xs text-gray-500">Solana</div>
              </div>
            </div>
            <span className={`text-sm font-bold ${prices.sol > 145 ? 'text-green-400' : 'text-red-400'}`}>
              {prices.sol > 145 ? '▲' : '▼'}
            </span>
          </div>
          <div className="text-3xl font-bold text-white">${prices.sol.toFixed(2)}</div>
          <div className="text-xs text-gray-500 mt-1">Live via Jupiter</div>
        </div>

        <div className="border border-orange-500/30 bg-orange-500/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-orange-500 flex items-center justify-center">
                <span className="text-orange-400">$</span>
              </div>
              <div>
                <div className="text-sm font-bold text-white">$CLAWD</div>
                <div className="text-xs text-gray-500">Solana Clawd Token</div>
              </div>
            </div>
            <span className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">TOKEN</span>
          </div>
          <div className="text-3xl font-bold text-orange-400">${prices.clawd.toFixed(8)}</div>
          <div className="text-xs text-gray-500 mt-1">8cHz...RLApump</div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="border border-gray-800 p-6 mb-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">SYSTEM METRICS</h3>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div className="text-2xl font-bold text-white">{status.registeredAgents}</div>
            <div className="text-xs text-gray-500">Registered Agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{status.uptime}</div>
            <div className="text-xs text-gray-500">Uptime</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">31</div>
            <div className="text-xs text-gray-500">MCP Tools</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-cyan-400">5</div>
            <div className="text-xs text-gray-500">Agent Roles</div>
          </div>
        </div>
      </div>

      {/* OODA Loop Status */}
      <div className="border border-gray-800 p-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">OODA LOOP STATUS</h3>
        <div className="flex items-center justify-around">
          {['Observe', 'Orient', 'Decide', 'Act'].map((phase, index) => (
            <div key={phase} className="flex items-center">
              <div className="text-center">
                <div className="w-14 h-14 border-2 border-orange-500/50 flex items-center justify-center mb-2 bg-orange-500/10">
                  <span className="text-lg font-bold text-orange-400">{phase[0]}</span>
                </div>
                <span className="text-xs text-gray-400 tracking-wider">{phase.toUpperCase()}</span>
              </div>
              {index < 3 && (
                <div className="w-8 h-0.5 bg-gradient-to-r from-orange-500 to-cyan-500 mx-2"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
