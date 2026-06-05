/**
 * Slab Get Command
 * 
 * 🔍 Get full slab state
 * 
 * @module commands/slab-get
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseHeader, parseConfig, parseEngine } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabGet(program: Command): void {
  program
    .command("slab:get")
    .description("🔍 Get full slab state")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);

      if (flags.json) {
        const header = parseHeader(data);
        const config = parseConfig(data);
        const engine = parseEngine(data);
        console.log(JSON.stringify({ header, config, engine }, null, 2));
      } else {
        const header = parseHeader(data);
        console.log("Header:");
        console.log(`  Admin: ${header.admin.toBase58()}`);
        console.log(`  Version: ${header.version}`);
        console.log(`  Nonce: ${header.nonce}`);
        console.log(`  Insurance Auth: ${header.insuranceAuthority.toBase58()}`);
      }
    });
}
