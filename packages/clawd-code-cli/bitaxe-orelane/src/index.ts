#!/usr/bin/env node
import chalk from 'chalk';
import { runLoop, runOnce, runStatus } from './controller.js';
import { loadEnvFiles } from './env.js';
import { loadOrelaneAppConfig } from './config.js';

loadEnvFiles();

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const once = args.has('--once');
  const statusOnly = args.has('--status');
  if (args.has('--dry-run') || statusOnly) {
    process.env.DRY_RUN = 'true';
  }
  const config = loadOrelaneAppConfig();

  console.log(chalk.cyan(`mode=${once || statusOnly ? 'single' : 'loop'} dryRun=${config.dryRun}`));

  if (once || statusOnly) {
    if (statusOnly) {
      await runStatus(config);
      return;
    }
    await runOnce(config);
    return;
  }

  await runLoop(config);
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
