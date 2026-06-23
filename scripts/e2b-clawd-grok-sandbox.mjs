#!/usr/bin/env node
import "dotenv/config";
import { Sandbox } from "@e2b/code-interpreter";

const DEFAULT_REPO = "https://github.com/solizardking/solana-clawd.git";
const DEFAULT_BRANCH = "main";
const DEFAULT_REMOTE_DIR = "/home/user/solana-clawd";
const DEFAULT_PACKAGE_DIR = "core-ai/clawd-grok";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 12 * 60 * 1000;

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--") && !arg.includes("=")));

function readFlag(name, fallback) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return fallback;
}

function readNumberFlag(name, fallback) {
  const value = Number.parseInt(readFlag(name, ""), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function shQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function joinRemotePath(root, child) {
  if (child.startsWith("/")) return child;
  return `${root.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
}

const providerEnvKeys = [
  "XAI_API_KEY",
  "GROK_API_KEY",
  "AI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

const solanaReadEnvKeys = [
  "HELIUS_API_KEY",
  "SOLANA_RPC_URL",
  "SOLANA_TRACKER_API_KEY",
  "SOLANA_TRACKER_RPC_URL",
  "PHOENIX_API_KEY",
  "PHOENIX_API_URL",
];

function pickEnv(keys) {
  return Object.fromEntries(keys.filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
}

const secretValues = [
  process.env.E2B_API_KEY,
  ...providerEnvKeys.map((key) => process.env[key]),
  ...solanaReadEnvKeys.map((key) => process.env[key]),
].filter(Boolean);

function redact(text) {
  let output = String(text ?? "");
  for (const secret of secretValues) output = output.split(secret).join("[REDACTED]");
  return output;
}

function printHelp() {
  console.log(`Usage: npm run e2b:clawd-grok -- [options]

Creates an E2B sandbox computer, clones solana-clawd, builds core-ai/clawd-grok, and runs a safe CLI smoke command.

Required:
  E2B_API_KEY                    E2B API key in your shell or .env file

Options:
  --dry-run                      Print the execution plan without creating a sandbox
  --keep                         Leave the sandbox running and print its sandbox ID
  --repo <url>                   Git repo to clone (default: ${DEFAULT_REPO})
  --branch <name>                Git branch to clone (default: ${DEFAULT_BRANCH})
  --remote-dir <path>            Sandbox checkout path (default: ${DEFAULT_REMOTE_DIR})
  --package-dir <path>           Path to clawd-grok inside the checkout (default: ${DEFAULT_PACKAGE_DIR})
  --timeout-ms <ms>              Sandbox TTL in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --command-timeout-ms <ms>      Per-command timeout in milliseconds (default: ${DEFAULT_COMMAND_TIMEOUT_MS})
  --skip-install                 Clone only, then run the smoke command
  --skip-build                   Install dependencies but skip the Clawd Grok build
  --command <cmd>                Override the final smoke command
  --prompt <text>                Run a Clawd Grok headless prompt after build
  --pass-provider-keys           Forward XAI/GROK/AI/OPENROUTER/OPENAI/ANTHROPIC keys into the sandbox
  --pass-solana-read-keys        Forward read-only Solana/Phoenix/Helius keys into the sandbox

Examples:
  E2B_API_KEY=e2b_... npm run e2b:clawd-grok
  npm run e2b:clawd-grok -- --dry-run
  npm run e2b:clawd-grok -- --keep
  npm run e2b:clawd-grok -- --prompt "Summarize the Clawd Grok status output" --pass-provider-keys --keep
`);
}

if (flags.has("--help") || flags.has("-h")) {
  printHelp();
  process.exit(0);
}

const repo = readFlag("--repo", process.env.CLAWD_GROK_E2B_REPO || process.env.CLAWD_E2B_REPO || DEFAULT_REPO);
const branch = readFlag(
  "--branch",
  process.env.CLAWD_GROK_E2B_BRANCH || process.env.CLAWD_E2B_BRANCH || DEFAULT_BRANCH,
);
const remoteDir = readFlag(
  "--remote-dir",
  process.env.CLAWD_GROK_E2B_REMOTE_DIR || process.env.CLAWD_E2B_REMOTE_DIR || DEFAULT_REMOTE_DIR,
);
const packageDir = readFlag("--package-dir", process.env.CLAWD_GROK_E2B_PACKAGE_DIR || DEFAULT_PACKAGE_DIR);
const packagePath = joinRemotePath(remoteDir, packageDir);
const timeoutMs = readNumberFlag(
  "--timeout-ms",
  Number.parseInt(process.env.CLAWD_GROK_E2B_TIMEOUT_MS || process.env.CLAWD_E2B_TIMEOUT_MS || "", 10) ||
    DEFAULT_TIMEOUT_MS,
);
const commandTimeoutMs = readNumberFlag(
  "--command-timeout-ms",
  Number.parseInt(
    process.env.CLAWD_GROK_E2B_COMMAND_TIMEOUT_MS || process.env.CLAWD_E2B_COMMAND_TIMEOUT_MS || "",
    10,
  ) || DEFAULT_COMMAND_TIMEOUT_MS,
);
const prompt = readFlag("--prompt", "");
const passProviderKeys =
  flags.has("--pass-provider-keys") || process.env.CLAWD_GROK_E2B_PASS_PROVIDER_KEYS === "true";
const passSolanaReadKeys =
  flags.has("--pass-solana-read-keys") || process.env.CLAWD_GROK_E2B_PASS_SOLANA_READ_KEYS === "true";
const providerEnv = passProviderKeys ? pickEnv(providerEnvKeys) : {};
const solanaReadEnv = passSolanaReadKeys ? pickEnv(solanaReadEnvKeys) : {};

const cloneCommand = [
  "git",
  "clone",
  "--depth",
  "1",
  "--branch",
  shQuote(branch),
  shQuote(repo),
  shQuote(remoteDir),
].join(" ");

const installCommand = [
  `cd ${shQuote(packagePath)}`,
  "if command -v bun >/dev/null 2>&1; then bun install --frozen-lockfile; else npm install --include=dev --ignore-scripts; fi",
].join(" && ");

const buildCommand = [
  `cd ${shQuote(packagePath)}`,
  "if command -v bun >/dev/null 2>&1; then bun run build; else npm run build; fi",
].join(" && ");

function clawdGrokCommand(commandArgs) {
  return [
    `cd ${shQuote(packagePath)}`,
    `if command -v bun >/dev/null 2>&1; then bun run dist/index.js ${commandArgs}; else node dist/index.js ${commandArgs}; fi`,
  ].join(" && ");
}

const defaultSmokeCommand = clawdGrokCommand("status --output json");
const promptCommand = prompt ? clawdGrokCommand(`-p ${shQuote(prompt)} --format text`) : "";
const smokeCommand = readFlag("--command", promptCommand || defaultSmokeCommand);

const plan = [
  ["create sandbox", `timeoutMs=${timeoutMs}`],
  ["interpreter smoke", `runCode('print("clawd-grok sandbox ready")')`],
  ["clone", cloneCommand],
  ...(!flags.has("--skip-install") ? [["install", installCommand]] : []),
  ...(!flags.has("--skip-install") && !flags.has("--skip-build") ? [["build", buildCommand]] : []),
  ["smoke", smokeCommand],
];

if (flags.has("--dry-run")) {
  console.log("[e2b] dry run plan");
  for (const [label, command] of plan) console.log(`- ${label}: ${redact(command)}`);
  console.log(
    `[e2b] provider keys forwarded: ${
      passProviderKeys ? Object.keys(providerEnv).join(", ") || "none set" : "false"
    }`,
  );
  console.log(
    `[e2b] Solana read keys forwarded: ${
      passSolanaReadKeys ? Object.keys(solanaReadEnv).join(", ") || "none set" : "false"
    }`,
  );
  process.exit(0);
}

if (!process.env.E2B_API_KEY) {
  console.error("E2B_API_KEY is required. Put it in your shell or .env; do not commit it.");
  process.exit(1);
}

if (prompt && !passProviderKeys && !Object.keys(providerEnv).length) {
  console.error("Prompt mode needs an LLM key. Re-run with --pass-provider-keys after setting XAI_API_KEY or AI_API_KEY.");
  process.exit(1);
}

async function runCommand(sandbox, label, command) {
  console.log(`\n[e2b] ${label}`);
  console.log(`[e2b] $ ${redact(command)}`);
  try {
    const result = await sandbox.commands.run(command, {
      timeoutMs: commandTimeoutMs,
      onStdout: (data) => process.stdout.write(redact(data)),
      onStderr: (data) => process.stderr.write(redact(data)),
    });
    console.log(`\n[e2b] ${label} exit ${result.exitCode}`);
    return result;
  } catch (error) {
    if (error?.stdout) process.stdout.write(redact(error.stdout));
    if (error?.stderr) process.stderr.write(redact(error.stderr));
    throw new Error(`${label} failed${Number.isInteger(error?.exitCode) ? ` with exit ${error.exitCode}` : ""}: ${error?.message || error}`);
  }
}

let sandbox;
try {
  console.log("[e2b] creating sandbox");
  sandbox = await Sandbox.create({
    timeoutMs,
    metadata: {
      project: "solana-clawd",
      runner: "clawd-grok",
      repo,
      branch,
      packageDir,
    },
    envs: {
      CI: "1",
      NO_COLOR: "1",
      CLAWD_E2B_SANDBOX: "true",
      CLAWD_GROK_E2B_SANDBOX: "true",
      ...providerEnv,
      ...solanaReadEnv,
    },
  });
  console.log(`[e2b] sandbox id: ${sandbox.sandboxId}`);

  const execution = await sandbox.runCode('print("clawd-grok sandbox ready")', { timeoutMs: 30_000 });
  for (const line of execution.logs.stdout) console.log(`[e2b:python] ${redact(line)}`);
  for (const line of execution.logs.stderr) console.error(`[e2b:python:stderr] ${redact(line)}`);

  await runCommand(sandbox, "clone repo", cloneCommand);
  if (!flags.has("--skip-install")) await runCommand(sandbox, "install dependencies", installCommand);
  if (!flags.has("--skip-install") && !flags.has("--skip-build")) await runCommand(sandbox, "build clawd grok", buildCommand);
  await runCommand(sandbox, prompt ? "run clawd grok prompt" : "run clawd grok smoke", smokeCommand);

  const files = await sandbox.files.list(packagePath);
  console.log(`\n[e2b] clawd-grok files: ${files.slice(0, 12).map((entry) => entry.name).join(", ")}`);

  if (flags.has("--keep")) {
    console.log(`[e2b] sandbox kept alive: ${sandbox.sandboxId}`);
    console.log("[e2b] reconnect later with the E2B CLI or SDK using that sandbox ID.");
  }
} finally {
  if (sandbox && !flags.has("--keep")) {
    console.log("[e2b] killing sandbox");
    await sandbox.kill().catch((error) => console.error(`[e2b] sandbox cleanup failed: ${error?.message || error}`));
  }
}
