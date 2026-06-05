/**
 * Topup Insurance Command
 * 
 * 🛡️ Top up the insurance fund
 * 
 * @module commands/topup-insurance
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { encodeTopUpInsurance } from "../abi/instructions.js";
import {
  ACCOUNTS_TOPUP_INSURANCE,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey, validateAmount } from "../validation.js";

export function registerTopupInsurance(program: Command): void {
  program
    .command("topup-insurance")
    .description("🛡️ Top up the insurance fund")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--amount <string>", "Amount to add (lamports)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      validateAmount(opts.amount, "--amount");
      const amount = opts.amount;

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const userAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);

      const ixData = encodeTopUpInsurance({ amount });

      const keys = buildAccountMetas(ACCOUNTS_TOPUP_INSURANCE, [
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
