import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { printInfo, printOk, printSection, printWarn } from "../banner.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskType = "perps" | "research" | "code" | "ops" | "full" | "auto";
export type ProviderName = "claude" | "openai" | "grok" | "gemini" | "ollama";
export type StrategyName = "twap" | "grid" | "ta" | "scan";

interface Provider {
  name: ProviderName;
  model: string;
  baseUrl: string;
  envKey: string;
  strengths: string[];
  bestFor: TaskType[];
}

interface SkillPack {
  task: TaskType;
  skills: string[];
  alwaysOn: string[];   // invariant rules packed every session
  onDemand: string[];   // loaded only when the task calls for them
  commands: Record<string, string>; // command registry for this pack
}

interface HarnessConfig {
  provider: ProviderName;
  model: string;
  task: TaskType;
  skills: string[];
  perpsEnabled: true;
  perpsStrategy?: StrategyName;
  perpsSymbol?: string;
  commandRegistry: Record<string, string>;
  contextPack: string;
  writtenAt: string;
}

// ── Provider Registry ─────────────────────────────────────────────────────────

const PROVIDERS: Record<ProviderName, Provider> = {
  claude: {
    name: "claude",
    model: "claude-sonnet-4-6",
    baseUrl: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    strengths: ["tool-use", "agentic-loops", "MCP", "structured-output", "code"],
    bestFor: ["perps", "code", "ops", "full"],
  },
  openai: {
    name: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    strengths: ["speed", "function-calling", "broad-knowledge"],
    bestFor: ["code", "research"],
  },
  grok: {
    name: "grok",
    model: "grok-3",
    baseUrl: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    strengths: ["real-time-data", "fast-inference", "web-search"],
    bestFor: ["research", "ops"],
  },
  gemini: {
    name: "gemini",
    model: "gemini-2.5-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    envKey: "GOOGLE_API_KEY",
    strengths: ["large-context", "deep-research", "multimodal"],
    bestFor: ["research", "full"],
  },
  ollama: {
    name: "ollama",
    model: "llama3.2",
    baseUrl: "http://localhost:11434/v1",
    envKey: "OLLAMA_BASE_URL",
    strengths: ["privacy", "offline", "free", "low-latency"],
    bestFor: ["code", "ops"],
  },
};

// ── Skill Packs ───────────────────────────────────────────────────────────────

