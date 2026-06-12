/**
 * Standalone TUI launcher for solana-clawd
 * Usage: npx tsx tui/start.ts [--url <gateway_url>] [--session <key>] [--message <text>]
 *
 * Replaces the old CLI/clawd-cli.sh and CLI/clawd-connect.sh bash scripts
 * with a native TypeScript entry point that wires the full TUI stack:
 *   - Gateway chat client
 *   - Slash commands (/clawd, /connect, /register, /attest)
 *   - SAS attestation, marketplace, x402 payments
 *   - Local shell execution via ! prefix
 */

import { runTui } from "./tui.js";

const url = process.argv.find((a) => a.startsWith("--url="))?.split("=")[1] ?? process.env.CLAWD_GATEWAY_URL ?? "http://localhost:3000";
const sessionIndex = process.argv.indexOf("--session");
const session = sessionIndex !== -1 ? process.argv[sessionIndex + 1] : undefined;
const messageIndex = process.argv.indexOf("--message");
const message = messageIndex !== -1 ? process.argv[messageIndex + 1] : process.env.CLAWD_AUTO_MESSAGE;

const opts = {
  url,
  ...(session ? { session } : {}),
  ...(message ? { message } : {}),
  thinking: process.env.CLAWD_THINKING_LEVEL as "off" | "on" | "ask" | "full" | undefined,
  deliver: process.env.CLAWD_DELIVER === "true",
};

console.error("🦞 Solana Clawd TUI starting...");
console.error(`   Gateway: ${opts.url}`);
console.error(`   Session: ${opts.session ?? "(auto)"}`);
console.error("");

runTui(opts).catch((err: Error) => {
  console.error("TUI exited with error:", err);
  process.exit(1);
});