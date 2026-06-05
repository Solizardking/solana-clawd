import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { printSection, printOk, printInfo, printWarn } from "../banner.js";
import { runGoalCreate } from "./goals.js";

const PERPS_API = "https://x402.wtf/api/perps/v1";
const IMPERIAL_API = "https://x402.wtf/api/imperial";
const PHOENIX_API = "https://x402.wtf/api/phoenix/markets";

function getPerpsAgentBin(): string | null {
  const thisFile = fileURLToPath(import.meta.url);
  const cliRoot = join(dirname(thisFile), "../..");
  const bin = join(cliRoot, "../clawd-perps-agent/dist/cli.js");
  return existsSync(bin) ? bin : null;
}

function callPerpsAgent(args: string[], fallback?: () => void): void {
  const bin = getPerpsAgentBin();
  if (bin) {
    const result = spawnSync("node", [bin, ...args], { stdio: "inherit" });
    if (result.status === 0) return;
    // Workspace dep not installed — fall through to inline preview
  }
  if (fallback) {
    fallback();
  } else {
    printWarn("clawd-perps-agent not available (workspace deps not installed).");
    printInfo(`Command: clawd-perps-agent/dist/cli.js ${args.join(" ")}`);
    printInfo("Install workspace deps or use the live API:");
    printInfo(`  POST ${PERPS_API}/execute`);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// ── /perps ─────────────────────────────────────────────────────────────────

export async function runPerps(sub: string, opts: {
  symbol?: string;
  notional?: string;
  leverage?: string;
  size?: string;
  autoRoute?: boolean;
  json?: boolean;
}): Promise<void> {
  const symbol = (opts.symbol ?? "SOL").toUpperCase();
  const notional = opts.notional ?? "100";
  const leverage = opts.leverage ?? "1";

  switch (sub) {
    case "status":
    case "health":
      callPerpsAgent(["status"]);
      break;
    case "scan":
    case "signals": {
      printSection("Imperial Scan");
      try {
        const data = await fetchJson(`${IMPERIAL_API}/scan?symbols=${symbol}&sizeUsd=${opts.size ?? notional}`);
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        printWarn(`Imperial API: ${String(err)}`);
        callPerpsAgent(["imperial-scan", "--symbols", symbol, "--size", opts.size ?? notional]);
      }
      break;
    }
    case "funding":
    case "markets": {
      printSection("Phoenix Markets");
      try {
        const data = await fetchJson(`${PHOENIX_API}?symbol=${symbol}`);
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        printWarn(`Phoenix API: ${String(err)}`);
        callPerpsAgent(["imperial-health"]);
      }
      break;
    }
    default:
      callPerpsAgent(["status"]);
  }
}

// ── /long ──────────────────────────────────────────────────────────────────

export function runLong(symbol: string, opts: {
  notional?: string;
  leverage?: string;
  live?: boolean;
  goal?: boolean;
}): void {
  const sym = symbol.toUpperCase();
  const notional = opts.notional ?? "100";
  const leverage = opts.leverage ?? "1";

  printSection(`LONG ${sym}`);
  printInfo(`Mode: ${opts.live ? "LIVE (OPERATOR_CONFIRMED required)" : "paper"}`);
  printInfo(`Notional: $${notional}  Leverage: ${leverage}x`);

  if (opts.goal) {
    runGoalCreate({ symbol: sym, side: "long", notional, leverage, category: "perps" });
  }

  const cmd = opts.live ? "live-long" : "paper-long";
  callPerpsAgent([cmd, sym, "--notional", notional, "--leverage", leverage], () => {
    printInfo(`Order shape (${opts.live ? "LIVE" : "paper"}):`);
    console.log(JSON.stringify({ action: "Increase", side: "Long", symbol: sym, sizeUsd: Number(notional), leverage: Number(leverage), mode: opts.live ? "live" : "paper", endpoint: PERPS_API }, null, 2));
    if (!opts.live) printWarn("Paper preview. Set LIVE_TRADING=true + OPERATOR_CONFIRMED=true to go live.");
  });
}

// ── /short ─────────────────────────────────────────────────────────────────

export function runShort(symbol: string, opts: {
  notional?: string;
  leverage?: string;
  live?: boolean;
  goal?: boolean;
}): void {
  const sym = symbol.toUpperCase();
  const notional = opts.notional ?? "100";
  const leverage = opts.leverage ?? "1";

  printSection(`SHORT ${sym}`);
  printInfo(`Mode: ${opts.live ? "LIVE (OPERATOR_CONFIRMED required)" : "paper"}`);
  printInfo(`Notional: $${notional}  Leverage: ${leverage}x`);

  if (opts.goal) {
    runGoalCreate({ symbol: sym, side: "short", notional, leverage, category: "perps" });
  }

  const cmd = opts.live ? "live-short" : "paper-short";
  callPerpsAgent([cmd, sym, "--notional", notional, "--leverage", leverage], () => {
    printInfo(`Order shape (${opts.live ? "LIVE" : "paper"}):`);
    console.log(JSON.stringify({ action: "Increase", side: "Short", symbol: sym, sizeUsd: Number(notional), leverage: Number(leverage), mode: opts.live ? "live" : "paper", endpoint: PERPS_API }, null, 2));
    if (!opts.live) printWarn("Paper preview. Set LIVE_TRADING=true + OPERATOR_CONFIRMED=true to go live.");
  });
}

// ── /spot ──────────────────────────────────────────────────────────────────

export async function runSpot(side: "buy" | "sell", symbol: string, opts: {
  amount?: string;
  slippage?: string;
  goal?: boolean;
  json?: boolean;
}): Promise<void> {
  const sym = symbol.toUpperCase();
  const amount = opts.amount ?? "100";

  printSection(`SPOT ${side.toUpperCase()} ${sym}`);
  printInfo(`Amount: $${amount}  Slippage: ${opts.slippage ?? "50"} bps`);
  printInfo(`Route: Imperial Router → Jupiter / Phoenix DEX`);

  if (opts.goal) {
    runGoalCreate({ symbol: sym, side, notional: amount, category: "spot" });
  }

  try {
    const payload = {
      action: side === "buy" ? "buy" : "sell",
      symbol: sym,
      amountUsd: Number(amount),
      slippageBps: opts.slippage ? Number(opts.slippage) : 50,
      dryRun: true,
    };
    printInfo("Dry-run via Imperial Router:");
    printInfo(`POST ${IMPERIAL_API}/spot — ${JSON.stringify(payload)}`);
    printWarn("Set IMPERIAL_LIVE=true + OPERATOR_CONFIRMED=true to execute live.");
  } catch (err) {
    printWarn(`Error: ${String(err)}`);
  }
}

// ── /ape ───────────────────────────────────────────────────────────────────

export function runApe(symbol: string, side: "long" | "short", opts: {
  live?: boolean;
  goal?: boolean;
}): void {
  const sym = symbol.toUpperCase();

  printSection(`🦞 APE ${side.toUpperCase()} ${sym}`);
  printWarn("Ape = max notional within PERPS_MAX_NOTIONAL_USD cap + PERPS_MAX_LEVERAGE");
  printInfo("Preflight runs first — any gate failure blocks the order.");
  printInfo("Default caps: notional $250, leverage 3x, spread 40bps");

  if (opts.goal) {
    runGoalCreate({ symbol: sym, side, notional: "250", leverage: "3", priority: "high", category: "perps" });
  }

  const cmd = opts.live ? (side === "long" ? "live-long" : "live-short") : (side === "long" ? "paper-long" : "paper-short");
  callPerpsAgent([cmd, sym, "--notional", "250", "--leverage", "3"]);
}
