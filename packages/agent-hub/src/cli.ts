#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { startHub, DEFAULT_PORT } from "./index.js";
import { execSync, spawn } from "child_process";

program
  .name("clawd-hub")
  .description("Spawn by Solana Clawd — agent discovery server and spawn dashboard")
  .version("0.1.0");

program
  .command("start")
  .description("Start the Spawn by Solana Clawd server")
  .option("-p, --port <port>", "port to listen on", String(DEFAULT_PORT))
  .option("--open", "open dashboard in browser after start")
  .action(async (opts) => {
    const port = parseInt(opts.port);
    const spinner = ora("Starting Spawn by Solana Clawd...").start();

    try {
      const hub = await startHub(port);
      spinner.succeed(
        `Spawn by Solana Clawd running at ${chalk.cyan.bold(hub.url)}`
      );
      console.log();
      console.log(`  ${chalk.bold("Dashboard:")}  ${chalk.cyan(hub.url)}`);
      console.log(`  ${chalk.bold("API:")}        ${chalk.cyan(`${hub.url}/api/v1`)}`);
      console.log(`  ${chalk.bold("WebSocket:")}  ${chalk.cyan(`ws://localhost:${port}/ws`)}`);
      console.log();
      console.log(chalk.dim("  Press Ctrl+C to stop\n"));

      if (opts.open) {
        openBrowser(hub.url);
      }

      process.on("SIGINT", async () => {
        console.log("\n" + chalk.yellow("Stopping hub..."));
        await hub.stop();
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    } catch (err) {
      spinner.fail(`Failed to start: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("open")
  .description("Open the agent hub dashboard in the browser")
  .option("-p, --port <port>", "port", String(DEFAULT_PORT))
  .action((opts) => {
    const url = `http://localhost:${opts.port}`;
    openBrowser(url);
    console.log(chalk.cyan(`Opening ${url}`));
  });

program
  .command("status")
  .description("Check if the hub is running")
  .option("-p, --port <port>", "port", String(DEFAULT_PORT))
  .action(async (opts) => {
    const url = `http://localhost:${opts.port}/api/v1/hub/status`;
    try {
      const res = await fetch(url);
      const data = await res.json() as Record<string, unknown>;
      console.log(chalk.green("Hub is running"));
      const stats = data.stats as Record<string, unknown> | undefined;
      console.log(`  Version:  ${data.version}`);
      console.log(`  Uptime:   ${Math.round((data.uptime as number) / 60)}m`);
      if (stats) {
        console.log(`  Agents:   ${stats.total} (${stats.active} active)`);
      }
    } catch {
      console.log(chalk.red("Hub is not running"));
      console.log(`  Start with: ${chalk.bold("clawd-hub start")}`);
    }
  });

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") execSync(`open ${url}`);
    else if (platform === "win32") execSync(`start ${url}`);
    else spawn("xdg-open", [url], { detached: true });
  } catch {
    // ignore
  }
}

program.parse();
