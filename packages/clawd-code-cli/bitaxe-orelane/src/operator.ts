import { computeEfficiency, pauseBitaxeMining, rebootBitaxe, resumeBitaxeMining, setBitaxeFrequency } from './bitaxe.js';
import type { BotIntent, OperatorResponse } from './bot-types.js';
import type { OrelaneAppConfig } from './config.js';
import { getHybridStatusReport } from './controller.js';
import { routeWithDeepSeek } from './deepseek.js';
import { formatWalletSummary, getWalletSummary } from './helius.js';
import { checkpointMiner, claimRewards, isOreCliAvailable } from './ore-cli.js';
import { runPerpsBridge } from './perps-bridge.js';

function ok(text: string, data?: unknown): OperatorResponse {
  return { ok: true, text, data };
}

function blocked(text: string, data?: unknown): OperatorResponse {
  return { ok: false, text, data };
}

function canControlRig(config: OrelaneAppConfig): boolean {
  return config.rigControlLive && config.operatorConfirmed && !config.dryRun;
}

function canExecuteOre(config: OrelaneAppConfig): boolean {
  return config.liveExecution && config.operatorConfirmed && !config.dryRun;
}

function parseSquares(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const squares = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 24);
  return squares.length > 0 ? squares : undefined;
}

function parseFrequency(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const mhz = Number.parseFloat(raw);
  return Number.isFinite(mhz) && mhz > 0 ? mhz : undefined;
}

function parseCommand(text: string): BotIntent | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const command = parts[0]?.toLowerCase();
  if (!command?.startsWith('/')) return null;

  switch (command) {
    case '/start':
    case '/help':
      return { action: 'help', rawText: text };
    case '/status':
    case '/rig':
    case '/bitaxe':
    case '/ore':
      return { action: 'status', rawText: text };
    case '/optimize':
    case '/latency':
      return { action: 'optimize', rawText: text };
    case '/hashrate':
    case '/hr':
      return { action: 'bitaxe_hashrate', rawText: text };
    case '/efficiency':
    case '/eff':
      return { action: 'bitaxe_efficiency', rawText: text };
    case '/freq':
      if (parts[1]) return { action: 'bitaxe_freq_set', frequencyMhz: parseFrequency(parts[1]), rawText: text };
      return { action: 'bitaxe_freq_get', rawText: text };
    case '/bitaxe_pause':
    case '/pause':
      return { action: 'bitaxe_pause', rawText: text };
    case '/bitaxe_resume':
    case '/resume':
      return { action: 'bitaxe_resume', rawText: text };
    case '/reboot':
    case '/restart':
      return { action: 'bitaxe_reboot', rawText: text };
    case '/ore_checkpoint':
      return { action: 'ore_checkpoint', rawText: text };
    case '/ore_claim':
      return { action: 'ore_claim', rawText: text };
    case '/ore_deploy':
      return {
        action: 'ore_deploy_preview',
        amountSol: parts[1] ? Number(parts[1]) : undefined,
        squares: parseSquares(parts[2]),
        rawText: text,
      };
    case '/perps':
    case '/portfolio':
      return { action: 'vulcan_portfolio', rawText: text };
    case '/margin':
      return { action: 'vulcan_margin', rawText: text };
    case '/positions':
    case '/pos':
      return { action: 'vulcan_positions', rawText: text };
    case '/ticker': {
      const symbol = parts[1]?.toUpperCase();
      return { action: 'vulcan_ticker', symbol, rawText: text };
    }
    case '/ta': {
      const symbol = parts[1]?.toUpperCase();
      const timeframe = parts[2];
      return { action: 'vulcan_ta', symbol, timeframe, rawText: text };
    }
    case '/candles': {
      const symbol = parts[1]?.toUpperCase();
      return { action: 'vulcan_candles', symbol, rawText: text };
    }
    case '/perps_paper_long':
    case '/trade_long':
    case '/paper_buy':
      return { action: 'perps_paper_trade', side: 'long', symbol: parts[1], notionalUsd: parts[2] ? Number(parts[2]) : undefined, rawText: text };
    case '/perps_paper_short':
    case '/trade_short':
    case '/paper_sell':
      return { action: 'perps_paper_trade', side: 'short', symbol: parts[1], notionalUsd: parts[2] ? Number(parts[2]) : undefined, rawText: text };
    case '/perps_live_long':
      return { action: 'perps_live_preview', side: 'long', symbol: parts[1], notionalUsd: parts[2] ? Number(parts[2]) : undefined, rawText: text };
    case '/perps_live_short':
      return { action: 'perps_live_preview', side: 'short', symbol: parts[1], notionalUsd: parts[2] ? Number(parts[2]) : undefined, rawText: text };
    case '/wallet':
    case '/assets':
      return { action: 'wallet_assets', rawText: text };
    case '/payments':
    case '/x402':
      return { action: 'payments_status', rawText: text };
    case '/agents':
    case '/clawd':
      return { action: 'agents_status', rawText: text };
    case '/dashboard':
    case '/surfaces':
      return { action: 'dashboards_status', rawText: text };
    default:
      return { action: 'help', rawText: text };
  }
}

