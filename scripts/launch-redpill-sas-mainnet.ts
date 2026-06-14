import "../server/env";

import crypto from "node:crypto";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  buildRedpillEvidenceRecord,
  deriveRedpillSasAddresses,
  ensureRedpillSasSetup,
  getSasLaunchConfig,
  issueRedpillEvidenceAttestation,
  sha256Hex,
} from "../server/lib/solana-attestation";

const REDPILL_BASE = "https://api.redpill.ai/v1";
const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const MIN_SETUP_SOL = Number(process.env.SAS_MAINNET_MIN_SOL || 0.03);

type Args = {
  confirmMainnet: boolean;
  setupOnly: boolean;
  attest: boolean;
  prompt: string;
  maxTokens: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    confirmMainnet: argv.includes("--confirm-mainnet"),
    setupOnly: argv.includes("--setup-only"),
    attest: argv.includes("--attest"),
    prompt: "What is the meaning of life? Answer in one sentence.",
    maxTokens: 64,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--prompt" && argv[i + 1]) args.prompt = argv[i + 1];
    if (argv[i] === "--max-tokens" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) args.maxTokens = Math.min(Math.floor(parsed), 512);
    }
  }

  return args;
}

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

async function redpillJson(path: string, init?: RequestInit) {
  const response = await fetch(`${REDPILL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.REDPILL_API_KEY}`,
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`RedPill ${path} failed ${response.status}: ${body.slice(0, 240)}`);
  }
  return JSON.parse(body);
}

async function collectRedpillProof(model: string, requestId: string) {
  const signature = await redpillJson(`/signature/${encodeURIComponent(requestId)}?model=${encodeURIComponent(model)}`);
  const signatureBody = signature as Record<string, unknown>;
  const signingAddress = String(signatureBody.signing_address || signatureBody.signingAddress || signatureBody.address || "");
  if (!signingAddress) throw new Error("RedPill signature response missing signing_address");

  const nonce = crypto.randomBytes(32).toString("hex");
  const attestationReport = await redpillJson(
    `/attestation/report?model=${encodeURIComponent(model)}&nonce=${encodeURIComponent(nonce)}&signing_address=${encodeURIComponent(signingAddress)}`,
  );

  return { signature, signingAddress, nonce, attestationReport };
}

async function printReadiness(args: Args) {
  const config = getSasLaunchConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  const program = await getAccountState(connection, config.programAddress);
  const payerBalanceLamports = config.payerAddress
    ? await connection.getBalance(new PublicKey(config.payerAddress), "confirmed")
    : null;
  const payerBalanceSol =
    payerBalanceLamports === null ? null : Number((payerBalanceLamports / LAMPORTS_PER_SOL).toFixed(9));
  const addresses = config.authorityAddress ? await deriveRedpillSasAddresses(config.authorityAddress) : null;
  const credential = await getAccountState(connection, addresses?.credentialPda);
  const schema = await getAccountState(connection, addresses?.schemaPda);
  const redpillConfigured = Boolean(process.env.REDPILL_API_KEY);
  const sasSignerConfigured = Boolean(config.authorityAddress && config.payerAddress);
  const mainnet = genesisHash === MAINNET_GENESIS_HASH;
  const payerFunded = payerBalanceSol !== null && payerBalanceSol >= MIN_SETUP_SOL;
  const readyForSetup = redpillConfigured && sasSignerConfigured && mainnet && program?.executable === true && payerFunded;
  const readyForIssuing = readyForSetup && credential?.exists === true && schema?.exists === true;

  return {
    check: "redpill-sas-mainnet-launch",
    willSpendSol: args.confirmMainnet,
    willCallRedpill: args.confirmMainnet && args.attest,
    rpcUrl: redactRpcUrl(config.rpcUrl),
    genesisHash,
    mainnet,
    credentialName: config.credentialName,
    primaryModel: process.env.REDPILL_MODEL || process.env.REDPILLMODEL1 || "deepseek/deepseek-v4-flash",
    secondaryModel:
      process.env.REDPILL_MODEL2 ||
      process.env.REDPILLMODEL2 ||
      process.env.REDPILLMODEL3 ||
      "google/gemma-4-31b-it",
    redpillConfigured,
    sasSignerConfigured,
    program: {
      address: config.programAddress,
      ...program,
    },
    payer: config.payerAddress
      ? {
          address: config.payerAddress,
          balanceSol: payerBalanceSol,
          minimumRequiredSol: MIN_SETUP_SOL,
          funded: payerFunded,
        }
      : null,
    authority: config.authorityAddress ? { address: config.authorityAddress } : null,
    schema: config.schema,
    addresses,
    accounts: { credential, schema },
    readyForSetup,
    readyForIssuing,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const readiness = await printReadiness(args);

  if (!args.confirmMainnet) {
    console.log(JSON.stringify({
      ...readiness,
      action: "dry-run",
      nextCommand: "npm run launch:redpill:sas:mainnet -- --confirm-mainnet --setup-only",
    }, null, 2));
    return;
  }

  if (!readiness.mainnet) throw new Error(`Refusing to launch: RPC genesis hash is not mainnet-beta (${readiness.genesisHash}).`);
  if (!readiness.redpillConfigured) throw new Error("REDPILL_API_KEY is not configured.");
  if (!readiness.sasSignerConfigured) throw new Error("SAS_PAYER_SECRET_KEY and SAS_AUTHORITY_SECRET_KEY are required.");
  if (readiness.program.executable !== true) throw new Error("SAS program account is missing or not executable on this RPC.");
  if (readiness.payer?.funded !== true) {
    throw new Error(`Fund SAS payer ${readiness.payer?.address || "(missing)"} with at least ${MIN_SETUP_SOL} SOL before launch.`);
  }

  const setup = await ensureRedpillSasSetup();
  const result: Record<string, unknown> = {
    ...readiness,
    setup,
  };

  if (args.setupOnly || !args.attest) {
    console.log(JSON.stringify({
      ...result,
      action: "setup",
      attestation: null,
      nextCommand: "npm run launch:redpill:sas:mainnet -- --confirm-mainnet --attest",
    }, null, 2));
    return;
  }

  const model = process.env.REDPILL_MODEL || process.env.REDPILLMODEL1 || "deepseek/deepseek-v4-flash";
  const request = {
    model,
    messages: [{ role: "user", content: args.prompt }],
    temperature: 0.2,
    max_tokens: args.maxTokens,
  };
  const completion = await redpillJson("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const requestId = completion.id;
  if (!requestId) throw new Error("RedPill response did not include an id.");

  const proof = await collectRedpillProof(model, requestId);
  const record = buildRedpillEvidenceRecord({
    requestId,
    model,
    signingAddress: proof.signingAddress,
    request,
    response: completion,
    signature: proof.signature,
    attestationReport: proof.attestationReport,
  });
  const attestation = await issueRedpillEvidenceAttestation(record);

  console.log(JSON.stringify({
    ...result,
    action: "setup-and-attest",
    model,
    requestId,
    responseHash: record.response_hash,
    evidenceHash: record.evidence_hash,
    providerAttested: record.provider_attested,
    signingAddress: proof.signingAddress,
    redpillNonce: proof.nonce,
    signatureHash: sha256Hex(proof.signature),
    attestationReportHash: sha256Hex(proof.attestationReport),
    attestation,
    explorer: attestation.signature
      ? `https://explorer.solana.com/tx/${attestation.signature}`
      : attestation.explorer,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: "redpill-sas-mainnet-launch",
    willSpendSol: process.argv.includes("--confirm-mainnet"),
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
