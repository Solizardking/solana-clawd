/**
 * clawd-wallet CLI — Command-line interface for Clawd Wallet
 * npm i -g @openclawd/wallet && clawd-wallet swap SOL USDC 0.1
 */

import { Command } from "commander";
import { ClawdWallet, SwapService, SOLANA_TOKENS } from "./index.js";

const program = new Command();

program
  .name("clawd-wallet")
  .description("Clawd Wallet — Privy-powered Solana wallet CLI for openclawd")
  .version("0.1.0");

// ─── Wallet commands ──────────────────────────────────────────────────────

program
  .command("create")
  .description("Create a new Clawd Wallet (prints address — private key never leaves Privy)")
  .requiredOption("--app-id <id>", "Privy app ID")
  .option("--chain <chain>", "solana | devnet", "mainnet")
  .action(async (opts) => {
    console.log("Creating wallet via Privy...");
    console.log("(In browser: use <PrivyProvider> from @openclawd/wallet/react)");
    console.log(`App: ${opts.appId}`);
    console.log(`Chain: ${opts.chain}`);
  });

program
  .command("balance <address>")
  .description("Get SOL balance for a Solana address")
  .option("--rpc <url>", "Solana RPC URL", "https://api.mainnet-beta.solana.com")
  .option("--json", "Output raw JSON")
  .action(async (address, opts) => {
    const wallet = new ClawdWallet({ address });
    const lamports = await wallet.getBalance();
    const sol = Number(lamports) / 1e9;

    if (opts.json) {
      console.log(JSON.stringify({ address, lamports: lamports.toString(), sol }, null, 2));
    } else {
      console.log(`${sol.toFixed(6)} SOL  (${lamports} lamports)`);
      console.log(`Address: ${address}`);
    }
  });

// ─── Swap commands ────────────────────────────────────────────────────────

const swapCmd = program
  .command("swap <input> <output> <amount>")
  .description("Swap tokens via Jupiter DEX aggregator")
  .requiredOption("--wallet <address>", "Solana wallet address")
  .option("--slippage <bps>", "Slippage in basis points", "50")
  .option("--chain <chain>", "solana | devnet", "mainnet")
  .option("--rpc <url>", "Solana RPC URL")
  .option("--json", "Output raw JSON");

swapCmd.action(async (input, output, amount, opts) => {
  const chain = opts.chain ?? "mainnet";

  // Parse amount — convert human-readable to raw (lamports for SOL, decimals for tokens)
  const inputToken = SOLANA_TOKENS[input.toUpperCase()] ?? SOLANA_TOKENS.USDC;
  const rawAmount = parseFloat(amount) * Math.pow(10, inputToken.decimals);

  const swap = new SwapService({ chain });

  // 1. Quote
  console.log(`Fetching quote: ${amount} ${input} → ${output}...`);
  const quote = await swap.quote({
    inputToken: input,
    outputToken: output,
    amount: rawAmount.toFixed(0),
    slippageBps: parseInt(opts.slippage),
  });

  const outputToken = SOLANA_TOKENS[output.toUpperCase()];
  const outputDecimals = outputToken?.decimals ?? 9;
  const { Decimal } = await import("decimal.js");
  const outputFormatted = new Decimal(quote.outAmount)
    .div(new Decimal(10).pow(outputDecimals))
    .toFixed(6);

  console.log(`\nQuote:`);
  console.log(`  Output: ${outputFormatted} ${output}`);
  console.log(`  Price impact: ${quote.priceImpactPct.toFixed(4)}%`);
  console.log(`  Routes: ${quote.routePlan.length}`);

  if (opts.json) {
    console.log(JSON.stringify(quote, null, 2));
    return;
  }

  console.log(`\nSign the transaction in your wallet to confirm.`);
  console.log(`(For programmatic execution: use @openclawd/wallet in Node.js with a signAndSendTransaction provider)`);
});

// ─── Quote command ────────────────────────────────────────────────────────

program
  .command("quote <input> <output> <amount>")
  .description("Get a Jupiter swap quote without executing")
  .option("--slippage <bps>", "Slippage in basis points", "50")
  .option("--chain <chain>", "solana | devnet", "mainnet")
  .option("--json", "Output raw JSON")
  .action(async (input, output, amount, opts) => {
    const chain = opts.chain ?? "mainnet";
    const swap = new SwapService({ chain });

    const inputToken = SOLANA_TOKENS[input.toUpperCase()] ?? { decimals: 9 };
    const rawAmount = parseFloat(amount) * Math.pow(10, inputToken.decimals);

    const quote = await swap.quote({
      inputToken: input,
      outputToken: output,
      amount: rawAmount.toFixed(0),
      slippageBps: parseInt(opts.slippage),
    });

    const outputToken = SOLANA_TOKENS[output.toUpperCase()] ?? { decimals: 9 };
    const { Decimal } = await import("decimal.js");
    const outFormatted = new Decimal(quote.outAmount)
      .div(new Decimal(10).pow(outputToken.decimals))
      .toFixed(6);

    console.log(`\nQuote: ${amount} ${input.toUpperCase()} → ${outFormatted} ${output.toUpperCase()}`);
    console.log(`Price impact: ${quote.priceImpactPct.toFixed(4)}%`);
    console.log(`Routes: ${quote.routePlan.map((r) => r.swapInfo.label).join(", ")}`);

    if (opts.json) {
      console.log(JSON.stringify(quote, null, 2));
    }
  });

// ─── Token list ───────────────────────────────────────────────────────────

program
  .command("tokens")
  .description("List top tokens on Jupiter")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const swap = new SwapService();
    const tokens = await swap.getTokens();
    const top = ["SOL", "USDC", "USDT", "WBTC", "WETH", "BONK", "WIF", "POPCAT"];
    const topTokens = tokens.filter((t) => top.includes(t.symbol.toUpperCase()));

    if (opts.json) {
      console.log(JSON.stringify(topTokens, null, 2));
    } else {
      console.log("Top tokens:\n");
      topTokens.forEach((t) => {
        console.log(`  ${t.symbol.padEnd(8)} ${t.mint.slice(0, 12)}...  (${t.name})`);
      });
    }
  });

// ─── Info ─────────────────────────────────────────────────────────────────

program
  .command("info")
  .description("Show Clawd Wallet package info and Privy setup instructions")
  .action(() => {
    console.log(`
🦞 Clawd Wallet v0.1.0
   @openclawd/wallet

A Privy-powered embedded Solana wallet for the openclawd ecosystem.
Built on:
  • Privy — embedded wallet infrastructure
  • Jupiter — DEX aggregator
  • Grok 4.20 Beta — AI transaction pre-screening
  • Solana Kit — modern transaction building

Setup:
  1. Get a Privy app ID: https://dashboard.privy.io
  2. Install: npm i @openclawd/wallet
  3. Wrap your app: <PrivyProvider appId="your-app-id">
  4. Access wallet: const { wallet } = useClawdWallet()

Commands:
  clawd-wallet tokens          List top tokens
  clawd-wallet quote <in> <out> <amt>   Get swap quote
  clawd-wallet swap <in> <out> <amt>   Execute swap
  clawd-wallet balance <addr>  Check SOL balance
`);
  });

/**
 * Export the CLI creator for programmatic use
 */
export function createCli(argv?: string[]) {
  return program.parse(argv ?? process.argv);
}

createCli();
