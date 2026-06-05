/**
 * Close All Slabs Command
 * 
 * 🗑️ Close all slab markets
 * 
 * @module commands/close-all-slabs
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeCloseSlab } from "../abi/instructions.js";
import {
  ACCOUNTS_CLOSE_SLAB,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";

export function registerCloseAllSlabs(program: Command): void {
  program
    .command("close-all-slabs")
    .description("🗑️ Close all slab markets (requires admin)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const accounts = await ctx.connection.getProgramAccounts(ctx.programId, {
        filters: [{ dataSize: 1_525_624 }],
      });

      console.log(`Found ${accounts.length} market(s) to close...`);

      for (const acc of accounts) {
        const ixData = encodeCloseSlab();
        const keys = buildAccountMetas(ACCOUNTS_CLOSE_SLAB, [
          ctx.payer.publicKey,
          acc.pubkey,
          ctx.payer.publicKey,
          ctx.payer.publicKey,
          ctx.payer.publicKey,
          WELL_KNOWN.tokenProgram,
        ]);

        const ix = buildIx({
          programId: ctx.programId,
          keys,
          data: ixData,
        });

        const result = await simulateOrSend({
          connection: ctx.connection,
          ix,
          signers: [ctx.payer],
          simulate: flags.simulate ?? false,
          commitment: ctx.commitment,
        });

        console.log(`${acc.pubkey.toBase58()}: ${result.err ? 'FAILED' : 'OK'}`);
      }
    });
}
