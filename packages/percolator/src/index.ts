#!/usr/bin/env node
/**
 * Percolator CLI Entry Point
 * 
 * 🧪 Main entry point for percolator CLI
 */

import { createProgram } from "./cli.js";
import { registerInitUser } from "./commands/init-user.js";
import { registerInitLP } from "./commands/init-lp.js";
import { registerDeposit } from "./commands/deposit.js";
import { registerWithdraw } from "./commands/withdraw.js";
import { registerTradeCpi } from "./commands/trade-cpi.js";
import { registerLiquidateAtOracle } from "./commands/liquidate-at-oracle.js";
import { registerCloseAccount } from "./commands/close-account.js";
import { registerInitMarket } from "./commands/init-market.js";
import { registerListMarkets } from "./commands/list-markets.js";
import { registerSlabGet } from "./commands/slab-get.js";
import { registerUpdateAdmin } from "./commands/update-admin.js";
import { registerTopupInsurance } from "./commands/topup-insurance.js";
import { registerSetOracleAuthority } from "./commands/set-oracle-authority.js";
import { registerCloseSlab } from "./commands/close-slab.js";
import { registerCloseAllSlabs } from "./commands/close-all-slabs.js";
import { registerUpdateConfig } from "./commands/update-config.js";
import { registerPushOraclePrice } from "./commands/push-oracle-price.js";
import { registerResolveMarket } from "./commands/resolve-market.js";
import { registerWithdrawInsurance } from "./commands/withdraw-insurance.js";
import { registerSlabHeader } from "./commands/slab-header.js";
import { registerSlabConfig } from "./commands/slab-config.js";
import { registerSlabNonce } from "./commands/slab-nonce.js";
import { registerSlabEngine } from "./commands/slab-engine.js";
import { registerSlabParams } from "./commands/slab-params.js";
import { registerSlabAccount } from "./commands/slab-account.js";
import { registerSlabAccounts } from "./commands/slab-accounts.js";
import { registerSlabBitmap } from "./commands/slab-bitmap.js";
import { registerAuditCu } from "./commands/audit-cu.js";
import { registerBestPrice } from "./commands/best-price.js";

async function main() {
  const program = createProgram();
  
  // Register all commands
  registerInitUser(program);
  registerInitLP(program);
  registerDeposit(program);
  registerWithdraw(program);
  registerTradeCpi(program);
  registerLiquidateAtOracle(program);
  registerCloseAccount(program);
  registerInitMarket(program);
  registerListMarkets(program);
  registerSlabGet(program);
  registerUpdateAdmin(program);
  registerTopupInsurance(program);
  registerSetOracleAuthority(program);
  registerCloseSlab(program);
  registerCloseAllSlabs(program);
  registerUpdateConfig(program);
  registerPushOraclePrice(program);
  registerResolveMarket(program);
  registerWithdrawInsurance(program);
  registerSlabHeader(program);
  registerSlabConfig(program);
  registerSlabNonce(program);
  registerSlabEngine(program);
  registerSlabParams(program);
  registerSlabAccount(program);
  registerSlabAccounts(program);
  registerSlabBitmap(program);
  registerAuditCu(program);
  registerBestPrice(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
