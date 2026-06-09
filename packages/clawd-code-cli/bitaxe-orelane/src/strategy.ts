import { solAmount } from './constants.js';
import type { RoundState } from './ore-rpc.js';

export interface SquareAnalysis {
  index: number;
  deployed: bigint;
  miners: bigint;
  expectedValue: number;
  isEmpty: boolean;
  isUnderbet: boolean;
}

export interface BoardAnalysis {
  totalDeployed: bigint;
  totalMiners: bigint;
  squares: SquareAnalysis[];
  topSquares: number[];
  emptySquares: number[];
  miningOpen: boolean;
  miningSecondsRemaining: number;
  claimHoursRemaining: number;
}

export function analyzeBoard(round: RoundState, currentSlot: bigint, boardEndSlot: bigint): BoardAnalysis {
  const total = round.totalDeployed;
  const miningOpen = currentSlot < boardEndSlot;
  const miningSecondsRemaining = miningOpen ? Number(boardEndSlot - currentSlot) * 0.4 : 0;
  const claimHoursRemaining = round.expiresAt > currentSlot
    ? Number(round.expiresAt - currentSlot) * 0.4 / 3600
    : 0;

  const squares = round.deployed.map((deployed, index) => {
    const others = total - deployed;
    const expectedValue = deployed === 0n ? 99 : Number(others) / Number(deployed);
    return {
      index,
      deployed,
      miners: round.count[index] ?? 0n,
      expectedValue,
      isEmpty: deployed === 0n,
      isUnderbet: expectedValue > 1,
    };
  });

  const topSquares = [...squares]
    .sort((a, b) => b.expectedValue - a.expectedValue)
    .map((square) => square.index);

  const emptySquares = squares.filter((square) => square.isEmpty).map((square) => square.index);

  return {
    totalDeployed: total,
    totalMiners: round.totalMiners,
    squares,
    topSquares,
    emptySquares,
    miningOpen,
    miningSecondsRemaining,
    claimHoursRemaining,
  };
}

export function chooseSquares(analysis: BoardAnalysis, maxSquares: number): number[] {
  const picks: number[] = [];

  for (const square of analysis.emptySquares) {
    if (picks.length >= maxSquares) {
      break;
    }
    picks.push(square);
  }

  if (picks.length < maxSquares) {
    for (const square of analysis.topSquares) {
      if (picks.includes(square)) {
        continue;
      }
      picks.push(square);
      if (picks.length >= maxSquares) {
        break;
      }
    }
  }

  return picks;
}

export function summarizeBoard(round: RoundState, analysis: BoardAnalysis): string {
  const top = analysis.topSquares.slice(0, 5).join(', ');
  const empties = analysis.emptySquares.join(', ') || 'none';
  return [
    `round=${round.id}`,
    `miningOpen=${analysis.miningOpen}`,
    `miningSecondsRemaining=${analysis.miningSecondsRemaining.toFixed(0)}`,
    `claimHoursRemaining=${analysis.claimHoursRemaining.toFixed(1)}`,
    `totalDeployed=${solAmount(round.totalDeployed)} SOL`,
    `emptySquares=[${empties}]`,
    `topSquares=[${top}]`,
  ].join(' | ');
}

