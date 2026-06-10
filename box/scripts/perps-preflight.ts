#!/usr/bin/env tsx

import {
  buildBoxPerpsPlan,
  loadBoxPerpsConfig,
  parsePerpsCliArgs,
} from "../lib/perps-policy";

const intent = parsePerpsCliArgs(process.argv.slice(2));
const plan = buildBoxPerpsPlan(intent, loadBoxPerpsConfig());

console.log(JSON.stringify(plan, null, 2));

if (!plan.preflight.ok) {
  process.exitCode = 2;
}
