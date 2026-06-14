import "../server/env";

import { Connection, PublicKey } from "@solana/web3.js";
import {
  SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  deserializeAttestationData,
  getAttestationDecoder,
  getCredentialDecoder,
  getSchemaDecoder,
} from "sas-lib";
import { REDPILL_TEE_EVIDENCE_SCHEMA } from "../server/lib/solana-attestation";

type Args = {
  attestation?: string;
  rpcUrl?: string;
  expectedEvidenceHash?: string;
  expectedRequestId?: string;
  expectedModel?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--attestation" && value) args.attestation = value;
    if (flag === "--rpc" && value) args.rpcUrl = value;
    if (flag === "--evidence-hash" && value) args.expectedEvidenceHash = value;
    if (flag === "--request-id" && value) args.expectedRequestId = value;
    if (flag === "--model" && value) args.expectedModel = value;
  }
  return args;
}

function getDefaultRpcUrl() {
  return (
    process.env.SAS_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
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

function utf8(bytes: Uint8Array | readonly number[]) {
  return Buffer.from(bytes).toString("utf8");
}

function parseJoinedVecStrings(bytes: Uint8Array | readonly number[]) {
  const buffer = Buffer.from(bytes);
  const values: string[] = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const len = buffer.readUInt32LE(offset);
    offset += 4;
    if (offset + len > buffer.length) break;
    values.push(buffer.subarray(offset, offset + len).toString("utf8"));
    offset += len;
  }
  return values;
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, jsonSafe(entry)]),
    );
  }
  return value;
}

async function requireAccount(connection: Connection, address: string, label: string) {
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info) throw new Error(`${label} account not found: ${address}`);
  return info;
}

function requireOwner(owner: PublicKey, address: string, label: string) {
  if (owner.toBase58() !== SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS) {
    throw new Error(`${label} ${address} is not owned by the SAS program.`);
  }
}

function check(condition: boolean, message: string, failures: string[]) {
  if (!condition) failures.push(message);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.attestation) {
    throw new Error("Usage: npm run verify:redpill:sas -- --attestation <SAS_ATTESTATION_PDA> [--rpc <RPC_URL>]");
  }

  const rpcUrl = args.rpcUrl || getDefaultRpcUrl();
  const connection = new Connection(rpcUrl, "confirmed");
  const attestationInfo = await requireAccount(connection, args.attestation, "attestation");
  requireOwner(attestationInfo.owner, args.attestation, "attestation");

  const attestation = getAttestationDecoder().decode(new Uint8Array(attestationInfo.data));
  const schemaAddress = String(attestation.schema);
  const credentialAddress = String(attestation.credential);

  const [schemaInfo, credentialInfo] = await Promise.all([
    requireAccount(connection, schemaAddress, "schema"),
    requireAccount(connection, credentialAddress, "credential"),
  ]);
  requireOwner(schemaInfo.owner, schemaAddress, "schema");
  requireOwner(credentialInfo.owner, credentialAddress, "credential");

  const schema = getSchemaDecoder().decode(new Uint8Array(schemaInfo.data));
  const credential = getCredentialDecoder().decode(new Uint8Array(credentialInfo.data));
  const evidence = deserializeAttestationData<Record<string, unknown>>(schema, new Uint8Array(attestation.data));

  const schemaFieldNames = parseJoinedVecStrings(schema.fieldNames);
  const expectedLayout = Array.from(REDPILL_TEE_EVIDENCE_SCHEMA.layout);
  const expectedFields = [...REDPILL_TEE_EVIDENCE_SCHEMA.fieldNames];
  const failures: string[] = [];

  check(String(schema.credential) === credentialAddress, "schema credential does not match attestation credential", failures);
  check(String(attestation.signer) && credential.authorizedSigners.map(String).includes(String(attestation.signer)), "attestation signer is not authorized by credential", failures);
  check(utf8(schema.name) === REDPILL_TEE_EVIDENCE_SCHEMA.name, "schema name does not match RedPill evidence schema", failures);
  check(JSON.stringify(Array.from(schema.layout)) === JSON.stringify(expectedLayout), "schema layout does not match RedPill evidence layout", failures);
  check(JSON.stringify(schemaFieldNames) === JSON.stringify(expectedFields), "schema field names do not match RedPill evidence fields", failures);
  if (args.expectedEvidenceHash) {
    check(String(evidence.evidence_hash) === args.expectedEvidenceHash, "evidence_hash does not match expected value", failures);
  }
  if (args.expectedRequestId) {
    check(String(evidence.request_id) === args.expectedRequestId, "request_id does not match expected value", failures);
  }
  if (args.expectedModel) {
    check(String(evidence.model) === args.expectedModel, "model does not match expected value", failures);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expirySeconds = Number(attestation.expiry);

  console.log(JSON.stringify(jsonSafe({
    check: "redpill-sas-attestation-verify",
    verified: failures.length === 0,
    rpcUrl: redactRpcUrl(rpcUrl),
    attestation: {
      address: args.attestation,
      owner: attestationInfo.owner.toBase58(),
      discriminator: attestation.discriminator,
      nonce: attestation.nonce,
      credential: attestation.credential,
      schema: attestation.schema,
      signer: attestation.signer,
      expiry: attestation.expiry,
      expired: Number.isFinite(expirySeconds) ? expirySeconds <= nowSeconds : null,
      dataLength: attestation.data.length,
      tokenAccount: attestation.tokenAccount,
    },
    credential: {
      address: credentialAddress,
      owner: credentialInfo.owner.toBase58(),
      authority: credential.authority,
      name: utf8(credential.name),
      authorizedSigners: credential.authorizedSigners,
    },
    schema: {
      address: schemaAddress,
      owner: schemaInfo.owner.toBase58(),
      name: utf8(schema.name),
      description: utf8(schema.description),
      layout: Array.from(schema.layout),
      fieldNames: schemaFieldNames,
      isPaused: schema.isPaused,
      version: schema.version,
    },
    evidence,
    failures,
  }), null, 2));

  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    check: "redpill-sas-attestation-verify",
    verified: false,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
