import { chooseSquares } from './strategy.js';
import { oreAmount, solAmount, solToLamports } from './constants.js';
import type { BitaxeSafetyReport, BitaxeSystemInfo } from './bitaxe.js';
import type { BoardState, MinerState, RoundState } from './ore-rpc.js';
import type { BoardAnalysis } from './strategy.js';

export interface HybridPolicyConfig {
  maxDeployPerRoundSol: number;
  minReserveSol: number;
  maxSquaresPerRound: number;
  claimSolThreshold: number;
  claimOreThreshold: number;
  requireHealthyBitaxe: boolean;
}

export interface HybridSnapshot {
  bitaxe: BitaxeSystemInfo;
  bitaxeSafety: BitaxeSafetyReport;
  board: BoardState;
  round: RoundState;
  analysis: BoardAnalysis;
  miner: MinerState | null;
  walletBalanceLamports: bigint;
}

export type HybridDecision =
  | { action: 'hold'; reason: string }
  | { action: 'checkpoint'; reason: string }
  | { action: 'claim'; reason: string }
  | { action: 'deploy'; reason: string; amountLamports: bigint; squares: number[] };

export function decide(snapshot: HybridSnapshot, config: HybridPolicyConfig): HybridDecision {
  if (config.requireHealthyBitaxe && !snapshot.bitaxeSafety.healthy) {
    return {
      action: 'hold',
      reason: `Bitaxe safety gate active: ${snapshot.bitaxeSafety.reasons.join(', ')}`,
    };
  }

  if (snapshot.miner?.checkpointNeeded) {
    return {
      action: 'checkpoint',
      reason: `miner checkpoint ${snapshot.miner.checkpointId} is behind round ${snapshot.miner.roundId}`,
    };
  }

  const claimSolThresholdLamports = solToLamports(config.claimSolThreshold);
  const claimOreThresholdUnits = BigInt(Math.round(config.claimOreThreshold * 10 ** 11));

  if (snapshot.miner && (
    snapshot.miner.rewardsSol >= claimSolThresholdLamports ||
    snapshot.miner.rewardsOre >= claimOreThresholdUnits
  )) {
    return {
      action: 'claim',
      reason: `claim thresholds hit: ${solAmount(snapshot.miner.rewardsSol)} SOL, ${oreAmount(snapshot.miner.rewardsOre)} ORE`,
    };
  }

  if (!snapshot.analysis.miningOpen) {
    return {
      action: 'hold',
      reason: 'ORE mining window is closed',
    };
  }

  const reserveLamports = solToLamports(config.minReserveSol);
  if (snapshot.walletBalanceLamports <= reserveLamports) {
    return {
      action: 'hold',
      reason: `wallet below reserve: ${solAmount(snapshot.walletBalanceLamports)} SOL <= ${config.minReserveSol} SOL`,
    };
  }

  const available = snapshot.walletBalanceLamports - reserveLamports;
  const desired = solToLamports(config.maxDeployPerRoundSol);
  const amountLamports = available < desired ? available : desired;

  if (amountLamports < solToLamports(0.001)) {
    return {
      action: 'hold',
      reason: `deploy budget too small: ${solAmount(amountLamports)} SOL`,
    };
  }

  const squares = chooseSquares(snapshot.analysis, config.maxSquaresPerRound);
  if (squares.length === 0) {
    return {
      action: 'hold',
      reason: 'no deployable squares found',
    };
  }

  return {
    action: 'deploy',
    reason: `deploy ${solAmount(amountLamports)} SOL across squares [${squares.join(', ')}] while Bitaxe is healthy`,
    amountLamports,
    squares,
  };
}

