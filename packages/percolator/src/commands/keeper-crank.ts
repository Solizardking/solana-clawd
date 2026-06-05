/**
 * Keeper Crank Command
 * 
 * ⚡ Process keeper crank for the perpetuals market
 * 
 * @module commands/keeper-crank
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeKeeperCrank } from "../abi/instructions.js";
import {
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey, validateIndex } from "../validation.js";

export function registerKeeperCrank(program: Command): void {
  program
    .command("keeper-crank")
    .description("⚡ Process keeper crank - advances the market and processes liquidations")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--nonce <number>", "Crank nonce")
    .requiredOption("--oracle <pubkey>", "Price oracle account")
    .option("--candidates <indices>", "Liquidation candidate indices (comma-separated)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const oracle = validatePublicKey(opts.oracle, "--oracle");
      const nonce = validateIndex(opts.nonce, "--nonce");
      const candidates = opts.candidates
        ? opts.candidates.split(",").map((s: string) => parseInt(s.trim(), 10))
        : undefined;

      const ixData = encodeKeeperCrank({ callerIdx: nonce, candidates });

      const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
        ctx.payer.publicKey,
        slabPk,
        WELL_KNOWN.clock,
        oracle,
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
