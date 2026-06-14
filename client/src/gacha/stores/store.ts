/*
 * Copyright (c) Michael Kolesidis <michael.kolesidis@gmail.com>
 * GNU Affero General Public License v3.0
 *
 * ATTENTION! FREE SOFTWARE
 * This website is free software (free as in freedom).
 * If you use any part of this code, you must make your entire project's source code
 * publicly available under the same license. This applies whether you modify the code
 * or use it as it is in your own project. This ensures that all modifications and
 * derivative works remain free software, so that everyone can benefit.
 * If you are not willing to comply with these terms, you must refrain from using any part of this code.
 *
 * For full license terms and conditions, you can read the AGPL-3.0 here:
 * https://www.gnu.org/licenses/agpl-3.0.html
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Fruit } from '../utils/enums';

const BET_TIERS = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 500];

export type AgentProgramId = 'sugarScout' | 'mintStrategist' | 'batchOptimizer';

export type AgentProgram = {
  id: AgentProgramId;
  name: string;
  trait: string;
  directive: string;
};

export type CandyStock = {
  abyssLobsters: number;
  neonClaws: number;
  pearlKernels: number;
  coralTickets: number;
};

export const AGENT_PROGRAMS: AgentProgram[] = [
  {
    id: 'sugarScout',
    name: 'Shell Scout',
    trait: 'Finds fast capsules',
    directive: 'Pull while the bank can afford the current capsule cost.',
  },
  {
    id: 'mintStrategist',
    name: 'Mint Strategist',
    trait: 'Protects prize inventory',
    directive: 'Keeps costs steady and records every capsule reveal.',
  },
  {
    id: 'batchOptimizer',
    name: 'Capsule Optimizer',
    trait: 'Chases rarity streaks',
    directive: 'Auto-runs the machine and upgrades collection progress.',
  },
];

type State = {
  isMobile: boolean;
  setIsMobile: (value: boolean) => void;
  modal: boolean;
  setModal: (isOpen: boolean) => void;
  coins: number;
  updateCoins: (amount: number) => void;
  fruit0: Fruit | '';
  setFruit0: (fr: Fruit | '') => void;
  fruit1: Fruit | '';
  setFruit1: (fr: Fruit | '') => void;
  fruit2: Fruit | '';
  setFruit2: (fr: Fruit | '') => void;
  showBars: boolean;
  toggleBars: () => void;
  bet: number;
  appliedBet: number;
  updateBet: (direction: number) => void;
  validateBet: () => void;
  win: number;
  setWin: (amount: number) => void;
  spins: number;
  addSpin: () => void;
  startTime: number;
  endTime: number;
  phase: 'idle' | 'spinning';
  start: (betAtLaunch: number) => void;
  end: () => void;
  firstTime: boolean;
  setFirstTime: (isFirstTime: boolean) => void;
  agentMode: boolean;
  activeAgentId: AgentProgramId;
  candyStock: CandyStock;
  missionProgress: number;
  agentLog: string[];
  toggleAgentMode: () => void;
  setActiveAgent: (id: AgentProgramId) => void;
  recordAgentOutcome: (
    fruits: [Fruit | '', Fruit | '', Fruit | ''],
    coinsWon: number,
  ) => void;
};

const candyLabels: Record<keyof CandyStock, string> = {
  abyssLobsters: 'abyss lobsters',
  neonClaws: 'neon claws',
  pearlKernels: 'pearl kernels',
  coralTickets: 'coral tickets',
};

const fruitCandyMap: Record<Fruit, keyof CandyStock> = {
  [Fruit.abyssLobster]: 'abyssLobsters',
  [Fruit.neonClaw]: 'neonClaws',
  [Fruit.pearlKernel]: 'pearlKernels',
  [Fruit.coralTicket]: 'coralTickets',
};

const createAgentLogEntry = (
  agentId: AgentProgramId,
  stockKey: keyof CandyStock | null,
  candiesMade: number,
  coinsWon: number,
) => {
  const agent = AGENT_PROGRAMS.find((program) => program.id === agentId);
  const agentName = agent?.name ?? 'Capsule Agent';
  const candyText = stockKey
    ? `${candiesMade} ${candyLabels[stockKey]}`
    : 'no prize';
  const winText = coinsWon > 0 ? ` and banked ${coinsWon} shell credits` : '';
  return `${agentName} produced ${candyText}${winText}.`;
};

const useGame = create<State>()(
  subscribeWithSelector((set) => ({
    isMobile: window.innerWidth < 768,
    setIsMobile: (value: boolean) => set(() => ({ isMobile: value })),
    modal: false,
    setModal: (isOpen: boolean) => set({ modal: isOpen }),

    /**
     * Coins: Just updates the value.
     * Snap-down logic removed from here to prevent bet resetting mid-spin.
     */
    coins: 1000,
    updateCoins: (amount: number) => {
      set((state) => ({ coins: state.coins + amount }));
    },

    fruit0: '',
    setFruit0: (fr: Fruit | '') => set({ fruit0: fr }),
    fruit1: '',
    setFruit1: (fr: Fruit | '') => set({ fruit1: fr }),
    fruit2: '',
    setFruit2: (fr: Fruit | '') => set({ fruit2: fr }),
    showBars: false,
    toggleBars: () => set((state) => ({ showBars: !state.showBars })),

    /**
     * Bet Logic
     */
    bet: 1,
    appliedBet: 1,
    updateBet: (direction: number) => {
      set((state) => {
        const currentIndex = BET_TIERS.indexOf(state.bet);
        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= BET_TIERS.length) return {};
        const newBet = BET_TIERS[nextIndex];
        if (newBet > state.coins && direction > 0) return {};
        return { bet: newBet };
      });
    },

    /**
     * Validate Bet: Called only when the round ends to check
     * if the player can still afford their current bet tier.
     */
    validateBet: () => {
      set((state) => {
        if (state.bet > state.coins) {
          const affordableTiers = BET_TIERS.filter((t) => t <= state.coins);
          const currentBet =
            affordableTiers.length > 0
              ? affordableTiers[affordableTiers.length - 1]
              : BET_TIERS[0];
          return { bet: currentBet };
        }
        return {};
      });
    },

    win: 0,
    setWin: (amount: number) => set({ win: amount }),
    spins: 0,
    addSpin: () => set((state) => ({ spins: state.spins + 1 })),
    startTime: 0,
    endTime: 0,
    phase: 'idle',
    start: (betAtLaunch: number) => {
      set((state) => {
        if (state.phase === 'idle') {
          return {
            phase: 'spinning',
            startTime: Date.now(),
            appliedBet: betAtLaunch,
          };
        }
        return {};
      });
    },
    end: () => {
      set((state) => {
        if (state.phase === 'spinning') {
          return { phase: 'idle', endTime: Date.now() };
        }
        return {};
      });
    },
    firstTime: true,
    setFirstTime: (isFirstTime: boolean) => set({ firstTime: isFirstTime }),
    agentMode: false,
    activeAgentId: 'sugarScout',
    candyStock: {
      abyssLobsters: 0,
      neonClaws: 0,
      pearlKernels: 0,
      coralTickets: 0,
    },
    missionProgress: 0,
    agentLog: ['Shell Scout is ready to run the lobster gacha machine.'],
    toggleAgentMode: () => {
      set((state) => ({
        agentMode: !state.agentMode,
        agentLog: [
          !state.agentMode
            ? 'Agent mode engaged. The machine will pull when idle.'
            : 'Agent mode paused. Manual control restored.',
          ...state.agentLog,
        ].slice(0, 5),
      }));
    },
    setActiveAgent: (id: AgentProgramId) => {
      set((state) => {
        const agent = AGENT_PROGRAMS.find((program) => program.id === id);
        return {
          activeAgentId: id,
          agentLog: [
            `${agent?.name ?? 'Capsule Agent'} loaded into the gacha dispenser.`,
            ...state.agentLog,
          ].slice(0, 5),
        };
      });
    },
    recordAgentOutcome: (fruits, coinsWon) => {
      set((state) => {
        const [firstFruit, secondFruit, thirdFruit] = fruits;
        const matchedFruit =
          firstFruit !== '' && firstFruit === secondFruit
            ? firstFruit
            : firstFruit !== '' &&
                firstFruit === secondFruit &&
                firstFruit === thirdFruit
              ? firstFruit
              : '';
        const stockKey = matchedFruit
          ? fruitCandyMap[matchedFruit as Fruit]
          : null;
        const candiesMade = stockKey ? (thirdFruit === matchedFruit ? 3 : 1) : 0;
        const nextStock = { ...state.candyStock };

        if (stockKey) {
          nextStock[stockKey] += candiesMade;
        }

        return {
          candyStock: nextStock,
          missionProgress: Math.min(
            100,
            state.missionProgress + candiesMade * 8 + (coinsWon > 0 ? 4 : 1),
          ),
          agentLog: [
            createAgentLogEntry(
              state.activeAgentId,
              stockKey,
              candiesMade,
              coinsWon,
            ),
            ...state.agentLog,
          ].slice(0, 5),
        };
      });
    },
  })),
);

export default useGame;
