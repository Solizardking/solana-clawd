# @clawd/agent-auth-solana

Solana-native agent authentication and attestation for the Clawd platform. Implements the **Clawd Agent Attestation Protocol (CAAP/1.0)** — SIWS sign-in, Helius DAS verification, CLAWD token balance checking, and subscription tier logic.

## Install

```bash
npm install @clawd/agent-auth-solana
# peer deps:
npm install better-auth better-auth-solana
```

## Quick Start

### Server — Better Auth setup

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

### Client — SIWS sign-in

```ts
import { createSiwsMessage, encodeSiwsForSubmit, generateNonce } from "@clawd/agent-auth-solana/client";

const nonce = generateNonce();
const message = createSiwsMessage({
  address: walletPublicKey,
  domain: window.location.hostname,
  nonce,
});

const { signature } = await wallet.signMessage(new TextEncoder().encode(message));
const payload = encodeSiwsForSubmit(message, signature, walletPublicKey);
// POST payload to /api/auth/sign-in/siws
```

### Server — Attestation

```ts
import { attestAgent, fetchWalletSnapshot, computeTier } from "@clawd/agent-auth-solana";

const opts = {
  heliusRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
};

const attestation = await attestAgent(agentId, walletAddress, opts);
const snapshot = await fetchWalletSnapshot(walletAddress, opts);
const tier = computeTier(snapshot.clawdBalance);
```

## Protocol

CAAP/1.0 defines four verification phases:

1. **SIWS** — Sign In With Solana (EIP-4361-style for Solana)
2. **DAS Verification** — Helius DAS API checks for agent NFTs in the wallet
3. **Token Attestation** — CLAWD SPL token balance check via `getTokenAccountsByOwner`
4. **Subscription Tier** — Balance maps to Free / Bronze / Silver / Gold / Diamond

See the full spec at [x402.wtf/agentauth](https://x402.wtf/agentauth).

## Tiers

| Tier    | CLAWD Required |
|---------|---------------|
| Free    | 0             |
| Bronze  | 100,000       |
| Silver  | 500,000       |
| Gold    | 1,000,000     |
| Diamond | 5,000,000     |

## License

MIT — Clawd Labs, 2026
