// Server-side CAAP attestation verification helpers.
import { createHash } from "crypto";

/**
 * Verify a CAAP attestation hash.
 * The hash is SHA-256 of `${agentId}:${walletAddress}:${mint}:${timestamp}`.
 * Since we cannot recover the timestamp, this checks structural validity only.
 * For real production use, store the hash + timestamp in your DB and verify against that.
 */
export function verifyCaapAttestation(
  hash: string,
  agentId: string,
  wallet: string,
  mint: string,
): boolean {
  if (!hash || hash.length !== 64) return false;
  if (!agentId || !wallet || !mint) return false;
  // Structural check: ensure the hash is a valid SHA-256 hex string
  return /^[0-9a-f]{64}$/.test(hash);
}

/**
 * Produce a deterministic CAAP attestation hash for a given tuple.
 * Use this to reproduce the hash for server-side storage and later comparison.
 */
export function createCaapHash(
  agentId: string,
  walletAddress: string,
  mint: string,
  timestamp: number,
): string {
  return createHash("sha256")
    .update(`${agentId}:${walletAddress}:${mint}:${timestamp}`)
    .digest("hex");
}
