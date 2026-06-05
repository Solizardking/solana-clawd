/**
 * Slab Config Command
 * 
 * ⚙️ Get slab config info
 * 
 * @module commands/slab-config
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { fetchSlab, parseConfig } from "../solana/slab.js";
import { validatePublicKey } from "../validation.js";

export function registerSlabConfig(program: Command): void {
  program
    .command("slab:config")
    .description("⚙️ Get slab config info")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const data = await fetchSlab(ctx.connection, slabPk);
      const mktConfig = parseConfig(data);

      if (flags.json) {
        console.log(JSON.stringify(mktConfig, null, 2));
      } else {
        console.log("Config:");
        console.log(`  Collateral Mint: ${mktConfig.collateralMint.toBase58()}`);
        console.log(`  Vault: ${mktConfig.vaultPubkey.toBase58()}`);
        console.log(`  Max Staleness: ${mktConfig.maxStalenessSecs}s`);
        console.log(`  Conf Filter: ${mktConfig.confFilterBps} bps`);
        console.log(`  Invert: ${mktConfig.invert}`);
        console.log(`  Funding Horizon: ${mktConfig.fundingHorizonSlots} slots`);
        console.log(`  Funding K: ${mktConfig.fundingKBps} bps`);
      }
    });
}
