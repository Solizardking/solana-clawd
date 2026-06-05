/**
 * Slab Params Command
 * 
 * 📊 Get slab risk parameters
 * 
 * @module commands/slab-params
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabParams(program: Command): void {
  program
    .command("slab:params")
    .description("📊 Get slab risk parameters")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);

      // Parse params from data at ENGINE_OFF + 32
      const ENGINE_OFF = 536;
      const PARAMS_OFF = ENGINE_OFF + 32;
      
      if (flags.json) {
        console.log(JSON.stringify({
          message: "Risk parameters not fully implemented - use slab:get --json for full state"
        }, null, 2));
      } else {
        console.log("Risk Parameters:");
        console.log("(Use 'slab:get --json' for complete state)");
      }
    });
}
