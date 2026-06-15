#!/usr/bin/env node

import { createClawdSovereignHarness } from "./sovereign-harness.js";

function getArg(flag: string): string | undefined {
  const prefix = `${flag}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function listArg(flag: string, fallback: string[]): string[] {
  const value = getArg(flag);
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const prompt = getArg("--prompt") ?? process.argv.slice(2).filter((arg) => !arg.startsWith("--")).join(" ");
  if (!prompt) {
    throw new Error('Pass a prompt, for example: npm run clawd:agent -- --prompt="Check Vulcan status"');
  }

  const harness = await createClawdSovereignHarness({
    toolkits: listArg("--toolkits", ["github", "slack"]),
    includeCustomTools: !process.argv.includes("--no-custom-tools"),
  });

  try {
    for await (const text of harness.stream(prompt, Number(getArg("--steps") ?? 10))) {
      process.stdout.write(text);
    }
    process.stdout.write("\n");
  } finally {
    await harness.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
