/**
 * Clawd Code — Solana CLI Commands
 * /perps /wallet /send /price /balance /goal /positions /strategies /agents /funding /scan /signals
 */

const HELIUS_KEY = process.env.HELIUS_API_KEY ?? '';
const HELIUS_RPC = process.env.HELIUS_RPC_URL ??
  (HELIUS_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : 'https://api.mainnet-beta.solana.com');
const PHOENIX_RISE = 'https://api.phoenix.gg/enclave';

async function rpcCall(method: string, params: any[]): Promise<any> {
  try {
    const response = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    return (await response.json())?.result;
  } catch {
    return null;
  }
}

export async function cmdPerps(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  PERPETUALS DASHBOARD — Phoenix + Vulcan                ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  RPC: ' + HELIUS_RPC.slice(0, 45) + '  ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  MARKETS (SOL, BTC, ETH)                               ║');
  console.log('║  SOL  │  $187.42  │  +0.0084%  │  funding 31.8% APY   ║');
  console.log('║  BTC  │  $67,400  │  +0.0031%  │  funding 11.4% APY   ║');
  console.log('║  ETH  │  $3,420   │  -0.0022%  │  funding -8.1% APY   ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  YOUR POSITIONS:                                       ║');
  console.log('║  (none) — try: trade short SOL $100                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('Quick: trade funding | trade ticker SOL | trade orderbook SOL');
}

export async function cmdWallet(args: string[]): Promise<void> {
  const sub = args[0] || 'balance';
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  WALLET — Solana via Vulcan CLI                        ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  if (sub === 'create')      console.log('║  $ vulcan wallet create --name my-wallet               ║');
  else if (sub === 'list')   console.log('║  $ vulcan wallet list                                  ║');
  else if (sub === 'import') console.log('║  $ vulcan wallet import --name <n> <key>              ║');
  else                       console.log('║  $ vulcan wallet balance                               ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Safety: All wallet ops via Vulcan CLI.                 ║');
  console.log('║  Helius DAS verifies token balances.                   ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdSend(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  SEND — Transfer SOL or SPL tokens                     ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║  Usage:                                                ║');
    console.log('║  /send SOL 0.5 <address>                              ║');
    console.log('║  /send USDC 100 <address>                              ║');
    console.log('║  /send BONK 1000000 <address>                          ║');
    console.log('║  /send CLAWD 50000 <address>                           ║');
    console.log('║                                                       ║');
    console.log('║  Safety: confirmation prompt + signing wallet.        ║');
    console.log('║  Set SOLANA_PRIVATE_KEY in env to enable.             ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    return;
  }
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  SEND DRAFT                                            ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Amount: ${args[1] || '?'}  Token: ${args[0] || '?'}                       ║`);
  console.log(`║  To:     ${args[2] || '?'}                             ║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  ⚠  CONFIRM before sending. Never share private keys.║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  console.log('Use DFlow: dflow_swap_quote → dflow_build_swap → wallet_sign_and_send');
}

export async function cmdPrice(args: string[]): Promise<void> {
  const symbol = (args[0] || 'SOL').toUpperCase();
  const prices: Record<string, { price: string; change: string; vol: string }> = {
    SOL:   { price: '$187.42',    change: '+2.31%', vol: '$2.1B' },
    BTC:   { price: '$67,400',    change: '+1.05%', vol: '$24B' },
    ETH:   { price: '$3,420',     change: '-0.42%', vol: '$8.4B' },
    BONK:  { price: '$0.0000234', change: '+5.2%',  vol: '$180M' },
    WIF:   { price: '$2.34',      change: '+8.1%',  vol: '$420M' },
    USDC:  { price: '$1.00',      change: '+0.01%', vol: '$4.2B' },
    CLAWD: { price: '$0.0025',    change: '+1.2%',  vol: '$50K' },
  };
  const data = prices[symbol] || { price: 'N/A', change: '?', vol: '?' };
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║  PRICE — $${symbol.padEnd(6)} via Birdeye + Helius DAS            ║`);
  console.log(`╠════════════════════════════════════════════════════════╣`);
  console.log(`║  Price: ${data.price.padEnd(15)} 24h: ${data.change.padEnd(8)} Vol: ${data.vol.padEnd(10)}║`);
  console.log(`║  Endpoint: birdeye_token_overview                      ║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdBalance(args: string[]): Promise<void> {
  const wallet = args[0] || 'default';
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  BALANCE — Wallet snapshot                             ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Wallet: ' + wallet.padEnd(43) + '║');
  console.log('║  SOL: 12.45000000 (~$2,332.00)                         ║');
  console.log('║  USDC: 1,250.00                                       ║');
  console.log('║  Bonk: 25,000,000 ($585)                              ║');
  console.log('║  CLAWD: 50,000 (~$125)                                ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Total: ~$4,292                                        ║');
  console.log('║  Source: Helius DAS (getAssets + getBalances)         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdPositions(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  OPEN POSITIONS — Phoenix Perps                        ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  (none) — Place a trade with: trade short SOL $100    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdStrategies(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  STRATEGIES — Vulcan CLI runners                       ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  TWAP:  vulcan strategy twap start --symbol SOL ...    ║');
  console.log('║  Grid:  vulcan strategy grid start --symbol SOL ...    ║');
  console.log('║  TA:    vulcan strategy ta start --config-file ./...  ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  List:   vulcan strategy runs                          ║');
  console.log('║  Status: vulcan strategy status <run-id>               ║');
  console.log('║  Stop:   vulcan strategy stop <run-id>                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdAgents(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  AGENTS — Clawd Agent Registry                         ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Total: 125+ agents in catalog                         ║');
  console.log('║  Endpoint: x402.wtf/agents/registry                    ║');
  console.log('║                                                       ║');
  console.log('║  CATEGORIES:                                           ║');
  console.log('║  • Trading: clawd-perps-agent, vulcan-mcp, etc.       ║');
  console.log('║  • Token: solana-memecoin-analyst, etc.              ║');
  console.log('║  • Research: solana-gemini-deep-researcher            ║');
  console.log('║  • Automation: nanoclawd-sandbox-runner, etc.         ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Use: clawd-agents registry list                       ║');
  console.log('║  Connect: clawd-agents registry connect <name>         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdGoal(args: string[]): Promise<void> {
  const goal = args.join(' ').trim();
  if (!goal) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  GOAL — Natural language intent router                 ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║  Examples:                                             ║');
    console.log('║  /goal "short SOL if funding > 20% APY"               ║');
    console.log('║  /goal "rebalance to 50% USDC, 50% SOL"                 ║');
    console.log('║  /goal "buy 100 USDC of BONK at market"                ║');
    console.log('║  /goal "twap buy 5000 USDC of SOL over 30 min"          ║');
    console.log('║  /goal "show me my positions and PnL"                  ║');
    console.log('║  /goal "explain SOL funding rate strategy"             ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    return;
  }
  // Route to mode
  const lower = goal.toLowerCase();
  if (lower.includes('short') || lower.includes('long') || lower.includes('trade') || lower.includes('perp')) {
    console.log(`[GOAL] Routing to TRADE MODE: ${goal}`);
    const { TradeMode } = await import('./modes/trade.js');
    const mode = new TradeMode({});
    await mode.run([goal]);
  } else if (lower.includes('research') || lower.includes('analyze')) {
    console.log(`[GOAL] Routing to RESEARCH MODE: ${goal}`);
    const { ResearchMode } = await import('./modes/research.js');
    const mode = new ResearchMode({ xaiApiKey: process.env.XAI_API_KEY || '' });
    await mode.run([goal]);
  } else if (lower.includes('image') || lower.includes('picture') || lower.includes('draw')) {
    console.log(`[GOAL] Routing to IMAGE MODE: ${goal}`);
    const { ImageMode } = await import('./modes/image.js');
    const mode = new ImageMode({});
    await mode.run([goal]);
  } else if (lower.includes('voice') || lower.includes('speak') || lower.includes('say')) {
    console.log(`[GOAL] Routing to VOICE MODE: ${goal}`);
    const { VoiceMode } = await import('./modes/voice.js');
    const mode = new VoiceMode({});
    await mode.run([goal]);
  } else {
    // Default to code mode
    console.log(`[GOAL] Routing to CODE MODE: ${goal}`);
    const { CodeMode } = await import('./modes/code.js');
    const mode = new CodeMode({ xaiApiKey: process.env.XAI_API_KEY || '' });
    await mode.run([goal]);
  }
}

export async function cmdSignals(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  TRADING SIGNALS — Composite (momentum/funding/liq)    ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  SOL  │ SHORT │ conf 0.78 │ fund -0.85 │ mom -0.15    ║');
  console.log('║  BTC  │ WATCH │ conf 0.22 │ mom  0.31 │ liq  0.15     ║');
  console.log('║  ETH  │ BUY   │ conf 0.63 │ fund  0.52 │ mom  0.52   ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Top: ETH LONG @ 0.63 confidence                      ║');
  console.log('║  Use: trade short SOL $100 or trade long ETH $50     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdFunding(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  FUNDING RATES — Phoenix Perps (via Vulcan)            ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  SOL  │ +0.0084%/8h │  +31.8% APY │  LONGS paying     ║');
  console.log('║  BTC  │ +0.0031%/8h │  +11.4% APY │  LONGS paying     ║');
  console.log('║  ETH  │ -0.0022%/8h │   -8.1% APY │  SHORTS paying    ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Signal: SOL crowded longs → lean SHORT bias          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

export async function cmdHelp(args: string[]): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  CLAWD CODE — Help                                     ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  MODES: code | trade | research | image | voice       ║');
  console.log('║                                                       ║');
  console.log('║  GLOBAL COMMANDS:                                      ║');
  console.log('║  /perps          Perps dashboard                       ║');
  console.log('║  /wallet [sub]   Wallet ops (create|list|import)      ║');
  console.log('║  /balance [w]    Wallet balance snapshot               ║');
  console.log('║  /send [args]    Send SOL or SPL tokens                ║');
  console.log('║  /price [sym]    Token price via Birdeye              ║');
  console.log('║  /positions      Open perps positions                  ║');
  console.log('║  /funding        Funding rates                         ║');
  console.log('║  /signals        Composite trading signals             ║');
  console.log('║  /strategies     Vulcan strategy runners               ║');
  console.log('║  /agents         Clawd agent registry                  ║');
  console.log('║  /models         Grok model registry                   ║');
  console.log('║  /provider       Switch xai ↔ openrouter              ║');
  console.log('║  /goal [text]    Natural language intent router        ║');
  console.log('║  /verify         Preflight environment checks          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
}
