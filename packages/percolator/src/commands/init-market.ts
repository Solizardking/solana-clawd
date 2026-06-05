/**
 * Init Market Command
 * 
 * 🏛️ Initialize a new perpetuals market
 * 
 * @module commands/init-market
 */

import { Command } from "commander";
import { getGlobalFlags } from "../cli.js";
import { loadConfig } from "../config.js";
import { createContext } from "../runtime/context.js";
import { encodeInitMarket } from "../abi/instructions.js";
import {
  ACCOUNTS_INIT_MARKET,
  buildAccountMetas,
  WELL_KNOWN,
} from "../abi/accounts.js";
import { buildIx, simulateOrSend, formatResult } from "../runtime/tx.js";
import { validatePublicKey, validateBps } from "../validation.js";

export function registerInitMarket(program: Command): void {
  program
    .command("init-market")
    .description("🏛️ Initialize a new perpetuals market")
    .requiredOption("--slab <pubkey>", "Slab account public key")
    .requiredOption("--mint <pubkey>", "Collateral mint")
    .requiredOption("--vault <pubkey>", "Vault account")
    .requiredOption("--index-feed-id <hex>", "Oracle feed ID (64 hex chars)")
    .requiredOption("--max-staleness-secs <number>", "Max staleness in seconds")
    .requiredOption("--conf-filter-bps <number>", "Confidence filter in bps")
    .option("--invert", "Invert market (SOL/USD instead of USD/SOL)", false)
    .option("--unit-scale <number>", "Unit scale", "0")
    .option("--initial-mark-price <number>", "Initial mark price (e6)")
    .action(async (opts, cmd) => {
      const flags = getGlobalFlags(cmd);
      const config = loadConfig(flags);
      const ctx = createContext(config);

      const slabPk = validatePublicKey(opts.slab, "--slab");
      const mint = validatePublicKey(opts.mint, "--mint");
      const vault = validatePublicKey(opts.vault, "--vault");
      const confFilterBps = validateBps(opts.confFilterBps, "--conf-filter-bps");

      const ixData = encodeInitMarket({
        admin: ctx.payer.publicKey.toString(),
        collateralMint: mint.toString(),
        indexFeedId: opts.indexFeedId,
        maxStalenessSecs: opts.maxStalenessSecs,
        confFilterBps,
        invert: opts.invert ? 1 : 0,
        unitScale: parseInt(opts.unitScale ?? "0", 10),
        initialMarkPriceE6: opts.initialMarkPrice ?? "1000000",
        maintenanceFeePerSlot: "265",
        minOraclePriceCapE2bps: "0",
        hMin: "1",
        maintenanceMarginBps: "1000",
        initialMarginBps: "2000",
        tradingFeeBps: "50",
        maxAccounts: "4096",
        newAccountFee: "57000000",
        hMax: "1000000000000",
        maxCrankStalenessSlots: "432000",
        liquidationFeeBps: "500",
        liquidationFeeCap: "1000000000",
        resolvePriceDeviationBps: "500",
        minLiquidationAbs: "1000",
        minNonzeroMmReq: "1000",
        minNonzeroImReq: "1000",
        insuranceWithdrawMaxBps: 1000,
        insuranceWithdrawCooldownSlots: "0",
        permissionlessResolveStaleSlots: "432000",
        fundingHorizonSlots: "3600",
        fundingKBps: "100",
        fundingMaxPremiumBps: "100",
        fundingMaxE9PerSlot: "1000000000",
        markMinFee: "0",
        forceCloseDelaySlots: "432000",
      });

      const keys = buildAccountMetas(ACCOUNTS_INIT_MARKET, [
        ctx.payer.publicKey,
        slabPk,
        mint,
        vault,
        WELL_KNOWN.tokenProgram,
        WELL_KNOWN.clock,
        WELL_KNOWN.rent,
        ctx.payer.publicKey, // oracle - should be real oracle
        WELL_KNOWN.systemProgram,
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
