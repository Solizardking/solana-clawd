/**
 * Push Oracle Price Command
 * 
 * 🔮 Push oracle price (for markets with oracle authority)
 * 
 * @module commands/push-oracle-price
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodePushOraclePrice } from "../abi/instructions.js";
import {
  ACCOUNTS_PUSH_ORACLE_PRICE,
  buildAccountMetas,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerPushOraclePrice(program: Command): void {
  program
    .command("push-oracle-price")
    .description("🔮 Push oracle price (oracle authority only)")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--price <number>", "Price in USD (e.g., 143.50 for $143.50)")
    .option("--timestamp <number>", "Timestamp (defaults to current)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const price = parseFloat(opts.price);
      if (isNaN(price) || price <= 0) {
        throw new Error("Price must be a positive number");
      }
      // Convert to e6 format
      const priceE6 = Math.round(price * 1_000_000).toString();
      const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000).toString();

      const ixData = encodePushOraclePrice({ priceE6, timestamp });

      const keys = buildAccountMetas(ACCOUNTS_PUSH_ORACLE_PRICE, [
        ctx.payer.publicKey,
        slabPk,
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
