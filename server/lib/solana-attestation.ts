import crypto from "crypto";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
  deriveAttestationPda,
  deriveCredentialPda,
  deriveSchemaPda,
  getCreateAttestationInstructionDataEncoder,
  getCreateCredentialInstructionDataEncoder,
  getCreateSchemaInstructionDataEncoder,
  serializeAttestationData,
} from "sas-lib";

const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";

export const REDPILL_TEE_EVIDENCE_SCHEMA = {
  name: process.env.SAS_REDPILL_SCHEMA_NAME || "RedPillTeeEvidence",
  version: Number(process.env.SAS_REDPILL_SCHEMA_VERSION || 1),
  description:
    process.env.SAS_REDPILL_SCHEMA_DESCRIPTION ||
    "Hashes binding a RedPill TEE completion to its request signature and attestation report.",
  layout: Uint8Array.from([12, 12, 12, 12, 12, 12, 8, 10]),
  fieldNames: [
    "request_id",
    "model",
    "signing_address",
    "request_hash",
    "response_hash",
    "evidence_hash",
    "issued_at",
    "provider_attested",
  ],
} as const;

export type RedpillEvidenceRecord = {
  request_id: string;
  model: string;
  signing_address: string;
  request_hash: string;
  response_hash: string;
  evidence_hash: string;
  issued_at: bigint;
  provider_attested: boolean;
};

export type RedpillEvidenceInput = {
  requestId: string;
  model: string;
  signingAddress?: string;
  request: unknown;
  response: unknown;
  signature?: unknown;
  attestationReport?: unknown;
  issuedAt?: Date;
};

export type SasLaunchConfig = {
  rpcUrl: string;
  credentialName: string;
  authorityAddress?: string;
  payerAddress?: string;
  programAddress: string;
  schema: {
    name: string;
    version: number;
    description: string;
    layout: number[];
    fieldNames: string[];
  };
};

type SasAddresses = {
  credentialPda: string;
  credentialBump: number;
  schemaPda: string;
  schemaBump: number;
};

type SubmitOptions = {
  skipPreflight?: boolean;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

export function sha256Hex(value: unknown): string {
  const input = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : stableStringify(value);
  return crypto.createHash("sha256").update(input).digest("hex");
}

function asAddress(value: PublicKey | string) {
  return (typeof value === "string" ? value : value.toBase58()) as never;
}

function publicKeyFromHash(seed: string) {
  return new PublicKey(crypto.createHash("sha256").update(seed).digest().subarray(0, 32));
}

function encodeJoinedVecStrings(values: readonly string[]) {
  const chunks = values.map((value) => {
    const bytes = Buffer.from(value, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    return Buffer.concat([len, bytes]);
  });
  return Uint8Array.from(Buffer.concat(chunks));
}

function bytesToBuffer(bytes: unknown) {
  return Buffer.from(Array.from(bytes as ArrayLike<number>));
}

function getRpcUrl() {
  return (
    process.env.SAS_RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com"
  );
}

function getCredentialName() {
  return process.env.SAS_CREDENTIAL_NAME || "Cheshire RedPill TEE";
}

function parseSecretKey(rawKey: string) {
  const trimmed = rawKey.trim();
  if (trimmed.startsWith("[")) return new Uint8Array(JSON.parse(trimmed));
  return bs58.decode(trimmed);
}

function loadKeypair(...envNames: string[]) {
  for (const envName of envNames) {
    const rawKey = process.env[envName];
    if (!rawKey) continue;
    return {
      envName,
      keypair: Keypair.fromSecretKey(parseSecretKey(rawKey)),
    };
  }
  return null;
}

function requireSasSigner() {
  const payer = loadKeypair(
    "SAS_PAYER_SECRET_KEY",
    "FEE_PAYER_SECRET_KEY",
    "WALLET_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
  );
  const authority = loadKeypair(
    "SAS_AUTHORITY_SECRET_KEY",
    "SAS_PAYER_SECRET_KEY",
    "FEE_PAYER_SECRET_KEY",
    "WALLET_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
  );
  if (!payer || !authority) {
    throw new Error(
      "SAS signer not configured. Set SAS_PAYER_SECRET_KEY and SAS_AUTHORITY_SECRET_KEY, or provide a funded FEE_PAYER_SECRET_KEY fallback.",
    );
  }
  return { payer, authority };
}

function toWeb3Instruction(instruction: {
  programAddress: string;
  accounts: Array<{ address: string; role: number }>;
  data: Uint8Array;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programAddress),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.address),
      isWritable: account.role === 1 || account.role === 3,
      isSigner: account.role === 2 || account.role === 3,
    })),
    data: Buffer.from(instruction.data),
  });
}

