import { describe, expect, it } from 'vitest';
import { analyzeBoard, chooseSquares, summarizeBoard } from '../strategy.js';
import type { RoundState } from '../ore-rpc.js';

function makeRound(overrides: Partial<RoundState> = {}): RoundState {
  const deployed = new Array(25).fill(0n) as bigint[];
  const count = new Array(25).fill(0n) as bigint[];
  return {
    address: 'fakeaddress',
    id: 1n,
    deployed,
    count,
    expiresAt: 1000n,
    motherlode: 0n,
    topMiner: 'fake',
    topMinerReward: 0n,
    totalDeployed: deployed.reduce((a, b) => a + b, 0n),
    totalMiners: 0n,
    totalVaulted: 0n,
    totalWinnings: 0n,
    slotHashRevealed: false,
    winningSquare: null,
    ...overrides,
  };
}

describe('analyzeBoard', () => {
  it('marks mining open when currentSlot < boardEndSlot', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 100n, 200n);
    expect(analysis.miningOpen).toBe(true);
  });

  it('marks mining closed when currentSlot >= boardEndSlot', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 200n, 200n);
    expect(analysis.miningOpen).toBe(false);
    expect(analysis.miningSecondsRemaining).toBe(0);
  });

  it('identifies empty squares', () => {
    const deployed = new Array(25).fill(0n) as bigint[];
    deployed[3] = 1_000_000n;
    const round = makeRound({ deployed, totalDeployed: 1_000_000n });
    const analysis = analyzeBoard(round, 100n, 200n);
    expect(analysis.emptySquares).toHaveLength(24);
    expect(analysis.emptySquares).not.toContain(3);
  });

  it('marks all squares empty when nothing deployed', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 100n, 200n);
    expect(analysis.emptySquares).toHaveLength(25);
  });

  it('computes claimHoursRemaining correctly', () => {
    const round = makeRound({ expiresAt: 9100n });
    // 9100 - 100 = 9000 slots * 0.4s = 3600s = 1h
    const analysis = analyzeBoard(round, 100n, 200n);
    expect(analysis.claimHoursRemaining).toBeCloseTo(1, 1);
  });
});

describe('chooseSquares', () => {
  it('picks empty squares first', () => {
    const deployed = new Array(25).fill(1_000_000n) as bigint[];
    deployed[5] = 0n;
    deployed[10] = 0n;
    const round = makeRound({ deployed, totalDeployed: 23_000_000n });
    const analysis = analyzeBoard(round, 100n, 200n);
    const picks = chooseSquares(analysis, 3);
    expect(picks).toContain(5);
    expect(picks).toContain(10);
  });

  it('respects maxSquares limit', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 100n, 200n);
    const picks = chooseSquares(analysis, 3);
    expect(picks.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for zero maxSquares', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 100n, 200n);
    expect(chooseSquares(analysis, 0)).toHaveLength(0);
  });

  it('avoids duplicate squares', () => {
    const round = makeRound();
    const analysis = analyzeBoard(round, 100n, 200n);
    const picks = chooseSquares(analysis, 5);
    const unique = new Set(picks);
    expect(unique.size).toBe(picks.length);
  });
});

describe('summarizeBoard', () => {
  it('returns a non-empty string', () => {
    const round = makeRound({ id: 42n });
    const analysis = analyzeBoard(round, 100n, 200n);
    const summary = summarizeBoard(round, analysis);
    expect(summary).toContain('round=42');
    expect(summary).toContain('miningOpen=');
  });
});
