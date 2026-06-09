import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import bs58 from "bs58";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";
import { fetchAgent, mintAgent } from "@openclawdsolana/agent-registry/registry";
import type { AgentNetwork, SearchOptions } from "@openclawdsolana/agent-registry";

function loadSecretKey(): Uint8Array {
  const keyEnv = process.env.SOLANA_PRIVATE_KEY ?? process.env.X402_SVM_PRIVATE_KEY;
  if (keyEnv) return bs58.decode(keyEnv);

  const keyFile = join(homedir(), ".config", "solana", "id.json");
  if (existsSync(keyFile)) {
    const arr = JSON.parse(readFileSync(keyFile, "utf8")) as number[];
    return Uint8Array.from(arr);
  }

  throw new Error(
    "No keypair found. Set SOLANA_PRIVATE_KEY or create ~/.config/solana/id.json",
  );
}

function buildInlineMetadataUri(name: string, description: string): string {
  return `data:application/json,${encodeURIComponent(
    JSON.stringify({
      name,
      description,
      image: "https://x402.wtf/lobster.png",
      external_url: "https://github.com/Solizardking/solana-clawd",
    }),
  )}`;
}

export function createAgentCommand(): Command {
  const agent = new Command("agent");
  agent.description("Browse and manage Solana AI agents on-chain");

  // clawd agent list
  agent
    .command("list")
    .description("List locally indexed agents")
    .option("-q, --query <query>", "search term")
    .option("-s, --service <service>", "filter by service (A2A, MCP, web)")
    .option("-n, --network <network>", "filter by network")
    .option("--limit <n>", "max results", "15")
    .action((opts) => {
      const idx = new AgentIndex();
      const agents = idx.search({
        query: opts.query,
        service: opts.service,
        network: opts.network as AgentNetwork | undefined,
        limit: parseInt(opts.limit),
      });
      idx.close();

      if (!agents.length) {
        console.log(
          chalk.yellow(
            "\n  No agents indexed yet.\n  Run: clawd agent add <asset-address>\n"
          )
        );
        return;
      }

      console.log(chalk.cyan.bold(`\n  ${agents.length} agent(s)\n`));
      for (const a of agents) {
        const dot = a.active ? chalk.green("●") : chalk.gray("○");
        const svcs = (a.metadata?.services ?? [])
          .map((s) => chalk.blue(s.name))
          .join(" ");
        console.log(
          `  ${dot} ${chalk.bold(a.name.padEnd(28))} ${chalk.dim(
            a.assetAddress.slice(0, 8) + "…"
          )}`
        );
        if (a.metadata?.description) {
          console.log(
            `     ${chalk.dim(a.metadata.description.slice(0, 72))}`
          );
        }
        if (svcs) console.log(`     ${svcs}`);
        console.log();
      }
    });

  // clawd agent add <address>
  agent
    .command("add <address>")
    .description("Fetch an on-chain agent and add it to the local index")
    .option("-r, --rpc <url>", "Solana RPC URL")
    .action(async (address: string, opts) => {
      const spinner = ora(`Fetching ${chalk.cyan(address)}…`).start();
      try {
        const ag = await fetchAgent(address, opts.rpc);
        if (!ag) {
          spinner.fail("Not registered on-chain");
          return;
        }
        const idx = new AgentIndex();
        idx.upsert(ag);
        idx.setMeta("last_indexed", Date.now().toString());
        idx.close();
        spinner.succeed(`Added ${chalk.bold(ag.name)}`);
      } catch (err) {
        spinner.fail(`Failed: ${(err as Error).message}`);
      }
    });

  // clawd agent info <address>
  agent
    .command("info <address>")
    .description("Show full details for an agent")
    .option("-r, --rpc <url>", "Solana RPC URL")
    .action(async (address: string, opts) => {
      const spinner = ora("Fetching agent…").start();
      try {
        const ag = await fetchAgent(address, opts.rpc);
        if (!ag) {
          spinner.fail("Agent not found or not registered");
          return;
        }
        spinner.stop();
        console.log(chalk.cyan.bold("\n  Agent Details\n"));
        const row = (label: string, val: string) =>
          console.log(`  ${chalk.dim(label.padEnd(14))} ${val}`);
        row("Address", ag.assetAddress);
        row("Name", chalk.bold(ag.name));
        row("Owner", ag.owner);
        row("Network", ag.network);
        row("Status", ag.active ? chalk.green("active") : chalk.gray("inactive"));
        if (ag.uri) row("URI", ag.uri);
        if (ag.registrationUri) row("Reg URI", ag.registrationUri);
        if (ag.metadata?.description) {
          console.log(`\n  ${chalk.dim("Description:")}`);
          console.log(`  ${ag.metadata.description}`);
        }
        if (ag.metadata?.services?.length) {
          console.log(`\n  ${chalk.dim("Services:")}`);
          for (const s of ag.metadata.services) {
            console.log(`    ${chalk.blue(s.name.padEnd(8))} ${s.endpoint}`);
          }
        }
        if (ag.metadata?.models?.length) {
          console.log(`\n  ${chalk.dim("Models:")} ${ag.metadata.models.join(", ")}`);
        }
        console.log();
      } catch (err) {
        spinner.fail(`Failed: ${(err as Error).message}`);
      }
    });

  // clawd agent stats
  agent
    .command("stats")
    .description("Show local registry index statistics")
    .action(() => {
      const idx = new AgentIndex();
      const stats = idx.stats();
      idx.close();
      console.log(chalk.cyan.bold("\n  Registry Stats\n"));
      console.log(`  Total:   ${stats.total}`);
      console.log(`  Active:  ${stats.active}`);
      for (const [net, n] of Object.entries(stats.byNetwork)) {
        console.log(`  ${net}: ${n}`);
      }
      if (stats.lastIndexed) {
        console.log(`  Indexed: ${new Date(stats.lastIndexed).toLocaleString()}`);
      }
      console.log();
    });

  // clawd agent hub
  agent
    .command("hub")
    .description("Start the Clawd Agent Hub dashboard server")
    .option("-p, --port <port>", "port", "3747")
    .option("--open", "open browser after start")
    .action(async (opts) => {
      const port = parseInt(opts.port);
      const spinner = ora(`Starting hub on port ${port}…`).start();
      try {
        // Dynamic import so agent-hub stays optional
        const { startHub } = await import("@openclawdsolana/agent-hub");
        const hub = await startHub(port);
        spinner.succeed(
          `Hub running at ${chalk.cyan.bold(hub.url)}`
        );
        console.log(`\n  Dashboard: ${chalk.cyan(hub.url)}`);
        console.log(`  API:       ${chalk.cyan(hub.url + "/api/v1")}`);
        console.log(chalk.dim("\n  Ctrl+C to stop\n"));

        if (opts.open) {
          const { execSync } = await import("child_process");
          try {
            execSync(
              process.platform === "darwin"
                ? `open ${hub.url}`
                : `xdg-open ${hub.url}`
            );
          } catch {}
        }

        process.on("SIGINT", async () => {
          await hub.stop();
          process.exit(0);
        });
        await new Promise(() => {});
      } catch (err) {
        spinner.fail(
          `Hub failed: ${(err as Error).message}\n  Install with: npm i -g @openclawdsolana/agent-hub`
        );
        process.exit(1);
      }
    });

  agent
    .command("mint-devnet")
    .description("Mint and index an AI agent on Solana devnet")
    .requiredOption("--name <name>", "agent name")
    .requiredOption("--description <description>", "agent description")
    .option("--uri <uri>", "public metadata URI")
    .option("--service <name:endpoint>", "add a service (repeatable)", collect, [])
    .option("--model <model>", "supported model (repeatable)", collect, [])
    .option("--trust <trust>", "trust level (repeatable)", collect, [])
    .option("-r, --rpc <url>", "Solana RPC URL")
    .action(async (opts) => {
      const spinner = ora("Minting agent on solana-devnet…").start();
      try {
        const services = (opts.service as string[]).map((s) => {
          const [name, endpoint] = s.split(":", 2);
          return { name, endpoint };
        });

        const metadata = {
          type: "agent" as const,
          name: opts.name,
          description: opts.description,
          services,
          registrations: [],
          supportedTrust: opts.trust as string[],
          models: opts.model as string[],
          active: true,
          clawdVersion: "0.1.0",
        };

        const result = await mintAgent({
          name: opts.name,
          uri: opts.uri || buildInlineMetadataUri(opts.name, opts.description),
          metadata,
          network: "solana-devnet",
          secretKey: loadSecretKey(),
          rpcUrl: opts.rpc,
        });

        const idx = new AgentIndex();
        idx.upsert({
          assetAddress: result.assetAddress,
          owner: "self",
          name: opts.name,
          uri: opts.uri || buildInlineMetadataUri(opts.name, opts.description),
          metadata,
          network: "solana-devnet",
          mintSignature: result.signature,
          registeredAt: Date.now(),
          indexedAt: Date.now(),
          active: true,
        });
        idx.close();

        spinner.succeed(`Minted ${chalk.bold(opts.name)} on devnet`);
        console.log(`\n  ${chalk.bold("Asset:")}      ${chalk.cyan(result.assetAddress)}`);
        console.log(`  ${chalk.bold("Signature:")}  ${result.signature}`);
        console.log(`  ${chalk.bold("Network:")}    solana-devnet`);
        console.log(`  ${chalk.bold("Indexed:")}    local registry updated\n`);
      } catch (err) {
        spinner.fail(`Mint failed: ${(err as Error).message}`);
      }
    });

  return agent;
}

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}
