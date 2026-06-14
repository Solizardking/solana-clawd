import "../server/env";

import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  deriveRedpillSasAddresses,
  getSasLaunchConfig,
} from "../server/lib/solana-attestation";

const MIN_RECOMMENDED_SOL = 0.03;

function redactRpcUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      url.searchParams.set(key, "REDACTED");
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/(api[-_]?key=)[^&\s]+/gi, "$1REDACTED");
  }
}

async function getAccountState(connection: Connection, address: string | undefined) {
  if (!address) return null;
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  return info
    ? {
        exists: true,
        executable: info.executable,
        owner: info.owner.toBase58(),
        lamports: info.lamports,
      }
    : { exists: false };
}

async function main() {
  const config = getSasLaunchConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const program = await getAccountState(connection, config.programAddress);

  let payerBalanceLamports: number | null = null;
  if (config.payerAddress) {
    payerBalanceLamports = await connection.getBalance(new PublicKey(config.payerAddress), "confirmed");
  }

  const addresses = config.authorityAddress
    ? await deriveRedpillSasAddresses(config.authorityAddress)
    : null;
  const credential = await getAccountState(connection, addresses?.credentialPda);
  const schema = await getAccountState(connection, addresses?.schemaPda);

  const redpillConfigured = Boolean(process.env.REDPILL_API_KEY);
  const sasSignerConfigured = Boolean(config.authorityAddress && config.payerAddress);
  const adminWriteGuardConfigured = Boolean(process.env.SAS_ADMIN_SECRET || process.env.ADMIN_SECRET);
  const programExecutable = program?.exists === true && program.executable === true;
  const payerBalanceSol =
    payerBalanceLamports === null ? null : Number((payerBalanceLamports / LAMPORTS_PER_SOL).toFixed(9));
  const payerFunded = payerBalanceSol !== null && payerBalanceSol >= MIN_RECOMMENDED_SOL;

  const readyForSetup =
    redpillConfigured &&
    sasSignerConfigured &&
    adminWriteGuardConfigured &&
    programExecutable &&
    payerFunded;
  const readyForIssuing = readyForSetup && credential?.exists === true && schema?.exists === true;

  const nextActions: string[] = [];
  if (!redpillConfigured) nextActions.push("Set REDPILL_API_KEY.");
  if (!sasSignerConfigured) nextActions.push("Set SAS_PAYER_SECRET_KEY and SAS_AUTHORITY_SECRET_KEY.");
  if (!adminWriteGuardConfigured) nextActions.push("Set SAS_ADMIN_SECRET or ADMIN_SECRET for write endpoints.");
  if (!programExecutable) nextActions.push("Use an RPC where the SAS program account exists and is executable.");
  if (sasSignerConfigured && !payerFunded) {
    nextActions.push(`Fund the SAS payer with at least ${MIN_RECOMMENDED_SOL} SOL for setup and issuance.`);
  }
  if (readyForSetup && !readyForIssuing) {
    nextActions.push("Call POST /api/tee/attestation/setup once, then rerun this check.");
  }
  if (readyForIssuing) {
    nextActions.push("Ready to issue on-chain RedPill SAS attestations with POST /api/tee/attestation/chat.");
  }

  console.log(JSON.stringify({
    check: "redpill-sas-readiness",
    willSpendSol: false,
    rpcUrl: redactRpcUrl(config.rpcUrl),
    credentialName: config.credentialName,
    primaryModel: process.env.REDPILL_MODEL || process.env.REDPILLMODEL1 || "deepseek/deepseek-v4-flash",
    secondaryModel:
      process.env.REDPILL_MODEL2 ||
      process.env.REDPILLMODEL2 ||
      process.env.REDPILLMODEL3 ||
      "google/gemma-4-31b-it",
    redpillConfigured,
    sasSignerConfigured,
    adminWriteGuardConfigured,
    program: {
      address: config.programAddress,
      ...program,
    },
    payer: config.payerAddress
      ? {
          address: config.payerAddress,
          balanceSol: payerBalanceSol,
          minimumRecommendedSol: MIN_RECOMMENDED_SOL,
          funded: payerFunded,
        }
      : null,
    authority: config.authorityAddress ? { address: config.authorityAddress } : null,
    schema: config.schema,
    addresses,
    accounts: {
      credential,
      schema,
    },
    readyForSetup,
    readyForIssuing,
    nextActions,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: "redpill-sas-readiness",
    willSpendSol: false,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
