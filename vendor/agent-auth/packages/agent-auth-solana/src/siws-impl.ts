// SIWS implementation using nacl + bs58.
// Standalone version of src/lib/agents/siws.ts — no Next.js or env coupling.

import nacl from "tweetnacl";
import bs58 from "bs58";

export interface SolanaSignInInput {
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

function buildSiwsMessage(input: SolanaSignInInput): string {
  const lines: string[] = [];
  if (input.domain) lines.push(`${input.domain} wants you to sign in with your Solana account:`);
  if (input.address) lines.push(input.address);
  lines.push("");
  if (input.statement) {
    lines.push(input.statement);
    lines.push("");
  }
  if (input.uri) lines.push(`URI: ${input.uri}`);
  if (input.version) lines.push(`Version: ${input.version}`);
  if (input.chainId) lines.push(`Chain ID: ${input.chainId}`);
  if (input.nonce) lines.push(`Nonce: ${input.nonce}`);
  if (input.issuedAt) lines.push(`Issued At: ${input.issuedAt}`);
  if (input.expirationTime) lines.push(`Expiration Time: ${input.expirationTime}`);
  if (input.notBefore) lines.push(`Not Before: ${input.notBefore}`);
  if (input.requestId) lines.push(`Request ID: ${input.requestId}`);
  if (input.resources?.length) {
    lines.push("Resources:");
    for (const r of input.resources) lines.push(`- ${r}`);
  }
  return lines.join("\n");
}

function randomBase58Nonce(len = 16): string {
  const bytes = nacl.randomBytes(Math.ceil(len * 0.75));
  return bs58.encode(bytes).slice(0, len);
}

export function createSiwsInput(opts?: {
  address?: string;
  nonce?: string;
  domain?: string;
  uri?: string;
  statement?: string;
}): SolanaSignInInput {
  const domain = opts?.domain ?? "clawd.xyz";
  const uri = opts?.uri ?? `https://${domain}`;

  return {
    domain,
    address: opts?.address,
    statement:
      opts?.statement ??
      "Sign in to Clawd. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri,
    version: "1",
    chainId: "mainnet",
    nonce: opts?.nonce ?? randomBase58Nonce(16),
    issuedAt: new Date().toISOString(),
  };
}

function toUint8Array(value: Uint8Array | number[]): Uint8Array {
  return value instanceof Uint8Array ? value : Uint8Array.from(value);
}

export function verifySiws(
  input: SolanaSignInInput,
  output: {
    account: { publicKey: Uint8Array | number[] };
    signature: Uint8Array | number[];
    signedMessage: Uint8Array | number[];
  },
): boolean {
  try {
    const publicKey = toUint8Array(output.account.publicKey);
    const signature = toUint8Array(output.signature);
    const signedMessage = toUint8Array(output.signedMessage);

    const expectedMessage = buildSiwsMessage(input);
    const decoded = new TextDecoder().decode(signedMessage);
    if (decoded !== expectedMessage) return false;

    return nacl.sign.detached.verify(signedMessage, signature, publicKey);
  } catch {
    return false;
  }
}

export function verifySolanaSignature(
  message: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

export { buildSiwsMessage };