async function sendInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: Keypair,
  signers: Keypair[],
  options: SubmitOptions = {},
) {
  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 }),
    ...instructions,
  );
  return sendAndConfirmTransaction(connection, transaction, [payer, ...signers], {
    commitment: "confirmed",
    skipPreflight: options.skipPreflight ?? false,
  });
}

export function getSasLaunchConfig(): SasLaunchConfig {
  const payer = loadKeypair("SAS_PAYER_SECRET_KEY", "FEE_PAYER_SECRET_KEY", "WALLET_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
  const authority = loadKeypair("SAS_AUTHORITY_SECRET_KEY", "SAS_PAYER_SECRET_KEY", "FEE_PAYER_SECRET_KEY", "WALLET_PRIVATE_KEY", "SOLANA_PRIVATE_KEY");
  return {
    rpcUrl: getRpcUrl(),
    credentialName: getCredentialName(),
    authorityAddress: authority?.keypair.publicKey.toBase58(),
    payerAddress: payer?.keypair.publicKey.toBase58(),
    programAddress: SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS,
    schema: {
      name: REDPILL_TEE_EVIDENCE_SCHEMA.name,
      version: REDPILL_TEE_EVIDENCE_SCHEMA.version,
      description: REDPILL_TEE_EVIDENCE_SCHEMA.description,
      layout: Array.from(REDPILL_TEE_EVIDENCE_SCHEMA.layout),
      fieldNames: [...REDPILL_TEE_EVIDENCE_SCHEMA.fieldNames],
    },
  };
}

export async function deriveRedpillSasAddresses(authority: PublicKey | string): Promise<SasAddresses> {
  const [credentialPda, credentialBump] = await deriveCredentialPda({
    authority: asAddress(authority),
    name: getCredentialName(),
  });
  const [schemaPda, schemaBump] = await deriveSchemaPda({
    credential: credentialPda,
    name: REDPILL_TEE_EVIDENCE_SCHEMA.name,
    version: REDPILL_TEE_EVIDENCE_SCHEMA.version,
  });
  return {
    credentialPda,
    credentialBump,
    schemaPda,
    schemaBump,
  };
}

export function buildRedpillEvidenceRecord(input: RedpillEvidenceInput): RedpillEvidenceRecord {
  const requestHash = sha256Hex(input.request);
  const responseHash = sha256Hex(input.response);
  const signatureHash = input.signature ? sha256Hex(input.signature) : "";
  const reportHash = input.attestationReport ? sha256Hex(input.attestationReport) : "";
  const evidenceHash = sha256Hex({
    requestHash,
    responseHash,
    signatureHash,
    reportHash,
    signingAddress: input.signingAddress || "",
  });
  return {
    request_id: input.requestId,
    model: input.model,
    signing_address: input.signingAddress || "",
    request_hash: requestHash,
    response_hash: responseHash,
    evidence_hash: evidenceHash,
    issued_at: BigInt(Math.floor((input.issuedAt?.getTime() ?? Date.now()) / 1000)),
    provider_attested: Boolean(input.signature && input.attestationReport && input.signingAddress),
  };
}

export function serializeRedpillEvidence(record: RedpillEvidenceRecord) {
  return serializeAttestationData({
    discriminator: 2,
    credential: asAddress(SYSTEM_PROGRAM_ADDRESS),
    name: Uint8Array.from(Buffer.from(REDPILL_TEE_EVIDENCE_SCHEMA.name, "utf8")),
    description: Uint8Array.from(Buffer.from(REDPILL_TEE_EVIDENCE_SCHEMA.description, "utf8")),
    layout: REDPILL_TEE_EVIDENCE_SCHEMA.layout,
    fieldNames: encodeJoinedVecStrings(REDPILL_TEE_EVIDENCE_SCHEMA.fieldNames),
    isPaused: false,
    version: REDPILL_TEE_EVIDENCE_SCHEMA.version,
  }, record);
}

export async function ensureRedpillSasSetup(options: SubmitOptions = {}) {
  const { payer, authority } = requireSasSigner();
  const connection = new Connection(getRpcUrl(), "confirmed");
  const addresses = await deriveRedpillSasAddresses(authority.keypair.publicKey);
  const signatures: string[] = [];

  const credentialInfo = await connection.getAccountInfo(new PublicKey(addresses.credentialPda), "confirmed");
  if (!credentialInfo) {
    const data = getCreateCredentialInstructionDataEncoder().encode({
      name: getCredentialName(),
      signers: [asAddress(authority.keypair.publicKey)],
    });
    const instruction = new TransactionInstruction({
      programId: new PublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS),
      keys: [
        { pubkey: payer.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: new PublicKey(addresses.credentialPda), isSigner: false, isWritable: true },
        { pubkey: authority.keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false },
      ],
      data: bytesToBuffer(data),
    });
    signatures.push(await sendInstructions(connection, [instruction], payer.keypair, [authority.keypair], options));
  }

  const schemaInfo = await connection.getAccountInfo(new PublicKey(addresses.schemaPda), "confirmed");
  if (!schemaInfo) {
    const data = getCreateSchemaInstructionDataEncoder().encode({
      name: REDPILL_TEE_EVIDENCE_SCHEMA.name,
      description: REDPILL_TEE_EVIDENCE_SCHEMA.description,
      layout: REDPILL_TEE_EVIDENCE_SCHEMA.layout,
      fieldNames: [...REDPILL_TEE_EVIDENCE_SCHEMA.fieldNames],
    });
    const instruction = new TransactionInstruction({
      programId: new PublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS),
      keys: [
        { pubkey: payer.keypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: authority.keypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: new PublicKey(addresses.credentialPda), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(addresses.schemaPda), isSigner: false, isWritable: true },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false },
      ],
      data: bytesToBuffer(data),
    });
    signatures.push(await sendInstructions(connection, [instruction], payer.keypair, [authority.keypair], options));
  }

  return {
    ...addresses,
    credentialName: getCredentialName(),
    schemaName: REDPILL_TEE_EVIDENCE_SCHEMA.name,
    signatures,
    explorer: `https://attest.solana.com`,
  };
}

