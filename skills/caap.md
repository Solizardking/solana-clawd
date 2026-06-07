# CAAP — Clawd Agent Attestation Protocol

## Overview

**CAAP/1.0** is a Solana-native protocol for AI agent identity, on-chain verification, and token-gated subscription tiers. It is the authentication backbone of the Clawd platform.

**Use this skill when:**
- Authenticating agents using Solana wallet key pairs (SIWS)
- Verifying agent NFT ownership via Helius DAS API
- Checking CLAWD SPL token balance for tier gating
- Integrating agent auth with Better Auth (`createCaapPlugin`)
- Building token-gated agent features using CLAWD balance thresholds
- Implementing agent-to-agent identity proofs on Solana

## Package

```
@clawd/agent-auth-solana
```

Source: `agent-auth-main/packages/agent-auth-solana/`

## Protocol Phases

### Phase 1 — SIWS (Sign In With Solana)

Build a structured sign-in message, have the wallet sign it, verify with nacl.

```ts
import { createSiwsInput, verifySiws } from "@clawd/agent-auth-solana";

// Server: create the SIWS input
const input = createSiwsInput({ address: walletAddress, nonce });
// Returns: { domain, address, statement, uri, version, chainId, nonce, issuedAt }

// Client: sign the message
const msgBytes = new TextEncoder().encode(buildMessage(input));
const { signature } = await wallet.signMessage(msgBytes);

// Server: verify
const valid = verifySiws(input, { account: { publicKey }, signature, signedMessage });
// Returns: boolean
```

### Phase 2 — DAS Verification

Helius DAS `getAssetsByOwner` checks for agent NFTs. `getAccountInfo` checks on-chain Metaplex registry presence.

### Phase 3 — Token Attestation

```ts
import { attestAgent } from "@clawd/agent-auth-solana";

const result = await attestAgent(agentId, walletAddress, {
  heliusRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`,
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
});
// result: { verified, agentNftAddress, tokenBalance, attestationHash, error? }
```

### Phase 4 — Subscription Tier

```ts
import { computeTier, tierLabel, TIER_THRESHOLDS } from "@clawd/agent-auth-solana";

const tier = computeTier(clawdBalance);
// tier.tier: "free" | "bronze" | "silver" | "gold" | "diamond"
// tier.nextTier?: SubscriptionTier
// tier.clawdToNextTier?: number
// tier.percentToNext?: number (0–100)
```

## Tier Thresholds

| Tier    | CLAWD Required | Notes                     |
|---------|---------------|---------------------------|
| free    | 0             | Basic read access         |
| bronze  | 100,000       | DAS lookup, peer card     |
| silver  | 500,000       | History, multi-agent mgmt |
| gold    | 1,000,000     | Webhooks, team accounts   |
| diamond | 5,000,000     | Dedicated node, SLA, white-label |

## Better Auth Plugin

Registers three CAAP endpoints on a Better Auth server:

```ts
import { betterAuth } from "better-auth";
import { siws } from "better-auth-solana";
import { createCaapPlugin } from "@clawd/agent-auth-solana";

export const auth = betterAuth({
  plugins: [
    siws(),
    createCaapPlugin({
      heliusApiKey: process.env.HELIUS_API_KEY,
      clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
      enableSubscriptionTiers: true,
      enableDasAttestation: true,
    }),
  ],
});
```

**Registered endpoints:**
- `POST /caap/attest` — full attestation + wallet snapshot + tier
- `GET  /caap/status/:agentId?wallet=` — lightweight verified/unverified
- `GET  /caap/discovery` — CAAP/1.0 protocol discovery document

## Client Helpers

```ts
import { createSiwsMessage, encodeSiwsForSubmit, generateNonce } from "@clawd/agent-auth-solana/client";

const nonce = generateNonce(16);
const message = createSiwsMessage({
  address: wallet.publicKey.toBase58(),
  domain: window.location.hostname,
  nonce,
});
const payload = encodeSiwsForSubmit(message, signature, walletAddress);
```

## Wallet Snapshot

```ts
import { fetchWalletSnapshot } from "@clawd/agent-auth-solana";

const snapshot = await fetchWalletSnapshot(walletAddress, opts);
// snapshot: { walletAddress, solBalance, clawdBalance, tokenAccounts, fetchedAt }
```

## Server-Side Hash Verification

```ts
import { verifyCaapAttestation, createCaapHash } from "@clawd/agent-auth-solana/verify";

const hash = createCaapHash(agentId, wallet, mint, Date.now());
const valid = verifyCaapAttestation(hash, agentId, wallet, mint);
```

## Key Constants

- Default CLAWD mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`
- Protocol version: `CAAP/1.0`
- Token program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

## Demo and Spec

- Live demo: [x402.wtf/agentauth](https://x402.wtf/agentauth)
- Whitepaper: [x402.wtf/agentauth#paper](https://x402.wtf/agentauth#paper)
- Source: `agent-auth-main/packages/agent-auth-solana/`
- Main project SIWS: `src/lib/agents/siws.ts`
- Main project attestation: `src/lib/agents/attestation.ts`
- Main project subscription: `src/lib/agents/subscription.ts`
