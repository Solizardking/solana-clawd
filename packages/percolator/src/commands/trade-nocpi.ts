/**
 * Trade (No CPI) Command
 * 
 * 📈 Execute direct perpetuals trades
 * 
 * @module commands/trade-nocpi
 */

import { Command } from "commander";
import { Keypair } from "@solana/web3.js";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { loadKeypair } from "../solana/wallet.js";
import { encodeTradeNoCpi } from "../abi/instructions.js";
import {
  ACCOUNTS_TRADE_NOCPI,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import {
  validatePublicKey,
  validateIndex,
  validateI128,
} from "../validation.js";

export function registerTradeNocpi(program: Command): void {
  program
    .command("trade-nocpi")
    .description("📈 Execute direct perpetuals trade (no CPI)\n   Use positive size for LONG, negative for SHORT")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--lp-idx <number>", "LP account index")
    .requiredOption("--user-idx <number>", "User account index")
    .requiredOption("--size <string>", "Trade size (i128)\n   positive = LONG USD (profit if SOL drops)\n   negative = SHORT USD (profit if SOL rises)")
    .requiredOption("--oracle <pubkey>", "Price oracle account")
    .option("--lp-wallet <path>", "LP wallet keypair (if different from payer)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const oracle = validatePublicKey(opts.oracle, "--oracle");
      const lpIdx = validateIndex(opts.lpIdx, "--lp-idx");
      const userIdx = validateIndex(opts.userIdx, "--user-idx");
      validateI128(opts.size, "--size");

      const lpKeypair = opts.lpWallet ? loadKeypair(opts.lpWallet) : ctx.payer;

      const ixData = encodeTradeNoCpi({
        lpIdx,
        userIdx,
        size: opts.size,
      });

      const keys = buildAccountMetas(ACCOUNTS_TRADE_NOCPI, [
        ctx.payer.publicKey,
        lpKeypair.publicKey,
        slabPk,
        WELL_KNOWN.clock,
        oracle,
      ]);

      const ix = buildIx({
        programId: ctx.programId,
        keys,
        data: ixData,
      });

      const signers: Keypair[] =
        lpKeypair.publicKey.equals(ctx.payer.publicKey)
          ? [ctx.payer]
          : [ctx.payer, lpKeypair];

      const result = await simulateOrSend({
        connection: ctx.connection,
        ix,
        signers,
        simulate: flags.simulate ?? false,
        commitment: ctx.commitment,
      });

      console.log(formatResult(result, flags.json ?? false));
    });
}
