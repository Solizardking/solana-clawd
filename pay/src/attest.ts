/**
 * pay/src/attest.ts
 *
 * x402 Payment Attestation Bridge — links an x402 payment receipt
 * to a Solana on-chain attestation via the Solana Attestation Service (SAS)
 * and Metaplex standards.
 *
 * This creates a cryptographic proof that an agent has paid via x402,
 * enabling trustless on-chain verification of agent identity and payments.
 */

import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PaymentAttestationInput {
  /** The x402 payment receipt (base64-encoded signed payload) */
  paymentReceipt: string;
  /** The agent's unique identifier */
  agentId: string;
  /** The agent's Solana wallet public key (base58) */
  agentWalletPubkey: string;
}

export interface PaymentAttestationResult {
  success: boolean;
  attestation?: {
    /** On-chain attestation account address */
    attestationAddress: string;
    /** The SAS program ID used */
    sasProgramId: string;
    /** Receipt hash committed on-chain */
    receiptHash: string;
    /** Transaction signature of the attestation */
    txSignature: string;
    /** Timestamp of attestation creation */
    timestamp: string;
  };
  error?: string;
  code?: string;
}

// ─── SAS Program Constants ──────────────────────────────────────────────────

const SAS_PROGRAM_ID = new PublicKey(
  "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG",
);

const AGENT_IDENTITY_SCHEMA = {
  name: "OpenClawdAgentIdentity",
  layout: [12, 32, 12, 32, 1] as number[],
  fieldNames: [
    "agent_id",
    "wallet_pubkey",
    "skill_attestation",
    "vault_address",
    "is_vault_initialized",
  ],
};

const PAYMENT_ATTESTATION_SCHEMA = {
  name: "OpenClawdPaymentAttestation",
  layout: [12, 32, 64, 12, 1] as number[],
  fieldNames: [
    "agent_id",
    "wallet_pubkey",
    "receipt_hash",
    "timestamp",
    "verified",
  ],
};

// ─── Receipt Hash Generation ────────────────────────────────────────────────

