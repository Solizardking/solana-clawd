// Client-side CAAP helpers — safe to import in browser/React components.

import { buildSiwsMessage } from "./siws-impl";

export interface SiwsMessageOpts {
  address: string;
  domain: string;
  nonce: string;
  statement?: string;
  uri?: string;
  chainId?: string;
  version?: string;
  issuedAt?: string;
}

/**
 * Build the SIWS sign-in message string that should be shown to the user
 * and passed to Phantom/Backpack/any Solana wallet for signing.
 */
export function createSiwsMessage(opts: SiwsMessageOpts): string {
  return buildSiwsMessage({
    domain: opts.domain,
    address: opts.address,
    statement:
      opts.statement ??
      "Sign in to Clawd. This request will not trigger a blockchain transaction or cost any gas fees.",
    uri: opts.uri ?? `https://${opts.domain}`,
    version: opts.version ?? "1",
    chainId: opts.chainId ?? "mainnet",
    nonce: opts.nonce,
    issuedAt: opts.issuedAt ?? new Date().toISOString(),
  });
}

/**
 * Encode the signed SIWS message and signature for POST to /caap/attest or
 * the better-auth-solana sign-in endpoint.
 */
export function encodeSiwsForSubmit(
  message: string,
  signature: Uint8Array,
  walletAddress: string,
): { message: string; signature: string; walletAddress: string } {
  // Encode signature as hex
  const sigHex = Array.from(signature)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { message, signature: sigHex, walletAddress };
}

/**
 * Generate a random base58 nonce for use in SIWS messages.
 */
export function generateNonce(length = 16): string {
  const bytes = new Uint8Array(Math.ceil(length * 0.75));
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // Simple base58 encoding for browser compatibility
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let result = "";
  let value = BigInt("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
  while (value > 0n) {
    result = ALPHABET[Number(value % 58n)] + result;
    value = value / 58n;
  }
  return result.slice(0, length).padStart(length, "1");
}
