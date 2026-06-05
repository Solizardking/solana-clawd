/**
 * Init LP Command
 * 
 * 💰 Initialize an LP (Liquidity Provider) account
 * 
 * @module commands/init-lp
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { encodeInitLP } from "../abi/instructions.js";
import {
  ACCOUNTS_INIT_LP,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerInitLp(program: Command): void {
  program
    .command("init-lp")
    .description("💰 Initialize a Liquidity Provider (LP) account")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--matcher-program <pubkey>", "Matcher program ID")
    .requiredOption("--matcher-ctx <pubkey>", "Matcher context account")
    .option("--fee-payment <lamports>", "Fee payment in lamports", "57000000")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const matcherProgram = validatePublicKey(opts.matcherProgram, "--matcher-program");
      const matcherCtx = validatePublicKey(opts.matcherCtx, "--matcher-ctx");

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const userAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);

      const ixData = encodeInitLP({
        matcherProgram: matcherProgram.toString(),
        matcherContext: matcherCtx.toString(),
        feePayment: opts.feePayment ?? "57000000",
      });

      const keys = buildAccountMetas(ACCOUNTS_INIT_LP, [
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