const SKILL_PACKS: Record<TaskType, SkillPack> = {
  perps: {
    task: "perps",
    skills: [
      "vulcan",
      "vulcan-trade-execution",
      "vulcan-grid-trading",
      "vulcan-twap-execution",
      "vulcan-ta-strategy",
      "vulcan-risk-management",
      "vulcan-tpsl-management",
      "vulcan-lot-size-calculator",
    ],
    alwaysOn: [
      "vulcan",                   // runtime contract + safety rules
      "vulcan-risk-management",   // preflight gate — never skip
      "vulcan-lot-size-calculator", // lot math — most common error source
    ],
    onDemand: [
      "vulcan-grid-trading",
      "vulcan-twap-execution",
      "vulcan-ta-strategy",
      "vulcan-tpsl-management",
    ],
    commands: {
      "/preflight":  "Run vulcan strategy preflight before any order",
      "/scan":       "Fetch Phoenix market data + funding rates + signals",
      "/twap":       "Start TWAP execution on Phoenix via Vulcan",
      "/grid":       "Start grid strategy via Vulcan",
      "/ta":         "Start TA-driven strategy via Vulcan",
      "/paper":      "Paper-trade a position (no real funds)",
      "/live":       "Arm live execution (requires all gates set)",
      "/positions":  "List open positions + PnL",
      "/finalize":   "Finalize a strategy run with optional close + cancel",
    },
  },
  research: {
    task: "research",
    skills: [
      "vulcan-market-intel",
      "vulcan-technical-analysis",
      "vulcan-portfolio-intel",
      "vulcan",
    ],
    alwaysOn: [
      "vulcan-market-intel",
    ],
    onDemand: [
      "vulcan-technical-analysis",
      "vulcan-portfolio-intel",
    ],
    commands: {
      "/scan":     "Imperial scan across symbols for signals",
      "/ta":       "TA indicator report on a symbol + timeframe",
      "/funding":  "Fetch Phoenix funding rates",
      "/depth":    "Fetch orderbook depth for a market",
    },
  },
  code: {
    task: "code",
    skills: [
      "solana-dev",
      "coding-agent",
    ],
    alwaysOn: [
      "solana-dev",
    ],
    onDemand: [
      "coding-agent",
    ],
    commands: {
      "/build":  "Build the agent package",
      "/eval":   "Validate clawd.json character file",
      "/test":   "Run project tests",
    },
  },
  ops: {
    task: "ops",
    skills: [
      "gateway-node-ops",
    ],
    alwaysOn: [
      "gateway-node-ops",
    ],
    onDemand: [],
    commands: {
      "/deploy":  "Deploy agent to target platform",
      "/status":  "Show deployment and service health",
    },
  },
  full: {
    task: "full",
    skills: [
      "vulcan",
      "vulcan-trade-execution",
      "vulcan-grid-trading",
      "vulcan-twap-execution",
      "vulcan-ta-strategy",
      "vulcan-risk-management",
      "vulcan-tpsl-management",
      "vulcan-lot-size-calculator",
      "vulcan-market-intel",
      "vulcan-technical-analysis",
      "vulcan-portfolio-intel",
      "solana-dev",
      "coding-agent",
    ],
    alwaysOn: [
      "vulcan",
      "vulcan-risk-management",
      "vulcan-lot-size-calculator",
      "vulcan-market-intel",
      "solana-dev",
    ],
    onDemand: [
      "vulcan-grid-trading",
      "vulcan-twap-execution",
      "vulcan-ta-strategy",
      "vulcan-tpsl-management",
      "vulcan-technical-analysis",
      "vulcan-portfolio-intel",
      "coding-agent",
    ],
    commands: {
      "/preflight":  "Vulcan strategy preflight gate",
      "/scan":       "Imperial market scan + signals",
      "/twap":       "TWAP strategy on Phoenix",
      "/grid":       "Grid strategy on Phoenix",
      "/ta":         "TA-driven strategy on Phoenix",
      "/paper":      "Paper trade (no real funds)",
      "/live":       "Arm live execution",
      "/positions":  "Open positions + PnL",
      "/finalize":   "Finalize strategy run",
      "/build":      "Build agent package",
      "/eval":       "Validate clawd.json",
      "/deploy":     "Deploy agent",
    },
  },
  auto: {
    task: "auto",
    skills: ["vulcan", "vulcan-risk-management", "vulcan-lot-size-calculator"],
    alwaysOn: ["vulcan", "vulcan-risk-management"],
    onDemand: [],
    commands: {},
  },
};

// ── Provider Selection ────────────────────────────────────────────────────────

function selectProvider(task: TaskType, hint?: ProviderName): ProviderName {
  if (hint) return hint;

  // check which providers are actually configured in env
  const configured = (Object.keys(PROVIDERS) as ProviderName[]).filter((p) => {
    const key = PROVIDERS[p].envKey;
    const val = process.env[key] ?? process.env.OPENROUTER_API_KEY;
    return Boolean(val && val !== "clawd_free");
  });

  const candidates = configured.length > 0 ? configured : (Object.keys(PROVIDERS) as ProviderName[]);

  // pick best match for the task
  for (const name of candidates) {
    if (PROVIDERS[name].bestFor.includes(task)) return name;
  }

  return "claude"; // default
}

// ── TA Config Templates ───────────────────────────────────────────────────────

