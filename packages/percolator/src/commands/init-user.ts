/**
 * Init User Command
 * 
 * 👤 Initialize your trading account
 * 
 * @module commands/init-user
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { encodeInitUser } from "../abi/instructions.js";
import {
  ACCOUNTS_INIT_USER,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerInitUser(program: Command): void {
  program
    .command("init-user")
    .description("👤 Initialize your trading account on a perpetuals market")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .option("--fee-payment <lamports>", "Fee payment in lamports", "57000000")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const userAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);

      const ixData = encodeInitUser({ feePayment: opts.feePayment ?? "57000000" });

      const keys = buildAccountMetas(ACCOUNTS_INIT_USER, [
        ctx.payer.publicKey,
        slabPk,
        userAta,
        mktConfig.vaultPubkey,
        WELL_KNOWN.tokenProgram,
        WELL_KNOWN.clock,
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
