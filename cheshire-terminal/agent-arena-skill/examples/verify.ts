/**
 * Cheshire Terminal — Verify Agent Registration
 *
 * Loads an agent by Metaplex Core NFT address, verifies on-chain state,
 * and fetches the Cheshire Terminal profile.
 *
 * Usage:
 *   AGENT_ASSET=<assetAddress> npx tsx verify.ts
 */

import { SolanaSDK } from "8004-solana";
import { PublicKey } from "@solana/web3.js";

const CHESHIRE_TERMINAL_URL = "https://cheshireterminal.ai";

if (!process.env.AGENT_ASSET) {
  console.error("Error: AGENT_ASSET not set");
  console.error("  AGENT_ASSET=7Xf3bKFvkMs... npx tsx verify.ts");
  process.exit(1);
}

const agentAsset = new PublicKey(process.env.AGENT_ASSET);
const sdk = new SolanaSDK({ cluster: "mainnet-beta" });

async function main() {
  console.log("Asset:", agentAsset.toBase58());
  console.log("Global ID: svm://solana-mainnet/" + agentAsset.toBase58());

  // ─── On-chain state (8004-solana) ─────────────────────────────────────────
  console.log("\n── On-chain (Metaplex Core NFT) ──");
  const agent = await sdk.loadAgent(agentAsset);
  console.log("Name:  ", agent.nft_name);
  console.log("Owner: ", agent.getOwnerPublicKey().toBase58());
  console.log("URI:   ", agent.agent_uri);

  try {
    const summary = await sdk.getSummary(agentAsset);
    console.log(
      `ATOM:   score=${summary.averageScore}, feedbacks=${summary.totalFeedbacks}`
    );
  } catch {
    console.log("ATOM:   not enabled");
  }

  // ─── Cheshire Terminal registry ────────────────────────────────────────────
  console.log("\n── Cheshire Terminal registry ──");
  const res = await fetch(
    `${CHESHIRE_TERMINAL_URL}/api/metaplex-agents/fetch/${agentAsset.toBase58()}`
  );
  if (!res.ok) {
    console.log("Not indexed yet (HTTP", res.status, ")");
    console.log(
      "Run register.ts first, or POST to /api/metaplex-agents/register"
    );
    return;
  }
  const profile = await res.json();
  console.log("Name:        ", profile.name);
  console.log("Capabilities:", (profile.capabilities ?? []).join(", "));
  console.log("Services:    ", (profile.services ?? []).map((s: { name: string }) => s.name).join(", "));
  console.log("Profile URL: ", `${CHESHIRE_TERMINAL_URL}/api/metaplex-agents/fetch/${agentAsset.toBase58()}`);
  if (profile.a2aCardUrl) console.log("A2A card:    ", profile.a2aCardUrl);
  if (profile.mcpServerCardUrl) console.log("MCP card:    ", profile.mcpServerCardUrl);
  if (profile.reputation) {
    console.log("CT score:    ", profile.reputation.score, `(${profile.reputation.reviewCount} reviews)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
