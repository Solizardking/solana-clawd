/**
 * Close Account Command
 * 
 * 🔒 Close your trading account
 * 
 * @module commands/close-account
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { deriveVaultAuthority } from "../solana/pda.js";
import { encodeCloseAccount } from "../abi/instructions.js";
import {
  ACCOUNTS_CLOSE_ACCOUNT,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey, validateIndex } from "../validation.js";

export function registerCloseAccount(program: Command): void {
  program
    .command("close-account")
    .description("🔒 Close your trading account")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--idx <number>", "Account index")
    .option("--oracle <pubkey>", "Price oracle account")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const idx = validateIndex(opts.idx, "--idx");

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const userAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);
      const [vaultAuth] = deriveVaultAuthority(ctx.programId, slabPk);

      const keys = buildAccountMetas(ACCOUNTS_CLOSE_ACCOUNT, [
        ctx.payer.publicKey,
        slabPk,
        mktConfig.vaultPubkey,
        userAta,
        vaultAuth,
        WELL_KNOWN.tokenProgram,
        WELL_KNOWN.clock,
        opts.oracle ? validatePublicKey(opts.oracle, "--oracle") : mktConfig.indexFeedId,
      ]);

      const ixData = encodeCloseAccount({ userIdx: idx });

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