function helpText(): string {
  return [
    'Bitaxe Orelane commands:',
    '',
    'Mining & Status:',
    '/status — Bitaxe, ORE, wallet, and policy decision',
    '/hashrate — hashrate trend (1m/10m/1h)',
    '/efficiency — W/GH efficiency metric',
    '/optimize — BTC lottery/latency and ORE round plan',
    '/freq [MHz] — get or set Bitaxe frequency',
    '/pause /resume — gated Bitaxe mining control',
    '/reboot — gated Bitaxe restart',
    '',
    'ORE:',
    '/ore_checkpoint — gated ORE checkpoint',
    '/ore_claim — gated ORE claim',
    '/ore_deploy <SOL> <square,square> — preview ORE deploy',
    '',
    'Phoenix Perps (Vulcan):',
    '/ticker SOL — live price ticker',
    '/ta SOL [1h] — TA report (RSI, MACD, BBands, ATR, ADX)',
    '/candles SOL — candles + indicators',
    '/portfolio — full portfolio snapshot',
    '/positions — open positions',
    '/margin — cross-margin health',
    '/paper_buy SOL 100 — paper market buy',
    '/paper_sell SOL 100 — paper market sell',
    '/perps_live_long SOL 100 — live buy (gated)',
    '/perps_live_short SOL 100 — live sell (gated)',
    '',
    'Wallet & Agents:',
    '/wallet — DAS wallet assets via Helius',
    '/payments — x402 payment surfaces',
    '/agents — Clawd agent surfaces',
    '/dashboard — AxeOS and firmware API surfaces',
    '',
    'Natural language uses DeepSeek first, then OpenRouter, then keyword routing.',
  ].join('\n');
}

async function optimizeText(config: OrelaneAppConfig): Promise<string> {
  const report = await getHybridStatusReport(config);
  const snapshot = report.snapshot;
  const miningWindow = snapshot
    ? (
        snapshot.analysis.miningOpen &&
        snapshot.analysis.miningSecondsRemaining >= 5 &&
        snapshot.analysis.miningSecondsRemaining <= 55
      )
    : false;
  const remaining = snapshot ? snapshot.analysis.miningSecondsRemaining.toFixed(0) : 'n/a';
  const reserve = config.policy.minReserveSol.toFixed(3);
  const squares = config.policy.maxSquaresPerRound;
  const probability = ((squares / 25) * 100).toFixed(0);

  return [
    'Current state:',
    report.text,
    '',
    'BTC optimization:',
    '- Sustained hashrate, accepted shares, and uptime drive lottery probability.',
    '- Keep temp under the safety ceiling, WiFi above the RSSI floor, rejected shares near zero.',
    '- Use the lowest-latency Stratum endpoint for your pool/solo strategy.',
    '',
    'ORE v3 optimization:',
    `- Current safe deploy window=${miningWindow} with ~${remaining}s remaining. Target the 5-55s window only.`,
    `- Current profile=${squares} squares per round, about ${probability}% win probability, max ${config.policy.maxDeployPerRoundSol.toFixed(3)} SOL spend per round.`,
    `- Keep at least ${reserve} SOL reserve. A safer operational reserve is 0.1 SOL or more for fees and retries.`,
    '- Prefer empty or underbet squares. Avoid late deploys in the final 5 seconds of a round.',
    '- Checkpoint when miner state is behind. A practical cadence is about every 5 rounds if rewards are accumulating cleanly.',
    '- Variance is real: 12% win probability does not imply smooth returns or guaranteed profit.',
  ].join('\n');
}

