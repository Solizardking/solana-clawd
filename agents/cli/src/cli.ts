#!/usr/bin/env node
import { printBanner } from "./banner.js";
import { runDeploy } from "./commands/deploy.js";
import { runEval } from "./commands/eval.js";
import { runGoalComplete, runGoalCreate, runGoalList, runGoalStatus } from "./commands/goals.js";
import { runOptimize } from "./commands/optimize.js";
import { runPack } from "./commands/pack.js";
import { runPublish } from "./commands/publish.js";
import { runPump } from "./commands/pump.js";
import { runRegister } from "./commands/register.js";
import { runRegistryConnect, runRegistryList, runRegistryRegister, runRegistryStatus } from "./commands/registry.js";
import { runScaffoldCreate, runScaffoldEnhance, runScaffoldUpgrade } from "./commands/scaffold.js";
import { runSetup } from "./commands/setup.js";
import { runApe, runLong, runPerps, runShort, runSpot } from "./commands/trading.js";

type FlagValue = string | boolean;
const DEPLOY_TARGETS = ["vercel", "vertex-ai", "fly", "railway"] as const;
type DeployTarget = (typeof DEPLOY_TARGETS)[number];

function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, FlagValue> } {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, inlineVal] = arg.slice(2).split("=", 2);
    const next = argv[i + 1];
    if (inlineVal !== undefined) {
      flags[rawKey] = inlineVal;
    } else if (next && !next.startsWith("--")) {
      flags[rawKey] = next;
      i++;
    } else {
      flags[rawKey] = true;
    }
  }

  return { positional, flags };
}

function flag(flags: Record<string, FlagValue>, key: string): boolean {
  return Boolean(flags[key]);
}