const TA_CONFIGS: Record<string, (symbol: string) => object> = {
  "ema-cross": (symbol) => ({
    symbol,
    timeframe: "1h",
    margin_mode: "cross",
    rules: [
      {
        condition: { indicator: "ema_cross", fast: 9, slow: 21, direction: "up" },
        action: { type: "open_long", notional_usdc: 100, leverage: 1 },
      },
      {
        condition: { indicator: "ema_cross", fast: 9, slow: 21, direction: "down" },
        action: { type: "close_long" },
      },
    ],
  }),
  "rsi-reversion": (symbol) => ({
    symbol,
    timeframe: "15m",
    margin_mode: "cross",
    rules: [
      {
        condition: { indicator: "rsi", period: 14, comparison: "lt", value: 30 },
        action: { type: "open_long", notional_usdc: 100, leverage: 1 },
      },
      {
        condition: { indicator: "rsi", period: 14, comparison: "gt", value: 70 },
        action: { type: "close_long" },
      },
      {
        condition: { indicator: "rsi", period: 14, comparison: "gt", value: 70 },
        action: { type: "open_short", notional_usdc: 100, leverage: 1 },
      },
      {
        condition: { indicator: "rsi", period: 14, comparison: "lt", value: 30 },
        action: { type: "close_short" },
      },
    ],
  }),
  "macd-trend": (symbol) => ({
    symbol,
    timeframe: "4h",
    margin_mode: "cross",
    rules: [
      {
        condition: { indicator: "macd_cross", direction: "bullish" },
        action: { type: "open_long", notional_usdc: 150, leverage: 2 },
      },
      {
        condition: { indicator: "macd_cross", direction: "bearish" },
        action: { type: "close_long" },
      },
    ],
  }),
};

export function generateTaConfig(preset: string, symbol: string): string {
  const builder = TA_CONFIGS[preset] ?? TA_CONFIGS["ema-cross"];
  return JSON.stringify(builder(symbol), null, 2);
}

export const TA_CONFIG_PRESETS = Object.keys(TA_CONFIGS);

// ── Context Pack Builder ──────────────────────────────────────────────────────

// Vulcan strategy operating loop — correct pattern per runtime contract
const OPERATING_LOOP = `## Vulcan Strategy Operating Loop (mandatory pattern)
# 1. Launch detached — always detached for multi-tick runs
RUN_ID=$(vulcan strategy grid start \\
  --symbol SOL --center-on-mark --width-pct 2.5 \\
  --levels-per-side 5 --tokens-per-level 0.5 \\
  --run-until-stopped --mode paper \\
  --max-total-notional-usdc 1000 --max-price-drift-bps 75 \\
  --detached -o json | jq -r '.data.run_id')

# 2. Backfill startup ticks (since_tick=0)
vulcan strategy status "$RUN_ID" --since-tick 0

# 3. Wait-next-tick loop — anchor to next_tick.next_tick_at, not wall clock
vulcan strategy wait-next-tick "$RUN_ID" --timeout-seconds 90
# → relay every tick immediately; never batch; never sleep as a substitute

# 4. Lifecycle controls
vulcan strategy pause   "$RUN_ID" --reason "checking risk"
vulcan strategy resume  "$RUN_ID"
vulcan strategy monitor "$RUN_ID"

# 5. Finalize with cleanup
vulcan strategy finalize "$RUN_ID" --cancel-orders --close-position --wait
`;

