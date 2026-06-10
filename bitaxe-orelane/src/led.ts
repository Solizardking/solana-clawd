#!/usr/bin/env node
import chalk from 'chalk';
import {
  cycleBitaxeBaseLed,
  parseBitaxeLedColor,
  setBitaxeBaseLed,
} from './bitaxe.js';
import { loadOrelaneAppConfig } from './config.js';
import { loadEnvFiles } from './env.js';

loadEnvFiles();

function usage(): string {
  return [
    'Usage:',
    '  npm run led -- red',
    '  npm run led -- "#00ff80"',
    '  npm run led -- "0,128,255"',
    '  npm run led -- cycle',
    '',
    'Requires RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, DRY_RUN=false.',
  ].join('\n');
}

async function main(): Promise<void> {
  const config = loadOrelaneAppConfig();
  const rawColor = process.argv.slice(2).join(' ').trim();

  if (!rawColor || rawColor === '--help' || rawColor === '-h') {
    console.log(usage());
    return;
  }

  if (!config.rigControlLive || !config.operatorConfirmed || config.dryRun) {
    throw new Error('LED control blocked. Set RIG_CONTROL_LIVE=true, OPERATOR_CONFIRMED=true, and DRY_RUN=false.');
  }

  if (rawColor === 'cycle' || rawColor === 'rainbow') {
    const response = await cycleBitaxeBaseLed(config.bitaxeUrl);
    console.log(chalk.green(`${response.message} at ${config.bitaxeUrl}`));
    return;
  }

  const color = parseBitaxeLedColor(rawColor);
  if (!color) {
    throw new Error(`Unsupported LED color "${rawColor}". Use a name, #rrggbb, or r,g,b.`);
  }

  const response = await setBitaxeBaseLed(config.bitaxeUrl, color);
  console.log(chalk.green(response.message));
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
