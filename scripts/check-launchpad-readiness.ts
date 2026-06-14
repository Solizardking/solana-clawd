import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  DBC_CONFIG_ENV_KEYS,
  getConfiguredDbcConfigAddress,
  getConfiguredDbcFeeWallet,
} from "../server/lib/launchpad/fee-wallet";
import { getConfiguredCheshireLaunchpadProgramId } from "../server/lib/launchpad/registry";
import {
  getConfiguredClawdConstitutionHash,
  CLAWD_CONSTITUTION_HASH_ENV_KEYS,
  CLAWD_CONSTITUTION_PATH_ENV_KEYS,
  getConfiguredClawdProtocolProgramId,
} from "../server/lib/launchpad/clawd-sdk";

const { AnchorProvider, Program, Wallet } = anchor;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const live = process.argv.includes("--live");
const strict = process.argv.includes("--strict");
const DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");

dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true, quiet: true });

type CheckStatus = "ok" | "warn" | "fail";
const checks: Array<{ label: string; status: CheckStatus; detail: string }> = [];

function add(label: string, status: CheckStatus, detail: string) {
  checks.push({ label, status, detail });
}

function hasEnv(key: string) {
  return Boolean(process.env[key]?.trim());
}

function redactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9+/_=-]{32,}/g, "[redacted]");
}

function statusIcon(status: CheckStatus) {
  if (status === "ok") return "ok";
  if (status === "warn") return "warn";
  return "fail";
}

async function fetchDbcConfig(configAddress: PublicKey) {
  const rpc = process.env.HELIUS_RPC_URL?.trim();
  if (!rpc) throw new Error("HELIUS_RPC_URL is not set");

  const idlPath = path.join(rootDir, "dynamic-bonding-curve-main/scripts/idl/release_0.1.6.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" });
  const program = new Program(idl as any, provider);
  return (program.account as any).poolConfig.fetch(configAddress);
}

const dbcFeeWallet = getConfiguredDbcFeeWallet();
if (dbcFeeWallet) {
  add("DBC fee wallet", "ok", `${dbcFeeWallet.publicKey.toBase58()} via ${dbcFeeWallet.source}`);
} else {
  add("DBC fee wallet", "fail", "Set DBC_FEE_WALLET or LAUNCHPAD_FEE_WALLET; TREASURY_WALLET/ADMIN_WALLET are fallback-only.");
}

const dbcConfig = getConfiguredDbcConfigAddress();
if (dbcConfig) {
  add("DBC config", "ok", `${dbcConfig.publicKey.toBase58()} via ${dbcConfig.source}`);
} else {
  add("DBC config", "fail", `Set ${DBC_CONFIG_ENV_KEYS.join(" or ")} so public launches can omit configAddress.`);
}

const cheshireProgram = getConfiguredCheshireLaunchpadProgramId();
if (cheshireProgram) {
  add("Cheshire launchpad registry", "ok", `${cheshireProgram.publicKey.toBase58()} via ${cheshireProgram.source}`);
} else {
  add("Cheshire launchpad registry", "warn", "Set CHESHIRE_LAUNCHPAD_PROGRAM_ID to append launch records.");
}

const clawdProgram = getConfiguredClawdProtocolProgramId();
if (clawdProgram) {
  add("CLAWD protocol", "ok", `${clawdProgram.publicKey.toBase58()} via ${clawdProgram.source}`);
} else {
  add("CLAWD protocol", "warn", "Set CLAWD_PROTOCOL_PROGRAM_ID to append AgentBinding records.");
}

const clawdConstitution = getConfiguredClawdConstitutionHash();
if (clawdConstitution) {
  add("CLAWD constitution hash", "ok", `configured via ${clawdConstitution.source}`);
} else {
  add("CLAWD constitution hash", "warn", `Set ${CLAWD_CONSTITUTION_HASH_ENV_KEYS[0]} or ${CLAWD_CONSTITUTION_PATH_ENV_KEYS[0]} to append AgentBinding records.`);
}