function skillDescription(name: string): string {
  const descriptions: Record<string, string> = {
    "vulcan":                   "Entry-point: runtime contract + safety rules + preflight gate",
    "vulcan-risk-management":   "Pre-trade checks, leverage tiers, margin health, preflight gate",
    "vulcan-lot-size-calculator": "Convert token amounts to base lots — most common agent error",
    "vulcan-trade-execution":   "Safe order execution with pre-trade checks + post-trade verify",
    "vulcan-grid-trading":      "Grid strategy: layered limit orders across a price band",
    "vulcan-twap-execution":    "TWAP: time-weighted slices to reduce market impact",
    "vulcan-ta-strategy":       "TA-driven strategy: EMA cross, RSI reversion, MACD trend",
    "vulcan-tpsl-management":   "Take-profit and stop-loss setup, update, cancellation",
    "vulcan-market-intel":      "Ticker, orderbook, candles, pre-trade research patterns",
    "vulcan-technical-analysis":"RSI, MACD, BBands, ATR, ADX, EMA — indicators + trigger eval",
    "vulcan-portfolio-intel":   "Positions, margin totals, open orders, funding overview",
    "vulcan-position-management":"List, show, close, reduce positions; attach TP/SL post-hoc",
    "vulcan-margin-operations": "Deposit, withdraw, transfer, isolated collateral management",
    "vulcan-scale-orders":      "Laddered limit entries; post-fill laddered TP/SL",
    "vulcan-error-recovery":    "Error category routing, tx_failed recovery, network errors",
    "vulcan-execution-modes":   "Observe/Paper/Dry-Run/Confirm-Each/Auto-Execute taxonomy",
    "solana-dev":               "Solana program dev, Anchor, SPL, RPC patterns",
    "coding-agent":             "Agent scaffolding, TypeScript patterns, build lifecycle",
    "gateway-node-ops":         "Node ops, deploy, infra health checks",
  };
  return descriptions[name] ?? name;
}

function buildContextPack(
  task: TaskType,
  provider: ProviderName,
  strategy?: StrategyName,
  symbol?: string,
  xml = false,
): string {
  const pack = SKILL_PACKS[task === "auto" ? "perps" : task];
  const prov = PROVIDERS[provider];
  const sym = (symbol ?? "SOL").toUpperCase();

  const stratBlock = strategy
    ? `\n## Active Strategy: ${strategy.toUpperCase()}\nDefault symbol: ${sym}. Run preflight before launch.\n`
    : "";

  const commandBlock = Object.entries(pack.commands)
    .map(([cmd, desc]) => `- ${cmd}: ${desc}`)
    .join("\n");

  function wrapSkill(name: string): string {
    const desc = skillDescription(name);
    if (xml) {
      return `<skill name="${name}">\n${desc}\n</skill>`;
    }
    return `- ${name}: ${desc}`;
  }

  const alwaysOnBlock = pack.alwaysOn.map(wrapSkill).join("\n");
  const onDemandBlock = pack.onDemand.length
    ? pack.onDemand.map(wrapSkill).join("\n")
    : "(none)";

  const header = xml
    ? `<harness task="${task}" provider="${provider}" model="${prov.model}">`
    : `# Clawd Harness — ${task.toUpperCase()} Pack\n## Provider: ${provider} (${prov.model})\n## Task: ${task}`;

  const footer = xml ? "</harness>" : "";

  return `${header}${stratBlock}

## Always-On Skills (load every session)
${alwaysOnBlock}

## On-Demand Skills (load when task calls for them)
${onDemandBlock}

## Command Registry
If I use a command, strictly follow the corresponding logic.
${commandBlock}

## Safety Invariants (non-negotiable)
- Never execute live trades without LIVE_TRADING=true, OPERATOR_CONFIRMED=true, PERPS_SIM_ONLY=false
- Always run vulcan strategy preflight before any order — even in paper mode
- Always use the lot-size calculator; never pass raw token amounts as base lots
- Paper mode is default; operator must explicitly arm live execution
- Report every trade, fill, and strategy slice immediately — never batch into summaries
- detached=true is required for all multi-tick strategy runs

## Perps Always Active (Phoenix / Vulcan MCP)
- Exchange: Phoenix Perpetuals DEX on Solana
- API: https://x402.wtf/api/perps/v1
- Default symbols: SOL, ETH, BTC
- Max notional: $250 (PERPS_MAX_NOTIONAL_USD)
- Max leverage: 3× (PERPS_MAX_LEVERAGE)
- Modes: paper (default) → confirm-each → auto-execute
- Strategies: TWAP · Grid · TA (ledger-backed, detached, resumable)
- Guardrails: --max-total-notional-usdc --max-step-notional-usdc --max-price-drift-bps --max-exposure-ratio

${OPERATING_LOOP}
## ClawdRouter (OpenAI-compat, free tier)
- Base URL: https://clawdrouter.fly.dev/v1
- Key env: OPENROUTER_API_KEY (source ~/.openclawd/.env)
${footer}`;
}

