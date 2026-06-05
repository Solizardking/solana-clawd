/**
 * Liquidate at Oracle Command
 * 
 * ⚔️ Liquidate an undercollateralized account at oracle price
 * 
 * @module commands/liquidate-at-oracle
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeLiquidateAtOracle } from "../abi/instructions.js";
import {
  ACCOUNTS_LIQUIDATE_AT_ORACLE,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey, validateIndex } from "../validation.js";

export function registerLiquidateAtOracle(program: Command): void {
  program
    .command("liquidate-at-oracle")
    .description("⚔️ Liquidate an undercollateralized account at oracle price")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--target-idx <number>", "Target account index")
    .requiredOption("--oracle <pubkey>", "Price oracle account")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const oracle = validatePublicKey(opts.oracle, "--oracle");
      const targetIdx = validateIndex(opts.targetIdx, "--target-idx");

      const ixData = encodeLiquidateAtOracle({ targetIdx });

      const keys = buildAccountMetas(ACCOUNTS_LIQUIDATE_AT_ORACLE, [
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
