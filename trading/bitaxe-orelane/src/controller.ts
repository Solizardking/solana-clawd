import { existsSync } from 'node:fs';
import { Connection, type Keypair } from '@solana/web3.js';
import chalk from 'chalk';
import { type BitaxeLimits, evaluateBitaxeSafety, fetchBitaxeSystemInfo } from './bitaxe.js';
import { solAmount } from './constants.js';
import { loadKeypair } from './keypair.js';
import { checkpointMiner, claimRewards, deployToSquares, isOreCliAvailable } from './ore-cli.js';
import { type BoardState, type MinerState, type RoundState, getBoard, getCurrentSlot, getMiner, getRound, getSolBalance } from './ore-rpc.js';
import { type HybridDecision, type HybridPolicyConfig, type HybridSnapshot, decide } from './policy.js';
import { type BoardAnalysis, analyzeBoard, summarizeBoard } from './strategy.js';

export interface HybridControllerConfig {
  rpcUrl: string;
  keypairPath?: string;
  keypairBase58?: string;
  bitaxeUrl: string;
  x402OreUrl: string;
  tickIntervalMs: number;
  dryRun: boolean;
  liveExecution: boolean;
  operatorConfirmed: boolean;
  limits: BitaxeLimits;
  policy: HybridPolicyConfig;
}

export interface SnapshotBundle {
  snapshot: HybridSnapshot;
  keypair: Keypair | null;
}

export interface HybridStatusReport {
  ok: boolean;
  text: string;
  snapshot?: HybridSnapshot;
  decision?: HybridDecision;
  error?: string;
}

export async function collectSnapshot(config: HybridControllerConfig): Promise<SnapshotBundle> {
  const conn = new Connection(config.rpcUrl, 'confirmed');
  const keypair = loadKeypair(config);

  // Phase 1: all independent fetches in parallel
  const [bitaxe, board, currentSlot, miner, walletBalanceLamports] = await Promise.all([
    fetchBitaxeSystemInfo(config.bitaxeUrl),
    getBoard(conn),
    getCurrentSlot(conn),
    keypair ? getMiner(conn, keypair.publicKey) : Promise.resolve(null),
    keypair ? getSolBalance(conn, keypair.publicKey) : Promise.resolve(0n),
  ]);

  const bitaxeSafety = evaluateBitaxeSafety(bitaxe, config.limits);

  // Phase 2: round depends on board.roundId
  const round = await getRound(conn, board.roundId);
  const analysis = analyzeBoard(round, currentSlot, board.endSlot);

  return {
    keypair,
    snapshot: { bitaxe, bitaxeSafety, board, round, analysis, miner, walletBalanceLamports },
  };
}

export function formatSnapshotLines(snapshot: HybridSnapshot): string[] {
  const lines = [
    `Bitaxe board=${snapshot.bitaxe.boardVersion} fw=${snapshot.bitaxe.version} axeOS=${snapshot.bitaxe.axeOSVersion}`,
    `Bitaxe hashrate=${snapshot.bitaxe.hashRate.toFixed(2)}Gh/s power=${snapshot.bitaxe.power.toFixed(2)}W temp=${snapshot.bitaxe.temp}C cpu=${snapshot.bitaxe.cpuUsage}% heap=${snapshot.bitaxe.freeHeap}`,
    `Bitaxe wifi=${snapshot.bitaxe.wifiRSSI}dBm pool=${snapshot.bitaxe.stratumURL} paused=${snapshot.bitaxe.miningPaused}`,
    `Bitaxe healthy=${snapshot.bitaxeSafety.healthy}${snapshot.bitaxeSafety.healthy ? '' : ` reasons=${snapshot.bitaxeSafety.reasons.join('; ')}`}`,
    `Wallet balance=${solAmount(snapshot.walletBalanceLamports)} SOL`,
  ];
  if (snapshot.miner) {
    lines.push(`Miner rewards=${solAmount(snapshot.miner.rewardsSol)} SOL checkpointNeeded=${snapshot.miner.checkpointNeeded}`);
  } else {
    lines.push('Miner account=not created yet');
  }
  lines.push(summarizeBoard(snapshot.round, snapshot.analysis));
  return lines;
}

function logSnapshot(snapshot: HybridSnapshot): void {
  console.log(chalk.cyan('━━━ SNAPSHOT ━━━'));
  for (const line of formatSnapshotLines(snapshot)) {
    console.log(line);
  }
}

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.search) {
      url.search = '?redacted';
    }
    if (url.password) {
      url.password = 'redacted';
    }
    return url.toString();
  } catch {
    return '<configured>';
  }
}

