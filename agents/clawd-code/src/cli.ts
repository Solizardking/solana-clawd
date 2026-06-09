#!/usr/bin/env node
/**
 * Clawd Code — CLI Entry Point
 * World's first headless Grok × Codex × Claude Code hybrid
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.clawd-code');
const ENV_FILE = join(CONFIG_DIR, '.env');

// Load environment
function loadEnv(): Record<string, string> {
  try {
    const env = readFileSync(ENV_FILE, 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of env.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (key && !key.startsWith('#')) {
        vars[key.trim()] = rest.join('=').trim();
      }
    }
    return vars;
  } catch {
    return {};
  }
}

type Mode = 'CODE' | 'TRADE' | 'RESEARCH' | 'IMAGE' | 'VOICE';

interface ClawdCodeConfig {
  mode: Mode;
  liveTrading: boolean;
  operatorConfirmed: boolean;
  rpcUrl: string;
  xaiApiKey: string;
  heliusApiKey: string;
  phoenixRiseUrl: string;
  vulcanMcpUrl: string;
  agentCount: 4 | 16;
  model: string;
}

function loadConfig(): ClawdCodeConfig {
  const env = loadEnv();
  return {
    mode: (env.CLAWD_MODE as Mode) || 'CODE',
    liveTrading: env.LIVE_TRADING === 'true',
    operatorConfirmed: env.OPERATOR_CONFIRMED === 'true',
    rpcUrl: env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    xaiApiKey: env.XAI_API_KEY || '',
    heliusApiKey: env.HELIUS_API_KEY || '',
    phoenixRiseUrl: env.PHOENIX_RISE_URL || 'https://api.phoenix.gg/enclave',
    vulcanMcpUrl: env.VULCAN_MCP_URL || 'http://localhost:3001',
    agentCount: parseInt(env.CLAWD_AGENT_COUNT || '4') as 4 | 16,
    model: env.CLAWD_MODEL || 'grok-4.20-multi-agent',
  };
}

async function runCodeMode(args: string[], config: ClawdCodeConfig): Promise<void> {
  const { CodeMode } = await import('./modes/code.js');
  const mode = new CodeMode(config);
  await mode.run(args);
}

async function runTradeMode(args: string[], config: ClawdCodeConfig): Promise<void> {
  const { TradeMode } = await import('./modes/trade.js');
  const mode = new TradeMode(config);
  await mode.run(args);
}

async function runResearchMode(args: string[], config: ClawdCodeConfig): Promise<void> {
  const { ResearchMode } = await import('./modes/research.js');
  const mode = new ResearchMode(config);
  await mode.run(args);
}

async function runImageMode(args: string[], config: ClawdCodeConfig): Promise<void> {
  const { ImageMode } = await import('./modes/image.js');
  const mode = new ImageMode(config);
  await mode.run(args);
}

async function runVoiceMode(args: string[], config: ClawdCodeConfig): Promise<void> {
  const { VoiceMode } = await import('./modes/voice.js');
  const mode = new VoiceMode(config);
  await mode.run(args);
}

function printBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🦞 CLAWD CODE                                           ║
║  Grok × Codex × Claude Code — Headless Hybrid            ║
║  Solana-native AI agent with perpetuals & realtime AI     ║
╚═══════════════════════════════════════════════════════════╝
`);
}

function printUsage(): void {
  printBanner();
  console.log(`
USAGE:
  clawd-code [mode] [command] [options]

MODES:
  code       Write, review, and ship production code
  trade      Perpetuals trading with Phoenix Rise + Vulcan MCP
  research   Multi-agent deep research with grok-4.20-multi-agent
  image      Generate images via DALL-E or Gemini
  voice      Text-to-speech and voice synthesis

COMMANDS:
  clawd-code code "Build a Jupiter swap bot"
  clawd-code trade "SOL funding rate?"
  clawd-code research "AI agent frameworks 2025"
  clawd-code image "cyberpunk Solana trading desk"
  clawd-code voice "Hello from Clawd Code"

OPTIONS:
  --mode <mode>          Set mode (code|trade|research|image|voice)
  --agents <n>           Number of agents for research (4|16)
  --live                 Enable live trading (requires ARM flags)
  --paper                Paper trading mode (default)
  --model <model>        Grok model (default: grok-4.20-multi-agent)

EXAMPLES:
  clawd-code trade "short SOL $100"
  clawd-code research --agents 16 "Solana perps funding arb"
  clawd-code code "Build an Anchor program for staking"
  clawd-code image "neon Solana claw logo"
  clawd-code voice "Clawd Code is operational"

ENVIRONMENT:
  SOLANA_RPC_URL         Solana RPC endpoint
  XAI_API_KEY            xAI API key for Grok
  HELIUS_API_KEY         Helius API key for DAS
  PHOENIX_RISE_URL       Phoenix Rise endpoint
  VULCAN_MCP_URL         Vulcan MCP server URL
  LIVE_TRADING           Enable live trading (true|false)
  OPERATOR_CONFIRMED     Operator confirmed (true|false)
  PERPS_SIM_ONLY         Simulation only (true|false)
  CLAWD_MODE             Default mode (code|trade|research|image|voice)
  CLAWD_AGENT_COUNT      Agent count for research (4|16)

First run: cp .env.example ~/.clawd-code/.env
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const config = loadConfig();
  const modeArg = args[0].toLowerCase();

  // Parse global flags
  if (args.includes('--live')) {
    config.liveTrading = true;
  }
  if (args.includes('--paper')) {
    config.liveTrading = false;
  }
  if (args.includes('--agents')) {
    const idx = args.indexOf('--agents');
    config.agentCount = parseInt(args[idx + 1]) as 4 | 16;
  }
  if (args.includes('--model')) {
    const idx = args.indexOf('--model');
    config.model = args[idx + 1];
  }

  printBanner();
  console.log(`[CLAWD CODE] Mode: ${config.mode} | Live: ${config.liveTrading} | Agents: ${config.agentCount}\n`);

  try {
    switch (modeArg) {
      case 'code':
        await runCodeMode(args.slice(1), config);
        break;
      case 'trade':
        await runTradeMode(args.slice(1), config);
        break;
      case 'research':
        await runResearchMode(args.slice(1), config);
        break;
      case 'image':
        await runImageMode(args.slice(1), config);
        break;
      case 'voice':
        await runVoiceMode(args.slice(1), config);
        break;
      default:
        // Treat as code command
        await runCodeMode(args, config);
    }
  } catch (error) {
    console.error('[CLAWD CODE] Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);