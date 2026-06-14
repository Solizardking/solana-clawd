// Solana Gacha Prize Tier System
// Maps reel outcomes to on-chain prize actions

export const CLAWD_MINT = '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
export const CLAWD_DECIMALS = 6;

export type PrizeTier =
  | 'JACKPOT'
  | 'LEGENDARY'
  | 'EPIC'
  | 'RARE'
  | 'UNCOMMON'
  | 'COMMON'
  | 'LOSS';

export type PrizeType = 'SPL' | 'NFT' | 'PHYGITAL' | 'AI_INFERENCE' | 'VESTING' | 'PERP' | 'USDC' | 'SOL';

export interface PrizeAction {
  type: PrizeType;
  label: string;
  amount?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface GachaPrize {
  tier: PrizeTier;
  displayName: string;
  color: string;
  glowColor: string;
  clawdAmount: number;
  actions: PrizeAction[];
  pokemonCard?: PokemonCard;
  nftUri?: string;
  vestingDays?: number;
  aiPrompt?: string;
}

export interface PokemonCard {
  name: string;
  set: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'ultra-rare' | 'secret-rare';
  number: string;
  year: number;
  holographic: boolean;
  estimatedValueUsd: number;
}

const POKEMON_CARDS: PokemonCard[] = [
  {
    name: 'Charizard',
    set: 'Base Set',
    rarity: 'rare',
    number: '4/102',
    year: 1999,
    holographic: true,
    estimatedValueUsd: 420,
  },
  {
    name: 'Mewtwo',
    set: 'Base Set',
    rarity: 'rare',
    number: '10/102',
    year: 1999,
    holographic: true,
    estimatedValueUsd: 380,
  },
  {
    name: 'Pikachu',
    set: 'Jungle',
    rarity: 'uncommon',
    number: '60/64',
    year: 1999,
    holographic: false,
    estimatedValueUsd: 85,
  },
  {
    name: 'Blastoise',
    set: 'Base Set',
    rarity: 'rare',
    number: '2/102',
    year: 1999,
    holographic: true,
    estimatedValueUsd: 340,
  },
  {
    name: 'Lugia',
    set: 'Neo Genesis',
    rarity: 'rare',
    number: '9/111',
    year: 2000,
    holographic: true,
    estimatedValueUsd: 820,
  },
  {
    name: 'Umbreon',
    set: 'Neo Discovery',
    rarity: 'rare',
    number: '13/75',
    year: 2001,
    holographic: true,
    estimatedValueUsd: 290,
  },
  {
    name: 'Rayquaza',
    set: 'EX Dragon',
    rarity: 'ultra-rare',
    number: '97/97',
    year: 2003,
    holographic: true,
    estimatedValueUsd: 650,
  },
  {
    name: 'Pikachu VMAX',
    set: 'Vivid Voltage',
    rarity: 'secret-rare',
    number: '188/185',
    year: 2020,
    holographic: true,
    estimatedValueUsd: 1200,
  },
];

function pickPokemonCard(tier: PrizeTier): PokemonCard {
  if (tier === 'JACKPOT') return POKEMON_CARDS[7]; // Pikachu VMAX
  if (tier === 'LEGENDARY') return POKEMON_CARDS[Math.floor(Math.random() * 3) + 4]; // Lugia/Umbreon/Rayquaza
  return POKEMON_CARDS[Math.floor(Math.random() * 4)]; // Base Set tier
}

export function buildPrize(fruit0: string, fruit1: string, fruit2: string): GachaPrize {
  const isTriple = fruit0 === fruit1 && fruit1 === fruit2 && fruit0 !== '';
  const isDouble = fruit0 === fruit1 && fruit0 !== '';

  if (isTriple && fruit0 === 'ABYSS_LOBSTER') {
    return {
      tier: 'JACKPOT',
      displayName: 'JACKPOT — Grand Prize',
      color: '#FFD700',
      glowColor: '#FFD700',
      clawdAmount: 50_000,
      vestingDays: 365,
      pokemonCard: pickPokemonCard('JACKPOT'),
      nftUri: 'https://arweave.net/lobster-jackpot-collection',
      aiPrompt: 'You hit the JACKPOT in the Lobster Gacha! You won 50,000 vested CLAWD tokens, a legendary holographic Pikachu VMAX card, and a one-of-a-kind Metaplex Core NFT. Tell me something amazing about this win.',
      actions: [
        { type: 'VESTING', label: '50,000 CLAWD vested 12 months', amount: 50_000, metadata: { vestingDays: 365, cliffDays: 30 } },
        { type: 'USDC',    label: '$500 USDC jackpot bonus', amount: 500 },
        { type: 'SOL',     label: '2 SOL native prize', amount: 2 },
        { type: 'NFT', label: 'Legendary Abyss Lobster NFT minted', metadata: { collection: 'Abyss Lobster Jackpot Series' } },
        { type: 'PHYGITAL', label: 'Pikachu VMAX (SS) physical card + NFT twin', metadata: { set: 'Vivid Voltage', number: '188/185' } },
        { type: 'AI_INFERENCE', label: '100 AI inference credits', amount: 100 },
        { type: 'PERP', label: 'Auto-hedge perp opened on Phoenix DEX', metadata: { side: 'long', size: 500 } },
      ],
    };
  }

  if (isDouble && fruit0 === 'ABYSS_LOBSTER') {
    const card = pickPokemonCard('LEGENDARY');
    return {
      tier: 'LEGENDARY',
      displayName: 'LEGENDARY — Abyss Double',
      color: '#72f6ff',
      glowColor: '#00bfff',
      clawdAmount: 10_000,
      vestingDays: 180,
      pokemonCard: card,
      nftUri: 'https://arweave.net/lobster-legendary-collection',
      aiPrompt: 'You won a LEGENDARY prize in the Lobster Gacha! 10,000 CLAWD tokens vested over 6 months and a rare Pokemon card. Describe this victory.',
      actions: [
        { type: 'VESTING', label: '10,000 CLAWD vested 6 months', amount: 10_000, metadata: { vestingDays: 180, cliffDays: 14 } },
        { type: 'USDC',    label: '$100 USDC legendary bonus', amount: 100 },
        { type: 'SOL',     label: '0.5 SOL native prize', amount: 0.5 },
        { type: 'NFT', label: 'Legendary Abyss Lobster NFT minted', metadata: { collection: 'Abyss Lobster Series' } },
        { type: 'PHYGITAL', label: `${card.name} (${card.set}) physical card + NFT twin`, metadata: { set: card.set } },
        { type: 'AI_INFERENCE', label: '25 AI inference credits', amount: 25 },
      ],
    };
  }

  if (isTriple && fruit0 === 'NEON_CLAW') {
    return {
      tier: 'EPIC',
      displayName: 'EPIC — Neon Triple',
      color: '#ff8f7f',
      glowColor: '#ff4d3f',
      clawdAmount: 5_000,
      nftUri: 'https://arweave.net/neon-claw-epic-collection',
      aiPrompt: 'You won an EPIC prize in the Lobster Gacha! 5,000 CLAWD tokens and a Metaplex Core NFT. Generate an epic battle narrative.',
      actions: [
        { type: 'SPL', label: '5,000 CLAWD tokens airdrop', amount: 5_000 },
        { type: 'NFT', label: 'Neon Claw Epic NFT minted', metadata: { collection: 'Neon Claw Series' } },
        { type: 'AI_INFERENCE', label: '10 AI inference credits', amount: 10 },
      ],
    };
  }

  if (isDouble && fruit0 === 'NEON_CLAW') {
    return {
      tier: 'RARE',
      displayName: 'RARE — Neon Double',
      color: '#d7f8ff',
      glowColor: '#9ae6f6',
      clawdAmount: 1_000,
      nftUri: 'https://arweave.net/neon-claw-rare-collection',
      aiPrompt: 'You won a RARE prize in the Lobster Gacha! 1,000 CLAWD tokens and a rare NFT. Celebrate this rare find.',
      actions: [
        { type: 'SPL', label: '1,000 CLAWD tokens airdrop', amount: 1_000 },
        { type: 'NFT', label: 'Rare Neon Claw NFT minted', metadata: { collection: 'Neon Claw Rares' } },
      ],
    };
  }

  if (isTriple && fruit0 === 'CORAL_TICKET') {
    return {
      tier: 'UNCOMMON',
      displayName: 'UNCOMMON — Coral Triple',
      color: '#ff5b4f',
      glowColor: '#e0372c',
      clawdAmount: 500,
      aiPrompt: 'You won an UNCOMMON prize in the Lobster Gacha! 500 CLAWD tokens. Not bad!',
      actions: [
        { type: 'SPL', label: '500 CLAWD tokens airdrop', amount: 500 },
        { type: 'AI_INFERENCE', label: '3 AI inference credits', amount: 3 },
      ],
    };
  }

  if (isDouble && fruit0 === 'CORAL_TICKET') {
    return {
      tier: 'UNCOMMON',
      displayName: 'UNCOMMON — Coral Double',
      color: '#ff5b4f',
      glowColor: '#e0372c',
      clawdAmount: 200,
      aiPrompt: 'You won 200 CLAWD tokens in the Lobster Gacha. Keep pulling!',
      actions: [
        { type: 'SPL', label: '200 CLAWD tokens airdrop', amount: 200 },
      ],
    };
  }

  if (isTriple && fruit0 === 'PEARL_KERNEL') {
    return {
      tier: 'COMMON',
      displayName: 'COMMON — Pearl Triple',
      color: '#8ee7b3',
      glowColor: '#46c97c',
      clawdAmount: 100,
      aiPrompt: 'A common Pearl triple! 100 CLAWD tokens earned. The lobster gacha rewards patience.',
      actions: [
        { type: 'SPL', label: '100 CLAWD tokens airdrop', amount: 100 },
      ],
    };
  }

  return {
    tier: 'LOSS',
    displayName: 'No Match — Try Again',
    color: 'rgba(242,251,255,0.32)',
    glowColor: 'transparent',
    clawdAmount: 0,
    aiPrompt: 'No match this pull. The lobster gacha is mysterious. Try again.',
    actions: [],
  };
}
