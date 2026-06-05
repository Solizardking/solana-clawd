/**
 * Withdraw Insurance Command
 * 
 * 💰 Withdraw from insurance fund after market resolution
 * 
 * @module commands/withdraw-insurance
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { deriveVaultAuthority } from "../solana/pda.js";
import { encodeWithdrawInsurance } from "../abi/instructions.js";
import {
  ACCOUNTS_WITHDRAW_INSURANCE,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerWithdrawInsurance(program: Command): void {
  program
    .command("withdraw-insurance")
    .description("💰 Withdraw from insurance fund (admin only, after resolution)")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const adminAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);
      const [vaultAuth] = deriveVaultAuthority(ctx.programId, slabPk);

      const ixData = encodeWithdrawInsurance();

      const keys = buildAccountMetas(ACCOUNTS_WITHDRAW_INSURANCE, [
        ctx.payer.publicKey,
        slabPk,
        adminAta,
        mktConfig.vaultPubkey,
        WELL_KNOWN.tokenProgram,
        vaultAuth,
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
