/**
 * Audit CU Command
 * 
 * 📊 Audit compute unit usage
 * 
 * @module commands/audit-cu
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";

export function registerAuditCu(program: Command): void {
  program
    .command("audit-cu")
    .description("📊 Audit compute unit usage for all instructions")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      console.log("Compute Unit Audit:");
      console.log("Run commands with --simulate flag to see compute units consumed");
      console.log("\nTypical ranges:");
      console.log("  InitUser: ~5,000 CU");
      console.log("  InitLP: ~5,000 CU");
      console.log("  Deposit: ~10,000 CU");
      console.log("  Withdraw: ~15,000 CU");
      console.log("  Trade: ~20,000-50,000 CU");
      console.log("  KeeperCrank: ~50,000-100,000 CU");
    });
}