add("Admin guard", hasEnv("ADMIN_SECRET") ? "ok" : "fail", hasEnv("ADMIN_SECRET")
  ? "ADMIN_SECRET is present for create-config/migrate."
  : "Set ADMIN_SECRET before enabling admin DBC endpoints.");
add("RPC", hasEnv("HELIUS_RPC_URL") ? "ok" : "fail", hasEnv("HELIUS_RPC_URL")
  ? "HELIUS_RPC_URL is present."
  : "Set HELIUS_RPC_URL for DBC build/fetch operations.");
add("Server signer", hasEnv("WALLET_PRIVATE_KEY") ? "ok" : "fail", hasEnv("WALLET_PRIVATE_KEY")
  ? "WALLET_PRIVATE_KEY is present."
  : "Set WALLET_PRIVATE_KEY for DBC config creation and IDL-backed reads.");

const dbcIdlPath = path.join(rootDir, "dynamic-bonding-curve-main/scripts/idl/release_0.1.6.json");
add("DBC IDL", fs.existsSync(dbcIdlPath) ? "ok" : "fail", fs.existsSync(dbcIdlPath)
  ? "dynamic-bonding-curve-main/scripts/idl/release_0.1.6.json is present."
  : "Missing DBC IDL release_0.1.6.json.");

const clawdSdkDist = process.env.CLAWD_SDK_DIST
  ? path.resolve(process.env.CLAWD_SDK_DIST)
  : path.resolve(rootDir, "../solana-clawd/packages/clawd-sdk/dist/index.js");
add("Local clawd-sdk dist", fs.existsSync(clawdSdkDist) ? "ok" : "warn", fs.existsSync(clawdSdkDist)
  ? "Local clawd-sdk dist is present for compatibility smoke tests."
  : "Local clawd-sdk dist not found; run npm run build in solana-clawd/packages/clawd-sdk if needed.");

if (live && dbcConfig) {
  try {
    const accountInfo = await new Connection(process.env.HELIUS_RPC_URL!.trim(), "confirmed").getAccountInfo(dbcConfig.publicKey);
    if (!accountInfo) {
      add("DBC config account", "fail", "Configured DBC config account does not exist on the selected RPC.");
    } else if (!accountInfo.owner.equals(DBC_PROGRAM_ID)) {
      add("DBC config owner", "fail", `Configured account owner is ${accountInfo.owner.toBase58()}, expected ${DBC_PROGRAM_ID.toBase58()}.`);
    } else {
      add("DBC config account", "ok", "Configured DBC config account exists and is owned by the DBC program.");
    }

    const configState = await fetchDbcConfig(dbcConfig.publicKey);
    const onchainFeeClaimer: PublicKey | undefined = configState.feeClaimer;
    if (dbcFeeWallet && onchainFeeClaimer) {
      add("DBC fee claimer match", onchainFeeClaimer.equals(dbcFeeWallet.publicKey) ? "ok" : "fail", onchainFeeClaimer.equals(dbcFeeWallet.publicKey)
        ? "Configured fee wallet matches the DBC config feeClaimer."
        : `DBC config feeClaimer is ${onchainFeeClaimer.toBase58()}, expected ${dbcFeeWallet.publicKey.toBase58()}.`);
    }
  } catch (error) {
    add("Live DBC config fetch", "fail", redactError(error));
  }
} else if (!live) {
  add("Live DBC config fetch", "warn", "Skipped. Re-run with --live to verify account owner and feeClaimer on RPC.");
}

for (const check of checks) {
  console.log(`[launchpad] ${statusIcon(check.status)} ${check.label}: ${check.detail}`);
}

const hasFail = checks.some((check) => check.status === "fail");
const hasWarn = checks.some((check) => check.status === "warn");
process.exitCode = hasFail || (strict && hasWarn) ? 1 : 0;
