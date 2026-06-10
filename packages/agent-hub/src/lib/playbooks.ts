export interface SpawnPlaybook {
  id: string;
  name: string;
  runtime: "agentwallet" | "box" | "cloudflare";
  category: "research" | "payments" | "trading" | "wallet" | "orchestration" | "companions";
  summary: string;
  exampleFile: string;
  templateHint: string;
  characterHint: string;
  mission: string;
  x402: boolean;
}

export const SPAWN_PLAYBOOKS: SpawnPlaybook[] = [
  {
    id: "auto-research",
    name: "Auto Research Broker",
    runtime: "cloudflare",
    category: "research",
    summary: "Karpathy-style self-improving research agents with priced endpoints and source tracking.",
    exampleFile: "examples/auto-research-client.ts",
    templateHint: "solana-x402-research-broker",
    characterHint: "solana-gemini-deep-researcher",
    mission: "Stand up a paid research agent that can learn, share findings, and recalibrate from outcomes.",
    x402: true,
  },
  {
    id: "blockchain-buddies",
    name: "Blockchain Buddies Swarm",
    runtime: "box",
    category: "companions",
    summary: "Spawn collectible trading companions with wallet personas, simulated PnL, and species-driven behavior.",
    exampleFile: "examples/blockchain-buddies-demo.ts",
    templateHint: "solana-autonomous-trader",
    characterHint: "clawd",
    mission: "Launch a buddy squad for paper-trading simulations and social trading experiments.",
    x402: false,
  },
  {
    id: "clawd-wallet",
    name: "Wallet Guardian",
    runtime: "agentwallet",
    category: "wallet",
    summary: "Provision wallet-first agents with guarded permissions, swap rails, and operator approval loops.",
    exampleFile: "examples/clawd-wallet-demo.ts",
    templateHint: "solana-clawd-wallet-guardian",
    characterHint: "solana-clawd-wallet-guardian",
    mission: "Spawn a wallet-aware operator agent with safe signing controls and swap planning hooks.",
    x402: false,
  },
  {
    id: "listen-wallet",
    name: "Wallet Listener",
    runtime: "agentwallet",
    category: "wallet",
    summary: "Create real-time balance and transaction listeners for watched Solana accounts.",
    exampleFile: "examples/listen-wallet.ts",
    templateHint: "solana-onchain-metrics",
    characterHint: "solana-whale-tracker",
    mission: "Monitor specific wallets, detect balance changes, and trigger downstream agent actions.",
    x402: false,
  },
  {
    id: "lobster-trader",
    name: "Lobster Trader",
    runtime: "box",
    category: "trading",
    summary: "Run pump.fun bonding-curve simulations, graduation scoring, and structured trade opinions.",
    exampleFile: "examples/lobster-trader.ts",
    templateHint: "solana-pumpfun-bot",
    characterHint: "solana-pumpfun-bot",
    mission: "Deploy a trader that evaluates bonding curves and surfaces buy, hold, sell, or avoid decisions.",
    x402: false,
  },
  {
    id: "ooda-loop",
    name: "OODA Signal Loop",
    runtime: "box",
    category: "trading",
    summary: "Observe, orient, decide, act, and learn across market data without live execution by default.",
    exampleFile: "examples/ooda-loop.ts",
    templateHint: "solana-technical-analyst",
    characterHint: "solana-technical-analyst",
    mission: "Create a fast signal agent that scores markets and records learned outcomes.",
    x402: false,
  },
  {
    id: "orchestrator",
    name: "Fleet Orchestrator",
    runtime: "cloudflare",
    category: "orchestration",
    summary: "Manage agent catalogs, wallets, MCP tools, and metaplex actions through a central control plane.",
    exampleFile: "examples/orchestrator-client.ts",
    templateHint: "solana-openclawd-orchestrator",
    characterHint: "solana-openclawd-orchestrator",
    mission: "Deploy a control plane that can route work across spawned specialists and monitor their capabilities.",
    x402: true,
  },
  {
    id: "x402-payments",
    name: "x402 Payment Gateway",
    runtime: "cloudflare",
    category: "payments",
    summary: "Gate premium APIs and MCP tools behind Solana USDC micropayments with slug-based pricing.",
    exampleFile: "examples/x402-payment-demo.ts",
    templateHint: "solana-clawd-payment-gateway",
    characterHint: "solana-x402-provider-author",
    mission: "Launch a paid agent API with facilitator-backed verification and monetized tool access.",
    x402: true,
  },
  {
    id: "x402-solana",
    name: "x402 Solana Rail Demo",
    runtime: "cloudflare",
    category: "payments",
    summary: "Expose a paid endpoint that returns HTTP 402 until the caller settles with Solana USDC.",
    exampleFile: "examples/x402-solana.ts",
    templateHint: "solana-x402-solana-rpc-broker",
    characterHint: "solana-x402-solana-rpc-broker",
    mission: "Deploy a micropayment-enabled Solana endpoint for premium data or execution access.",
    x402: true,
  },
];
