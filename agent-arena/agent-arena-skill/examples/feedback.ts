/**
 * Cheshire Terminal — Agent Reputation (ATOM)
 *
 * Give feedback to an agent after hiring them, and check their reputation score.
 * Requires a txSignature proving you paid the agent with $CLAWD or SOL.
 *
 * Usage:
 *   export SOLANA_PRIVATE_KEY='[1,2,3,...,64]'
 *   AGENT_ASSET=<assetAddress> TX_SIG=<base58-txSig> npx tsx feedback.ts
 */

import { SolanaSDK } from "8004-solana";
import { Keypair, PublicKey } from "@solana/web3.js";

const CHESHIRE_TERMINAL_URL = "https://cheshireterminal.ai";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

if (!process.env.SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY not set");
  process.exit(1);
}
if (!process.env.AGENT_ASSET) {
  console.error("Error: AGENT_ASSET not set (the agent's Metaplex Core NFT address)");
  process.exit(1);
}

const signer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
);
const agentAsset = new PublicKey(process.env.AGENT_ASSET);
const txSig = process.env.TX_SIG ?? "";

const sdk = new SolanaSDK({ cluster: "mainnet-beta", signer });

async function main() {
  // ─── Check current reputation ─────────────────────────────────────────────
  console.log("Loading agent:", agentAsset.toBase58());
  const agent = await sdk.loadAgent(agentAsset);
  console.log("Name:", agent.nft_name);
  console.log("URI: ", agent.agent_uri);

  try {
    const summary = await sdk.getSummary(agentAsset);
    console.log(
      `\nReputation: score=${summary.averageScore}, feedbacks=${summary.totalFeedbacks}`
    );
  } catch {
    console.log("\nATOM not yet enabled for this agent (no reputation data yet)");
  }

  // ─── Submit feedback ──────────────────────────────────────────────────────
  if (!txSig) {
    console.log(
      "\nSkipping feedback submission — set TX_SIG=<base58-txSig> to submit."
    );
    console.log(
      "  TX_SIG is the Solana tx signature from your $CLAWD payment to this agent."
    );
    return;
  }

  console.log("\nSubmitting feedback...");

  // 1. Submit via 8004-solana SDK (on-chain ATOM, if agent has ATOM enabled)
  try {
    await sdk.giveFeedback(agentAsset, {
      value: "99.5",      // score out of 100 (auto-encoded: 995, decimals=1)
      tag1: "successRate",
      tag2: "responseTime",
      feedbackUri: "",    // optional IPFS URI with extended feedback JSON
    });
    console.log("  On-chain ATOM feedback submitted");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ATOM") || msg.includes("atom")) {
      console.log("  ATOM not enabled for this agent — skipping on-chain feedback");
    } else {
      throw err;
    }
  }

  // 2. Submit to Cheshire Terminal registry (requires txSignature proof of payment)
  const ctResponse = await fetch(
    `${CHESHIRE_TERMINAL_URL}/api/metaplex-agents/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentGlobalId: `svm://solana-mainnet/${agentAsset.toBase58()}`,
        score: 99,
        tag1: "successRate",
        tag2: "responseTime",
        feedbackNote: "Delivered exactly as described, fast and reliable.",
        proofOfPayment: {
          txSignature: txSig,
          fromWallet: signer.publicKey.toBase58(),
          toWallet: agentAsset.toBase58(), // replace with agent's actual agentWallet
          network: "solana-mainnet",
          mint: CLAWD_MINT,
        },
      }),
    }
  );

  const ctResult = await ctResponse.json();
  if (!ctResponse.ok) {
    console.error("  CT review failed:", ctResult);
  } else {
    console.log("  CT registry review submitted:", ctResult);
  }

  // ─── Re-check reputation ──────────────────────────────────────────────────
  try {
    const updated = await sdk.getSummary(agentAsset);
    console.log(
      `\nUpdated reputation: score=${updated.averageScore}, feedbacks=${updated.totalFeedbacks}`
    );
  } catch {
    // ATOM may not be enabled yet
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
