#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import bs58 from "bs58";
import { AgentIndex } from "../indexer/db.js";
import { fetchAgent, mintAgent } from "../registry/client.js";
import { buildMetadata } from "../metadata/builder.js";
import type { AgentNetwork } from "../types.js";

function loadSecretKey(): Uint8Array {
  const keyEnv = process.env.SOLANA_PRIVATE_KEY ?? process.env.X402_SVM_PRIVATE_KEY;
  if (keyEnv) return bs58.decode(keyEnv);

  const keyFile = join(homedir(), ".config", "solana", "id.json");
  if (existsSync(keyFile)) {
    const arr = JSON.parse(readFileSync(keyFile, "utf8")) as number[];
    return Uint8Array.from(arr);
  }
  throw new Error(
    "No keypair found. Set SOLANA_PRIVATE_KEY or create ~/.config/solana/id.json"
  );
}

program
  .name("clawd-registry")
  .description("Solana Clawd Agent Registry — mint, discover, and manage on-chain AI agents")
  .version("0.1.0");

// ── list ──────────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("List locally indexed agents")
  .option("-n, --network <network>", "filter by network")
  .option("-q, --query <query>", "search by name or capability")
  .option("-s, --service <service>", "filter by service type (A2A, MCP, web)")
  .option("--limit <n>", "max results", "20")
  .action((opts) => {
    const idx = new AgentIndex();
    const agents = idx.search({
      network: opts.network as AgentNetwork | undefined,
      query: opts.query,
      service: opts.service,
      limit: parseInt(opts.limit),
    });
    idx.close();

    if (agents.length === 0) {
      console.log(chalk.yellow("No agents indexed yet. Run: clawd-registry add <address>"));
      return;
    }

    console.log(chalk.cyan.bold(`\n  ${agents.length} agent(s) found\n`));
    for (const a of agents) {
      const badge = a.active ? chalk.green("● active") : chalk.gray("○ inactive");
      console.log(`  ${badge}  ${chalk.bold(a.name)}  ${chalk.dim(a.assetAddress)}`);
      if (a.metadata?.description) {
        console.log(`     ${chalk.dim(a.metadata.description.slice(0, 80))}`);
      }
      if (a.metadata?.services?.length) {
        const svcs = a.metadata.services.map((s) => s.name).join(", ");
        console.log(`     ${chalk.blue("services:")} ${svcs}`);
      }
      console.log();
    }
  });

// ── add ───────────────────────────────────────────────────────────────────────
program
  .command("add <assetAddress>")
  .description("Fetch an on-chain agent and add it to the local index")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .action(async (assetAddress: string, opts) => {
    const spinner = ora(`Fetching ${chalk.cyan(assetAddress)}...`).start();
    try {
      const agent = await fetchAgent(assetAddress, opts.rpc);
      if (!agent) {
        spinner.fail("Agent not registered on-chain");
        return;
      }
      const idx = new AgentIndex();
      idx.upsert(agent);
      idx.setMeta("last_indexed", Date.now().toString());
      idx.close();
      spinner.succeed(
        `Added ${chalk.bold(agent.name)} (${chalk.dim(agent.assetAddress)})`
      );
    } catch (err) {
      spinner.fail(`Failed: ${(err as Error).message}`);
    }
  });

