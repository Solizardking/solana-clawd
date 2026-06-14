import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import {
  buildCreateConfigTransaction,
  getConnection,
} from "../server/lib/dbc/index";
import { resolveDbcFeeWallet } from "../server/lib/launchpad/fee-wallet";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true, quiet: true });

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const send = process.argv.includes("--send");
const outPath = argValue("--out");
const migrationThresholdSol = Number(argValue("--migration-threshold-sol") ?? "3");

if (!Number.isFinite(migrationThresholdSol) || migrationThresholdSol <= 0) {
  throw new Error("--migration-threshold-sol must be a positive number");
}

const feeWallet = resolveDbcFeeWallet();
const customParams = {
  migrationQuoteThreshold: new BN(Math.round(migrationThresholdSol * LAMPORTS_PER_SOL)),
};

const result = await buildCreateConfigTransaction(
  feeWallet.publicKey,
  feeWallet.publicKey,
  customParams
);

const payload = {
  configAddress: result.configAddress,
  feeClaimer: feeWallet.publicKey.toBase58(),
  feeWalletSource: feeWallet.source,
  leftoverReceiver: feeWallet.publicKey.toBase58(),
  migrationThresholdSol,
  transaction: result.transaction,
};

if (outPath) {
  fs.writeFileSync(path.resolve(rootDir, outPath), JSON.stringify(payload, null, 2));
}

if (send) {
  const connection = getConnection();
  const tx = Transaction.from(Buffer.from(result.transaction, "base64"));
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(signature, "confirmed");
  console.log(`[dbc-config] sent: ${signature}`);
  console.log(`[dbc-config] set DBC_CONFIG_ADDRESS=${result.configAddress}`);
} else {
  console.log("[dbc-config] dry run only; transaction was not sent");
  console.log(`[dbc-config] configAddress=${result.configAddress}`);
  console.log(`[dbc-config] feeClaimer=${feeWallet.publicKey.toBase58()} via ${feeWallet.source}`);
  console.log(`[dbc-config] migrationThresholdSol=${migrationThresholdSol}`);
  if (outPath) {
    console.log(`[dbc-config] wrote transaction payload to ${outPath}`);
  }
  console.log("[dbc-config] rerun with --send to create this config on-chain");
}
