import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { printInfo, printOk, printSection, printWarn } from "../banner.js";

const CLAWDROUTER_URL = "https://clawdrouter.fly.dev";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const PUMP_FUN_URL = `https://pump.fun/coin/${CLAWD_MINT}`;
const DEXSCREENER_URL = `https://dexscreener.com/solana/${CLAWD_MINT}`;
const BOT_CONTROL_PATH = process.env.BOT_CONTROL_FILE ?? "/tmp/clawd-bot-control.json";

// Resolve clawd-pump directory relative to this file's location in the agents tree
function getClawdPumpDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // dist/commands/pump.js → ../../.. → agents/ → ../../ → repo root
  const agentsDir = resolve(dirname(thisFile), "../../..");
  const repoRoot = resolve(agentsDir, "..");
  const candidate = join(repoRoot, "clawd-pump");
  if (existsSync(candidate)) return candidate;
  // fallback: env override
  return process.env.CLAWD_PUMP_DIR ?? candidate;
}

// ── Control-file IPC ─────────────────────────────────────────────────────────

interface BotControlState {
  mode: string;
  volumeAmountSol?: number;
  volumeIntervalSeconds?: number;
  volumeBurstCount?: number;
  volumeBurstPauseSeconds?: number;
}

function writeBotControl(state: BotControlState): void {
  writeFileSync(BOT_CONTROL_PATH, JSON.stringify(state, null, 2), "utf-8");
}

function readBotControl(): BotControlState | null {
  try {
    return JSON.parse(readFileSync(BOT_CONTROL_PATH, "utf-8")) as BotControlState;
  } catch {
    return null;
  }
}

// ── ClawdRouter status fetchers ───────────────────────────────────────────────

interface RouterStatus {
  clawd?: {
    holderTier?: string;
    balance?: number;
    premiumModelsUnlocked?: boolean;
    maxRequestsPerHour?: number;
    x402Required?: boolean;
    thresholds?: { whale: number; diamond: number; holder: number };
  };
  openRouter?: { enabled: boolean; configured: boolean };
}

interface AccessStatus {
  clawd?: {
    tier?: string;
    balance?: number;
    premiumModelsUnlocked?: boolean;
    maxRequestsPerHour?: number;
    x402Required?: boolean;
    allowedModelTiers?: string[];
  };
}