// ── Starter Pack (minimal always-on context) ──────────────────────────────────

export function buildStarterPack(xml = false): string {
  const alwaysOn = [
    "vulcan",
    "vulcan-risk-management",
    "vulcan-lot-size-calculator",
  ];

  function wrapSkill(name: string): string {
    const desc = skillDescription(name);
    return xml
      ? `<skill name="${name}">\n${desc}\n</skill>`
      : `- ${name}: ${desc}`;
  }

  const skillBlock = alwaysOn.map(wrapSkill).join("\n");

  const header = xml ? "<clawd-starter>" : "# Clawd Starter Pack (always-on minimum)";
  const footer = xml ? "</clawd-starter>" : "";

  return `${header}

## Load these skills at the start of every Vulcan / perps session
${skillBlock}

## Invariant rules — pack into system prompt, never strip
- Perps always active: Phoenix DEX / Vulcan MCP (https://x402.wtf/api/perps/v1)
- vulcan strategy preflight BEFORE any order — blocking, even in paper mode
- base lots ≠ tokens: always call vulcan_market_info, always use lot-size-calculator
- detached: true for every multi-tick strategy run
- Report every fill, slice, and tx signature immediately

## Command Registry (paste into System Instructions for Grok/ChatGPT)
- /preflight: Run vulcan strategy preflight before any order
- /scan: Fetch Phoenix market data + funding rates + signals
- /twap: Start TWAP on Phoenix (detached, ledger-backed)
- /grid: Start grid strategy (detached, ledger-backed)
- /ta: Start TA-driven strategy (detached, ledger-backed)
- /paper: Paper-trade a position (no real funds)
- /positions: List open positions + PnL
- /finalize: Finalize strategy run with optional cancel + close
If I use a command, strictly follow the corresponding Vulcan MCP logic.
${footer}`;
}

// ── Preflight Check ───────────────────────────────────────────────────────────

async function checkVulcanHealth(): Promise<{ ok: boolean; note: string }> {
  const IMPERIAL = "https://x402.wtf/api/imperial";
  try {
    const res = await fetch(`${IMPERIAL}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return { ok: true, note: "Imperial API online" };
    return { ok: false, note: `Imperial API ${res.status}` };
  } catch {
    return { ok: false, note: "Imperial API unreachable (offline or RPC issue)" };
  }
}

async function checkClawdRouter(): Promise<{ tier: string; note: string }> {
  const ROUTER = "https://clawdrouter.fly.dev";
  try {
    const res = await fetch(`${ROUTER}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const body = (await res.json()) as { clawd?: { holderTier?: string } };
      const tier = body.clawd?.holderTier ?? "FREE";
      return { tier, note: `ClawdRouter online — tier: ${tier}` };
    }
    return { tier: "UNKNOWN", note: `ClawdRouter ${res.status}` };
  } catch {
    return { tier: "OFFLINE", note: "ClawdRouter unreachable" };
  }
}

// ── Main Command ──────────────────────────────────────────────────────────────

