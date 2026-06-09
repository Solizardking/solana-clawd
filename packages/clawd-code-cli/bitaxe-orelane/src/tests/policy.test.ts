import { describe, expect, it } from 'vitest';
import { decide } from '../policy.js';
import type { HybridPolicyConfig, HybridSnapshot } from '../policy.js';
import { analyzeBoard } from '../strategy.js';
import type { BoardState, MinerState, RoundState } from '../ore-rpc.js';
import type { BitaxeSafetyReport, BitaxeSystemInfo } from '../bitaxe.js';

const HEALTHY_BITAXE: BitaxeSystemInfo = {
  boardVersion: '602', version: 'v2.10.1', axeOSVersion: 'v2.10.1',
  hashRate: 800, hashRate_1m: 800, hashRate_10m: 790, hashRate_1h: 785,
  expectedHashrate: 800, power: 16.5, current: 4000, voltage: 4100,
  temp: 54, temp2: 0, vrTemp: 60, cpuUsage: 30, freeHeap: 200000,
  wifiStatus: 'connected', wifiRSSI: -52,
  poolDifficulty: 1024, networkDifficulty: 100000,
  miningPaused: false, overheat_mode: 0,
  sharesAccepted: 100, sharesRejected: 1,
  uptimeSeconds: 3600, stratumURL: 'public-pool.io', stratumProtocol: 'SV1',
};

const HEALTHY_SAFETY: BitaxeSafetyReport = { healthy: true, reasons: [] };
const UNHEALTHY_SAFETY: BitaxeSafetyReport = { healthy: false, reasons: ['chip temp 80C > 72C'] };

const BOARD: BoardState = { address: 'fakeboard', roundId: 1n, startSlot: 0n, endSlot: 1000n, epochId: 0n };

function makeRound(overrides: Partial<RoundState> = {}): RoundState {
  const deployed = new Array(25).fill(0n) as bigint[];
  return {
    address: 'fakeround', id: 1n, deployed,
    count: new Array(25).fill(0n) as bigint[],
    expiresAt: 2000n, motherlode: 0n, topMiner: 'fake', topMinerReward: 0n,
    totalDeployed: 0n, totalMiners: 0n, totalVaulted: 0n, totalWinnings: 0n,
    slotHashRevealed: false, winningSquare: null,
    ...overrides,
  };
}

const POLICY: HybridPolicyConfig = {
  maxDeployPerRoundSol: 0.05,
  minReserveSol: 0.05,
  maxSquaresPerRound: 3,
  claimSolThreshold: 0.01,
  claimOreThreshold: 0.5,
  requireHealthyBitaxe: true,
};

function makeSnapshot(overrides: Partial<HybridSnapshot> = {}): HybridSnapshot {
  const round = makeRound();
  const analysis = analyzeBoard(round, 100n, 1000n);
  return {
    bitaxe: HEALTHY_BITAXE,
    bitaxeSafety: HEALTHY_SAFETY,
    board: BOARD,
    round,
    analysis,
    miner: null,
    walletBalanceLamports: 200_000_000n, // 0.2 SOL
    ...overrides,
  };
}

describe('decide', () => {
  it('holds when Bitaxe safety gate fails', () => {
    const snapshot = makeSnapshot({ bitaxeSafety: UNHEALTHY_SAFETY });
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('safety gate');
  });

  it('ignores safety gate when requireHealthyBitaxe=false', () => {
    const snapshot = makeSnapshot({ bitaxeSafety: UNHEALTHY_SAFETY });
    const policy = { ...POLICY, requireHealthyBitaxe: false };
    const decision = decide(snapshot, policy);
    expect(decision.action).not.toBe('hold');
  });

  it('checkpoints when miner is behind', () => {
    const miner: MinerState = {
      address: 'fakeminer', authority: 'fake',
      deployed: new Array(25).fill(0n) as bigint[],
      cumulative: new Array(25).fill(0n) as bigint[],
      checkpointFee: 0n, checkpointId: 0n, rewardsSol: 0n, rewardsOre: 0n,
      refinedOre: 0n, roundId: 5n, lifetimeSol: 0n, lifetimeOre: 0n,
      lifetimeDeployed: 0n, checkpointNeeded: true,
    };
    const snapshot = makeSnapshot({ miner });
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('checkpoint');
  });

  it('claims when SOL rewards exceed threshold', () => {
    const miner: MinerState = {
      address: 'fakeminer', authority: 'fake',
      deployed: new Array(25).fill(0n) as bigint[],
      cumulative: new Array(25).fill(0n) as bigint[],
      checkpointFee: 0n, checkpointId: 5n, rewardsSol: 20_000_000n, // 0.02 SOL > 0.01 threshold
      rewardsOre: 0n, refinedOre: 0n, roundId: 5n,
      lifetimeSol: 0n, lifetimeOre: 0n, lifetimeDeployed: 0n,
      checkpointNeeded: false,
    };
    const snapshot = makeSnapshot({ miner });
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('claim');
  });

  it('holds when mining window is closed', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 2000n, 1000n); // currentSlot > endSlot
    const snapshot = makeSnapshot({ analysis });
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('mining window');
  });

  it('holds when wallet below reserve', () => {
    const snapshot = makeSnapshot({ walletBalanceLamports: 10_000_000n }); // 0.01 SOL < 0.05 reserve
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('hold');
    expect(decision.reason).toContain('reserve');
  });

  it('deploys when all conditions are met', () => {
    const snapshot = makeSnapshot({ walletBalanceLamports: 500_000_000n }); // 0.5 SOL
    const decision = decide(snapshot, POLICY);
    expect(decision.action).toBe('deploy');
    if (decision.action === 'deploy') {
      expect(decision.squares.length).toBeGreaterThan(0);
      expect(decision.amountLamports).toBeGreaterThan(0n);
    }
  });
});
