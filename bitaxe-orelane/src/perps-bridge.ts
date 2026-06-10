import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import type { BotIntent } from './bot-types.js';
import type { OrelaneAppConfig } from './config.js';

const execFileAsync = promisify(execFile);

function normalizeSymbol(symbol: string | undefined): string {
  return (symbol ?? 'SOL').toUpperCase().replace(/-PERP$/, '');
}

function normalizeNotional(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : 100;
}

function isVulcanAvailable(config: OrelaneAppConfig): boolean {
  const bin = config.vulcanBin;
  if (bin.includes('/')) return existsSync(bin);
  return true;
}

async function runVulcan(
  config: OrelaneAppConfig,
  args: string[],
  timeoutMs = 30_000,
): Promise<{ stdout: string; stderr: string }> {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (config.vulcanWalletName) env.VULCAN_WALLET_NAME = config.vulcanWalletName;
  if (config.vulcanWalletPassword) env.VULCAN_WALLET_PASSWORD = config.vulcanWalletPassword;
  if (config.rpcUrl) env.RPC_URL = config.rpcUrl;

  return execFileAsync(config.vulcanBin, [...args, '-o', 'json'], {
    env,
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function formatVulcanJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

async function vulcanTicker(config: OrelaneAppConfig, symbol: string): Promise<string> {
  const { stdout } = await runVulcan(config, ['market', 'ticker', symbol]);
  return `Phoenix ${symbol} ticker:\n${formatVulcanJson(stdout)}`;
}

async function vulcanTaReport(config: OrelaneAppConfig, symbol: string, timeframe?: string): Promise<string> {
  const args = ['ta', 'report', symbol];
  if (timeframe) args.push('--timeframe', timeframe);
  const { stdout } = await runVulcan(config, args);
  return `Phoenix ${symbol} TA report:\n${formatVulcanJson(stdout)}`;
}

async function vulcanPositions(config: OrelaneAppConfig): Promise<string> {
  const { stdout } = await runVulcan(config, ['position', 'list']);
  return `Open positions:\n${formatVulcanJson(stdout)}`;
}

async function vulcanPortfolio(config: OrelaneAppConfig): Promise<string> {
  const { stdout } = await runVulcan(config, ['portfolio']);
  return `Portfolio snapshot:\n${formatVulcanJson(stdout)}`;
}

async function vulcanMargin(config: OrelaneAppConfig): Promise<string> {
  const { stdout } = await runVulcan(config, ['margin', 'status']);
  return `Margin status:\n${formatVulcanJson(stdout)}`;
}

async function vulcanCandles(config: OrelaneAppConfig, symbol: string, indicators = 'rsi,macd,bbands'): Promise<string> {
  const { stdout } = await runVulcan(config, [
    'market', 'candles', symbol,
    '--with-indicators', indicators,
    '--limit', '10',
  ]);
  return `${symbol} candles + indicators (${indicators}):\n${formatVulcanJson(stdout)}`;
}

async function vulcanPaperBuy(config: OrelaneAppConfig, symbol: string, notionalUsd: number): Promise<string> {
  const { stdout } = await runVulcan(config, [
    'paper', 'buy', symbol,
    '--notional-usdc', String(notionalUsd),
    '--type', 'market',
  ]);
  return `Paper buy ${symbol} $${notionalUsd}:\n${formatVulcanJson(stdout)}`;
}

async function vulcanPaperSell(config: OrelaneAppConfig, symbol: string, notionalUsd: number): Promise<string> {
  const { stdout } = await runVulcan(config, [
    'paper', 'sell', symbol,
    '--notional-usdc', String(notionalUsd),
    '--type', 'market',
  ]);
  return `Paper sell ${symbol} $${notionalUsd}:\n${formatVulcanJson(stdout)}`;
}

async function vulcanLiveBuy(config: OrelaneAppConfig, symbol: string, notionalUsd: number): Promise<string> {
  if (!config.liveTrading || !config.operatorConfirmed || config.perpsSimOnly) {
    return [
      `Live buy ${symbol} $${notionalUsd} — BLOCKED`,
      'Requires: LIVE_TRADING=true, OPERATOR_CONFIRMED=true, PERPS_SIM_ONLY=false',
    ].join('\n');
  }
  const { stdout } = await runVulcan(config, [
    'trade', 'market-buy', symbol,
    '--notional-usdc', String(notionalUsd),
    '--yes',
  ]);
  return `Live buy ${symbol} $${notionalUsd}:\n${formatVulcanJson(stdout)}`;
}

async function vulcanLiveSell(config: OrelaneAppConfig, symbol: string, notionalUsd: number): Promise<string> {
  if (!config.liveTrading || !config.operatorConfirmed || config.perpsSimOnly) {
    return [
      `Live sell ${symbol} $${notionalUsd} — BLOCKED`,
      'Requires: LIVE_TRADING=true, OPERATOR_CONFIRMED=true, PERPS_SIM_ONLY=false',
    ].join('\n');
  }
  const { stdout } = await runVulcan(config, [
    'trade', 'market-sell', symbol,
    '--notional-usdc', String(notionalUsd),
    '--yes',
  ]);
  return `Live sell ${symbol} $${notionalUsd}:\n${formatVulcanJson(stdout)}`;
}

function legacyFallback(config: OrelaneAppConfig, intent: BotIntent): string {
  const mode = config.liveTrading && config.operatorConfirmed && !config.perpsSimOnly ? 'live' : 'paper';
  if (intent.action === 'perps_status' || intent.action === 'vulcan_portfolio' || intent.action === 'vulcan_margin') {
    return [
      'Perps bridge status:',
      `vulcan=${config.vulcanBin} (not found in PATH — install with: curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh)`,
      `mode=${mode}`,
      `liveTrading=${config.liveTrading}`,
      `operatorConfirmed=${config.operatorConfirmed}`,
      `perpsSimOnly=${config.perpsSimOnly}`,
    ].join('\n');
  }
  const symbol = normalizeSymbol(intent.symbol);
  const notional = normalizeNotional(intent.notionalUsd);
  const side = intent.side ?? 'long';
  return [
    `${intent.action} ${side} ${symbol} $${notional} — preview only`,
    `vulcan not found — install Vulcan CLI to execute`,
  ].join('\n');
}

async function dispatchVulcan(config: OrelaneAppConfig, intent: BotIntent): Promise<string> {
  const symbol = normalizeSymbol(intent.symbol);
  const notional = normalizeNotional(intent.notionalUsd);

  switch (intent.action) {
    case 'perps_status':
    case 'vulcan_portfolio':
      return vulcanPortfolio(config);
    case 'vulcan_margin':
      return vulcanMargin(config);
    case 'vulcan_ticker':
      return vulcanTicker(config, symbol);
    case 'vulcan_ta':
      return vulcanTaReport(config, symbol, intent.timeframe);
    case 'vulcan_candles':
      return vulcanCandles(config, symbol);
    case 'vulcan_positions':
      return vulcanPositions(config);
    case 'perps_paper_trade':
      return intent.side === 'short'
        ? vulcanPaperSell(config, symbol, notional)
        : vulcanPaperBuy(config, symbol, notional);
    case 'perps_live_preview':
      return intent.side === 'short'
        ? vulcanLiveSell(config, symbol, notional)
        : vulcanLiveBuy(config, symbol, notional);
    default:
      return legacyFallback(config, intent);
  }
}

export async function runPerpsBridge(config: OrelaneAppConfig, intent: BotIntent): Promise<string> {
  if (!isVulcanAvailable(config)) {
    const legacyCli = config.perpsCliPath;
    if (existsSync(legacyCli)) {
      return legacyFallback(config, intent);
    }
    return legacyFallback(config, intent);
  }

  try {
    return await dispatchVulcan(config, intent);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return [legacyFallback(config, intent), '', `vulcanError=${message}`].join('\n');
  }
}
