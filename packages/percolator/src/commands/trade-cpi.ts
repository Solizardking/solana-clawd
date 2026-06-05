/**
 * Trade CPI Command
 * 
 * 📈 Execute perpetuals trade via CPI to matcher
 * 
 * @module commands/trade-cpi
 */

import { Command } from "commander";
import { Keypair } from "@solana/web3.js";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { loadKeypair } from "../solana/wallet.js";
import { deriveLpPda } from "../solana/pda.js";
import { encodeTradeCpi } from "../abi/instructions.js";
import {
  ACCOUNTS_TRADE_CPI,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import {
  validatePublicKey,
  validateIndex,
  validateI128,
} from "../validation.js";

export function registerTradeCpi(program: Command): void {
  program
    .command("trade-cpi")
    .description("📈 Execute perpetuals trade via CPI to matcher")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--lp-idx <number>", "LP account index")
    .requiredOption("--user-idx <number>", "User account index")
    .requiredOption("--size <string>", "Trade size (i128)")
    .requiredOption("--matcher-program <pubkey>", "Matcher program ID")
    .requiredOption("--matcher-ctx <pubkey>", "Matcher context account")
    .option("--limit-price <string>", "Limit price (e6)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const matcherProgram = validatePublicKey(opts.matcherProgram, "--matcher-program");
      const matcherCtx = validatePublicKey(opts.matcherCtx, "--matcher-ctx");
      const lpIdx = validateIndex(opts.lpIdx, "--lp-idx");
      const userIdx = validateIndex(opts.userIdx, "--user-idx");
      validateI128(opts.size, "--size");

      const [lpPda] = deriveLpPda(ctx.programId, slabPk, lpIdx);

      const ixData = encodeTradeCpi({
        lpIdx,
        userIdx,
        size: opts.size,
        limitPriceE6: opts.limitPrice,
      });

      const keys = buildAccountMetas(ACCOUNTS_TRADE_CPI, [
        ctx.payer.publicKey,
        ctx.payer.publicKey, // lpOwner
        slabPk,
        WELL_KNOWN.clock,
        ctx.payer.publicKey, // oracle placeholder
        matcherProgram,
        matcherCtx,
        lpPda,
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
