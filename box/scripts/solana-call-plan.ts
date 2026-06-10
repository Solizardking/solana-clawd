#!/usr/bin/env tsx

import { createEphemeralAgentWalletManifest } from "../lib/agent-wallet";
import { buildSolanaCallPlan, loadSolanaCallConfig } from "../lib/solana-calls";

const wallet = createEphemeralAgentWalletManifest();
const plan = buildSolanaCallPlan(loadSolanaCallConfig(), {
  ownerPublicKey: wallet.publicKey,
  symbol: process.argv[2] ?? "SOL",
});

console.log(JSON.stringify({ wallet, plan }, null, 2));
