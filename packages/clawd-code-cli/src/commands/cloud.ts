import { Command } from "commander";
import chalk from "chalk";
import { spawn, execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STATE_DIR = join(homedir(), ".clawd-cloud-os");
const PIDS_DIR = join(STATE_DIR, "pids");
const LOGS_DIR = join(STATE_DIR, "logs");
const API_BASE = "https://solanaclawd.com/api";

interface ServiceDef {
  id: string;
  name: string;
  port: number;
  command: string;
  args: string[];
  healthPath?: string;
}

const SERVICES: ServiceDef[] = [
  {
    id: "solanaos-server",
    name: "SolanaOS Control UI",
    port: parseInt(process.env.SOLANAOS_UI_PORT ?? "7777"),
    command: "solanaos",
    args: ["server"],
  },
  {
    id: "solanaos-daemon",
    name: "SolanaOS Daemon",
    port: parseInt(process.env.SOLANAOS_DAEMON_PORT ?? "18790"),
    command: "solanaos",
    args: ["daemon"],
  },
  {
    id: "clawd-mcp",
    name: "solana-clawd MCP",
    port: parseInt(process.env.CLAWD_MCP_PORT ?? "3000"),
    command: "npm",
    args: ["run", "mcp:http"],
    healthPath: "/mcp",
  },
];

function ensureDirs() {
  for (const dir of [STATE_DIR, PIDS_DIR, LOGS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

function pidFile(serviceId: string) {
  return join(PIDS_DIR, `${serviceId}.pid`);
}

function logFile(serviceId: string) {
  return join(LOGS_DIR, `${serviceId}.log`);
}

function readPid(serviceId: string): number | null {
  const file = pidFile(serviceId);
  if (!existsSync(file)) return null;
  const val = parseInt(readFileSync(file, "utf8").trim());
  return isNaN(val) ? null : val;
}

function writePid(serviceId: string, pid: number) {
  ensureDirs();
  writeFileSync(pidFile(serviceId), String(pid));
}

function removePid(serviceId: string) {
  const file = pidFile(serviceId);
  if (existsSync(file)) {
    try { require("node:fs").unlinkSync(file); } catch { /* ignore */ }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function checkHttp(port: number, path = "/"): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 2000);
    import("node:http").then(({ default: http }) => {
      const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
        clearTimeout(timer);
        resolve(true);
        res.destroy();
      });
      req.on("error", () => { clearTimeout(timer); resolve(false); });
    });
  });
}

function resolveClawdRoot(): string {
  // Try OPENCLAWD_ROOT, then walk up from package dir
  if (process.env.OPENCLAWD_ROOT) return process.env.OPENCLAWD_ROOT;
  const pkg = resolve(import.meta.url ? new URL(import.meta.url).pathname : __filename, "../../../../..");
  if (existsSync(join(pkg, "clawd-cloud-os"))) return pkg;
  return join(homedir(), "src", "solana-clawd");
}

