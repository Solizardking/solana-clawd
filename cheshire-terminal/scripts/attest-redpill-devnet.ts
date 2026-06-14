import "../server/env";

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildRedpillEvidenceRecord,
  issueRedpillEvidenceAttestation,
  sha256Hex,
} from "../server/lib/solana-attestation";

const REDPILL_BASE = "https://api.redpill.ai/v1";

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

async function main() {
  if (!process.env.REDPILL_API_KEY) {
    throw new Error("REDPILL_API_KEY is not configured");
  }

  process.env.SAS_RPC_URL = "https://api.devnet.solana.com";
  process.env.SAS_CREDENTIAL_NAME = "Cheshire RedPill TEE Devnet";

  const cliKeypairPath = process.env.SOLANA_CLI_KEYPAIR || path.join(os.homedir(), ".config/solana/id.json");
  const cliKeypair = fs.readFileSync(cliKeypairPath, "utf8");
  process.env.SAS_PAYER_SECRET_KEY = cliKeypair;
  process.env.SAS_AUTHORITY_SECRET_KEY = cliKeypair;

  const model = process.env.REDPILL_MODEL || "deepseek/deepseek-v4-flash";
  const request = {
    model,
    messages: [
      {
        role: "user",
        content: "What is the meaning of life? Answer in one sentence.",
      },
    ],
    temperature: 0.2,
    max_tokens: 64,
  };

  const completion = await redpillJson("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const requestId = completion.id;
  if (!requestId) throw new Error("RedPill response did not include an id");

  let signature: unknown = null;
  let attestationReport: unknown = null;
  let signingAddress = "";
  let redpillNonce = "";

  try {
    signature = await redpillJson(`/signature/${encodeURIComponent(requestId)}?model=${encodeURIComponent(model)}`);
    const signatureBody = signature as Record<string, unknown>;
    signingAddress = String(signatureBody.signing_address || signatureBody.signingAddress || signatureBody.address || "");
    if (!signingAddress) throw new Error("signature response missing signing_address");

    redpillNonce = crypto.randomBytes(32).toString("hex");
    attestationReport = await redpillJson(
      `/attestation/report?model=${encodeURIComponent(model)}&nonce=${encodeURIComponent(redpillNonce)}&signing_address=${encodeURIComponent(signingAddress)}`,
    );
  } catch (error: any) {
    console.warn(JSON.stringify({ redpillProofWarning: String(error?.message || error).slice(0, 240) }));
  }

  const record = buildRedpillEvidenceRecord({
    requestId,
    model,
    signingAddress,
    request,
    response: completion,
    signature,
    attestationReport,
  });
  const attestation = await issueRedpillEvidenceAttestation(record);

  console.log(JSON.stringify({
    network: "devnet",
    model,
    requestId,
    responseHash: record.response_hash,
    evidenceHash: record.evidence_hash,
    providerAttested: record.provider_attested,
    signingAddress: signingAddress || null,
    redpillNonce: redpillNonce || null,
    signatureHash: signature ? sha256Hex(signature) : null,
    attestationReportHash: attestationReport ? sha256Hex(attestationReport) : null,
    credentialPda: attestation.credentialPda,
    schemaPda: attestation.schemaPda,
    attestationPda: attestation.attestationPda,
    txSignature: attestation.signature,
    alreadyExists: attestation.alreadyExists,
    explorer: attestation.explorer,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
