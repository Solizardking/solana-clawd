/**
 * List Markets Command
 * 
 * 📋 List available perpetuals markets
 * 
 * @module commands/list-markets
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";

export function registerListMarkets(program: Command): void {
  program
    .command("list-markets")
    .description("📋 List available perpetuals markets on this program")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      // Query program accounts for all slabs
      const accounts = await ctx.connection.getProgramAccounts(ctx.programId, {
        filters: [{ dataSize: 1_525_624 }],
      });

      if (accounts.length === 0) {
        console.log("No markets found");
        return;
      }

      console.log(`Found ${accounts.length} market(s):\n`);
      
      for (const acc of accounts) {
        const pubkey = acc.pubkey.toBase58();
        const dataLen = acc.account.data.length;
        console.log(`  ${pubkey}`);
        console.log(`    Size: ${dataLen.toLocaleString()} bytes`);
      }
    });
}
