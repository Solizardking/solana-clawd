export type DarkSwapToken = "SOL" | "USDC" | "USDT" | "JUP" | "mSOL" | "BONK" | "PYTH";

export interface DarkSwapRoute {
  venue: string;
  label: string;
  note: string;
  slippageBps: number;
  speed: "fast" | "balanced" | "deep";
}

export interface DarkSwapQuote {
  inputToken: DarkSwapToken;
  outputToken: DarkSwapToken;
  inputAmount: number;
  outputAmount: number;
  route: DarkSwapRoute;
  slippageBps: number;
  spotRate: number;
}

export const DARK_SWAP_TOKENS: Record<DarkSwapToken, { symbol: DarkSwapToken; display: string; routeWeight: number }> = {
  SOL: { symbol: "SOL", display: "Solana", routeWeight: 1 },
  USDC: { symbol: "USDC", display: "USD Coin", routeWeight: 0.00665 },
  USDT: { symbol: "USDT", display: "Tether", routeWeight: 0.00663 },
  JUP: { symbol: "JUP", display: "Jupiter", routeWeight: 0.0011 },
  mSOL: { symbol: "mSOL", display: "Marinade SOL", routeWeight: 1.015 },
  BONK: { symbol: "BONK", display: "Bonk", routeWeight: 0.000000012 },
  PYTH: { symbol: "PYTH", display: "Pyth", routeWeight: 0.00082 },
};

export const DARK_SWAP_ROUTES: DarkSwapRoute[] = [
  {
    venue: "Jupiter Ultra",
    label: "Best price path",
    note: "Balances price impact with healthy liquidity.",
    slippageBps: 35,
    speed: "balanced",
  },
  {
    venue: "Orca / Phoenix",
    label: "Deep stable route",
    note: "Useful for SOL and stablecoin edges.",
    slippageBps: 20,
    speed: "deep",
  },
  {
    venue: "Direct pool",
    label: "Fast direct route",
    note: "Minimal hops when the pair is already liquid.",
    slippageBps: 60,
    speed: "fast",
  },
];

export function estimateDarkSwap(
  inputToken: DarkSwapToken,
  outputToken: DarkSwapToken,
  inputAmount: number,
  slippageBps = 50,
): DarkSwapQuote {
  const input = DARK_SWAP_TOKENS[inputToken];
  const output = DARK_SWAP_TOKENS[outputToken];
  const spotRate = input.routeWeight / output.routeWeight;
  const route = pickDarkSwapRoute(inputToken, outputToken);
  const slip = Math.max(slippageBps, route.slippageBps) / 10_000;
  const outputAmount = Math.max(inputAmount * spotRate * (1 - slip), 0);

  return {
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    route,
    slippageBps: Math.max(slippageBps, route.slippageBps),
    spotRate,
  };
}

export function pickDarkSwapRoute(
  inputToken: DarkSwapToken,
  outputToken: DarkSwapToken,
): DarkSwapRoute {
  if (inputToken === outputToken) {
    return DARK_SWAP_ROUTES[0];
  }

  if (inputToken === "SOL" || outputToken === "SOL" || inputToken === "USDC" || outputToken === "USDC") {
    return DARK_SWAP_ROUTES[1];
  }

  return DARK_SWAP_ROUTES[0];
}