async function fetchRouterStatus(): Promise<RouterStatus | null> {
  try {
    const res = await fetch(`${CLAWDROUTER_URL}/v1/clawd/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as RouterStatus;
  } catch {
    return null;
  }
}

async function fetchWalletAccess(wallet: string): Promise<AccessStatus | null> {
  try {
    const res = await fetch(`${CLAWDROUTER_URL}/v1/clawd/access`, {
      headers: { "X-Clawd-Wallet": wallet },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AccessStatus;
  } catch {
    return null;
  }
}

function tierEmoji(tier: string): string {
  switch (tier) {
    case "WHALE":   return "🐋";
    case "DIAMOND": return "💎";
    case "HOLDER":  return "🎫";
    default:        return "🆓";
  }
}

// ── Bot subcommand handlers ───────────────────────────────────────────────────

function runBotBuild(): void {
  const pumpDir = getClawdPumpDir();
  printSection("clawd-pump — Building Rust bot");
  printInfo(`Source: ${pumpDir}`);
  if (!existsSync(pumpDir)) {
    printWarn(`clawd-pump directory not found at ${pumpDir}`);
    printWarn("Set CLAWD_PUMP_DIR env var to override the path");
    return;
  }
  try {
    execSync("cargo build --release", {
      cwd: pumpDir,
      stdio: "inherit",
      env: { ...process.env, RUSTFLAGS: "-C target-cpu=native" },
    });
    printOk("Bot binary built → clawd-pump/target/release/solana-vntr-sniper");
  } catch {
    printWarn("Build failed — check Rust toolchain (rustup show) and retry");
  }
}

function runBotStart(opts: { autobuy?: boolean; vol?: boolean } = {}): void {
  const pumpDir = getClawdPumpDir();
  printSection("clawd-pump — Starting bot");
  if (!existsSync(pumpDir)) {
    printWarn(`clawd-pump not found at ${pumpDir} — run 'clawd-agents pump build' first`);
    return;
  }

  const args = ["run", "--release", "--"];
  if (opts.autobuy) args.push("--autobuy");

  if (opts.vol) {
    writeBotControl({ mode: "volume" });
    printInfo("Control file set to volume mode");
  } else {
    writeBotControl({ mode: "normal" });
  }

  printInfo(`Launching: cargo ${args.join(" ")}`);
  printInfo("Press Ctrl+C to stop. Use 'clawd-agents pump stop' from another shell to pause.");

  const child = spawn("cargo", args, {
    cwd: pumpDir,
    stdio: "inherit",
    env: { ...process.env, RUSTFLAGS: "-C target-cpu=native" },
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      printWarn(`Bot exited with code ${code}`);
    }
  });
}

function runBotStop(): void {
  printSection("clawd-pump — Stopping bot");
  const current = readBotControl();
  writeBotControl({ mode: "stopped" });
  printOk(`Control file written (mode=stopped) → ${BOT_CONTROL_PATH}`);
  if (current) {
    printInfo(`Previous mode was: ${current.mode}`);
  }
  printInfo("Bot will pause at next loop iteration. Kill the process to fully terminate.");
}

function runBotVol(
  sub: string | undefined,
  opts: { amount?: string; interval?: string } = {}
): void {
  printSection("clawd-pump — Volume mode");
  if (!sub || sub === "on") {
    const state: BotControlState = {
      mode: "volume",
      volumeAmountSol: opts.amount ? parseFloat(opts.amount) : undefined,
      volumeIntervalSeconds: opts.interval ? parseInt(opts.interval, 10) : undefined,
    };
    writeBotControl(state);
    printOk(`Volume mode ON → ${BOT_CONTROL_PATH}`);
    if (state.volumeAmountSol !== undefined) printInfo(`  Amount: ${state.volumeAmountSol} SOL`);
    if (state.volumeIntervalSeconds !== undefined) printInfo(`  Interval: ${state.volumeIntervalSeconds}s`);
  } else if (sub === "off") {
    writeBotControl({ mode: "normal" });
    printOk("Volume mode OFF — reverted to normal");
  } else {
    printWarn("Usage: clawd-agents pump vol [on|off] [--amount <sol>] [--interval <sec>]");
  }
}

function runBotBuy(mint: string | undefined, amountSol: string | undefined): void {
  const pumpDir = getClawdPumpDir();
  printSection("clawd-pump — Direct buy");
  if (!mint || !amountSol) {
    printWarn("Usage: clawd-agents pump buy <mint_address> <amount_sol>");
    return;
  }
  if (!existsSync(pumpDir)) {
    printWarn(`clawd-pump not found at ${pumpDir}`);
    return;
  }
  printInfo(`Buying ${amountSol} SOL of ${mint}`);
  try {
    execSync(`cargo run --release -- --buy ${mint} ${amountSol}`, {
      cwd: pumpDir,
      stdio: "inherit",
      env: { ...process.env, RUSTFLAGS: "-C target-cpu=native" },
    });
  } catch {
    printWarn("Buy command failed — check .env config and RPC connectivity");
  }
}

function runBotLaunch(args: string[]): void {
  const pumpDir = getClawdPumpDir();
  printSection("clawd-pump — Token launch");
  if (args.length < 4) {
    printWarn("Usage: clawd-agents pump launch <name> <symbol> <description> <image_url> [dev_buy_sol]");
    printWarn("  Optional env: TWITTER, TELEGRAM, WEBSITE, X402_API_URL, X402_PAYMENT_KEY");
    return;
  }
  if (!existsSync(pumpDir)) {
    printWarn(`clawd-pump not found at ${pumpDir}`);
    return;
  }
  const shellArgs = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
  printInfo(`Launching token: ${args[0]} (${args[1]})`);
  try {
    execSync(`cargo run --release -- --launch ${shellArgs}`, {
      cwd: pumpDir,
      stdio: "inherit",
      env: { ...process.env, RUSTFLAGS: "-C target-cpu=native" },
    });
  } catch {
    printWarn("Launch failed — check .env, PRIVATE_KEY, and RPC_HTTP");
  }
}

function runBotStatus(): void {
  printSection("clawd-pump — Bot status");
  const pumpDir = getClawdPumpDir();
  const ctrl = readBotControl();

  if (ctrl) {
    printOk(`Control file: ${BOT_CONTROL_PATH}`);
    printInfo(`  Mode:     ${ctrl.mode}`);
    if (ctrl.volumeAmountSol !== undefined) printInfo(`  Vol amt:  ${ctrl.volumeAmountSol} SOL`);
    if (ctrl.volumeIntervalSeconds !== undefined) printInfo(`  Interval: ${ctrl.volumeIntervalSeconds}s`);
  } else {
    printInfo(`Control file not found (${BOT_CONTROL_PATH}) — bot may not be running`);
  }

  const binary = join(pumpDir, "target", "release", "solana-vntr-sniper");
  if (existsSync(binary)) {
    printOk(`Binary present: ${binary}`);
  } else {
    printWarn(`Binary not built — run 'clawd-agents pump build'`);
  }

  const envFile = join(pumpDir, ".env");
  if (existsSync(envFile)) {
    printOk(`.env found: ${envFile}`);
  } else {
    printWarn(`.env missing — copy ${pumpDir}/.env.example to ${pumpDir}/.env`);
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runPump(
  sub?: string,
  opts: {
    wallet?: string;
    json?: boolean;
    amount?: string;
    interval?: string;
    autobuy?: boolean;
    vol?: boolean;
    // extra positional args after sub (for buy / launch)
    args?: string[];
  } = {}
): Promise<void> {
  // ── Bot management subcommands ──────────────────────────────────────────────
  switch (sub) {
    case "build":
      runBotBuild();
      return;
    case "start":
      runBotStart({ autobuy: opts.autobuy, vol: opts.vol });
      return;
    case "stop":
      runBotStop();
      return;
    case "autobuy":
      runBotStart({ autobuy: true });
      return;
    case "vol":
      runBotVol(opts.args?.[0], { amount: opts.amount, interval: opts.interval });
      return;
    case "buy": {
      const [mint, amount] = opts.args ?? [];
      runBotBuy(mint, amount ?? opts.amount);
      return;
    }
    case "launch":
      runBotLaunch(opts.args ?? []);
      return;
    case "bot-status":
      runBotStatus();
      return;
    default:
      break;
  }

  // ── $CLAWD tier info (default / "status") ────────────────────────────────
  printSection("$CLAWD Token — ClawdRouter Access Gate");

  console.error(`\n  Token:     $CLAWD`);
  console.error(`  Mint:      ${CLAWD_MINT}`);
  console.error(`  Buy:       ${PUMP_FUN_URL}`);
  console.error(`  Chart:     ${DEXSCREENER_URL}`);

  console.error(`\n  Access Tiers (ClawdRouter):`);
  console.error(`    🐋 WHALE    1,000,000+ $CLAWD → All models · no x402 · unlimited req/hr`);
  console.error(`    💎 DIAMOND    100,000+ $CLAWD → Premium models · no x402 · 500 req/hr`);
  console.error(`    🎫 HOLDER       1,000+ $CLAWD → Mid-tier models · standard x402 · 100 req/hr`);
  console.error(`    🆓 FREE              0 $CLAWD → Budget models · 20 req/hr (free via ClawdRouter)`);

  printSection("ClawdRouter Status");
  const status = await fetchRouterStatus();
  if (status?.clawd) {
    const { holderTier = "FREE", balance = 0, premiumModelsUnlocked, maxRequestsPerHour, x402Required } = status.clawd;
    const emoji = tierEmoji(holderTier);
    printOk(`Router tier:    ${emoji} ${holderTier}`);
    printOk(`Router balance: ${balance.toLocaleString()} $CLAWD`);
    printInfo(`Premium models: ${premiumModelsUnlocked ? "unlocked" : "locked"}`);
    printInfo(`Rate limit:     ${maxRequestsPerHour === undefined ? "20" : maxRequestsPerHour}/hr`);
    printInfo(`x402 required:  ${x402Required ? "yes" : "no"}`);
  } else {
    printWarn("Router unreachable — check https://clawdrouter.fly.dev/health");
  }

  if (status?.openRouter) {
    printOk(`OpenRouter:     ${status.openRouter.enabled ? "enabled" : "disabled"} · key ${status.openRouter.configured ? "configured" : "missing"}`);
  }

  // ── Bot status summary ──────────────────────────────────────────────────
  printSection("clawd-pump Bot");
  const ctrl = readBotControl();
  if (ctrl) {
    printOk(`Bot control: mode=${ctrl.mode}`);
  } else {
    printInfo(`Bot not running (no control file at ${BOT_CONTROL_PATH})`);
  }
  const pumpDir = getClawdPumpDir();
  const binary = join(pumpDir, "target", "release", "solana-vntr-sniper");
  printInfo(`Binary: ${existsSync(binary) ? "built ✓" : "not built — run 'clawd-agents pump build'"}`);

  // ── Wallet check ───────────────────────────────────────────────────────
  const wallet = opts.wallet ?? (sub && sub !== "status" ? sub : undefined);
  if (wallet && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    printSection(`Wallet: ${wallet.slice(0, 8)}...${wallet.slice(-4)}`);
    const access = await fetchWalletAccess(wallet);
    if (access?.clawd) {
      const { tier = "FREE", balance = 0, premiumModelsUnlocked, maxRequestsPerHour, allowedModelTiers } = access.clawd;
      const emoji = tierEmoji(tier);
      printOk(`Tier:      ${emoji} ${tier}`);
      printOk(`Balance:   ${balance.toLocaleString()} $CLAWD`);
      printInfo(`Premium:   ${premiumModelsUnlocked ? "unlocked" : "locked"}`);
      printInfo(`Rate:      ${maxRequestsPerHour}/hr`);
      printInfo(`Models:    ${(allowedModelTiers ?? []).join(", ")}`);
      if (opts.json) console.log(JSON.stringify(access, null, 2));
    } else {
      printWarn(`Could not check wallet — ensure it's a valid Solana base58 address`);
    }
  }

  console.error(`\n  Bot commands:`);
  console.error(`    clawd-agents pump build             Build Rust bot binary`);
  console.error(`    clawd-agents pump start             Start copy-trading bot`);
  console.error(`    clawd-agents pump start --autobuy   Start in auto-buy mode`);
  console.error(`    clawd-agents pump stop              Pause bot via control file`);
  console.error(`    clawd-agents pump buy <mint> <sol>  One-shot buy`);
  console.error(`    clawd-agents pump launch <n> <s> <d> <img>  Launch token`);
  console.error(`    clawd-agents pump vol on|off        Toggle volume mode`);
  console.error(`    clawd-agents pump bot-status        Show binary + control file status`);
  console.error(`\n  Upgrade access:`);
  console.error(`    Buy $CLAWD:   ${PUMP_FUN_URL}`);
  console.error(`    API keys:     https://x402.wtf/profile/api`);
  console.error(`    Free tier:    clawd-agents setup  (auto-provisions OPENROUTER_BASE_URL)`);
}