function strFlag(flags: Record<string, FlagValue>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function deployTarget(value: string | undefined): DeployTarget {
  const target = value ?? "vercel";
  if ((DEPLOY_TARGETS as readonly string[]).includes(target)) return target as DeployTarget;
  throw new Error(`Unknown deployment target: ${target}\nValid targets: ${DEPLOY_TARGETS.join(", ")}`);
}

function printHelp(): void {
  console.log(`
clawd-agents — Solana Agents CLI

USAGE
  clawd-agents <command> [subcommand] [options]

COMMANDS
  optimize                 Select provider + skill pack for the task; always wires Solana perps
  pack [skills...]         Flatten SKILL.md files into a single context pack (repomix-style)
  setup                    Install skills and show registered Agent Registry endpoints
  register --name <name>   Create/register a catalog agent JSON
  scaffold create <name>   Create a new Solana agent project
  scaffold enhance <dir>   Enhance an existing agent project
  scaffold upgrade [dir]   Upgrade a project to the latest templates
  deploy --target <t>      Deploy to vercel | vertex-ai | fly | railway
  eval <agent.json>        Validate an agent JSON definition
  publish <agent.json>     Add agent to the Clawd catalog
  registry list            List registered Google Agent Registry endpoints
  registry connect <ep>    Show connection example for a registered endpoint
  registry status          Show Agent Registry + Reasoning Engine status
  registry register <url>  Register a new endpoint in Agent Registry
  pump [subcommand]        Manage clawd-pump Rust bot and $CLAWD access

PUMP COMMANDS
  pump                     Show $CLAWD access and bot status
  pump build               Build the Rust bot
  pump start               Start copy-trading bot
  pump start --autobuy     Start in auto-buy mode
  pump stop                Pause bot via control file
  pump buy <mint> <sol>    One-shot buy
  pump launch <n> <s> <d> <img> [dev_buy_sol]
  pump vol on|off          Toggle volume mode
  pump bot-status          Show binary + control file status

TRADING COMMANDS
  perps [status|scan|markets]  Phoenix perps agent status / signals / market data
  long <symbol>            Paper long (add --live to arm)
  short <symbol>           Paper short (add --live to arm)
  spot <buy|sell> <symbol> Spot trade via Imperial Router (dry-run by default)
  ape <symbol> <long|short> Max-size position within risk caps (paper by default)

GOALS COMMANDS
  goals create             Create a trading goal
  goals list               List all goals
  goals status <id>        Show goal details
  goals complete <id>      Mark a goal as complete

OPTIONS
  --task <type>            optimize: perps | research | code | ops | full | auto (default)
  --provider <name>        optimize: claude | openai | grok | gemini | ollama
  --strategy <name>        optimize: twap | grid | ta | scan
  --ta-config <preset>     optimize: generate TA config JSON (ema-cross | rsi-reversion | macd-trend)
  --starter                optimize: print minimal always-on context pack and exit
  --print-context          optimize: print packed context for other runtimes (Grok, etc.)
  --xml                    optimize/pack: wrap output in XML tags for Grok-compat System Instructions
  --write                  optimize: save harness config to ~/.openclawd/harness.json
  --list                   pack: list all discoverable skills
  --out <file>             pack: write output to file instead of stdout
  --help, -h               Show help
  --dry-run                Preview without executing
  --json                   Output as JSON where supported
  --strict                 Strict validation (eval command)
  --prod                   Production deployment (deploy command)
  --local                  Register locally only
  --name <name>            Agent name for register
  --description <text>     Agent description for register
  --category <cat>         Agent category for register/goals
  --tags <csv>             Agent tags for register
  --skills <csv>           Agent skills for register
  --author <name>          Agent author for register
  --homepage <url>         Agent homepage for register
  --api-key <key>          x402 API key for register
  --agent <template>       Agent template: perps (default), base
  --auth                   Add CAAP/1.0 agent auth (scaffold)
  --payments               Add x402 payment middleware (scaffold)
  --telegram               Add Telegram bot surface (scaffold)
  --registry               Add Agent Registry integration (scaffold)
  --skip-build             Skip catalog rebuild (publish)
  --global                 Global install scope (setup)
  --wallet <address>       Wallet for pump access checks
  --amount <value>         Amount for pump/spot commands
  --interval <seconds>     Interval for pump volume mode
  --notional <usd>         Trade size in USD (long/short/spot/ape)
  --leverage <x>           Leverage multiplier (long/short/ape)
  --live                   Arm live execution (requires LIVE_TRADING=true + OPERATOR_CONFIRMED=true)
  --goal                   Auto-create a goal for this trade
  --symbol <sym>           Override symbol for goals create
  --side <side>            Side: long|short|buy|sell (goals create)
  --priority <p>           Goal priority: high|medium|low

EXAMPLES
  clawd-agents optimize
  clawd-agents optimize --task perps --strategy twap --symbol SOL
  clawd-agents optimize --task full --provider claude --write
  clawd-agents optimize --task perps --print-context --xml
  clawd-agents optimize --starter --xml
  clawd-agents optimize --ta-config ema-cross --symbol SOL
  clawd-agents pack --list
  clawd-agents pack vulcan vulcan-risk-management vulcan-lot-size-calculator --xml
  clawd-agents pack vulcan vulcan-grid-trading vulcan-twap-execution --out ~/.openclawd/perps-pack.md
  clawd-agents setup
  clawd-agents pump
  clawd-agents pump build
  clawd-agents pump launch "Clawd Test" CLAWD "description" https://example.com/image.png 0.05
  clawd-agents register --name "Solana PumpFun Bot" --local
  clawd-agents long SOL --notional 100
  clawd-agents scaffold create my-defi-agent --agent perps
  clawd-agents eval my-agent/clawd.json --strict
  clawd-agents deploy --target vertex-ai
  clawd-agents registry list

PROTOCOL
  CAAP/1.0 discovery: https://x402.wtf/.well-known/agent-auth.json
  Agent Registry:     https://x402.wtf/agents/registry
`);
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, sub, arg0] = positional;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || flag(flags, "help")) {
    printHelp();
    return;
  }

  printBanner();

  switch (cmd) {
    case "pack":
      await runPack({
        skills: positional.slice(1),
        xml: flag(flags, "xml"),
        outFile: strFlag(flags, "out"),
        list: flag(flags, "list"),
        json: flag(flags, "json"),
      });
      break;
    case "optimize":
      await runOptimize({
        task: strFlag(flags, "task") ?? sub,
        provider: strFlag(flags, "provider"),
        strategy: strFlag(flags, "strategy"),
        symbol: strFlag(flags, "symbol") ?? positional[2],
        printContext: flag(flags, "print-context"),
        xml: flag(flags, "xml"),
        starter: flag(flags, "starter"),
        taConfig: strFlag(flags, "ta-config"),
        write: flag(flags, "write"),
        json: flag(flags, "json"),
      });
      break;
    case "setup":
      runSetup({ global: flag(flags, "global") });
      break;
    case "register":
      await runRegister({
        name: strFlag(flags, "name") ?? sub,
        systemRole: strFlag(flags, "system-role"),
        description: strFlag(flags, "description"),
        tags: strFlag(flags, "tags"),
        avatar: strFlag(flags, "avatar"),
        category: strFlag(flags, "category"),
        skills: strFlag(flags, "skills"),
        author: strFlag(flags, "author"),
        homepage: strFlag(flags, "homepage"),
        local: flag(flags, "local"),
        apiKey: strFlag(flags, "api-key"),
        dryRun: flag(flags, "dry-run"),
      });
      break;
    case "pump":
      await runPump(sub, {
        wallet: strFlag(flags, "wallet"),
        json: flag(flags, "json"),
        amount: strFlag(flags, "amount"),
        interval: strFlag(flags, "interval"),
        autobuy: flag(flags, "autobuy"),
        vol: flag(flags, "vol"),
        args: positional.slice(2),
      });
      break;
    case "scaffold":
      switch (sub) {
        case "create":
          if (!arg0) throw new Error("Usage: clawd-agents scaffold create <name>");
          runScaffoldCreate(arg0, {
            agent: strFlag(flags, "agent"),
            prototype: flag(flags, "prototype"),
            auth: flag(flags, "auth"),
            payments: flag(flags, "payments"),
          });
          break;
        case "enhance":
          runScaffoldEnhance(arg0 ?? ".", {
            auth: flag(flags, "auth"),
            payments: flag(flags, "payments"),
            telegram: flag(flags, "telegram"),
            registry: flag(flags, "registry"),
          });
          break;
        case "upgrade":
          runScaffoldUpgrade(arg0 ?? ".", {
            dryRun: flag(flags, "dry-run"),
            autoApprove: flag(flags, "auto-approve"),
          });
          break;
        default:
          throw new Error(`Unknown scaffold subcommand: ${sub}\nUsage: scaffold create|enhance|upgrade`);
      }
      break;
    case "deploy":
      runDeploy(deployTarget(strFlag(flags, "target")), {
        prod: flag(flags, "prod"),
        dryRun: flag(flags, "dry-run"),
      });
      break;
    case "eval":
      if (!sub) throw new Error("Usage: clawd-agents eval <agent.json>");
      runEval(sub, {
        strict: flag(flags, "strict"),
        json: flag(flags, "json"),
      });
      break;
    case "publish":
      if (!sub) throw new Error("Usage: clawd-agents publish <agent.json>");
      runPublish(sub, {
        dryRun: flag(flags, "dry-run"),
        skipBuild: flag(flags, "skip-build"),
      });
      break;
    case "registry":
      switch (sub) {
        case "list":
          runRegistryList();
          break;
        case "connect":
          if (!arg0) throw new Error("Usage: clawd-agents registry connect <endpoint-name-or-url>");
          runRegistryConnect(arg0);
          break;
        case "status":
          runRegistryStatus();
          break;
        case "register":
          if (!arg0) throw new Error("Usage: clawd-agents registry register <url>");
          runRegistryRegister(arg0, {
            name: strFlag(flags, "name"),
            protocol: strFlag(flags, "protocol"),
            location: strFlag(flags, "location"),
          });
          break;
        default:
          throw new Error(`Unknown registry subcommand: ${sub}\nUsage: registry list|connect|status|register`);
      }
      break;
    case "perps":
      await runPerps(sub ?? "status", {
        symbol: strFlag(flags, "symbol") ?? positional[2],
        notional: strFlag(flags, "notional"),
        leverage: strFlag(flags, "leverage"),
        size: strFlag(flags, "size"),
        autoRoute: flag(flags, "auto-route"),
        json: flag(flags, "json"),
      });
      break;
    case "long":
      runLong(sub ?? strFlag(flags, "symbol") ?? "SOL", {
        notional: strFlag(flags, "notional"),
        leverage: strFlag(flags, "leverage"),
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    case "short":
      runShort(sub ?? strFlag(flags, "symbol") ?? "SOL", {
        notional: strFlag(flags, "notional"),
        leverage: strFlag(flags, "leverage"),
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    case "spot":
      await runSpot(sub === "sell" ? "sell" : "buy", arg0 ?? strFlag(flags, "symbol") ?? "SOL", {
        amount: strFlag(flags, "amount") ?? strFlag(flags, "notional"),
        slippage: strFlag(flags, "slippage"),
        goal: flag(flags, "goal"),
        json: flag(flags, "json"),
      });
      break;
    case "ape":
      runApe(sub ?? strFlag(flags, "symbol") ?? "SOL", arg0 === "short" ? "short" : "long", {
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    case "goals":
      switch (sub) {
        case "create":
          runGoalCreate({
            category: strFlag(flags, "category"),
            symbol: strFlag(flags, "symbol") ?? arg0,
            side: strFlag(flags, "side"),
            notional: strFlag(flags, "notional"),
            leverage: strFlag(flags, "leverage"),
            target: strFlag(flags, "target"),
            priority: strFlag(flags, "priority"),
          });
          break;
        case "list":
          runGoalList({ active: flag(flags, "active"), json: flag(flags, "json") });
          break;
        case "status":
          if (!arg0) throw new Error("Usage: clawd-agents goals status <id>");
          runGoalStatus(arg0, { json: flag(flags, "json") });
          break;
        case "complete":
          if (!arg0) throw new Error("Usage: clawd-agents goals complete <id>");
          runGoalComplete(arg0);
          break;
        default:
          runGoalList({ active: false, json: flag(flags, "json") });
      }
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
