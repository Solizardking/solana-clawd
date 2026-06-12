#!/usr/bin/env node
/**
 * Clawd Code — CLI Entry Point
 * World's first headless Grok × Codex × Claude Code hybrid
 */

import { MODELS, printModelsTable, normalizeModelId, DEFAULT_MODEL } from './grok-models.js';
import { HeadlessWriter } from './headless.js';
import { EnvironmentVerifier } from './verify.js';
import { createOpenRouterClient, OpenRouterClient, DEFAULT_FREE_MODEL } from './openrouter.js';
import { loadClawdEnv, maskSecret } from './env.js';
import * as C from './commands.js';

type Mode = 'CODE' | 'TRADE' | 'RESEARCH' | 'IMAGE' | 'VOICE';

interface ClawdCodeConfig {
  mode: Mode;
  provider: 'xai' | 'openrouter' | 'deepseek';
  liveTrading: boolean;
  operatorConfirmed: boolean;
  rpcUrl: string;
  xaiApiKey: string;
  deepSeekApiKey: string;
  deepSeekBaseUrl: string;
  heliusApiKey: string;
  phoenixRiseUrl: string;
  vulcanMcpUrl: string;
  agentCount: 4 | 16;
  model: string;
}

const DEFAULT_HELIUS_RPC = process.env.HELIUS_RPC_URL ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com');

function loadConfig(): ClawdCodeConfig {
  const env = loadClawdEnv();
  const provider = normalizeProvider(env.CLAWD_PROVIDER || process.env.CLAWD_PROVIDER || 'xai');
  return {
    mode: (env.CLAWD_MODE as Mode) || 'CODE',
    provider,
    liveTrading: env.LIVE_TRADING === 'true',
    operatorConfirmed: env.OPERATOR_CONFIRMED === 'true',
    rpcUrl: env.SOLANA_RPC_URL || env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || DEFAULT_HELIUS_RPC,
    xaiApiKey: env.XAI_API_KEY || process.env.XAI_API_KEY || '',
    deepSeekApiKey: env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    deepSeekBaseUrl: env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    heliusApiKey: env.HELIUS_API_KEY || process.env.HELIUS_API_KEY || '',
    phoenixRiseUrl: env.PHOENIX_RISE_URL || 'https://api.phoenix.gg/enclave',
    vulcanMcpUrl: env.VULCAN_MCP_URL || 'http://localhost:3001',
    agentCount: parseInt(env.CLAWD_AGENT_COUNT || '4') as 4 | 16,
    model: env.CLAWD_MODEL || 'grok-4.20-multi-agent',
  };
}

