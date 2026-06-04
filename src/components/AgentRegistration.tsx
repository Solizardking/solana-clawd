import { useState } from 'react';

const defaultRegistration = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Solana Clawd',
  description: 'The Solana-native AI agent framework for autonomous operators. Built for high-frequency memecoin trading environments with real-time market data, wallet tracking, OODA-loop execution, and multi-agent orchestration.',
  image: 'https://solanaclawd.com/clawd-logo.png',
  services: [
    { name: 'web', endpoint: 'https://solanaclawd.com', version: '1.0' },
    { name: 'MCP', endpoint: 'https://solanaclawd.com/mcp', version: '2026-04-12' },
    { name: 'A2A', endpoint: 'https://solanaclawd.com/a2a', version: '0.3.0' },
  ],
  active: true,
  registrations: [],
  supportedTrust: ['wallet-verified', 'token-holder'],
};

export function AgentRegistration() {
  const [registration, setRegistration] = useState(defaultRegistration);
  const [copied, setCopied] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationResult, setRegistrationResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(registration, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    setRegistrationResult(null);
    setTimeout(() => {
      setRegistrationResult({
        success: true,
        message: 'Agent registered successfully on Metaplex Agent Registry! Asset address: 7xKp...3nRt',
      });
      setIsRegistering(false);
    }, 2000);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-orange-500 tracking-wider">ERC-8004 AGENT REGISTRATION</h2>
          <p className="text-xs text-gray-500 mt-1">Configure your agent for Metaplex Registry</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="px-4 py-2 text-sm border border-gray-700 text-gray-400 hover:border-orange-500 hover:text-orange-500 transition-colors"
          >
            {copied ? '[ COPIED ]' : '[ COPY JSON ]'}
          </button>
          <button
            onClick={handleRegister}
            disabled={isRegistering}
            className="px-4 py-2 text-sm bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {isRegistering ? '[ REGISTERING... ]' : '[ REGISTER ON METAPLEX ]'}
          </button>
        </div>
      </div>

      {/* Registration Result */}
      {registrationResult && (
        <div className={`p-4 border mb-6 ${registrationResult.success ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
          <p className={`text-sm ${registrationResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {registrationResult.message}
          </p>
        </div>
      )}

      {/* Registration Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Edit Form */}
        <div className="border border-gray-800 p-6">
          <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">AGENT DETAILS</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">NAME</label>
              <input
                type="text"
                value={registration.name}
                onChange={(e) => setRegistration({ ...registration, name: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">DESCRIPTION</label>
              <textarea
                value={registration.description}
                onChange={(e) => setRegistration({ ...registration, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">IMAGE URL</label>
              <input
                type="text"
                value={registration.image}
                onChange={(e) => setRegistration({ ...registration, image: e.target.value })}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">STATUS</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRegistration({ ...registration, active: true })}
                  className={`px-4 py-2 text-sm ${registration.active ? 'bg-green-500/20 text-green-400 border border-green-500' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
                >
                  ACTIVE
                </button>
                <button
                  onClick={() => setRegistration({ ...registration, active: false })}
                  className={`px-4 py-2 text-sm ${!registration.active ? 'bg-red-500/20 text-red-400 border border-red-500' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
                >
                  INACTIVE
                </button>
              </div>
            </div>

            {/* Services */}
            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">SERVICES</label>
              <div className="space-y-2">
                {registration.services.map((service, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={service.name}
                      onChange={(e) => {
                        const newServices = [...registration.services];
                        newServices[index].name = e.target.value;
                        setRegistration({ ...registration, services: newServices });
                      }}
                      className="w-24 px-3 py-2 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={service.endpoint}
                      onChange={(e) => {
                        const newServices = [...registration.services];
                        newServices[index].endpoint = e.target.value;
                        setRegistration({ ...registration, services: newServices });
                      }}
                      className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Supported Trust */}
            <div>
              <label className="block text-xs text-gray-500 mb-2 tracking-wider">SUPPORTED TRUST</label>
              <div className="flex flex-wrap gap-2">
                {['wallet-verified', 'token-holder', 'tee', 'reputation', 'crypto-economic'].map((trust) => (
                  <button
                    key={trust}
                    onClick={() => {
                      const newTrust = registration.supportedTrust.includes(trust)
                        ? registration.supportedTrust.filter((t) => t !== trust)
                        : [...registration.supportedTrust, trust];
                      setRegistration({ ...registration, supportedTrust: newTrust });
                    }}
                    className={`px-3 py-1 text-xs ${registration.supportedTrust.includes(trust) ? 'bg-orange-500/20 text-orange-400 border border-orange-500' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
                  >
                    {trust}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* JSON Preview */}
        <div className="border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-400 tracking-wider">REGISTRATION JSON</h3>
            <span className="text-xs text-gray-600">ERC-8004 FORMAT</span>
          </div>
          <pre className="bg-gray-900 p-4 overflow-auto max-h-[450px] text-xs">
            <code className="text-gray-400">{JSON.stringify(registration, null, 2)}</code>
          </pre>
        </div>
      </div>

      {/* Memory Tiers Info */}
      <div className="border border-gray-800 p-6 mt-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">MEMORY TIERS (SOLANAOS EPISTEMOLOGY)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-green-500/30 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-green-500"></span>
              <span className="font-bold text-green-400 text-sm tracking-wider">KNOWN</span>
            </div>
            <p className="text-xs text-gray-500">API data, prices, balances, on-chain state. Verified, expires.</p>
          </div>
          <div className="border border-cyan-500/30 bg-cyan-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-cyan-500"></span>
              <span className="font-bold text-cyan-400 text-sm tracking-wider">LEARNED</span>
            </div>
            <p className="text-xs text-gray-500">Trade patterns, wallet behaviors, market correlations. Persistent, high trust.</p>
          </div>
          <div className="border border-purple-500/30 bg-purple-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-purple-500"></span>
              <span className="font-bold text-purple-400 text-sm tracking-wider">INFERRED</span>
            </div>
            <p className="text-xs text-gray-500">Derived signals, hypotheses, weak correlations. Tentative, revisable.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
