/**
 * Update Admin Command
 * 
 * 👑 Update market admin
 * 
 * @module commands/update-admin
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeUpdateAdmin } from "../abi/instructions.js";
import {
  ACCOUNTS_UPDATE_ADMIN,
  buildAccountMetas,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerUpdateAdmin(program: Command): void {
  program
    .command("update-admin")
    .description("👑 Update market admin")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--new-admin <pubkey>", "New admin public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const newAdmin = validatePublicKey(opts.newAdmin, "--new-admin");

      const ixData = encodeUpdateAdmin({ newAdmin: newAdmin.toString() });

      const keys = buildAccountMetas(ACCOUNTS_UPDATE_ADMIN, [
        ctx.payer.publicKey,
        newAdmin,
        slabPk,
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

      console.log(formatResult(result, flags.json ?? false));
    });
}
