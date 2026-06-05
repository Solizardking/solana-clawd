/**
 * Slab Engine Command
 * 
 * ⚡ Get slab engine state
 * 
 * @module commands/slab-engine
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseEngine } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabEngine(program: Command): void {
  program
    .command("slab:engine")
    .description("⚡ Get slab engine state")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const engine = parseEngine(data);

      if (flags.json) {
        console.log(JSON.stringify(engine, null, 2));
      } else {
        console.log("Engine State:");
        console.log(`  Vault: ${engine.vault}`);
        console.log(`  Insurance Fund: ${engine.insuranceFundBalance}`);
        console.log(`  Current Slot: ${engine.currentSlot}`);
        console.log(`  Last Crank Slot: ${engine.lastCrankSlot}`);
        console.log(`  Last Oracle Price: ${engine.lastOraclePrice}`);
        console.log(`  Used Accounts: ${engine.numUsedAccounts}`);
      }
    });
}