function normalizeProvider(provider: string): 'xai' | 'openrouter' | 'deepseek' {
  const normalized = provider.toLowerCase();
  if (normalized === 'or') return 'openrouter';
  if (normalized === 'ds') return 'deepseek';
  if (normalized === 'deepseek' || normalized === 'openrouter' || normalized === 'xai') return normalized;
  return 'xai';
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

GLOBAL COMMANDS:
  /verify                 Run preflight checks
  /models                 List all available Grok models
  /models <id>           Switch to a specific model
  /provider              Show current AI provider
  /provider <name>       Switch to xai, openrouter, or deepseek

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
  --model <model>        Override model
  --format <fmt>         Output format: text (default) | json (JSONL)

EXAMPLES:
  clawd-code trade "short SOL $100"
  clawd-code research --agents 16 "Solana perps funding arb"
  clawd-code code "Build an Anchor program for staking"
  clawd-code image "neon Solana claw logo"
  clawd-code voice "Clawd Code is operational"

ENVIRONMENT:
  SOLANA_RPC_URL         Solana RPC endpoint (default: Helius)
  XAI_API_KEY            xAI API key for Grok
  DEEPSEEK_API_KEY       DeepSeek API key for deepseek-v4-pro/flash
  DEEPSEEK_BASE_URL      Default: https://api.deepseek.com
  OPENROUTER_API_KEY     OpenRouter API key (free models supported)
  OPENROUTER_FREE_MODEL  Default: nex-agi/nex-n2-pro:free
  CLAWD_PROVIDER         xai (default) | openrouter | deepseek
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
  loadClawdEnv();
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // /models command
  if (args[0] === '/models' || args[0] === 'models') {
    if (args[1]) {
      const normalized = normalizeModelId(args[1]);
      console.log(`\n[CLAWD CODE] Switched model to: ${normalized}`);
      console.log(`Set CLAWD_MODEL=${normalized} in ~/.clawd-code/.env to persist.`);
    } else {
      printModelsTable();
    }
    process.exit(0);
  }

  // /verify command
  if (args[0] === '/verify' || args[0] === 'verify') {
    EnvironmentVerifier.loadEnvFile();
    const verifier = new EnvironmentVerifier();
    const results = verifier.verifyAll();
    const report = verifier.printReport(results);
    process.exit(report.ok ? 0 : 1);
  }

  // /provider command — switch between xai and openrouter
  if (args[0] === '/provider' || args[0] === 'provider') {
    const env = loadClawdEnv();
    const current = normalizeProvider(env.CLAWD_PROVIDER || 'xai');
    if (args[1]) {
      const normalized = normalizeProvider(args[1]);
      if (['xai', 'openrouter', 'deepseek'].includes(normalized)) {
        console.log(`\n[CLAWD CODE] Switched provider: ${current} -> ${normalized}`);
        console.log(`Set CLAWD_PROVIDER=${normalized} in ~/.clawd-code/.env to persist.`);
        if (normalized === 'deepseek') {
          console.log('Set DEEPSEEK_API_KEY=<key> and CLAWD_MODEL=deepseek-v4-pro or deepseek-v4-flash.');
        }
      } else {
        console.log(`\n[CLAWD CODE] Unknown provider: ${args[1]}`);
        console.log('Available: xai, openrouter (or), deepseek (ds)');
      }
    } else {
      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log('║  CLAWD CODE — AI PROVIDERS                              ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Current: ${current.padEnd(45)}║`);
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log('║  xai         (default)  xAI Grok models                 ║');
      console.log('║  openrouter  (alt)      Free models via OpenRouter      ║');
      console.log('║  deepseek    (alt)      deepseek-v4-pro / v4-flash      ║');
      console.log('╚════════════════════════════════════════════════════════╝');
      console.log(`\n  grok       key=${maskSecret(env.XAI_API_KEY)}`);
      console.log(`  deepseek   key=${maskSecret(env.DEEPSEEK_API_KEY)} baseURL=${env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}`);
      console.log(`  openrouter key=${maskSecret(env.OPENROUTER_API_KEY)} baseURL=${env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'}`);
      console.log(`\n  Default OpenRouter free model: ${DEFAULT_FREE_MODEL}`);
      console.log('  Switch: clawd-code /provider deepseek');
    }
    process.exit(0);
  }

  // Solana-style slash commands and install-friendly aliases
  const directCommands: Record<string, (a: string[]) => Promise<void>> = {
    '/perps':      C.cmdPerps,
    'perps':       C.cmdPerps,
    '/wallet':     C.cmdWallet,
    'wallet':      C.cmdWallet,
    '/send':       C.cmdSend,
    'send':        C.cmdSend,
    '/price':      C.cmdPrice,
    'price':       C.cmdPrice,
    '/balance':    C.cmdBalance,
    'balance':     C.cmdBalance,
    '/positions':  C.cmdPositions,
    'positions':   C.cmdPositions,
    '/funding':    C.cmdFunding,
    'funding':     C.cmdFunding,
    '/signals':    C.cmdSignals,
    'signals':     C.cmdSignals,
    '/strategies': C.cmdStrategies,
    'strategies':  C.cmdStrategies,
    '/agents':     C.cmdAgents,
    'agents':      C.cmdAgents,
    '/goal':       C.cmdGoal,
    'goal':        C.cmdGoal,
    '/help':       C.cmdHelp,
    'help':        C.cmdHelp,
  };

  if (directCommands[args[0]]) {
    await directCommands[args[0]](args.slice(1));
    process.exit(0);
  }

  // Headless output format
  const formatFlag = args.indexOf('--format');
  const format = formatFlag !== -1 ? args[formatFlag + 1] : 'text';
  if (format === 'json' || format === 'text') {
    process.env.CLAWD_OUTPUT_FORMAT = format;
  }

  const config = loadConfig();
  const modeArg = args[0].toLowerCase();
  if (['code', 'trade', 'research', 'image', 'voice'].includes(modeArg)) {
    config.mode = modeArg.toUpperCase() as Mode;
  }

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
        await runCodeMode(args, config);
    }
  } catch (error) {
    console.error('[CLAWD CODE] Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