function resolveCloudOsScript(name: string): string | null {
  const root = resolveClawdRoot();
  const candidates = [
    join(root, "clawd-cloud-os", "scripts", name),
    join(root, "clawd-cloud-os", "tools", name),
    join(root, "CLI", name),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function createCloudCommand(): Command {
  const cloud = new Command("cloud");
  cloud.description("CLAWD Cloud OS — service management and environment setup");

  // ── start ──────────────────────────────────────────────────────────────────
  cloud
    .command("start [service]")
    .description("Start CLAWD services (solanaos-server, solanaos-daemon, clawd-mcp, or all)")
    .option("-f, --foreground", "run in foreground (logs to stdout)")
    .action(async (serviceId: string | undefined, opts) => {
      ensureDirs();
      const targets = serviceId
        ? SERVICES.filter((s) => s.id === serviceId || s.name.toLowerCase().includes(serviceId.toLowerCase()))
        : SERVICES;

      if (!targets.length) {
        console.error(chalk.red(`Unknown service: ${serviceId}`));
        console.log(`Available: ${SERVICES.map((s) => s.id).join(", ")}`);
        process.exit(1);
      }

      for (const svc of targets) {
        const existing = readPid(svc.id);
        if (existing && isProcessAlive(existing)) {
          console.log(chalk.yellow(`  ⚡ ${svc.name} already running (pid ${existing}, :${svc.port})`));
          continue;
        }

        console.log(chalk.cyan(`  ▶ Starting ${svc.name}...`));

        if (opts.foreground) {
          spawn(svc.command, svc.args, { stdio: "inherit" });
        } else {
          const log = logFile(svc.id);
          const out = require("node:fs").openSync(log, "a");
          const child = spawn(svc.command, svc.args, {
            detached: true,
            stdio: ["ignore", out, out],
          });
          child.unref();
          writePid(svc.id, child.pid!);
          console.log(chalk.green(`  ✓ ${svc.name} started (pid ${child.pid}, :${svc.port})`));
          console.log(chalk.dim(`    Logs: ${log}`));
        }
      }
    });

  // ── stop ───────────────────────────────────────────────────────────────────
  cloud
    .command("stop [service]")
    .description("Stop CLAWD services")
    .action(async (serviceId: string | undefined) => {
      const targets = serviceId
        ? SERVICES.filter((s) => s.id === serviceId || s.name.toLowerCase().includes(serviceId.toLowerCase()))
        : SERVICES;

      for (const svc of targets) {
        const pid = readPid(svc.id);
        if (!pid) {
          console.log(chalk.dim(`  · ${svc.name} — not running`));
          continue;
        }
        if (!isProcessAlive(pid)) {
          removePid(svc.id);
          console.log(chalk.dim(`  · ${svc.name} — stale pid removed`));
          continue;
        }
        try {
          process.kill(pid, "SIGTERM");
          removePid(svc.id);
          console.log(chalk.green(`  ✓ ${svc.name} stopped (pid ${pid})`));
        } catch (e: any) {
          console.error(chalk.red(`  ✗ Failed to stop ${svc.name}: ${e.message}`));
        }
      }
    });

  // ── status ─────────────────────────────────────────────────────────────────
  cloud
    .command("status")
    .description("Show service status")
    .action(async () => {
      console.log(chalk.cyan("\n  CLAWD Cloud OS — Service Status\n"));
      console.log(`  ${"Service".padEnd(30)} ${"Port".padEnd(8)} ${"PID".padEnd(8)} Status`);
      console.log(`  ${"─".repeat(60)}`);

      for (const svc of SERVICES) {
        const pid = readPid(svc.id);
        const alive = pid ? isProcessAlive(pid) : false;
        const healthy = alive ? await checkHttp(svc.port, svc.healthPath ?? "/") : false;

        const pidStr = pid ? String(pid) : "—";
        const statusStr = alive
          ? healthy
            ? chalk.green("● healthy")
            : chalk.yellow("● running (no response)")
          : chalk.dim("○ stopped");

        console.log(
          `  ${svc.name.padEnd(30)} ${(":" + svc.port).padEnd(8)} ${pidStr.padEnd(8)} ${statusStr}`,
        );
      }

      // Remote ping
      console.log();
      try {
        const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(3000) });
        console.log(
          chalk.dim(`  Remote API (solanaclawd.com): ${res.ok ? chalk.green("online") : chalk.yellow(`${res.status}`)}`),
        );
      } catch {
        console.log(chalk.dim("  Remote API (solanaclawd.com): unreachable"));
      }
      console.log();
    });

  // ── logs ───────────────────────────────────────────────────────────────────
  cloud
    .command("logs [service]")
    .description("Show service logs")
    .option("-f, --follow", "follow log output (tail -f)")
    .option("-n, --lines <n>", "number of lines to show", "50")
    .action(async (serviceId: string | undefined, opts) => {
      const svc = serviceId
        ? SERVICES.find((s) => s.id === serviceId || s.name.toLowerCase().includes(serviceId.toLowerCase()))
        : SERVICES[0];

      if (!svc) {
        console.error(chalk.red(`Unknown service: ${serviceId}`));
        process.exit(1);
      }

      const log = logFile(svc.id);
      if (!existsSync(log)) {
        console.log(chalk.dim(`No logs yet for ${svc.name}`));
        return;
      }

      if (opts.follow) {
        spawn("tail", ["-f", log], { stdio: "inherit" });
      } else {
        const tailArgs = ["-n", opts.lines, log];
        spawn("tail", tailArgs, { stdio: "inherit" });
      }
    });

  // ── doctor ─────────────────────────────────────────────────────────────────
  cloud
    .command("doctor")
    .description("Check prerequisites and system health")
    .action(async () => {
      console.log(chalk.cyan("\n  CLAWD Cloud OS — Doctor\n"));

      const checks: Array<{ name: string; check: () => Promise<[boolean, string]> }> = [
        {
          name: "Node.js ≥ 20",
          check: async () => {
            const v = process.version;
            const major = parseInt(v.slice(1));
            return [major >= 20, v];
          },
        },
        {
          name: "Go runtime",
          check: async () => {
            try {
              const { stdout } = await execFileAsync("go", ["version"]);
              return [true, stdout.trim()];
            } catch {
              return [false, "not found (run: clawd cloud install-go)"];
            }
          },
        },
        {
          name: "SolanaOS CLI (solanaos)",
          check: async () => {
            try {
              const { stdout } = await execFileAsync("solanaos", ["version"]);
              return [true, stdout.trim()];
            } catch {
              return [false, "not found"];
            }
          },
        },
        {
          name: "Solana CLI",
          check: async () => {
            try {
              const { stdout } = await execFileAsync("solana", ["--version"]);
              return [true, stdout.trim()];
            } catch {
              return [false, "not found"];
            }
          },
        },
        {
          name: "AI provider key",
          check: async () => {
            const provider =
              process.env.XAI_API_KEY ? "XAI_API_KEY" :
              process.env.GROK_API_KEY ? "GROK_API_KEY" :
              process.env.ZAI_API_KEY ? "ZAI_API_KEY" :
              process.env.OPENROUTER_API_KEY ? "OPENROUTER_API_KEY" :
              "";
            return [Boolean(provider), provider || "not set"];
          },
        },
        {
          name: "HELIUS_API_KEY",
          check: async () => {
            const val = process.env.HELIUS_API_KEY || process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL;
            return [Boolean(val), process.env.HELIUS_API_KEY ? "set" : val ? "RPC URL set" : "not set (Helius RPC unavailable)"];
          },
        },
        {
          name: "HELIUS_WSS_URL",
          check: async () => {
            const val = process.env.HELIUS_WSS_URL || process.env.SOLANA_WSS_URL;
            return [Boolean(val || process.env.HELIUS_API_KEY), val ? "set" : "derived from HELIUS_API_KEY if set"];
          },
        },
        {
          name: "Solana keypair (~/.config/solana/id.json)",
          check: async () => {
            const path = join(homedir(), ".config", "solana", "id.json");
            return [existsSync(path), existsSync(path) ? path : "not found"];
          },
        },
        {
          name: "State dir (~/.clawd-cloud-os)",
          check: async () => {
            return [true, existsSync(STATE_DIR) ? "exists" : "will be created on first start"];
          },
        },
      ];

      let allGood = true;
      for (const { name, check } of checks) {
        const [ok, detail] = await check();
        if (!ok) allGood = false;
        const icon = ok ? chalk.green("✓") : chalk.red("✗");
        const label = name.padEnd(42);
        const info = ok ? chalk.dim(detail) : chalk.yellow(detail);
        console.log(`  ${icon} ${label} ${info}`);
      }

      console.log();
      if (allGood) {
        console.log(chalk.green("  ✓ All checks passed\n"));
      } else {
        console.log(chalk.yellow("  Some checks failed. Run clawd cloud setup to install missing dependencies.\n"));
      }
    });

  // ── setup ──────────────────────────────────────────────────────────────────
  cloud
    .command("setup")
    .description("Run the CLAWD Cloud OS bootstrap (Go + SolanaOS + solana-clawd)")
    .action(async () => {
      const script = resolveCloudOsScript("bootstrap.sh");
      if (!script) {
        console.error(chalk.red("bootstrap.sh not found."));
        console.log(
          chalk.dim("Tip: run from inside the solana-clawd repo, or set OPENCLAWD_ROOT"),
        );
        process.exit(1);
      }
      console.log(chalk.cyan(`  Running bootstrap: ${script}\n`));
      spawn("bash", [script], { stdio: "inherit" });
    });

  // ── install-go ─────────────────────────────────────────────────────────────
  cloud
    .command("install-go")
    .description("Install Go on any terminal (root or non-root, E2B-safe)")
    .action(async () => {
      const script = resolveCloudOsScript("install-go.sh");
      if (!script) {
        console.error(chalk.red("install-go.sh not found."));
        process.exit(1);
      }
      console.log(chalk.cyan(`  Running Go installer: ${script}\n`));
      spawn("bash", [script], { stdio: "inherit" });
    });

  // ── paths ──────────────────────────────────────────────────────────────────
  cloud
    .command("paths")
    .description("Show resolved repo, Cloud OS, state, log, and pid paths")
    .action(() => {
      const root = resolveClawdRoot();
      console.log(chalk.cyan("\n  CLAWD Cloud OS — Paths\n"));
      const rows: [string, string][] = [
        ["Repo root", root],
        ["Cloud OS", join(root, "clawd-cloud-os")],
        ["CLI tools", join(root, "CLI")],
        ["State dir", STATE_DIR],
        ["PID dir", PIDS_DIR],
        ["Log dir", LOGS_DIR],
        ["Settings", join(homedir(), ".clawd", "user-settings.json")],
        ["Solana keypair", join(homedir(), ".config", "solana", "id.json")],
      ];
      for (const [label, path] of rows) {
        const exists = existsSync(path);
        const icon = exists ? chalk.green("✓") : chalk.dim("·");
        console.log(`  ${icon} ${label.padEnd(18)} ${chalk.dim(path)}`);
      }
      console.log();
    });

  // ── env ────────────────────────────────────────────────────────────────────
  cloud
    .command("env")
    .description("Show loaded env files and masked key status")
    .action(() => {
      const root = resolveClawdRoot();
      const envFiles = [
        join(root, "clawd-cloud-os", ".env"),
        join(root, ".env"),
        join(root, "solana-clawd", ".env"),
        join(homedir(), ".clawd-code", ".env"),
      ];

      console.log(chalk.cyan("\n  CLAWD Cloud OS — Environment\n"));
      console.log("  Env files (precedence order):");
      for (const f of envFiles) {
        const exists = existsSync(f);
        const icon = exists ? chalk.green("✓") : chalk.dim("·");
        console.log(`    ${icon} ${f}`);
      }

      const keys = [
        "XAI_API_KEY",
        "ZAI_API_KEY",
        "ZAI_BASE_URL",
        "HELIUS_API_KEY",
        "HELIUS_WSS_URL",
        "OPENROUTER_API_KEY",
        "TELEGRAM_BOT_TOKEN",
        "SOLANA_PRIVATE_KEY",
        "OPENAI_API_KEY",
        "BIRDEYE_API_KEY",
      ];

      console.log("\n  Key status:");
      for (const k of keys) {
        const val = process.env[k];
        const status = val
          ? chalk.green(`set (${val.slice(0, 4)}${"*".repeat(8)})`)
          : chalk.dim("not set");
        console.log(`    ${k.padEnd(25)} ${status}`);
      }
      console.log();
    });

  // ── validate ───────────────────────────────────────────────────────────────
  cloud
    .command("validate")
    .description("Validate Cloud OS configs and required files")
    .action(async () => {
      const root = resolveClawdRoot();
      const required = [
        join(root, "clawd-cloud-os", "config", "clawd-cloud-os.json"),
        join(root, "clawd-cloud-os", "config", "clawd-registration.json"),
        join(root, "clawd-cloud-os", "scripts", "bootstrap.sh"),
        join(root, "clawd-cloud-os", "scripts", "install-go.sh"),
      ];

      console.log(chalk.cyan("\n  CLAWD Cloud OS — Validate\n"));
      let ok = true;
      for (const f of required) {
        if (existsSync(f)) {
          console.log(`  ${chalk.green("✓")} ${f}`);
        } else {
          console.log(`  ${chalk.red("✗")} ${f} ${chalk.yellow("(missing)")}`);
          ok = false;
        }
      }

      // Validate main config JSON
      const cfgPath = join(root, "clawd-cloud-os", "config", "clawd-cloud-os.json");
      if (existsSync(cfgPath)) {
        try {
          JSON.parse(readFileSync(cfgPath, "utf8"));
          console.log(`  ${chalk.green("✓")} clawd-cloud-os.json is valid JSON`);
        } catch {
          console.log(`  ${chalk.red("✗")} clawd-cloud-os.json is invalid JSON`);
          ok = false;
        }
      }

      console.log();
      if (ok) {
        console.log(chalk.green("  ✓ All validations passed\n"));
      } else {
        console.log(chalk.yellow("  Validation issues found.\n"));
        process.exit(1);
      }
    });

  return cloud;
}