export async function issueRedpillEvidenceAttestation(
  record: RedpillEvidenceRecord,
  options: SubmitOptions = {},
) {
  const { payer, authority } = requireSasSigner();
  const connection = new Connection(getRpcUrl(), "confirmed");
  const setup = await ensureRedpillSasSetup(options);
  const nonce = publicKeyFromHash(`redpill:${record.request_id}:${record.model}:${record.evidence_hash}`);
  const [attestationPda, attestationBump] = await deriveAttestationPda({
    credential: asAddress(setup.credentialPda),
    schema: asAddress(setup.schemaPda),
    nonce: asAddress(nonce),
  });
  const existing = await connection.getAccountInfo(new PublicKey(attestationPda), "confirmed");
  if (existing) {
    return {
      ...setup,
      attestationPda,
      attestationBump,
      nonce: nonce.toBase58(),
      signature: null,
      alreadyExists: true,
      explorer: `https://attest.solana.com/${attestationPda}`,
    };
  }

  const data = getCreateAttestationInstructionDataEncoder().encode({
    nonce: asAddress(nonce),
    data: serializeRedpillEvidence(record),
    expiry: BigInt(Math.floor(Date.now() / 1000) + Number(process.env.SAS_ATTESTATION_EXPIRY_SECONDS || 31_536_000)),
  });
  const instruction = new TransactionInstruction({
    programId: new PublicKey(SOLANA_ATTESTATION_SERVICE_PROGRAM_ADDRESS),
    keys: [
      { pubkey: payer.keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.keypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: new PublicKey(setup.credentialPda), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(setup.schemaPda), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(attestationPda), isSigner: false, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: bytesToBuffer(data),
  });
  const signature = await sendInstructions(connection, [instruction], payer.keypair, [authority.keypair], options);

  return {
    ...setup,
    attestationPda,
    attestationBump,
    nonce: nonce.toBase58(),
    signature,
    alreadyExists: false,
    explorer: `https://attest.solana.com/${attestationPda}`,
  };
}
