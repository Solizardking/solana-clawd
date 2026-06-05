#!/usr/bin/env node
import { printBanner } from "./banner.js";
import { runDeploy } from "./commands/deploy.js";
import { runEval } from "./commands/eval.js";
import { runGoalComplete, runGoalCreate, runGoalList, runGoalStatus } from "./commands/goals.js";
import { runIdentityAttest, runIdentityBridgeGoogle, runIdentityCreate, runIdentitySpiffe, runIdentityVerify } from "./commands/identity.js";
import { runPublish } from "./commands/publish.js";
import { runPump } from "./commands/pump.js";
import { runRegister } from "./commands/register.js";
import { runRegistryConnect, runRegistryList, runRegistryRegister, runRegistryStatus } from "./commands/registry.js";
import { runScaffoldCreate, runScaffoldEnhance, runScaffoldUpgrade } from "./commands/scaffold.js";
import { runSetup } from "./commands/setup.js";
import { runSign } from "./commands/sign.js";
import { runApe, runLong, runPerps, runShort, runSpot } from "./commands/trading.js";

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
clawd-agents — Solana Agents CLI (Google ADK-compatible)

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

IDENTITY COMMANDS (Google ADK + Solana on-chain)
  identity create          Create on-chain agent identity (wallet + MPL Core NFT + SAS PDA)
  identity attest          Attest existing identity via SAS (check on-chain status)
  identity verify          Verify on-chain attestation (SAS + MPL Core NFT)
  identity spiffe          Show Google SPIFFE principal mapping for the agent
  identity bridge-google   Bridge identity to Google Agent Registry + ADK

SIGN COMMANDS
  sign <base64-tx>         Sign a base64 Solana transaction with Pay account + submit

TOKEN COMMANDS
  pump [wallet]            Show $CLAWD tier info, ClawdRouter status, upgrade path

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
  --name <name>            Agent display name (register/identity)
  --agent-id <id>          Agent identifier (identity create/bridge-google)
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

IDENTITY OPTIONS
  --vault                  Initialize Hermes vault for agent wallet (identity create)
  --google-project <id>    Google Cloud project ID/number (identity create/bridge-google)
  --google-location <loc>  Google Cloud location (default: global)
  --organization-id <id>   Google Cloud organization ID (identity spiffe)
  --engine-id <id>         Reasoning Engine ID (identity spiffe/bridge-google)

SIGN OPTIONS
  --network <net>          Solana network: mainnet-beta|devnet|testnet
  --account <name>         Pay account name selector

EXAMPLES
  clawd-agents setup
  clawd-agents identity create --agent-id my-agent --google-project my-project
  clawd-agents identity attest
  clawd-agents identity verify
  clawd-agents identity spiffe --organization-id 12345 --project-number 67890
  clawd-agents identity bridge-google --project my-project --agent my-agent
  clawd-agents sign <BASE64_TX> --network devnet
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

PACKAGES
  @solanaclawd/clawd-agents-cli  Solana Agents CLI — this package
  @clawd/agent-auth-solana       Solana extension — SIWS, DAS attestation, CAAP/1.0
  @better-auth/agent-auth        Better Auth server plugin
  @auth/agent                    Client SDK for agent runtimes
  @auth/agent-cli                Upstream CLI + MCP server

PROTOCOL
  CAAP/1.0 discovery:   https://x402.wtf/.well-known/agent-auth.json
  Agent Registry:       https://x402.wtf/agents/registry
  SAS Attestation:      22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG
  MPL Core:             CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d
  Clawd Token:          CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump
  dna-x402 Receipts:    6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN
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
      await runSetup({ global: flag(flags, "global") });
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

    // ─── Identity commands ─────────────────────────────────────────────────
    case "identity": {
      switch (sub) {
        case "create":
          await runIdentityCreate({
            agentId: strFlag(flags, "agent-id") ?? strFlag(flags, "name"),
            googleProject: strFlag(flags, "google-project"),
            googleLocation: strFlag(flags, "google-location"),
            vault: flag(flags, "vault"),
            dryRun: flag(flags, "dry-run"),
          });
          break;
        case "attest":
          await runIdentityAttest({ dryRun: flag(flags, "dry-run") });
          break;
        case "verify":
          await runIdentityVerify();
          break;
        case "spiffe":
          runIdentitySpiffe({
            organizationId: strFlag(flags, "organization-id"),
            projectNumber: strFlag(flags, "google-project"),
            location: strFlag(flags, "google-location"),
            engineId: strFlag(flags, "engine-id"),
          });
          break;
        case "bridge-google":
          await runIdentityBridgeGoogle({
            projectId: strFlag(flags, "google-project") ?? strFlag(flags, "project"),
            location: strFlag(flags, "google-location"),
            agentId: strFlag(flags, "agent-id") ?? strFlag(flags, "agent"),
            dryRun: flag(flags, "dry-run"),
          });
          break;
        default:
          throw new Error(
            `Unknown identity subcommand: ${sub}\n` +
            "Usage: identity create|attest|verify|spiffe|bridge-google",
          );
      }
      break;
    }

    // ─── Sign commands ─────────────────────────────────────────────────────
    case "sign": {
      if (!sub) throw new Error("Usage: clawd-agents sign <BASE64_TX>");
      await runSign(sub, {
        network: strFlag(flags, "network"),
        account: strFlag(flags, "account"),
        json: flag(flags, "json"),
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

    // ── Token commands ──────────────────────────────────────────────────────
    case "pump":
      await runPump(sub, { wallet: strFlag(flags, "wallet") ?? sub, json: flag(flags, "json") });
      break;

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
