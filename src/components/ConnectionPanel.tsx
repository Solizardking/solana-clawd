import { useState } from 'react';

export function ConnectionPanel() {
  const [endpoint, setEndpoint] = useState('https://solanaclawd.com');
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setIsConnecting(true);
    setConnectionStatus('connecting');
    setError('');

    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (endpoint && endpoint.startsWith('https://')) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('error');
      setError('Invalid endpoint URL. Must start with https://');
    }

    setIsConnecting(false);
  };

  const handleDisconnect = () => {
    setConnectionStatus('idle');
    setEndpoint('https://solanaclawd.com');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-orange-500 tracking-wider">CONNECT TO SOLANACLAWD.COM</h2>
        <p className="text-xs text-gray-500 mt-1">Configure your connection to the agent network</p>
      </div>

      {/* Connection Form */}
      <div className="border border-gray-800 p-6 max-w-xl">
        <div className="space-y-4">
          {/* Endpoint */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 tracking-wider">API ENDPOINT</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={connectionStatus === 'connected'}
              placeholder="https://solanaclawd.com"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 tracking-wider">API KEY (OPTIONAL)</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={connectionStatus === 'connected'}
              placeholder="Enter your API key"
              className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none disabled:opacity-50"
            />
            <p className="mt-2 text-xs text-gray-600">
              Your API key is stored locally and never sent to third parties.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 border border-red-500/30 bg-red-500/10">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Connect Button */}
          <div className="flex gap-3 pt-2">
            {connectionStatus === 'connected' ? (
              <button
                onClick={handleDisconnect}
                className="px-6 py-3 text-sm border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                [ DISCONNECT ]
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting || !endpoint}
                className="px-6 py-3 text-sm bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors disabled:opacity-50"
              >
                {isConnecting ? '[ CONNECTING... ]' : '[ CONNECT ]'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="border border-gray-800 p-6 max-w-xl mt-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">CONNECTION STATUS</h3>

        <div className="space-y-3">
          {/* Status Indicator */}
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 ${
              connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-600'
            }`}></div>
            <span className="text-sm text-white uppercase tracking-wider">{connectionStatus}</span>
          </div>

          {/* Connection Details */}
          {connectionStatus === 'connected' && (
            <div className="space-y-2 text-xs border-t border-gray-800 pt-3 mt-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Endpoint</span>
                <span className="text-white">{endpoint}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Protocol</span>
                <span className="text-orange-400">ERC-8004</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Transport</span>
                <span className="text-orange-400">HTTPS + WebSocket</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Connect Options */}
      <div className="border border-gray-800 p-6 max-w-xl mt-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">QUICK CONNECT</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setEndpoint('https://solanaclawd.com'); handleConnect(); }}
            disabled={connectionStatus === 'connected'}
            className="p-4 border border-gray-700 bg-gray-900 hover:border-orange-500 text-left transition-colors disabled:opacity-50 disabled:hover:border-gray-700"
          >
            <div className="text-sm font-bold text-white">MAINNET</div>
            <div className="text-xs text-gray-500 mt-1">solanaclawd.com</div>
          </button>
          <button
            onClick={() => { setEndpoint('https://dev.solanaclawd.com'); handleConnect(); }}
            disabled={connectionStatus === 'connected'}
            className="p-4 border border-gray-700 bg-gray-900 hover:border-orange-500 text-left transition-colors disabled:opacity-50 disabled:hover:border-gray-700"
          >
            <div className="text-sm font-bold text-white">DEVNET</div>
            <div className="text-xs text-gray-500 mt-1">dev.solanaclawd.com</div>
          </button>
        </div>
      </div>

      {/* Capabilities */}
      <div className="border border-gray-800 p-6 max-w-xl mt-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">CONNECTED CAPABILITIES</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'Solana RPC', status: 'active' },
            { name: 'Helius DAS', status: 'active' },
            { name: 'Jupiter Price', status: 'active' },
            { name: 'Metaplex Registry', status: 'active' },
            { name: 'Honcho Memory', status: 'active' },
            { name: 'Firecrawl Web', status: 'active' },
          ].map((cap) => (
            <div key={cap.name} className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500"></span>
              <span className="text-xs text-gray-400">{cap.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
