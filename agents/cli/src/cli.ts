#!/usr/bin/env node
import { printBanner } from "./banner.js";
import { runSetup } from "./commands/setup.js";
import { runScaffoldCreate, runScaffoldEnhance, runScaffoldUpgrade } from "./commands/scaffold.js";
import { runDeploy } from "./commands/deploy.js";
import { runEval } from "./commands/eval.js";
import { runPublish } from "./commands/publish.js";
import { runRegistryList, runRegistryConnect, runRegistryStatus, runRegistryRegister } from "./commands/registry.js";

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
  registry list            List registered Google Agent Registry endpoints
  registry connect <ep>    Show connection example for a registered endpoint
  registry status          Show Agent Registry + Reasoning Engine status
  registry register <url>  Register a new endpoint in Agent Registry

OPTIONS
  --help, -h               Show help
  --dry-run                Preview without executing
  --json                   Output as JSON (eval command)
  --strict                 Strict validation (eval command)
  --prod                   Production deployment (deploy command)
  --agent <template>       Agent template: perps (default), base
  --auth                   Add CAAP/1.0 agent auth (scaffold)
  --payments               Add x402 payment middleware (scaffold)
  --telegram               Add Telegram bot surface (scaffold)
  --registry               Add Agent Registry integration (scaffold)
  --skip-build             Skip catalog rebuild (publish)
  --global                 Global install scope (setup)

EXAMPLES
  clawd-agents setup
  clawd-agents scaffold create my-defi-agent --agent perps
  clawd-agents scaffold enhance ./my-agent --auth --telegram
  clawd-agents eval my-agent/clawd.json
  clawd-agents eval my-agent/clawd.json --strict --json
  clawd-agents publish my-agent/clawd.json
  clawd-agents deploy --target vercel --prod
  clawd-agents deploy --target vertex-ai
  clawd-agents registry list
  clawd-agents registry connect "Perps Trading"
  clawd-agents registry register https://myapp.com/api/agent

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
