/**
 * Slab Accounts Command
 * 
 * 📋 List all accounts in a slab
 * 
 * @module commands/slab-accounts
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseAllAccounts } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabAccounts(program: Command): void {
  program
    .command("slab:accounts")
    .description("📋 List all accounts in a slab")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const accounts = parseAllAccounts(data);

      console.log(`Found ${accounts.length} account(s):\n`);

      for (const { idx, account } of accounts) {
        console.log(`  [${idx}] ${account.kind === 0 ? 'User' : 'LP'} - ${account.owner.toBase58().slice(0, 8)}...`);
      }
    });
}
