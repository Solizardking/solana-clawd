/**
 * Update Config Command
 * 
 * ⚙️ Update market configuration parameters
 * 
 * @module commands/update-config
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeUpdateConfig } from "../abi/instructions.js";
import {
  ACCOUNTS_UPDATE_CONFIG,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey } from "../validation.js";

export function registerUpdateConfig(program: Command): void {
  program
    .command("update-config")
    .description("⚙️ Update market configuration parameters")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .option("--funding-horizon-slots <number>", "Funding horizon in slots")
    .option("--funding-k-bps <number>", "Funding K in basis points")
    .option("--funding-max-premium-bps <number>", "Max funding premium in bps")
    .option("--funding-max-e9-per-slot <number>", "Max funding per slot")
    .option("--tvl-insurance-cap-mult <number>", "TVL insurance cap multiplier")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");

      const ixData = encodeUpdateConfig({
        fundingHorizonSlots: opts.fundingHorizonSlots ?? "3600",
        fundingKBps: opts.fundingKBps ?? "100",
        fundingMaxPremiumBps: opts.fundingMaxPremiumBps ?? "100",
        fundingMaxE9PerSlot: opts.fundingMaxE9PerSlot ?? "1000000000",
        tvlInsuranceCapMult: parseInt(opts.tvlInsuranceCapMult ?? "20", 10),
      });

      const keys = buildAccountMetas(ACCOUNTS_UPDATE_CONFIG, [
        ctx.payer.publicKey,
        slabPk,
        WELL_KNOWN.clock,
        ctx.payer.publicKey, // oracle placeholder
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
