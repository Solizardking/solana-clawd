import { useState } from 'react';

const commands = [
  { name: 'connect', description: 'Connect to solanaclawd.com' },
  { name: 'status', description: 'Check agent status' },
  { name: 'agents', description: 'List registered agents' },
  { name: 'wallet', description: 'View wallet info' },
  { name: 'prices', description: 'Get live token prices' },
  { name: 'register', description: 'Register on Metaplex' },
];

interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'success';
  content: string;
}

export function Terminal() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalLine[]>([
    { type: 'output', content: 'CLAWD TERMINAL v1.0' },
    { type: 'output', content: 'Type "help" for available commands' },
    { type: 'output', content: '' },
  ]);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleCommand = async (cmd: string) => {
    const trimmedCmd = cmd.trim().toLowerCase();

    setHistory((prev) => [...prev, { type: 'input', content: `> ${cmd}` }]);
    setInput('');
    setIsExecuting(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    switch (trimmedCmd) {
      case 'help':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: 'Available commands:' },
          ...commands.map((c) => ({ type: 'output' as const, content: `  ${c.name.padEnd(12)} ${c.description}` })),
          { type: 'output', content: '' },
        ]);
        break;
      case 'connect':
        setHistory((prev) => [
          ...prev,
          { type: 'success', content: '[OK] Connecting to solanaclawd.com...' },
          { type: 'success', content: '[OK] Connected successfully!' },
          { type: 'output', content: '' },
        ]);
        break;
      case 'status':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: 'Agent Status: Active' },
          { type: 'output', content: 'Network: Solana Mainnet' },
          { type: 'output', content: 'RPC: Helius' },
          { type: 'output', content: 'Memory: Honcho v3' },
          { type: 'output', content: '' },
        ]);
        break;
      case 'agents':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: 'Registered Agents:' },
          { type: 'output', content: '  - Solana Clawd (solana-clawd) [ACTIVE]' },
          { type: 'output', content: '' },
        ]);
        break;
      case 'wallet':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: 'Wallet: Not connected' },
          { type: 'output', content: 'Connect via Phantom wallet to view details' },
          { type: 'output', content: '' },
        ]);
        break;
      case 'prices':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: 'Live Token Prices:' },
          { type: 'output', content: '  SOL: $145.23' },
          { type: 'output', content: '  $CLAWD: $0.00001234' },
          { type: 'output', content: '  USDC: $1.00' },
          { type: 'output', content: '' },
        ]);
        break;
      case 'register':
        setHistory((prev) => [
          ...prev,
          { type: 'output', content: '[...] Registering on Metaplex Agent Registry...' },
          { type: 'success', content: '[OK] Registration complete!' },
          { type: 'output', content: '  Asset: 7xKp...3nRt' },
          { type: 'output', content: '  View at: metaplex.com/agent/7xKp...3nRt' },
          { type: 'output', content: '' },
        ]);
        break;
      case '':
        break;
      default:
        setHistory((prev) => [
          ...prev,
          { type: 'error', content: `[ERROR] Command not found: ${trimmedCmd}` },
          { type: 'output', content: 'Type "help" for available commands' },
          { type: 'output', content: '' },
        ]);
    }

    setIsExecuting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isExecuting) {
      handleCommand(input);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-orange-500 tracking-wider">TERMINAL</h2>
        <p className="text-xs text-gray-500 mt-1">Execute commands to interact with solanaclawd.com</p>
      </div>

      {/* Quick Commands */}
      <div className="flex flex-wrap gap-2 mb-4">
        {commands.map((cmd) => (
          <button
            key={cmd.name}
            onClick={() => handleCommand(cmd.name)}
            disabled={isExecuting}
            className="px-3 py-1.5 text-xs border border-gray-700 bg-gray-900 hover:border-orange-500 hover:text-orange-500 text-gray-400 transition-colors disabled:opacity-50"
          >
            {cmd.name}
          </button>
        ))}
      </div>

      {/* Terminal */}
      <div className="border border-gray-800 bg-black">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 bg-red-500"></span>
            <span className="w-3 h-3 bg-yellow-500"></span>
            <span className="w-3 h-3 bg-green-500"></span>
          </div>
          <span className="ml-2 text-xs text-gray-500">clawd@solanaclawd:~$</span>
        </div>

        {/* Terminal Content */}
        <div className="p-4 h-[350px] overflow-y-auto font-mono text-xs">
          {history.map((line, index) => (
            <div
              key={index}
              className={`${
                line.type === 'input'
                  ? 'text-orange-400'
                  : line.type === 'error'
                  ? 'text-red-400'
                  : line.type === 'success'
                  ? 'text-green-400'
                  : 'text-gray-400'
              }`}
            >
              {line.content}
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border-t border-gray-800">
          <span className="text-orange-500 font-mono">$</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            disabled={isExecuting}
            className="flex-1 bg-transparent text-white font-mono text-sm focus:outline-none placeholder-gray-600"
          />
        </div>
      </div>

      {/* Command Reference */}
      <div className="border border-gray-800 p-6 mt-6">
        <h3 className="text-sm font-bold text-gray-400 tracking-wider mb-4">COMMAND REFERENCE</h3>
        <div className="grid grid-cols-2 gap-3">
          {commands.map((cmd) => (
            <div key={cmd.name} className="flex items-start gap-3">
              <code className="px-2 py-1 bg-gray-900 text-orange-400 border border-gray-700 text-xs">{cmd.name}</code>
              <span className="text-xs text-gray-500">{cmd.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
