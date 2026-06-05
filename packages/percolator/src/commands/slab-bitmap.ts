/**
 * Slab Bitmap Command
 * 
 * 🗺️ Get slab bitmap info
 * 
 * @module commands/slab-bitmap
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseUsedIndices } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabBitmap(program: Command): void {
  program
    .command("slab:bitmap")
    .description("🗺️ Get slab bitmap info")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const usedIndices = parseUsedIndices(data);

      if (flags.json) {
        console.log(JSON.stringify({ usedIndices, count: usedIndices.length }, null, 2));
      } else {
        console.log(`Used Accounts: ${usedIndices.length}`);
        console.log(`Indices: ${usedIndices.slice(0, 20).join(', ')}${usedIndices.length > 20 ? '...' : ''}`);
      }
    });
}
