/**
 * @agentwallet/core — Network / RPC URL resolution
 * Keys never leave the vault. RPC URLs are selected per-network at call time.
 */

import type { Network } from "./types.js";

const RPC_URLS: Record<Network, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/**
 * Return the RPC URL for a network, allowing override via SOLANA_RPC_URL env var.
 * SOLANA_RPC_URL is only honoured on mainnet-beta to allow custom RPC endpoints
 * (Helius, QuickNode, etc.) without affecting devnet/localnet behaviour.
 */
export function getRpcUrl(network: Network): string {
  if (network === "mainnet-beta" && process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }
  return RPC_URLS[network];
}

export function parseNetwork(raw: string | undefined): Network {
  const valid: Network[] = ["localnet", "devnet", "testnet", "mainnet-beta"];
  const n = (raw ?? "devnet") as Network;
  if (!valid.includes(n)) {
    throw new Error(
      `Unknown network "${raw}". Valid: ${valid.join(", ")}`
    );
  }
  return n;
}

export function isMainnet(network: Network): boolean {
  return network === "mainnet-beta";
}

export function networkLabel(network: Network): string {
  const labels: Record<Network, string> = {
    localnet: "🖥  Local (solana-test-validator)",
    devnet: "🔵 Devnet",
    testnet: "🟡 Testnet",
    "mainnet-beta": "🔴 Mainnet-Beta (REAL FUNDS)",
  };
  return labels[network];
}
