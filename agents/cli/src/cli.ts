#!/usr/bin/env node
import { printBanner } from "./banner.js";
import { runSetup } from "./commands/setup.js";
import { runScaffoldCreate, runScaffoldEnhance, runScaffoldUpgrade } from "./commands/scaffold.js";
import { runDeploy } from "./commands/deploy.js";
import { runEval } from "./commands/eval.js";
import { runPublish } from "./commands/publish.js";
import { runRegistryList, runRegistryConnect, runRegistryStatus, runRegistryRegister } from "./commands/registry.js";
import { runRegister } from "./commands/register.js";
import { runGoalCreate, runGoalList, runGoalStatus, runGoalComplete } from "./commands/goals.js";
import { runPerps, runLong, runShort, runSpot, runApe } from "./commands/trading.js";

type RawArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): RawArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

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

function flag(flags: Record<string, string | boolean>, key: string): boolean {
  return Boolean(flags[key]);
}

function strFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function printHelp(): void {
  console.log(`
clawd-agents — Solana Agents CLI

USAGE
  clawd-agents <command> [subcommand] [options]

COMMANDS
  setup                    Install skills and show registered Agent Registry endpoints
  scaffold create <name>   Create a new Solana agent project
  scaffold enhance <dir>   Enhance an existing agent project
  scaffold upgrade [dir]   Upgrade a project to the latest templates
  deploy --target <t>      Deploy to vercel | vertex-ai | fly | railway
  eval <agent.json>        Validate an agent JSON definition
  publish <agent.json>     Add agent to the Clawd catalog
  register                 One-shot: build, publish locally, and register at x402.wtf
  registry list            List registered Google Agent Registry endpoints
  registry connect <ep>    Show connection example for a registered endpoint
  registry status          Show Agent Registry + Reasoning Engine status
  registry register <url>  Register a new endpoint in Agent Registry

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
  --help, -h               Show help
  --dry-run                Preview without executing
  --json                   Output as JSON (eval/goals commands)
  --strict                 Strict validation (eval command)
  --prod                   Production deployment (deploy command)
  --agent <template>       Agent template: perps (default), base
  --auth                   Add CAAP/1.0 agent auth (scaffold)
  --payments               Add x402 payment middleware (scaffold)
  --telegram               Add Telegram bot surface (scaffold)
  --registry               Add Agent Registry integration (scaffold)
  --skip-build             Skip catalog rebuild (publish)
  --name <name>            Agent display name (register)
  --system-role <prompt>   System role / prompt (register)
  --description <text>     Short description (register)
  --tags <t1,t2>           Comma-separated tags (register)
  --avatar <emoji>         Avatar emoji or URL (register)
  --category <cat>         Category: trading|defi|research|infrastructure|agentic (register)
  --skills <s1,s2>         Comma-separated skill names (register)
  --author <name>          Author name (register)
  --homepage <url>         Homepage URL (register)
  --api-key <key>          x402.wtf API key (or set X402_API_KEY env)
  --local                  Skip remote registration, write locally only (register)
  --global                 Global install scope (setup)
  --notional <usd>         Trade size in USD (long/short/spot/ape)
  --leverage <x>           Leverage multiplier (long/short/ape)
  --live                   Arm live execution (requires LIVE_TRADING=true + OPERATOR_CONFIRMED=true)
  --goal                   Auto-create a goal for this trade
  --symbol <sym>           Override symbol for goals create
  --side <side>            Side: long|short|buy|sell (goals create)
  --priority <p>           Goal priority: high|medium|low

EXAMPLES
  clawd-agents setup
  clawd-agents long SOL --notional 100
  clawd-agents short ETH --notional 50 --leverage 2
  clawd-agents spot buy SOL --amount 200
  clawd-agents ape SOL long
  clawd-agents perps scan --symbol SOL
  clawd-agents goals create --symbol SOL --side long --notional 100
  clawd-agents goals list
  clawd-agents scaffold create my-defi-agent --agent perps
  clawd-agents eval my-agent/clawd.json --strict
  clawd-agents deploy --target vertex-ai
  clawd-agents registry list
  clawd-agents register --name "My DeFi Agent" --description "Handles swaps" --tags "defi,solana" --category defi
  clawd-agents register --name "My Agent" --local --dry-run

PACKAGES
  @clawd/agent-auth-solana    Solana extension — SIWS, DAS attestation, CAAP/1.0
  @better-auth/agent-auth     Better Auth server plugin
  @auth/agent                 Client SDK for agent runtimes
  @auth/agent-cli             Upstream CLI + MCP server

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
    case "setup":
      runSetup({ global: flag(flags, "global") });
      break;

    case "scaffold": {
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
    }

    case "deploy": {
      const target = strFlag(flags, "target") ?? "vercel";
      runDeploy(target as "vercel" | "vertex-ai" | "fly" | "railway", {
        prod: flag(flags, "prod"),
        dryRun: flag(flags, "dry-run"),
      });
      break;
    }

    case "eval": {
      if (!sub) throw new Error("Usage: clawd-agents eval <agent.json>");
      runEval(sub, {
        strict: flag(flags, "strict"),
        json: flag(flags, "json"),
      });
      break;
    }

    case "publish": {
      if (!sub) throw new Error("Usage: clawd-agents publish <agent.json>");
      runPublish(sub, {
        dryRun: flag(flags, "dry-run"),
        skipBuild: flag(flags, "skip-build"),
      });
      break;
    }

    case "register": {
      await runRegister({
        name: strFlag(flags, "name") ?? sub ?? "",
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
    }

    case "registry": {
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
    }

    // ── Trading commands ────────────────────────────────────────────────────
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

    case "long": {
      const sym = sub ?? strFlag(flags, "symbol") ?? "SOL";
      runLong(sym, {
        notional: strFlag(flags, "notional"),
        leverage: strFlag(flags, "leverage"),
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    }

    case "short": {
      const sym = sub ?? strFlag(flags, "symbol") ?? "SOL";
      runShort(sym, {
        notional: strFlag(flags, "notional"),
        leverage: strFlag(flags, "leverage"),
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    }

    case "spot": {
      const side = (sub === "sell" ? "sell" : "buy") as "buy" | "sell";
      const sym = arg0 ?? strFlag(flags, "symbol") ?? "SOL";
      await runSpot(side, sym, {
        amount: strFlag(flags, "amount") ?? strFlag(flags, "notional"),
        slippage: strFlag(flags, "slippage"),
        goal: flag(flags, "goal"),
        json: flag(flags, "json"),
      });
      break;
    }

    case "ape": {
      const sym = sub ?? strFlag(flags, "symbol") ?? "SOL";
      const side = (arg0 === "short" ? "short" : "long") as "long" | "short";
      runApe(sym, side, {
        live: flag(flags, "live"),
        goal: flag(flags, "goal"),
      });
      break;
    }

    // ── Goals commands ──────────────────────────────────────────────────────
    case "goals": {
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
    }

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