async function logBitaxeOnly(config: HybridControllerConfig, reason: unknown): Promise<void> {
  const bitaxe = await fetchBitaxeSystemInfo(config.bitaxeUrl);
  const bitaxeSafety = evaluateBitaxeSafety(bitaxe, config.limits);

  console.log(chalk.cyan('━━━ BITAXE STATUS ━━━'));
  console.log(`Bitaxe board=${bitaxe.boardVersion} fw=${bitaxe.version} axeOS=${bitaxe.axeOSVersion}`);
  console.log(`Bitaxe hashrate=${bitaxe.hashRate}Gh/s power=${bitaxe.power}W temp=${bitaxe.temp}C cpu=${bitaxe.cpuUsage}% heap=${bitaxe.freeHeap}`);
  console.log(`Bitaxe wifi=${bitaxe.wifiRSSI}dBm pool=${bitaxe.stratumURL} paused=${bitaxe.miningPaused}`);
  console.log(`Bitaxe healthy=${bitaxeSafety.healthy}${bitaxeSafety.healthy ? '' : ` reasons=${bitaxeSafety.reasons.join('; ')}`}`);
  console.log(chalk.yellow(`ORE status unavailable: ${reason instanceof Error ? reason.message : String(reason)}`));
}

export async function executeDecision(decision: HybridDecision, config: HybridControllerConfig): Promise<void> {
  console.log(chalk.magenta(`Decision: ${decision.action} — ${decision.reason}`));

  if (config.dryRun) {
    console.log(chalk.yellow('Dry run enabled, no transaction executed.'));
    return;
  }

  if (!config.liveExecution || !config.operatorConfirmed) {
    console.log(chalk.red('Live execution gates are not armed; set LIVE_EXECUTION=true and OPERATOR_CONFIRMED=true to execute.'));
    return;
  }

  if (!isOreCliAvailable()) {
    console.log(chalk.red('ore-cli binary not available; skipping execution.'));
    return;
  }
  if (!config.keypairPath && !config.keypairBase58) {
    console.log(chalk.red('No KEYPAIR path or KEYPAIR_BASE58 configured; skipping execution.'));
    return;
  }
  if (config.keypairPath && !existsSync(config.keypairPath) && !config.keypairBase58) {
    console.log(chalk.red('No valid KEYPAIR path configured; skipping execution.'));
    return;
  }

  switch (decision.action) {
    case 'hold':
      return;
    case 'checkpoint': {
      const result = await checkpointMiner();
      console.log(result.success ? chalk.green(result.stdout || 'checkpoint submitted') : chalk.red(result.stderr));
      return;
    }
    case 'claim': {
      const result = await claimRewards();
      console.log(result.success ? chalk.green(result.stdout || 'claim submitted') : chalk.red(result.stderr));
      return;
    }
    case 'deploy': {
      const result = await deployToSquares(decision.amountLamports, decision.squares);
      console.log(result.success ? chalk.green(result.stdout || 'deploy submitted') : chalk.red(result.stderr));
      return;
    }
  }
}

export async function runOnce(config: HybridControllerConfig): Promise<void> {
  const { snapshot } = await collectSnapshot(config);
  logSnapshot(snapshot);
  const decision = decide(snapshot, config.policy);
  await executeDecision(decision, config);
}

export async function getHybridStatusReport(config: HybridControllerConfig): Promise<HybridStatusReport> {
  try {
    const { snapshot } = await collectSnapshot(config);
    const decision = decide(snapshot, config.policy);
    return {
      ok: true,
      snapshot,
      decision,
      text: [
        ...formatSnapshotLines(snapshot),
        `Decision=${decision.action} reason=${decision.reason}`,
      ].join('\n'),
    };
  } catch (error) {
    const bitaxe = await fetchBitaxeSystemInfo(config.bitaxeUrl);
    const bitaxeSafety = evaluateBitaxeSafety(bitaxe, config.limits);
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: reason,
      text: [
        `Bitaxe board=${bitaxe.boardVersion} fw=${bitaxe.version} axeOS=${bitaxe.axeOSVersion}`,
        `Bitaxe hashrate=${bitaxe.hashRate.toFixed(2)}Gh/s power=${bitaxe.power.toFixed(2)}W temp=${bitaxe.temp}C cpu=${bitaxe.cpuUsage}% heap=${bitaxe.freeHeap}`,
        `Bitaxe wifi=${bitaxe.wifiRSSI}dBm pool=${bitaxe.stratumURL} paused=${bitaxe.miningPaused}`,
        `Bitaxe healthy=${bitaxeSafety.healthy}${bitaxeSafety.healthy ? '' : ` reasons=${bitaxeSafety.reasons.join('; ')}`}`,
        `ORE status unavailable: ${reason}`,
      ].join('\n'),
    };
  }
}

export async function runStatus(config: HybridControllerConfig): Promise<void> {
  try {
    await runOnce(config);
  } catch (error) {
    await logBitaxeOnly(config, error);
  }
}

export async function runLoop(config: HybridControllerConfig): Promise<void> {
  console.log(chalk.cyan('━━━ BITAXE ORELANE LOOP ━━━'));
  console.log(`bitaxe=${config.bitaxeUrl} rpc=${redactUrl(config.rpcUrl)}`);
  console.log(`x402Ore=${config.x402OreUrl}`);
  console.log(`ore-cli=${isOreCliAvailable() ? 'available' : 'missing'} dryRun=${config.dryRun} liveExecution=${config.liveExecution} operatorConfirmed=${config.operatorConfirmed}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce(config);
    } catch (error) {
      console.error(chalk.red(`Loop error: ${error instanceof Error ? error.message : String(error)}`));
    }
    await new Promise((resolve) => setTimeout(resolve, config.tickIntervalMs));
  }
}

export type { BoardState, BoardAnalysis, MinerState, RoundState };
