import { Command } from "commander";
import chalk from "chalk";

const API_BASE = "https://solanaclawd.com/api";

async function apiGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

async function apiPost(path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NODE COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

export function createNodeCommand(): Command {
  const node = new Command("node");
  node.description("CLAWD node operations — register, status, peers");

  node
    .command("register")
    .description("Register this node with solanaclawd.com")
    .option("--name <name>", "Node name")
    .option("--wallet <pubkey>", "Node wallet public key")
    .option("--region <region>", "Node region (e.g. us-east, eu-west)")
    .option("--dry-run", "Simulate without submitting")
    .action(async (opts) => {
      console.log(chalk.cyan("\n  📡 Node Registration\n"));
      if (opts.dryRun) {
        console.log(chalk.yellow("  [dry-run] Would register:"));
        console.log(`    Name   : ${opts.name ?? "(auto)"}`);
        console.log(`    Wallet : ${opts.wallet ?? "(from env)"}`);
        console.log(`    Region : ${opts.region ?? "auto-detect"}\n`);
        return;
      }
      const result = await apiPost("/nodes/register", {
        name: opts.name,
        wallet: opts.wallet ?? process.env.SOLANA_PRIVATE_KEY ? "(from env)" : undefined,
        region: opts.region,
      });
      if (result?.nodeId) {
        console.log(chalk.green(`  ✓ Registered — Node ID: ${result.nodeId}\n`));
      } else {
        console.log(chalk.dim("  Registration unavailable (offline). Node ID will be assigned when connected.\n"));
      }
    });

  node
    .command("status")
    .description("Show node status and health")
    .action(async () => {
      console.log(chalk.cyan("\n  📊 Node Status\n"));
      const data = await apiGet("/nodes/status");
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`  System   : ${chalk.green("online (local)")}`);
        console.log(`  RPC      : ${chalk.dim(process.env.HELIUS_API_KEY ? "Helius mainnet" : "public mainnet-beta")}`);
        console.log(`  Operator : ${process.env.SOLANA_PRIVATE_KEY ? chalk.green("wallet set") : chalk.yellow("no wallet (SOLANA_PRIVATE_KEY not set)")}`);
        console.log();
      }
    });

  node
    .command("peers")
    .description("List connected peers")
    .action(async () => {
      console.log(chalk.cyan("\n  🔗 Node Peers\n"));
      const data = await apiGet("/nodes/peers");
      if (!data) {
        console.log(chalk.dim("  Peer list unavailable.\n"));
        return;
      }
      const peers = Array.isArray(data) ? data : data.peers ?? [];
      if (!peers.length) {
        console.log(chalk.dim("  No peers connected.\n"));
        return;
      }
      for (const p of peers) {
        console.log(`  ${chalk.cyan((p.id ?? "?").padEnd(20))} ${p.region ?? "?"} ${chalk.dim(p.latency ? `${p.latency}ms` : "")}`);
      }
      console.log();
    });

  return node;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE COMMAND
// ═══════════════════════════════════════════════════════════════════════════════

export function createMarketplaceCommand(): Command {
  const mp = new Command("marketplace");
  mp.alias("market");
  mp.description("ClawdHub marketplace — browse skills, agents, and tools");

  mp
    .command("list")
    .alias("ls")
    .description("Show marketplace listings")
    .option("--category <cat>", "Filter by category (skills|agents|tools)")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const path = opts.category ? `/marketplace?category=${opts.category}` : "/marketplace";
      console.log(chalk.cyan("\n  🛒 Marketplace\n"));
      const data = await apiGet(path);
      if (!data) {
        console.log(chalk.dim("  Marketplace unavailable.\n"));
        printDefaultMarketplace();
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const items = Array.isArray(data) ? data : data.items ?? [];
      for (const item of items) {
        const price = item.price ? chalk.yellow(` ${item.price}`) : "";
        console.log(`  ${chalk.cyan((item.id ?? "?").padEnd(30))} ${chalk.white(item.name ?? "")}${price}`);
        if (item.description) console.log(`  ${" ".repeat(30)} ${chalk.dim(item.description)}`);
      }
      console.log();
    });

  mp
    .command("trending")
    .description("Show trending marketplace items")
    .action(async () => {
      console.log(chalk.cyan("\n  📈 Trending\n"));
      const data = await apiGet("/marketplace/trending");
      if (!data) {
        console.log(chalk.dim("  Trending unavailable.\n"));
        return;
      }
      const items = Array.isArray(data) ? data : data.items ?? [];
      items.forEach((item: any, i: number) => {
        console.log(`  ${chalk.yellow(`#${i + 1}`)} ${chalk.cyan(item.id ?? "?")}  ${chalk.white(item.name ?? "")}`);
      });
      console.log();
    });

  return mp;
}