export async function runOptimize(opts: {
  task?: string;
  provider?: string;
  strategy?: string;
  symbol?: string;
  printContext?: boolean;
  xml?: boolean;
  starter?: boolean;
  taConfig?: string;
  write?: boolean;
  json?: boolean;
}): Promise<void> {
  // starter subcommand — just print the minimal always-on pack and exit
  if (opts.starter) {
    console.log(buildStarterPack(opts.xml));
    return;
  }

  // TA config template generator
  if (opts.taConfig) {
    const preset = opts.taConfig.toLowerCase();
    const symbol = (opts.symbol ?? "SOL").toUpperCase();
    if (!TA_CONFIG_PRESETS.includes(preset)) {
      process.stderr.write(`Unknown TA preset: ${preset}\nAvailable: ${TA_CONFIG_PRESETS.join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
    const outFile = `${preset}-${symbol.toLowerCase()}.json`;
    const config = generateTaConfig(preset, symbol);
    writeFileSync(outFile, config);
    process.stderr.write(`Written: ${outFile}\n`);
    process.stderr.write(`Launch:  vulcan strategy ta start --config-file ./${outFile} --mode paper --run-until-stopped --detached\n`);
    console.log(config);
    return;
  }

  const task = (opts.task ?? "auto") as TaskType;
  const providerHint = opts.provider as ProviderName | undefined;
  const strategy = opts.strategy as StrategyName | undefined;
  const symbol = (opts.symbol ?? "SOL").toUpperCase();

  // resolve actual task for auto
  const resolvedTask: TaskType =
    task === "auto"
      ? (process.env.CLAWD_TASK as TaskType | undefined) ?? "perps"
      : task;

  const provider = selectProvider(resolvedTask, providerHint);
  const pack = SKILL_PACKS[resolvedTask];
  const prov = PROVIDERS[provider];

  if (opts.json) {
    // fire preflight checks in parallel
    const [vulcanHealth, routerHealth] = await Promise.all([
      checkVulcanHealth(),
      checkClawdRouter(),
    ]);

    const config: HarnessConfig = {
      provider,
      model: prov.model,
      task: resolvedTask,
      skills: pack.skills,
      perpsEnabled: true,
      perpsStrategy: strategy,
      perpsSymbol: symbol,
      commandRegistry: pack.commands,
      contextPack: buildContextPack(resolvedTask, provider, strategy, symbol, false),
      writtenAt: new Date().toISOString(),
    };

    console.log(JSON.stringify({
      harness: config,
      health: { vulcan: vulcanHealth, router: routerHealth },
    }, null, 2));
    return;
  }

  printSection("Clawd Harness — /optimize");
  printInfo(`Task:     ${resolvedTask}  (${task === "auto" ? "auto-detected" : "explicit"})`);
  printInfo(`Provider: ${provider} / ${prov.model}`);
  printInfo(`Symbol:   ${symbol}`);
  if (strategy) printInfo(`Strategy: ${strategy.toUpperCase()}`);

  // check health
  printSection("Health Checks");
  const [vulcanHealth, routerHealth] = await Promise.all([
    checkVulcanHealth(),
    checkClawdRouter(),
  ]);

  if (vulcanHealth.ok) {
    printOk(vulcanHealth.note);
  } else {
    printWarn(vulcanHealth.note);
  }
  printInfo(routerHealth.note);

  // env check
  printSection("Provider Environment");
  const envVal = process.env[prov.envKey];
  if (envVal) {
    printOk(`${prov.envKey} set`);
  } else {
    const routerKey = process.env.OPENROUTER_API_KEY;
    if (routerKey) {
      printOk(`OPENROUTER_API_KEY set — routing via ClawdRouter (${routerHealth.tier} tier)`);
    } else {
      printWarn(`${prov.envKey} not set — source ~/.openclawd/.env or run: clawd-agents setup`);
    }
  }

  // skill pack
  printSection("Skill Pack");
  console.error(`\n  Always-on  (${pack.alwaysOn.length}):`);
  for (const s of pack.alwaysOn) {
    printOk(s);
  }
  if (pack.onDemand.length > 0) {
    console.error(`\n  On-demand  (${pack.onDemand.length}):`);
    for (const s of pack.onDemand) {
      printInfo(s);
    }
  }

  // command registry
  printSection("Command Registry");
  const cmds = Object.entries(pack.commands);
  if (cmds.length > 0) {
    for (const [cmd, desc] of cmds) {
      console.error(`  ${cmd.padEnd(14)} ${desc}`);
    }
  } else {
    printInfo("No commands registered for this pack. Use /full for the complete registry.");
  }

  // perps always block
  printSection("Solana Perps — Always Active");
  printOk("Phoenix Perpetuals DEX via Vulcan MCP");
  printInfo("Paper mode default → confirm-each → auto-execute");
  if (strategy) {
    printInfo(`Strategy ready: ${strategy.toUpperCase()} on ${symbol}`);
    printInfo(`Launch: clawd-agents perps   OR   vulcan strategy ${strategy} start --symbol ${symbol} --mode paper`);
  } else {
    printInfo("Strategies: TWAP · Grid · TA (detached, ledger-backed)");
    printInfo("Preflight: vulcan strategy preflight");
  }

  // context pack
  if (opts.printContext) {
    const label = opts.xml ? "Context Pack — XML (paste into Grok / ChatGPT System Instructions)" : "Context Pack (copy into any runtime)";
    printSection(label);
    if (opts.xml) {
      console.error("  Tip: wrap skills in XML tags so Grok distinguishes them from your code.");
    }
    console.log(buildContextPack(resolvedTask, provider, strategy, symbol, opts.xml));
  }

  // write harness config
  if (opts.write) {
    const harnessDir = join(homedir(), ".openclawd");
    const harnessPath = join(harnessDir, "harness.json");
    mkdirSync(harnessDir, { recursive: true });

    const existing: Partial<HarnessConfig> = existsSync(harnessPath)
      ? (JSON.parse(readFileSync(harnessPath, "utf-8")) as Partial<HarnessConfig>)
      : {};

    const config: HarnessConfig = {
      ...existing,
      provider,
      model: prov.model,
      task: resolvedTask,
      skills: pack.skills,
      perpsEnabled: true,
      perpsStrategy: strategy ?? existing.perpsStrategy,
      perpsSymbol: symbol,
      commandRegistry: pack.commands,
      contextPack: buildContextPack(resolvedTask, provider, strategy, symbol, false),
      writtenAt: new Date().toISOString(),
    };

    writeFileSync(harnessPath, JSON.stringify(config, null, 2));
    printSection("Harness Written");
    printOk(`~/.openclawd/harness.json`);
    printInfo("Source this in agents: cat ~/.openclawd/harness.json | jq .contextPack -r");
  }

  // summary table for cross-runtime use
  printSection("Next Steps");
  console.error(`
  1. Load always-on skills at session start:
       ${pack.alwaysOn.map((s) => `/${s}`).join("  ")}

  2. Run preflight (blocking gate — must pass before any order):
       vulcan strategy preflight

  3. Paper trade a position:
       clawd-agents long ${symbol} --notional 100
       clawd-agents short ${symbol} --notional 100

  4. Start a strategy (detached, ledger-backed):
       vulcan strategy twap start \\
         --symbol ${symbol} --side buy --notional-usdc 500 --slices 5 \\
         --interval-seconds 300 --mode paper \\
         --max-step-notional-usdc 110 --max-price-drift-bps 75 --detached

       vulcan strategy grid start \\
         --symbol ${symbol} --center-on-mark --width-pct 2.5 \\
         --levels-per-side 5 --tokens-per-level 0.5 \\
         --run-until-stopped --mode paper \\
         --max-total-notional-usdc 1000 --detached

  5. Generate a TA strategy config then launch:
       clawd-agents optimize --ta-config ema-cross --symbol ${symbol}
       vulcan strategy ta start --config-file ./ema-cross-${symbol.toLowerCase()}.json \\
         --mode paper --run-until-stopped --detached

  6. Monitor the operating loop:
       vulcan strategy wait-next-tick <run-id> --timeout-seconds 90
       vulcan strategy monitor <run-id>
       vulcan strategy finalize <run-id> --cancel-orders --close-position --wait

  7. Export context for Grok / ChatGPT / Gemini CLI:
       clawd-agents optimize --task ${resolvedTask} --print-context --xml    (Grok-compat XML)
       clawd-agents optimize --task ${resolvedTask} --print-context           (plain markdown)
       clawd-agents optimize --starter --xml                                  (minimal always-on)
       clawd-agents optimize --task ${resolvedTask} --write                   (~/.openclawd/harness.json)
       clawd-agents pack vulcan vulcan-risk-management vulcan-grid-trading    (flatten full SKILL.md bodies)
`);
}
