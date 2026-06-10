/**
 * Safety policy for Box-hosted perps workflows.
 *
 * This module intentionally contains no signing or private-key handling. It
 * builds observable/paper/live-preview plans that a human or external executor
 * can inspect before any capital is put at risk.
 */

export type PerpsSide = "long" | "short";
export type PerpsExecutionMode = "observe" | "paper" | "live-preview";

export interface BoxPerpsConfig {
  allowedSymbols: string[];
  maxNotionalUsd: number;
  maxLeverage: number;
  maxSpreadBps: number;
  liveTrading: boolean;
  operatorConfirmed: boolean;
  simOnly: boolean;
  rpcConfigured: boolean;
  walletReferenceConfigured: boolean;
}

export interface PerpsIntent {
  symbol: string;
  side: PerpsSide;
  notionalUsd: number;
  leverage: number;
  expectedSpreadBps: number;
  execution: PerpsExecutionMode;
}

export interface PerpsPreflight {
  ok: boolean;
  mode: PerpsExecutionMode;
  blocking: string[];
  warnings: string[];
}

export interface PerpsPlan {
  intent: PerpsIntent;
  config: BoxPerpsConfig;
  preflight: PerpsPreflight;
  wallet: {
    mode: "ephemeral-agent-wallet";
    publicKey?: string;
    signing: "simulation-only";
  };
  dataSources: {
    rpc: boolean;
    jupiter: boolean;
    helius: boolean;
    phoenix: boolean;
  };
  route: {
    adapter: "vulcan";
    command: string;
    args: string[];
  };
  notes: string[];
}

export function loadBoxPerpsConfig(env: NodeJS.ProcessEnv = process.env): BoxPerpsConfig {
  return {
    allowedSymbols: parseSymbols(env.PERPS_ALLOWED_SYMBOLS ?? "SOL,ETH,BTC"),
    maxNotionalUsd: parsePositiveNumber(env.PERPS_MAX_NOTIONAL_USD, 250),
    maxLeverage: parsePositiveNumber(env.PERPS_MAX_LEVERAGE, 3),
    maxSpreadBps: parsePositiveNumber(env.PERPS_MAX_SPREAD_BPS, 40),
    liveTrading: env.LIVE_TRADING === "true",
    operatorConfirmed: env.OPERATOR_CONFIRMED === "true",
    simOnly: env.PERPS_SIM_ONLY !== "false",
    rpcConfigured: Boolean(env.SOLANA_RPC_URL ?? env.RPC_URL),
    walletReferenceConfigured: Boolean(env.PERPS_WALLET_ADDRESS ?? env.WALLET_PUBLIC_KEY),
  };
}

export function parsePerpsCliArgs(args: string[]): PerpsIntent {
  return normalizeIntent({
    symbol: readFlag(args, "--symbol") ?? "SOL",
    side: readFlag(args, "--side") ?? "long",
    notionalUsd: readFlag(args, "--notional") ?? "100",
    leverage: readFlag(args, "--leverage") ?? "1",
    expectedSpreadBps: readFlag(args, "--spread-bps") ?? "10",
    execution: readFlag(args, "--execution") ?? "paper",
  });
}

export function normalizeIntent(input: Record<string, unknown>): PerpsIntent {
  const symbol = String(input.symbol ?? "SOL").trim().toUpperCase();
  const side = String(input.side ?? "long").trim().toLowerCase();
  const execution = String(input.execution ?? "paper").trim().toLowerCase();

  if (side !== "long" && side !== "short") {
    throw new Error(`Unsupported perps side: ${side}`);
  }

  if (!["observe", "paper", "live-preview"].includes(execution)) {
    throw new Error(`Unsupported perps execution mode: ${execution}`);
  }

  return {
    symbol,
    side,
    notionalUsd: parsePositiveNumber(input.notionalUsd ?? input.notional, 100),
    leverage: parsePositiveNumber(input.leverage, 1),
    expectedSpreadBps: parsePositiveNumber(input.expectedSpreadBps ?? input.spreadBps, 10),
    execution: execution as PerpsExecutionMode,
  };
}

export function buildBoxPerpsPreflight(config: BoxPerpsConfig, intent: PerpsIntent): PerpsPreflight {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!config.allowedSymbols.includes(intent.symbol)) {
    blocking.push(`${intent.symbol} is not in PERPS_ALLOWED_SYMBOLS`);
  }

  if (intent.notionalUsd > config.maxNotionalUsd) {
    blocking.push(`notional ${intent.notionalUsd} exceeds max ${config.maxNotionalUsd}`);
  }

  if (intent.leverage > config.maxLeverage) {
    blocking.push(`leverage ${intent.leverage} exceeds max ${config.maxLeverage}`);
  }

  if (intent.expectedSpreadBps > config.maxSpreadBps) {
    blocking.push(`spread ${intent.expectedSpreadBps}bps exceeds max ${config.maxSpreadBps}bps`);
  }

  if (!config.rpcConfigured) {
    warnings.push("No SOLANA_RPC_URL/RPC_URL configured; market data may fall back to public endpoints.");
  }

  if (!config.walletReferenceConfigured) {
    warnings.push("No public wallet reference configured; position checks will be read-only or simulated.");
  }

  if (intent.execution === "live-preview") {
    if (!config.liveTrading) blocking.push("LIVE_TRADING must be true for live previews");
    if (!config.operatorConfirmed) blocking.push("OPERATOR_CONFIRMED must be true for live previews");
    if (config.simOnly) blocking.push("PERPS_SIM_ONLY must be false for live previews");
    warnings.push("Live-preview does not sign or submit transactions inside Box.");
  }

  return {
    ok: blocking.length === 0,
    mode: intent.execution,
    blocking,
    warnings,
  };
}

export function buildBoxPerpsPlan(intent: PerpsIntent, config = loadBoxPerpsConfig()): PerpsPlan {
  const preflight = buildBoxPerpsPreflight(config, intent);
  const action = intent.side === "long" ? "paper-buy" : "paper-sell";

  return {
    intent,
    config,
    preflight,
    wallet: {
      mode: "ephemeral-agent-wallet",
      publicKey: process.env.PERPS_AGENT_WALLET_PUBLIC_KEY,
      signing: "simulation-only",
    },
    dataSources: {
      rpc: config.rpcConfigured,
      jupiter: true,
      helius: Boolean(process.env.HELIUS_API_KEY),
      phoenix: true,
    },
    route: {
      adapter: "vulcan",
      command: "cargo",
      args: [
        "run",
        "--bin",
        "vulcan",
        "--",
        action,
        "--symbol",
        intent.symbol,
        "--notional-usd",
        String(intent.notionalUsd),
        "--leverage",
        String(intent.leverage),
      ],
    },
    notes: [
      "Box perps is paper-first and policy-gated.",
      "Private keys, seed phrases, and signing authority must never be copied into a Box.",
      "Use live-preview only to inspect an execution plan before handoff to a separate signer.",
    ],
  };
}

function parseSymbols(raw: string): string[] {
  return raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
}

function parsePositiveNumber(raw: unknown, fallback: number): number {
  const value = Number(raw ?? fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}
