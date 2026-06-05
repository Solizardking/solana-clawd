/**
 * Slab Header Command
 * 
 * 📋 Get slab header info
 * 
 * @module commands/slab-header
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseHeader } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabHeader(program: Command): void {
  program
    .command("slab:header")
    .description("📋 Get slab header info")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const header = parseHeader(data);

      if (flags.json) {
        console.log(JSON.stringify(header, null, 2));
      } else {
        console.log("Header:");
        console.log(`  Magic: 0x${header.magic.toString(16)}`);
        console.log(`  Version: ${header.version}`);
        console.log(`  Bump: ${header.bump}`);
        console.log(`  Flags: ${header.flags}`);
        console.log(`  Admin: ${header.admin.toBase58()}`);
        console.log(`  Nonce: ${header.nonce}`);
        console.log(`  Insurance Auth: ${header.insuranceAuthority.toBase58()}`);
        console.log(`  Insurance Operator: ${header.insuranceOperator.toBase58()}`);
      }
    });
}