async function hashrateText(config: OrelaneAppConfig): Promise<string> {
  const report = await getHybridStatusReport(config);
  if (!report.snapshot) return report.text;
  const b = report.snapshot.bitaxe;
  return [
    `Hashrate trend for Bitaxe ${b.boardVersion}:`,
    `  current: ${b.hashRate.toFixed(2)} GH/s`,
    `  1m avg:  ${b.hashRate_1m.toFixed(2)} GH/s`,
    `  10m avg: ${b.hashRate_10m.toFixed(2)} GH/s`,
    `  1h avg:  ${b.hashRate_1h.toFixed(2)} GH/s`,
    `  expected: ${b.expectedHashrate.toFixed(2)} GH/s`,
    `  shares accepted=${b.sharesAccepted} rejected=${b.sharesRejected}`,
    `  uptime=${Math.floor(b.uptimeSeconds / 3600)}h ${Math.floor((b.uptimeSeconds % 3600) / 60)}m`,
  ].join('\n');
}

async function efficiencyText(config: OrelaneAppConfig): Promise<string> {
  const report = await getHybridStatusReport(config);
  if (!report.snapshot) return report.text;
  const b = report.snapshot.bitaxe;
  const eff = computeEfficiency(b);
  return [
    `Bitaxe ${b.boardVersion} efficiency:`,
    `  power: ${b.power.toFixed(2)} W`,
    `  hashrate: ${b.hashRate.toFixed(2)} GH/s`,
    `  efficiency: ${eff > 0 ? `${eff.toFixed(4)} W/GH` : 'n/a'}`,
    `  voltage: ${b.voltage.toFixed(0)} mV  current: ${b.current.toFixed(0)} mA`,
    `  temp: ${b.temp}°C  vrTemp: ${b.vrTemp}°C`,
  ].join('\n');
}

function paymentsText(config: OrelaneAppConfig): string {
  return [
    'Payment surfaces:',
    `x402=${config.x402PaymentUrl}`,
    `paymentsLive=${config.paymentsLive}`,
    'Payment execution is not wired to move funds from Telegram.',
  ].join('\n');
}

function agentsText(config: OrelaneAppConfig): string {
  return [
    'Clawd agent surfaces:',
    'agent=bitaxe-orelane',
    'manifest=clawd.json',
    'capabilities=attest_agent,get_peer_card,list_agents,agent_chat',
    `deepseek=${config.deepseekApiKey ? 'configured' : 'missing DEEPSEEK_API_KEY'}`,
    `openrouter=${config.openrouterApiKey ? 'configured' : 'missing OPENROUTER_API_KEY'}`,
    `helius=${config.heliusApiKey ? 'configured' : 'missing HELIUS_API_KEY'}`,
    `vulcan=${config.vulcanBin}`,
    'Live gates: DRY_RUN=false, LIVE_EXECUTION=true, OPERATOR_CONFIRMED=true.',
  ].join('\n');
}

function dashboardsText(config: OrelaneAppConfig): string {
  return [
    'Dashboard and control surfaces:',
    `Bitaxe AxeOS=${config.bitaxeUrl}`,
    `ORE/x402=${config.x402OreUrl}`,
    `Dashboard=${config.dashboardUrl}`,
    `Firmware status=${new URL('/api/orelane/status', config.bitaxeUrl).toString()}`,
    `Firmware bundle=${new URL('/api/orelane/bundle', config.bitaxeUrl).toString()}`,
    `Vulcan bin=${config.vulcanBin}`,
  ].join('\n');
}

const VULCAN_INTENTS = new Set([
  'perps_status', 'perps_paper_trade', 'perps_live_preview',
  'vulcan_ticker', 'vulcan_ta', 'vulcan_candles',
  'vulcan_positions', 'vulcan_portfolio', 'vulcan_margin',
]);