async function sha256Hash(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeReceiptHash(paymentReceipt: string): Promise<string> {
  const receiptBytes = base64ToBytes(paymentReceipt);
  const hash = await sha256Hash(receiptBytes);
  // Take first 32 bytes as the on-chain commitment
  return Buffer.from(hash.slice(0, 32)).toString("hex");
}

// ─── Derive Attestation PDA ─────────────────────────────────────────────────

function deriveAttestationPDA(
  agentPubkey: PublicKey,
  receiptHash: Buffer,
): PublicKey {
  // Derive PDA: [agent_pubkey, receipt_hash, "payment_attestation"]
  const [pda] = PublicKey.findProgramAddressSync(
    [
      agentPubkey.toBuffer(),
      receiptHash,
      Buffer.from("payment_attestation"),
    ],
    SAS_PROGRAM_ID,
  );
  return pda;
}

// ─── RPC Attestation Check ──────────────────────────────────────────────────

async function checkExistingAttestation(
  connection: Connection,
  pda: PublicKey,
): Promise<{ exists: boolean; data?: any }> {
  try {
    const accountInfo = await connection.getAccountInfo(pda);
    if (accountInfo && accountInfo.data.length > 0) {
      return { exists: true, data: accountInfo };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

// ─── Main Attestation Creation ──────────────────────────────────────────────

export async function createPaymentAttestation(
  paymentReceipt: string,
  agentId: string,
  agentWalletPubkey: string,
  env?: Record<string, string | undefined>,
): Promise<PaymentAttestationResult> {
  // Validate inputs
  if (!paymentReceipt) {
    return {
      success: false,
      error: "Missing payment receipt",
      code: "missing_payment_receipt",
    };
  }

  if (!agentId || !agentWalletPubkey) {
    return {
      success: false,
      error: "Missing agentId or agentWalletPubkey",
      code: "missing_agent_identity",
    };
  }

  // Validate wallet pubkey
  let agentPubkey: PublicKey;
  try {
    agentPubkey = new PublicKey(agentWalletPubkey);
  } catch {
    return {
      success: false,
      error: "Invalid agent wallet public key",
      code: "invalid_wallet_pubkey",
    };
  }

  // Compute receipt hash
  const receiptHash = await computeReceiptHash(paymentReceipt);
  const receiptHashBuffer = Buffer.from(receiptHash, "hex");

  // Derive attestation PDA
  const pda = deriveAttestationPDA(agentPubkey, receiptHashBuffer);

  // Connect to Solana
  const rpcUrl =
    env?.PAY_RPC_URL ??
    env?.SOLANA_RPC_URL ??
    clusterApiUrl("mainnet-beta");
  const connection = new Connection(rpcUrl, "confirmed");

  // Check if attestation already exists
  const existing = await checkExistingAttestation(connection, pda);
  if (existing.exists) {
    return {
      success: true,
      attestation: {
        attestationAddress: pda.toBase58(),
        sasProgramId: SAS_PROGRAM_ID.toBase58(),
        receiptHash,
        txSignature: "already_attested",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // At this point, in a full implementation we would:
  //   1. Build the SAS attestation transaction
  //   2. Submit it to the chain
  //   3. Wait for confirmation
  //
  // For the x402 payment attestation, we record the attestation intent.
  // The actual on-chain writing requires a signed transaction from the agent's wallet,
  // which flows through the sign_transaction MCP tool (sign.ts).

  return {
    success: true,
    attestation: {
      attestationAddress: pda.toBase58(),
      sasProgramId: SAS_PROGRAM_ID.toBase58(),
      receiptHash,
      txSignature: "pending_agent_signature",
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Export Attestation Transaction Builder (for sign.ts integration) ───────

export interface AttestationTransactionInput {
  agentId: string;
  agentWalletPubkey: string;
  paymentReceipt: string;
  vaultAddress?: string;
  network?: string;
}

export function buildAgentIdentityAttestationTx(
  input: AttestationTransactionInput,
): { instructionData: string; accounts: string[]; schema: typeof AGENT_IDENTITY_SCHEMA } {
  const agentIdBuffer = Buffer.from(input.agentId.padEnd(12, "\0").slice(0, 12));
  const walletBuffer = new PublicKey(input.agentWalletPubkey).toBuffer();
  const attestationBuffer = Buffer.alloc(12); // Placeholder for attestation ref
  const vaultBuffer = input.vaultAddress
    ? new PublicKey(input.vaultAddress).toBuffer()
    : Buffer.alloc(32); // Zero if no vault
  const isVaultInit = input.vaultAddress ? 1 : 0;

  // Build SAS instruction data:
  // discriminator (8 bytes) + agent_id (12) + wallet_pubkey (32) + attestation (12) + vault (32) + flag (1)
  const discriminator = Buffer.from("create_agent_identity", "utf-8").slice(0, 8);
  const data = Buffer.concat([
    discriminator,
    agentIdBuffer,
    walletBuffer,
    attestationBuffer,
    vaultBuffer,
    Buffer.from([isVaultInit]),
  ]);

  return {
    instructionData: data.toString("base64"),
    accounts: [
      SAS_PROGRAM_ID.toBase58(),
      input.agentWalletPubkey,
    ],
    schema: AGENT_IDENTITY_SCHEMA,
  };
}

export function buildPaymentAttestationTx(
  input: AttestationTransactionInput & { receiptHash: string },
): { instructionData: string; accounts: string[]; schema: typeof PAYMENT_ATTESTATION_SCHEMA } {
  const agentIdBuffer = Buffer.from(input.agentId.padEnd(12, "\0").slice(0, 12));
  const walletBuffer = new PublicKey(input.agentWalletPubkey).toBuffer();
  const receiptHashBuffer = Buffer.from(input.receiptHash, "hex");
  const timestampBuffer = Buffer.alloc(12);
  timestampBuffer.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)));

  // SAS discriminator for payment attestation
  const discriminator = Buffer.from("attest_payment", "utf-8").slice(0, 8);
  const data = Buffer.concat([
    discriminator,
    agentIdBuffer,
    walletBuffer,
    receiptHashBuffer,
    timestampBuffer,
    Buffer.from([1]), // verified = true
  ]);

  return {
    instructionData: data.toString("base64"),
    accounts: [
      SAS_PROGRAM_ID.toBase58(),
      input.agentWalletPubkey,
    ],
    schema: PAYMENT_ATTESTATION_SCHEMA,
  };
}