/**
 * Best Price Command
 * 
 * 💰 Find best LP price for a trade
 * 
 * @module commands/best-price
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseAllAccounts } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerBestPrice(program: Command): void {
  program
    .command("best-price")
    .description("💰 Find best LP price for a trade")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--size <string>", "Trade size")
    .option("--oracle <pubkey>", "Oracle price feed")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const accounts = parseAllAccounts(data);

      // Filter to LPs only
      const lps = accounts.filter(({ account }) => account.kind === 1);

      console.log(`Found ${lps.length} LP(s):`);

      for (const { idx, account } of lps) {
        console.log(`  [${idx}] Matcher: ${account.matcherProgram.toBase58().slice(0, 8)}...`);
      }
    });
}
