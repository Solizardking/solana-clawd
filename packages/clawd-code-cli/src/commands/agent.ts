import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { AgentIndex } from "@openclawdsolana/agent-registry/indexer";
import { fetchAgent } from "@openclawdsolana/agent-registry/registry";
import type { AgentNetwork, SearchOptions } from "@openclawdsolana/agent-registry";

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

  return agent;
}