// ── info ──────────────────────────────────────────────────────────────────────
program
  .command("info <assetAddress>")
  .description("Show full details for an agent")
  .option("-r, --rpc <url>", "Solana RPC URL")
  .action(async (assetAddress: string, opts) => {
    const spinner = ora("Fetching agent...").start();
    try {
      const agent = await fetchAgent(assetAddress, opts.rpc);
      if (!agent) {
        spinner.fail("Agent not found or not registered");
        return;
      }
      spinner.stop();

      console.log(chalk.cyan.bold("\n  Agent Info\n"));
      console.log(`  ${chalk.bold("Address:")}  ${agent.assetAddress}`);
      console.log(`  ${chalk.bold("Name:")}     ${agent.name}`);
      console.log(`  ${chalk.bold("Owner:")}    ${agent.owner}`);
      console.log(`  ${chalk.bold("Network:")}  ${agent.network}`);
      console.log(`  ${chalk.bold("URI:")}      ${agent.uri}`);
      if (agent.registrationUri) {
        console.log(`  ${chalk.bold("Reg URI:")} ${agent.registrationUri}`);
      }
      if (agent.metadata) {
        console.log(`\n  ${chalk.bold("Metadata:")}`);
        console.log(`    ${chalk.dim("Description:")} ${agent.metadata.description}`);
        if (agent.metadata.services?.length) {
          console.log(`    ${chalk.dim("Services:")}`);
          for (const s of agent.metadata.services) {
            console.log(`      ${chalk.blue(s.name)}  ${s.endpoint}`);
          }
        }
        if (agent.metadata.models?.length) {
          console.log(`    ${chalk.dim("Models:")} ${agent.metadata.models.join(", ")}`);
        }
        if (agent.metadata.supportedTrust?.length) {
          console.log(`    ${chalk.dim("Trust:")} ${agent.metadata.supportedTrust.join(", ")}`);
        }
      }
      console.log();
    } catch (err) {
      spinner.fail(`Failed: ${(err as Error).message}`);
    }
  });

// ── mint ──────────────────────────────────────────────────────────────────────
program
  .command("mint")
  .description("Mint a new agent on-chain (requires funded wallet)")
  .requiredOption("--name <name>", "agent name")
  .requiredOption("--uri <uri>", "NFT metadata URI (publicly hosted JSON)")
  .requiredOption("--description <desc>", "agent description")
  .option("--service <name:endpoint>", "add a service (repeatable)", collect, [])
  .option("--model <model>", "supported AI model (repeatable)", collect, [])
  .option("--network <network>", "target network", "solana-mainnet")
  .option("--rpc <url>", "Solana RPC URL")
  .option("--trust <trust>", "trust level (repeatable)", collect, [])
  .action(async (opts) => {
    const spinner = ora("Minting agent on-chain...").start();
    try {
      const secretKey = loadSecretKey();
      const services = (opts.service as string[]).map((s) => {
        const [name, endpoint] = s.split(":", 2);
        return { name, endpoint };
      });
      const metadata = buildMetadata({
        name: opts.name,
        description: opts.description,
        services,
        models: opts.model,
        supportedTrust: opts.trust,
      });
      const result = await mintAgent({
        name: opts.name,
        uri: opts.uri,
        metadata,
        network: opts.network as AgentNetwork,
        secretKey,
        rpcUrl: opts.rpc,
      });

      const idx = new AgentIndex();
      idx.upsert({
        assetAddress: result.assetAddress,
        owner: "self",
        name: opts.name,
        uri: opts.uri,
        metadata,
        network: opts.network as AgentNetwork,
        mintSignature: result.signature,
        registeredAt: Date.now(),
        indexedAt: Date.now(),
        active: true,
      });
      idx.close();

      spinner.succeed(`Minted ${chalk.bold(opts.name)}`);
      console.log(`\n  ${chalk.bold("Asset address:")} ${chalk.cyan(result.assetAddress)}`);
      console.log(`  ${chalk.bold("Signature:")}     ${result.signature}\n`);
    } catch (err) {
      spinner.fail(`Mint failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── stats ─────────────────────────────────────────────────────────────────────
program
  .command("stats")
  .description("Show local index statistics")
  .action(() => {
    const idx = new AgentIndex();
    const stats = idx.stats();
    idx.close();

    console.log(chalk.cyan.bold("\n  Registry Index Stats\n"));
    console.log(`  Total agents:  ${stats.total}`);
    console.log(`  Active agents: ${stats.active}`);
    if (Object.keys(stats.byNetwork).length) {
      console.log(`  By network:`);
      for (const [net, n] of Object.entries(stats.byNetwork)) {
        console.log(`    ${net}: ${n}`);
      }
    }
    if (stats.lastIndexed) {
      console.log(`  Last indexed:  ${new Date(stats.lastIndexed).toLocaleString()}`);
    }
    console.log();
  });

function collect(val: string, prev: string[]): string[] {
  return [...prev, val];
}

program.parse();
