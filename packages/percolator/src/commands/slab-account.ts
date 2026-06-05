/**
 * Slab Account Command
 * 
 * 👤 Get specific account info
 * 
 * @module commands/slab-account
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseAccount, parseUsedIndices } from "../solana/slab.js";
import { validatePublicKey, validateIndex } from "../validation.js";

export function registerSlabAccount(program: Command): void {
  program
    .command("slab:account")
    .description("👤 Get specific account info")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--idx <number>", "Account index")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const idx = validateIndex(opts.idx, "--idx");
      const data = await fetchSlab(ctx.connection, slabPk);

      try {
        const account = parseAccount(data, idx);

        if (flags.json) {
          console.log(JSON.stringify({ idx, ...account }, null, 2));
        } else {
          console.log(`Account ${idx}:`);
          console.log(`  Kind: ${account.kind}`);
          console.log(`  Capital: ${account.capital}`);
          console.log(`  PnL: ${account.pnl}`);
          console.log(`  Owner: ${account.owner.toBase58()}`);
        }
      } catch (e) {
        console.log(`Account ${idx} not found or invalid`);
      }
    });
}
