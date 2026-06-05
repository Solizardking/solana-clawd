/**
 * Deposit Command
 * 
 * 🦾 Deposit collateral to your trading account
 * 
 * @module commands/deposit
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { getAta } from "../solana/ata.js";
import { encodeDepositCollateral } from "../abi/instructions.js";
import {
  ACCOUNTS_DEPOSIT_COLLATERAL,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import {
  validatePublicKey,
  validateIndex,
  validateAmount,
} from "../validation.js";

export function registerDeposit(program: Command): void {
  program
    .command("deposit")
    .description("🦾 Deposit collateral to your trading account")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--user-idx <number>", "User account index")
    .requiredOption("--amount <string>", "Amount to deposit (lamports)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const userIdx = validateIndex(opts.userIdx, "--user-idx");
      validateAmount(opts.amount, "--amount");
      const amount = opts.amount;

      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      const userAta = await getAta(ctx.payer.publicKey, mktConfig.collateralMint);

      const ixData = encodeDepositCollateral({ userIdx, amount });

      const keys = buildAccountMetas(ACCOUNTS_DEPOSIT_COLLATERAL, [
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
