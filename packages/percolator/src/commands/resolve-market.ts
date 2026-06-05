/**
 * Resolve Market Command
 * 
 * ✅ Resolve a binary/premarket market
 * 
 * @module commands/resolve-market
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeResolveMarket } from "../abi/instructions.js";
import {
  ACCOUNTS_RESOLVE_MARKET,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerResolveMarket(program: Command): void {
  program
    .command("resolve-market")
    .description("✅ Resolve a binary/premarket market")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--oracle <pubkey>", "Price oracle account")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const oracle = validatePublicKey(opts.oracle, "--oracle");

      const ixData = encodeResolveMarket();

      const keys = buildAccountMetas(ACCOUNTS_RESOLVE_MARKET, [
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
