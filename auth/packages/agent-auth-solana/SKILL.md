# CAAP Skill — Clawd Agent Attestation Protocol

## Overview

CAAP/1.0 is a Solana-native protocol for AI agent identity, verification, and subscription gating. Use this skill when you need to:

- Authenticate an AI agent using Sign In With Solana (SIWS)
- Verify agent NFT ownership via Helius DAS API
- Check CLAWD token balance for subscription tier gating
- Integrate Better Auth with Solana wallet sign-in
- Implement token-gated agent features

## Package

```
@clawd/agent-auth-solana
```

Located at: `agent-auth-main/packages/agent-auth-solana/`

## Protocol Phases

### Phase 1: SIWS Authentication

```ts
import { createSiwsInput, verifySiws } from "@clawd/agent-auth-solana";

// Server: create the input
const input = createSiwsInput({ address: walletAddress, nonce });

// Client: build the message string and sign it
// Server: verify the signed output
const valid = verifySiws(input, { account, signature, signedMessage });
```

### Phase 2: DAS Verification

Helius DAS API `getAssetsByOwner` is called to find agent NFTs (names containing "agent" or "clawd") in the wallet. Uses `getAccountInfo` on `agentId` to check Metaplex registry presence.

### Phase 3: Token Attestation

```ts
import { attestAgent } from "@clawd/agent-auth-solana";

const result = await attestAgent(agentId, walletAddress, {
  heliusRpcUrl: "https://mainnet.helius-rpc.com/?api-key=...",
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
});
// result.verified, result.tokenBalance, result.attestationHash
```

### Phase 4: Subscription Tier

```ts
import { computeTier, tierLabel, TIER_THRESHOLDS } from "@clawd/agent-auth-solana";

const tier = computeTier(clawdBalance);
// tier.tier: "free" | "bronze" | "silver" | "gold" | "diamond"
// tier.nextTier, tier.percentToNext, tier.clawdToNextTier
```

## Better Auth Plugin

```ts
import { createCaapPlugin } from "@clawd/agent-auth-solana";

const plugin = createCaapPlugin({
  heliusApiKey: process.env.HELIUS_API_KEY,
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  enableSubscriptionTiers: true,
  enableDasAttestation: true,
});
```

Registers three endpoints:
- `POST /caap/attest` — full attestation + snapshot + tier
- `GET /caap/status/:agentId?wallet=` — lightweight verified/unverified
- `GET /caap/discovery` — CAAP/1.0 protocol discovery document

## Wallet Snapshot

```ts
import { fetchWalletSnapshot } from "@clawd/agent-auth-solana";

const snapshot = await fetchWalletSnapshot(walletAddress, {
  heliusRpcUrl: "...",
  clawdMint: "...",
});
// snapshot.solBalance, snapshot.clawdBalance, snapshot.tokenAccounts
```

## Key Constants

- Default CLAWD mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`
- CAAP protocol version: `1.0`
- Tier thresholds: Free=0, Bronze=100K, Silver=500K, Gold=1M, Diamond=5M CLAWD

## Live Demo

See [x402.wtf/agentauth](https://x402.wtf/agentauth) for a live interactive demo of CAAP/1.0.