async function executeIntent(config: OrelaneAppConfig, intent: BotIntent): Promise<OperatorResponse> {
  switch (intent.action) {
    case 'help':
      return ok(helpText());
    case 'status':
    case 'ore_decision':
      return ok((await getHybridStatusReport(config)).text);
    case 'optimize':
      return ok(await optimizeText(config));
    case 'bitaxe_hashrate':
      return ok(await hashrateText(config));
    case 'bitaxe_efficiency':
      return ok(await efficiencyText(config));
    case 'bitaxe_freq_get': {
      const report = await getHybridStatusReport(config);
      if (!report.snapshot) return ok(report.text);
      return ok(`Bitaxe frequency: not exposed via AxeOS system/info (check AxeOS UI at ${config.bitaxeUrl})`);
    }
    case 'bitaxe_freq_set':
      if (!canControlRig(config)) {
        return blocked('Frequency change blocked. Require RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, DRY_RUN=false.');
      }
      if (!intent.frequencyMhz) {
        return blocked('Provide frequency in MHz: /freq 500');
      }
      await setBitaxeFrequency(config.bitaxeUrl, intent.frequencyMhz);
      return ok(`Bitaxe frequency set to ${intent.frequencyMhz} MHz.`);
    case 'bitaxe_pause':
      if (!canControlRig(config)) {
        return blocked('Rig pause blocked. Require RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, DRY_RUN=false.');
      }
      await pauseBitaxeMining(config.bitaxeUrl);
      return ok('Bitaxe pause command submitted.');
    case 'bitaxe_resume':
      if (!canControlRig(config)) {
        return blocked('Rig resume blocked. Require RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, DRY_RUN=false.');
      }
      await resumeBitaxeMining(config.bitaxeUrl);
      return ok('Bitaxe resume command submitted.');
    case 'bitaxe_reboot':
      if (!canControlRig(config)) {
        return blocked('Rig reboot blocked. Require RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, DRY_RUN=false.');
      }
      await rebootBitaxe(config.bitaxeUrl);
      return ok('Bitaxe reboot command submitted. Allow ~30s for restart.');
    case 'ore_checkpoint':
      if (!canExecuteOre(config)) {
        return blocked('ORE checkpoint blocked. Require DRY_RUN=false, LIVE_EXECUTION=true, OPERATOR_CONFIRMED=true.');
      }
      return ok((await checkpointMiner()).stdout || 'ORE checkpoint submitted.');
    case 'ore_claim':
      if (!canExecuteOre(config)) {
        return blocked('ORE claim blocked. Require DRY_RUN=false, LIVE_EXECUTION=true, OPERATOR_CONFIRMED=true.');
      }
      return ok((await claimRewards()).stdout || 'ORE claim submitted.');
    case 'ore_deploy_preview':
      return ok([
        'ORE deploy preview:',
        `amountSol=${intent.amountSol ?? config.policy.maxDeployPerRoundSol}`,
        `squares=${intent.squares?.join(',') || 'policy-selected'}`,
        `probability=${(((intent.squares?.length ?? config.policy.maxSquaresPerRound) / 25) * 100).toFixed(0)}% per round`,
        `safeWindow=deploy only with roughly 5-55s remaining in an active round`,
        `reserveTarget=${config.policy.minReserveSol.toFixed(3)} SOL minimum`,
        `oreCli=${isOreCliAvailable() ? 'available' : 'missing'}`,
        'Telegram deploy is preview-only; use controller live gates for execution.',
      ].join('\n'));
    case 'wallet_assets': {
      if (!config.rpcUrl) return blocked('RPC URL not configured.');
      const keypairPublicKey = config.keypairPath || config.keypairBase58;
      if (!keypairPublicKey) return blocked('No KEYPAIR configured to look up wallet assets.');
      const { loadKeypair } = await import('./keypair.js');
      const keypair = loadKeypair(config);
      if (!keypair) return blocked('Could not load keypair to determine wallet address.');
      const summary = await getWalletSummary(config.rpcUrl, keypair.publicKey.toBase58());
      return ok(formatWalletSummary(summary));
    }
    case 'payments_status':
      return ok(paymentsText(config));
    case 'agents_status':
      return ok(agentsText(config));
    case 'dashboards_status':
      return ok(dashboardsText(config));
    default:
      if (VULCAN_INTENTS.has(intent.action)) {
        return ok(await runPerpsBridge(config, intent));
      }
      return ok(helpText());
  }
}

export async function handleOperatorText(config: OrelaneAppConfig, text: string): Promise<OperatorResponse> {
  const commandIntent = parseCommand(text);
  const intent = commandIntent ?? (await routeWithDeepSeek(config, text));
  return executeIntent(config, intent);
}