function printDefaultMarketplace() {
  const items = [
    { id: "qedgen-solana",   name: "QEDGen Solana",       cat: "skills",  price: "0.01 SOL" },
    { id: "vulcan-mcp",      name: "Vulcan MCP Server",   cat: "agents",  price: "free"     },
    { id: "clawd-perps",     name: "Clawd Perps Agent",   cat: "agents",  price: "free"     },
    { id: "helius-das",      name: "Helius DAS Skill",    cat: "skills",  price: "free"     },
    { id: "bags-launcher",   name: "Bags Token Launcher", cat: "tools",   price: "0.005 SOL" },
    { id: "nanoclawd",       name: "NanoClawd Sandbox",   cat: "tools",   price: "free"     },
  ];
  for (const item of items) {
    console.log(
      `  ${chalk.cyan(item.id.padEnd(28))} ${chalk.white(item.name.padEnd(26))} ${chalk.yellow(item.price)}`
    );
  }
  console.log();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAY COMMAND (x402)
// ═══════════════════════════════════════════════════════════════════════════════

export function createPayCommand(): Command {
  const pay = new Command("pay");
  pay.description("x402 payment operations — supported tokens, verify, settle");

  pay
    .command("supported")
    .description("List supported tokens for x402 payments")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      console.log(chalk.cyan("\n  💳 x402 Supported Tokens\n"));
      const data = await apiGet("/x402/facilitator/supported");
      if (!data) {
        console.log(chalk.dim("  Offline — known supported tokens:\n"));
        const defaults = [
          { symbol: "USDC",  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6  },
          { symbol: "SOL",   mint: "So11111111111111111111111111111111111111112",   decimals: 9  },
          { symbol: "USDT",  mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6  },
          { symbol: "CLAWD", mint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump", decimals: 6 },
        ];
        console.log(`  ${"Symbol".padEnd(8)} ${"Decimals".padEnd(10)} Mint`);
        console.log(`  ${"─".repeat(70)}`);
        for (const t of defaults) {
          console.log(`  ${chalk.cyan(t.symbol.padEnd(8))} ${String(t.decimals).padEnd(10)} ${chalk.dim(t.mint)}`);
        }
        console.log();
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }
      const tokens = Array.isArray(data) ? data : data.tokens ?? [];
      console.log(`  ${"Symbol".padEnd(8)} ${"Decimals".padEnd(10)} Mint`);
      console.log(`  ${"─".repeat(70)}`);
      for (const t of tokens) {
        console.log(
          `  ${chalk.cyan((t.symbol ?? "?").padEnd(8))} ${String(t.decimals ?? "?").padEnd(10)} ${chalk.dim(t.mint ?? "?")}`,
        );
      }
      console.log();
    });

  pay
    .command("verify <paymentId>")
    .description("Verify an x402 payment by ID")
    .action(async (paymentId: string) => {
      console.log(chalk.cyan(`\n  ✓ Verifying payment: ${paymentId}\n`));
      const result = await apiPost("/x402/facilitator/verify", { payment: paymentId });
      if (result) {
        const ok = result.valid !== false;
        console.log(ok ? chalk.green("  ✓ Payment valid") : chalk.red("  ✗ Payment invalid"));
        if (result.amount)   console.log(`  Amount  : ${result.amount}`);
        if (result.token)    console.log(`  Token   : ${result.token}`);
        if (result.paidAt)   console.log(`  Paid at : ${result.paidAt}`);
      } else {
        console.log(chalk.dim("  Verification service unavailable.\n"));
      }
      console.log();
    });

  pay
    .command("settle <paymentId>")
    .description("Settle an x402 payment")
    .option("--dry-run", "Simulate without settling")
    .action(async (paymentId: string, opts) => {
      console.log(chalk.cyan(`\n  💸 Settling payment: ${paymentId}\n`));
      if (opts.dryRun) {
        console.log(chalk.yellow("  [dry-run] Would settle payment.\n"));
        return;
      }
      const result = await apiPost("/x402/facilitator/settle", { payment: paymentId });
      if (result?.txId) {
        console.log(chalk.green("  ✓ Payment settled"));
        console.log(`  Tx : ${chalk.cyan(result.txId)}\n`);
      } else {
        console.log(chalk.dim("  Settlement service unavailable.\n"));
      }
    });

  return pay;
}
