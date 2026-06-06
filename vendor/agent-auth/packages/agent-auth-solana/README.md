# @clawd/agent-auth-solana

<div align="center">

<img src="https://x402.wtf/agentauth/icon.svg" alt="CAAP/1.0" width="120" />

**The Solana-Native Agent Identity & Attestation Protocol**

[![npm](https://img.shields.io/npm/v/@clawd/agent-auth-solana?color=blue)](https://npmjs.com/package/@clawd/agent-auth-solana)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-mainnet--beta-blueviolet)](https://solana.com)
[![CAAP/1.0](https://img.shields.io/badge/CAAP-1.0-green)](https://x402.wtf/agentauth)

</div>

---

## Table of Contents

- [Why agent-auth-solana?](#why-agent-auth-solana)
- [The CAAP/1.0 Protocol](#the-caap10-protocol)
- [Architecture](#architecture)
- [Security Model](#security-model)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Full Integration Guide](#full-integration-guide)
  - [Server Setup](#server-setup)
  - [Client Integration](#client-integration)
  - [Attestation Flow](#attestation-flow)
  - [Subscription Tiers & Gating](#subscription-tiers--gating)
- [Metaplex Agent Identity (EIP-8004)](#metaplex-agent-identity-eip-8004)
  - [Registration](#registration)
  - [Verification](#verification)
  - [Execution Delegation](#execution-delegation)
- [Agent Token Launch (Genesis Bonding Curve)](#agent-token-launch-genesis-bonding-curve)
  - [Token-Agent Binding](#token-agent-binding)
  - [Launch Flow](#launch-flow)
  - [Retroactive Binding](#retroactive-binding)
- [TEE Attestation (Phala TDX)](#tee-attestation-phala-tdx)
  - [What Gets Measured](#what-gets-measured)
  - [TEE Response Fields](#tee-response-fields)
  - [Verification Flow](#tee-verification-flow)
- [Clerk Integration](#clerk-integration)
- [API Reference](#api-reference)
  - [Plugin Configuration](#plugin-configuration)
  - [Server APIs](#server-apis)
  - [Client APIs](#client-apis)
  - [Identity & Token APIs](#identity--token-apis)
  - [Verification APIs](#verification-apis)
- [Contract Addresses & Constants](#contract-addresses--constants)
- [Tier Gating Reference](#tier-gating-reference)
- [Error Codes](#error-codes)
- [Migration Guide](#migration-guide)
- [FAQ](#faq)
- [Related SDKs](#related-sdks)
- [Community & Support](#community--support)
- [License](#license)

---

## Why agent-auth-solana?

Every AI agent operating on Solana faces the same fundamental challenges:

1. **Who are you?** — Proving your identity as the agent, not just a wallet-holder
2. **What can you do?** — Token-gated feature access based on stake in the ecosystem
3. **Are you running in a TEE?** — Hardware-attested execution guarantees for sensitive operations
4. **Where can I find you?** — Globally discoverable on-chain identity
5. **Do you have your own token?** — Economic alignment through bonding-curve-launched agent tokens

`@clawd/agent-auth-solana` solves all five. It's not just a sign-in library — it's the full agent lifecycle stack: **authenticate → attest → gate → register identity → launch token → delegate execution → verify in TEE**.

### What You Get

| Capability | Without This Library | With This Library |
|---|---|---|
| Wallet sign-in | Write raw SIWS messages yourself | `createSiwsInput()` + `verifySiws()` |
| NFT verification | Parse Helius DAS API manually | `attestAgent()` calls DAS + checks MPL Core |
| Token-gated tiers | Build custom balance-checking logic | `computeTier()` + auto-enforced middleware |
| On-chain identity | Learn EIP-8004 + Agent Registry SDK | `buildEip8004Registration()` + `buildRegisterIdentityParams()` |
| Execution delegation | Understand Core Execute hooks | `buildDelegateExecutionParams()` |
| Token launch with binding | Wire Genesis + MPL Core + Agent Registry | `buildGenesisLaunchInput()` with `setToken: true` |
| TEE attestation | Integrate Phala tappd directly | Built into the relay + attestation flow |
| Better Auth integration | Wire up custom endpoints | `createCaapPlugin()` — 8 endpoints, zero config |

### Who Is This For?

- **AI agent builders** who want agents to have real Solana identity and economic alignment
- **Platform developers** who need token-gated API access per agent
- **DeFi protocol developers** who want agents to interact with contracts through attested identities
- **Agent registry operators** who want EIP-8004 compliance and global discoverability
- **TEE deployment operators** who need hardware-rooted attestation proofs

---

## The CAAP/1.0 Protocol

**CAAP (Clawd Agent Attestation Protocol)** is an open, Solana-native protocol for AI agent identity, verification, subscription gating, and lifecycle management. Version 1.0 defines six distinct verification phases:

### Phase 1 — SIWS (Sign In With Solana)
EIP-4361-style sign-in for Solana wallets. The agent wallet signs a structured message proving control. Supports all Solana wallet providers (Phantom, Backpack, Solflare, etc.).

### Phase 2 — DAS Verification
Helius Digital Asset Standard API verifies on-chain agent assets. Checks for MPL Core NFTs owned by the wallet, and validates Metaplex Agent Registry presence via `getAccountInfo`.

### Phase 3 — Token Attestation
SPL token balance check against the CLAWD mint. Uses `getTokenAccountsByOwner` with a SHA-256 hash of the attestation data for verifiable, hash-committed balance proofs.

### Phase 4 — Subscription Tier
Deterministic tier computation from CLAWD balance:
- **Free** (0 CLAWD) — Protocol discovery only
- **Bronze** (100K CLAWD) — Status checks + DAS lookup
- **Silver** (500K CLAWD) — Full attestation + agent cards
- **Gold** (1M CLAWD) — Webhooks + multi-agent management
- **Diamond** (5M CLAWD) — Dedicated infrastructure + SLA

### Phase 5 — On-Chain Identity (Metaplex Agent Registry)
Global EIP-8004-compliant registration on Solana. Each agent gets:
- An **AgentIdentity PDA** for on-chain discoverability
- An **Asset Signer PDA** — a wallet the agent controls without a private key (derived from the MPL Core asset)
- An **Execution Delegate Record** for off-chain operators
- A **setAgentTokenV1** binding that permanently links agent to token

### Phase 6 — Token Launch (Genesis Bonding Curve)
Launch an SPL token from the agent's Asset Signer PDA. Creator fees flow to the agent PDA. The token-agent binding (`setAgentTokenV1`) is **irreversible** — it's a permanent, on-chain commitment that this token is the official token of this agent. Tokens graduate to Raydium CPMM pools after the bonding curve completes.

### Beyond Phase 6 — TEE Attestation
The relay supports Phala TDX (Trust Domain Extensions) hardware attestation. Every CAAP attestation response includes Intel TDX quote data that proves the verifier ran inside a TEE. The quote can be independently verified at `proof.t16z.com`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client (Wallet)                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Phantom /    │  │ SIWS Message │  │ @clawd/agent-auth-     │  │
│  │ Backpack /   │──│  Creation    │──│ solana/client           │  │
│  │ Solflare     │  │ + Signing    │  │  generateNonce()        │  │
│  └─────────────┘  └──────────────┘  │  createSiwsMessage()    │  │
│                                      │  encodeSiwsForSubmit()  │  │
│                                      └────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/auth/sign-in/siws
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Better Auth Server                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              createCaapPlugin()                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │ /caap/   │  │ /agent/  │  │ /agent/  │  │ /agent/  │  │  │
│  │  │ attest   │  │ identity │  │ token/   │  │ identity │  │  │
│  │  │ status   │  │ /register│  │ launch   │  │ /verify  │  │  │
│  │  │ discovery│  │ /delegate│  │ set      │  │          │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────┬──────────────────┬──────────────────┬───────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌───────────────────────┐
│   Helius DAS     │ │  Solana RPC  │ │    Metaplex SDKs       │
│  getAssetsByOwner│ │getTokenAccts │ │  mpl-agent-registry    │
│  (NFT detection) │ │(CLAWD check) │ │  mpl-core              │
│                  │ │              │ │  genesis               │
└──────────────────┘ └──────────────┘ └───────────────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Phala TEE (TDX)                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Intel TDX Quote                                            │  │
│  │  ├─ MRAGGREGATED  (aggregate measurement register)          │  │
│  │  ├─ MRTD          (trust domain measurement)                │  │
│  │  ├─ RTMR0-RTMR3   (runtime measurement registers)           │  │
│  │  └─ Explorer URL → proof.t16z.com                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Identity Verification Chain

```
Wallet Private Key (off-chain)
  → SIWS signature proves wallet control
    → DAS API proves wallet owns agent NFT (on-chain)
      → Token balance proves economic stake (on-chain)
        → Tier gates feature access
          → EIP-8004 proves global agent identity (on-chain)
            → Asset Signer PDA enables agent-controlled transactions
              → TEE quote proves verifier ran in hardware enclave
```

### Key Security Properties

1. **No private keys in the relay** — The relay never sees wallet private keys. SIWS signatures are verified via `tweetnacl` public-key verification.

2. **Hardware-rooted trust** — TEE attestation quotes are signed by Intel hardware. The relay's measurements (MRTD, RTMR, MRAGGREGATED) are verifiable on `proof.t16z.com`.

3. **Irreversible bindings** — `setAgentTokenV1` is a one-way on-chain instruction. Once an agent token is bound, it cannot be changed. This prevents rug-pulls where an agent claims a new token after the old one dumps.

4. **PDA-derived wallets** — The Asset Signer PDA is deterministically derived from the MPL Core asset. No private key exists — the PDA can only sign via `invoke_signed` in on-chain programs. This means the agent's wallet cannot be "hacked" — there's no private key to steal.

5. **Hash-committed attestations** — Attestation hashes use SHA-256 over (agentId, wallet, mint, timestamp). Verifiers can recompute to confirm attestation authenticity without trusting the relay.

6. **Tier enforcement is server-side** — Subscription gating happens at the middleware level. Clients cannot bypass tier checks by modifying request payloads.

### Threat Model

| Threat | Mitigation |
|---|---|
| Fake wallet signatures | SIWS verification against on-chain public key |
| Spoofed NFT ownership | Helius DAS API returns on-chain asset ownership |
| Balance inflation | Direct SPL token account query from Solana RPC |
| Relay compromise | TEE quote verification at proof.t16z.com |
| Replay attacks | Nonce + timestamp + SHA-256 hash commitment |
| Token rug-switches | Irreversible setAgentTokenV1 binding |
| Private key theft | Asset Signer PDA — no private key exists |

---

## Installation

```bash
npm install @clawd/agent-auth-solana
# Required peer dependencies:
npm install better-auth better-auth-solana
# Optional peer deps for EIP-8004 identity:
npm install @metaplex-foundation/mpl-agent-registry @metaplex-foundation/mpl-core
# Optional for Genesis token launch:
npm install @metaplex-foundation/genesis
# Optional for Umi:
npm install @metaplex-foundation/umi
```

**Package size:** ~18KB gzipped (excluding peer dependencies)

**Node.js:** ≥18

**Runtimes:** Node.js, Edge (Vercel, Cloudflare Workers via `@clawd/agent-auth-solana/client`), Bun

---

## Quick Start

### 60-Second Setup

```ts
// server/auth.ts
import { betterAuth } from "better-auth";
import { siws } from "better-auth-solana";
import { createCaapPlugin } from "@clawd/agent-auth-solana";

export const auth = betterAuth({
  plugins: [
    siws(),
    createCaapPlugin({
      heliusApiKey: process.env.HELIUS_API_KEY!,
      clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
      enableSubscriptionTiers: true,
      enableDasAttestation: true,
      identityRpcUrl: process.env.SOLANA_RPC_URL,
    }),
  ],
});
```

That's it. Eight API endpoints are registered automatically. Your agent can now sign in, attest, and get tier-gated access.

### Client: Sign In

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

### Server: Attest

```ts
import { attestAgent, fetchWalletSnapshot, computeTier } from "@clawd/agent-auth-solana";

const opts = {
  heliusRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
};

// Full attestation — runs SIWS verification + DAS + balance check
const attestation = await attestAgent(agentId, walletAddress, opts);

// Wallet snapshot
const snapshot = await fetchWalletSnapshot(walletAddress, opts);

// Tier computation
const tier = computeTier(snapshot.clawdBalance);
// → { tier: "gold", nextTier: "diamond", clawdRequired: 1000000, clawdToNextTier: 4000000, percentToNext: 50 }
```

---

## Full Integration Guide

### Server Setup

#### 1. Install Dependencies

```bash
npm install better-auth better-auth-solana @clawd/agent-auth-solana
```

#### 2. Create auth.ts

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { siws } from "better-auth-solana";
import { createCaapPlugin } from "@clawd/agent-auth-solana";

export const auth = betterAuth({
  database: {
    provider: "postgresql", // or sqlite, mysql, etc.
    url: process.env.DATABASE_URL!,
  },
  plugins: [
    siws(),
    createCaapPlugin({
      // Required
      heliusApiKey: process.env.HELIUS_API_KEY!,

      // Optional — CLAWD token mint (defaults to mainnet CLAWD)
      clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",

      // Enable CAAP phases (all default to true)
      enableSubscriptionTiers: true,   // Phase 4
      enableDasAttestation: true,       // Phase 2

      // RPC for identity verification (Phases 5-6)
      // Defaults to Helius RPC if omitted
      identityRpcUrl: process.env.SOLANA_RPC_URL,

      // Tier gating configuration
      tierGating: {
        free: ["/caap/discovery"],
        bronze: ["/caap/discovery", "/caap/status"],
        silver: ["/caap/discovery", "/caap/status", "/caap/attest"],
        gold: ["/caap/discovery", "/caap/status", "/caap/attest", "/agent/identity"],
        diamond: ["/caap/discovery", "/caap/status", "/caap/attest", "/agent/identity", "/agent/token"],
      },
    }),
  ],
});
```

#### 3. Configure Environment Variables

```env
# .env
HELIUS_API_KEY=your-helius-api-key
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-helius-api-key
DATABASE_URL=postgresql://localhost:5432/auth
```

#### 4. Expose Route Handler (Next.js App Router)

```ts
// app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Client Integration

#### React / Next.js

```tsx
// components/SignInButton.tsx
import { useWallet } from "@solana/wallet-adapter-react";
import {
  createSiwsMessage,
  encodeSiwsForSubmit,
  generateNonce,
} from "@clawd/agent-auth-solana/client";

export function SignInButton() {
  const { publicKey, signMessage } = useWallet();

  const signIn = async () => {
    if (!publicKey || !signMessage) return;

    const address = publicKey.toBase58();
    const nonce = generateNonce();
    const message = createSiwsMessage({
      address,
      domain: window.location.hostname,
      nonce,
      statement: "Sign in to authenticate your agent.",
    });

    const signatureBytes = await signMessage(new TextEncoder().encode(message));
    const signature = Buffer.from(signatureBytes).toString("base64");

    const payload = encodeSiwsForSubmit(message, signature, address);

    const res = await fetch("/api/auth/sign-in/siws", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Signed in — session cookie set
      console.log("Authenticated as:", address);
    }
  };

  return <button onClick={signIn}>Sign In with Solana</button>;
}
```

#### Vanilla JS / Non-React

```ts
import { createSiwsMessage, encodeSiwsForSubmit, generateNonce } from "@clawd/agent-auth-solana/client";

async function signIn(wallet: { publicKey: PublicKey; signMessage: (msg: Uint8Array) => Promise<Uint8Array> }) {
  const address = wallet.publicKey.toBase58();
  const nonce = generateNonce();
  const message = createSiwsMessage({ address, domain: location.hostname, nonce });

  const sig = await wallet.signMessage(new TextEncoder().encode(message));
  const payload = encodeSiwsForSubmit(message, Buffer.from(sig).toString("base64"), address);

  await fetch("/api/auth/sign-in/siws", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

### Attestation Flow

Once signed in, run attestation to verify agent identity and get the subscription tier:

```ts
// Client request
const res = await fetch("/api/caap/attest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    agentId: "your-agent-id",
    walletAddress: "your-wallet-address",
  }),
});

const { verified, attestation, tee, tier } = await res.json();
// {
//   verified: true,
//   attestation: { hash: "sha256:...", timestamp: 1719000000 },
//   tee: { hasTeeEvidence: true, mrAggregated: "...", explorerUrl: "https://proof.t16z.com?attestation=..." },
//   tier: { tier: "gold", clawdRequired: 1000000, percentToNext: 50 }
// }
```

### Subscription Tiers & Gating

The tier system gates which API endpoints are accessible. Tiers are computed from CLAWD SPL token balance:

| Tier | CLAWD Required | Access |
|---|---|---|
| Free | 0 | `/caap/discovery` only |
| Bronze | 100,000 | Status checks, DAS lookups |
| Silver | 500,000 | Full attestation, agent card generation |
| Gold | 1,000,000 | Webhooks, multi-agent management |
| Diamond | 5,000,000 | Dedicated endpoint, SLA, white-label |

**Tier progress calculation:**

```
percentToNext = ((currentBalance - currentTierThreshold) / (nextTierThreshold - currentTierThreshold)) × 100
```

Example: Balance = 1,500,000 CLAWD (Gold tier)
- Current tier threshold: 1,000,000
- Next tier threshold (Diamond): 5,000,000
- Progress: (1,500,000 − 1,000,000) / (5,000,000 − 1,000,000) × 100 = **12.5%**

---

## Metaplex Agent Identity (EIP-8004)

### Overview

EIP-8004 is the Ethereum Improvement Proposal for **Agent Registration**. It defines a standard JSON schema for describing AI agents, their capabilities, services, and trust mechanisms. The Metaplex Agent Registry implements EIP-8004 on Solana, storing registration data on-chain via MPL Core assets.

Every agent registered through this library gets:
- **Global discoverability** — any EIP-8004 consumer can find and interact with your agent
- **On-chain identity** — verified via `AgentIdentity` PDA derived from the MPL Core asset
- **Asset Signer PDA wallet** — the agent can sign Solana transactions without ever holding a private key
- **Execution delegation** — off-chain operators can execute on behalf of the agent
- **Token binding** — permanent, irreversible link between agent and token

### Registration

```ts
import {
  buildEip8004Registration,
  buildRegisterIdentityParams,
  deriveAssetSignerPda,
  deriveAgentIdentityPda,
} from "@clawd/agent-auth-solana";

// Step 1: Build the EIP-8004 registration document
const doc = buildEip8004Registration({
  name: "My Solana DeFi Agent",
  description: "An autonomous agent that executes DeFi strategies on Solana.",
  image: "https://arweave.net/your-agent-avatar-tx-hash",
  assetPublicKey: "YOUR_MPL_CORE_ASSET_PUBKEY",

  // Services the agent exposes
  services: [
    {
      name: "A2A",
      endpoint: "https://myagent.com/agent-card.json",
      version: "0.3.0",
    },
    {
      name: "MCP",
      endpoint: "https://myagent.com/mcp",
      version: "2025-06-18",
    },
    {
      name: "web",
      endpoint: "https://myagent.com",
    },
  ],

  // Trust mechanisms the agent supports
  supportedTrust: ["reputation", "crypto-economic"],

  // Whether the agent accepts x402 payments
  x402Support: true,
});

// Step 2: Upload doc to permanent storage (Arweave, Irys, etc.)
const uri = "https://arweave.net/registration-json-hash";

// Step 3: Derive the agent's PDAs
const identityPda = deriveAgentIdentityPda(assetPublicKey);
// → The on-chain address where agent identity is stored

const agentWallet = deriveAssetSignerPda(assetPublicKey);
// → A wallet address controlled by the MPL Core asset
// → Can sign transactions via invoke_signed — no private key exists!

// Step 4: Build registration params → pass to Metaplex SDK
const params = buildRegisterIdentityParams({
  asset: assetPublicKey,
  collection: collectionPublicKey,  // optional but recommended
  agentRegistrationUri: uri,
});

// Step 5: Execute on-chain
import { registerIdentityV1 } from "@metaplex-foundation/mpl-agent-registry";
await registerIdentityV1(umi, params).sendAndConfirm(umi);
```

### Verification

Check if an agent is registered on-chain and fetch its EIP-8004 document:

```ts
import { verifyAgentRegistration, fetchAgentRegistrationDoc } from "@clawd/agent-auth-solana";

const result = await verifyAgentRegistration("ASSET_PUBKEY", rpcUrl);
// {
//   registered: true,
//   identityPda: "Ai3...",
//   uri: "https://arweave.net/registration-json-hash"
// }

if (result.uri) {
  const doc = await fetchAgentRegistrationDoc(result.uri);
  console.log(doc.name);        // "My Solana DeFi Agent"
  console.log(doc.services);     // [{ name: "A2A", ... }, { name: "MCP", ... }]
  console.log(doc.x402Support);  // true
  console.log(doc.agentToken);   // token mint (if setAgentTokenV1 was called)
}
```

### Execution Delegation

Allow an off-chain executive (e.g., a cloud function, bot, or automation) to sign transactions on behalf of the agent through Core's Execute lifecycle hook:

```ts
import { buildDelegateExecutionParams, deriveExecutiveProfilePda, deriveExecutionDelegateRecordPda } from "@clawd/agent-auth-solana";

// Derive PDAs
const executiveProfile = deriveExecutiveProfilePda(agentAsset, executiveWallet);
const delegateRecord = deriveExecutionDelegateRecordPda(agentAsset, executiveWallet);

// Build delegation params
const params = buildDelegateExecutionParams({
  agentAsset: "AGENT_ASSET_PUBKEY",
  executiveAuthority: "EXECUTIVE_WALLET_PUBKEY",
});

// Execute on-chain
import { delegateExecutionV1 } from "@metaplex-foundation/mpl-agent-registry";
await delegateExecutionV1(umi, params).sendAndConfirm(umi);

// Now the executive wallet can call:
// import { execute, findAssetSignerPda } from "@metaplex-foundation/mpl-core";
// await execute(umi, { asset, collection, instructions: [...] }).sendAndConfirm(umi);
```

---

## Agent Token Launch (Genesis Bonding Curve)

### Token-Agent Binding

The `setAgentTokenV1` instruction permanently and **irreversibly** binds an SPL token to the agent's MPL Core asset. This is the on-chain commitment that says "this token is the official token of this agent."

Once set:
- The token-agent bond is forever recorded on-chain
- Creator fees from bonding curve trades flow to the agent's Asset Signer PDA
- The agent's EIP-8004 registration document includes `agentToken` pointing to the token mint
- The bond **cannot** be changed or removed — it's a security guarantee for token holders

### Launch Flow

Launch a new token directly from the agent's Asset Signer PDA:

```ts
import { buildGenesisLaunchInput, validateGenesisLaunchInput } from "@clawd/agent-auth-solana";

const input = buildGenesisLaunchInput({
  agentAsset: "AGENT_ASSET_PUBKEY",
  setToken: true,        // ⚠️ IRREVERSIBLE — permanent token-agent binding
  payer: "PAYER_WALLET",
  tokenName: "Agent Token",
  tokenSymbol: "AGT",
  tokenImage: "https://gateway.irys.xyz/your-image-id",
  tokenDescription: "The official token of my agent — powers governance, fee sharing, and premium access.",
  firstBuyAmount: 0.1,   // 0.1 SOL fee-free first buy
  // Optional: custom bonding curve parameters
  // targetMarketCap: 100,  // SOL
  // curveType: "linear" | "exponential",
});

// Validate before sending
const errors = validateGenesisLaunchInput(input);
if (errors.length === 0) {
  // Pass to @metaplex-foundation/genesis:
  // await createAndRegisterLaunch(umi, {}, input).sendAndConfirm(umi);
} else {
  console.error("Validation errors:", errors);
}
```

**CLI equivalent:**

```bash
mplx genesis launch create --launchType bonding-curve \
  --name "Agent Token" \
  --symbol "AGT" \
  --image "https://gateway.irys.xyz/your-image-hash" \
  --agentAsset <AGENT_CORE_ASSET_ADDRESS> \
  --agentSetToken
```

**What happens after launch:**
1. Token is created by the agent's Asset Signer PDA
2. Bonding curve starts — buyers can purchase token at the curve price
3. Creator fees from each trade are sent to the agent PDA
4. When the bonding curve reaches its target, the token **graduates** to a Raydium CPMM pool
5. The token-agent binding is forever recorded on-chain

### Retroactive Binding

If you already launched a token without `setToken: true`, you can bind it retroactively:

```ts
import { buildSetAgentTokenParams } from "@clawd/agent-auth-solana";

const params = buildSetAgentTokenParams({
  agentAsset: "AGENT_ASSET_PUBKEY",
  agentCollection: "COLLECTION_PUBKEY",
  genesisAccount: "GENESIS_ACCOUNT_PUBKEY", // From Genesis launch
});

// Wrap in Core Execute:
// import { execute, findAssetSignerPda } from "@metaplex-foundation/mpl-core";
// import { setAgentTokenV1 } from "@metaplex-foundation/mpl-agent-registry";
// await execute(umi, {
//   asset,
//   collection,
//   instructions: setAgentTokenV1(umi, params)
// }).sendAndConfirm(umi);
```

---

## TEE Attestation (Phala TDX)

When you call `/api/caap/attest` through the relay (`https://relay.clawd.xyz`), the attestation verifier runs inside a **Phala TDX (Trust Domain Extensions)** confidential virtual machine. This means the code that verifies your wallet, checks your tokens, and computes your tier is executing in a hardware-encrypted environment — the relay operator cannot tamper with or observe the verification.

### What Gets Measured

The TEE attestation report includes measurements of the entire software stack running inside the enclave:

| Measurement | What It Covers |
|---|---|
| `MRTD` | The initial state of the TD — the kernel, initrd, and boot parameters |
| `RTMR0` | The docker-compose.yml hash — what containers are running |
| `RTMR1` | The Docker image hashes — exact versions of each container |
| `RTMR2` | Runtime environment — environment variables, configuration |
| `RTMR3` | Application-level measurement — the specific code + state |
| `MRAGGREGATED` | Aggregate of all measurements — changes if ANYTHING changes |

### TEE Response Fields

The `tee` object in the attestation response:

| Field | Type | Description |
|---|---|---|
| `appId` | `string` | Phala dstack application ID |
| `instanceId` | `string` | CVM instance identifier |
| `composeHash` | `string` | SHA-256 of the docker-compose.yml |
| `mrAggregated` | `string` | Aggregate measurement register |
| `mrtd` | `string` | TDX MRTD measurement |
| `rtmr0` | `string` | Runtime measurement register 0 (compose) |
| `rtmr1` | `string` | Runtime measurement register 1 (images) |
| `rtmr2` | `string` | Runtime measurement register 2 (env) |
| `rtmr3` | `string` | Runtime measurement register 3 (app) |
| `intelQuote` | `string` | Raw Intel TDX quote (base64-encoded) |
| `explorerUrl` | `string` | Link to proof.t16z.com for verification |
| `hasTeeEvidence` | `boolean` | `true` when quote generation succeeded |
| `tcbInfo` | `object?` | TCB recovery status (if available) |

### Verification Flow

```
1. Agent calls /caap/attest → relay (running in TDX enclave)
2. Relay verifies SIWS signature inside enclave
3. Relay queries DAS API, token balance inside enclave
4. Relay generates Intel TDX quote via Phala tappd
5. Response includes: attestation result + TDX quote + proof.t16z.com URL
6. Client can independently verify the quote at proof.t16z.com
```

To independently verify TEE evidence:

```ts
// Open the explorerUrl in a browser or verify programmatically
const tee = response.tee;
const isVerified = await fetch(`https://proof.t16z.com/api/verify/${tee.intelQuote}`);
```

---

## Clerk Integration

For applications using Clerk for user management, the `@clawd/clerk-caap` package bridges Clerk session tokens with CAAP/1.0 attestation:

```ts
import { verifyClerkToken, fetchPhalaAttestation } from "@clawd/clerk-caap";

// 1. Verify the Clerk session token (from the client)
const claims = await verifyClerkToken(sessionToken);
// → { sub, wallet_address, agent_id, iat, exp }

// 2. Run full CAAP attestation using the wallet address from Clerk metadata
const res = await fetch("https://relay.clawd.xyz/api/caap/attest", {
  method: "POST",
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: JSON.stringify({ walletAddress: claims.wallet_address }),
});

const { verified, attestation, tee, tier } = await res.json();
```

**Clerk setup requirements:**
1. Store the user's Solana wallet address in `publicMetadata.wallet_address`
2. Create a JWT template named `solana_wallet` that exposes `wallet_address` and `agent_id`
3. Use the `<your-clerk-instance>.accounts.dev` domain for sign-in/up flows

For Next.js, add middleware to protect CAAP endpoints:

```ts
// middleware.ts
import { createClerkCaapMiddleware } from "@clawd/clerk-caap/middleware";

export const middleware = createClerkCaapMiddleware({
  protectedPaths: [/^\/api\/caap\/attest/],
  publicPaths: [/^\/api\/caap\/discovery/, /^\/api\/siws\//],
});
```

---

## API Reference

### Plugin Configuration

```ts
createCaapPlugin({
  // === Required ===
  heliusApiKey: string;
  // Your Helius API key — used for DAS API (NFT detection) and RPC

  // === Optional ===
  clawdMint?: PublicKey | string;
  // Default: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
  // The CLAWD SPL token mint for balance checks

  enableSubscriptionTiers?: boolean;
  // Default: true
  // Enable/disable tier gating on endpoints

  enableDasAttestation?: boolean;
  // Default: true
  // Enable/disable Helius DAS NFT verification

  identityRpcUrl?: string;
  // Default: auto-derived from heliusApiKey
  // Separate RPC URL for on-chain identity verification (Phases 5-6)

  tierGating?: {
    free?: string[];     // Default: ["/caap/discovery"]
    bronze?: string[];   // Default: ["/caap/discovery", "/caap/status"]
    silver?: string[];   // Default: includes attest
    gold?: string[];     // Default: includes identity
    diamond?: string[];  // Default: includes token launch
  };
  // Customize which endpoints are accessible per tier
})
```

### Server APIs

| Endpoint | Method | Auth | Tier | Description |
|---|---|---|---|---|
| `/caap/attest` | POST | Session | Silver+ | Full attestation: SIWS + DAS + balance + tier + TEE |
| `/caap/status/:agentId` | GET | None | Bronze+ | Lightweight verified/unverified check |
| `/caap/discovery` | GET | None | Free+ | CAAP/1.0 protocol discovery document |
| `/agent/identity/register` | POST | Session | Gold+ | Build EIP-8004 doc + registerIdentityV1 params |
| `/agent/identity/verify/:asset` | GET | None | Silver+ | Check on-chain Metaplex Agent Registry registration |
| `/agent/identity/delegate` | POST | Session | Gold+ | Build delegateExecutionV1 params |
| `/agent/token/set` | POST | Session | Diamond+ | Build setAgentTokenV1 params (irreversible) |
| `/agent/token/launch` | POST | Session | Diamond+ | Build Genesis bonding curve launch input |

#### POST /caap/attest

**Request:**
```json
{
  "agentId": "string",
  "walletAddress": "string (base58 Solana address)"
}
```

**Response:**
```json
{
  "verified": true,
  "agentNftAddress": "string | null",
  "attestation": {
    "hash": "sha256:abc123...",
    "timestamp": 1719000000,
    "agentId": "string",
    "walletAddress": "string"
  },
  "tokenBalance": "1500000",
  "tier": {
    "tier": "gold",
    "clawdRequired": 1000000,
    "clawdToNextTier": 4000000,
    "percentToNext": 12.5
  },
  "tee": {
    "hasTeeEvidence": true,
    "mrAggregated": "abc123...",
    "mrtd": "def456...",
    "rtmr0": "...",
    "rtmr1": "...",
    "rtmr2": "...",
    "rtmr3": "...",
    "intelQuote": "base64...",
    "explorerUrl": "https://proof.t16z.com/?attestation=..."
  },
  "snapshot": {
    "walletAddress": "string",
    "solBalance": "10.5",
    "clawdBalance": "1500000",
    "tokenAccounts": [],
    "fetchedAt": 1719000000
  }
}
```

#### GET /caap/status/:agentId

**Query params:** `?wallet=<walletAddress>`

**Response:**
```json
{
  "verified": true,
  "tier": "gold"
}
```

#### GET /caap/discovery

**Response:**
```json
{
  "protocol": "CAAP/1.0",
  "phases": ["SIWS", "DAS", "TokenAttestation", "SubscriptionTier", "OnChainIdentity", "TokenLaunch"],
  "endpoints": {
    "attest": "/caap/attest",
    "status": "/caap/status/:agentId",
    "discovery": "/caap/discovery"
  },
  "network": "solana-mainnet",
  "teeProvider": "phala-tdx"
}
```

### Client APIs

```ts
// SIWS client helpers
import {
  generateNonce,        // (length?: number) => string
  createSiwsMessage,    // (params: SiwsMessageParams) => string
  encodeSiwsForSubmit,  // (message, signature, address) => object
} from "@clawd/agent-auth-solana/client";

// SIWS message params
interface SiwsMessageParams {
  address: string;        // Solana wallet address
  domain: string;         // Hostname of the requesting site
  nonce: string;          // Random nonce for replay protection
  statement?: string;     // Human-readable sign-in statement
  uri?: string;           // URI of the requesting resource
  chainId?: string;       // Solana chain (default: "mainnet")
  issuedAt?: string;      // ISO timestamp
}
```

### Identity & Token APIs

```ts
// EIP-8004 Registration
buildEip8004Registration(params: Eip8004Params): Eip8004Doc
buildRegisterIdentityParams(params: RegisterIdentityParams): RegisterIdentityV1Args
deriveAgentIdentityPda(asset: PublicKey): PublicKey
deriveAssetSignerPda(asset: PublicKey): PublicKey

// Execution Delegation
buildDelegateExecutionParams(params: DelegateExecutionParams): DelegateExecutionV1Args
deriveExecutiveProfilePda(asset: PublicKey, executive: PublicKey): PublicKey
deriveExecutionDelegateRecordPda(asset: PublicKey, executive: PublicKey): PublicKey

// Token Launch
buildGenesisLaunchInput(params: GenesisLaunchParams): GenesisLaunchInput
validateGenesisLaunchInput(input: GenesisLaunchInput): string[] // returns errors
buildSetAgentTokenParams(params: SetAgentTokenParams): SetAgentTokenV1Args

// On-chain verification
verifyAgentRegistration(asset: PublicKey, rpcUrl: string): Promise<VerificationResult>
fetchAgentRegistrationDoc(uri: string): Promise<Eip8004Doc>
```

### Verification APIs

```ts
import {
  attestAgent,           // Full attestation: SIWS + DAS + balance
  fetchWalletSnapshot,   // Get wallet's SOL + CLAWD + token accounts
  computeTier,           // Compute tier from CLAWD balance
  tierLabel,             // Human-readable tier label
  TIER_THRESHOLDS,       // Constants: tier thresholds
  createSiwsInput,       // Server-side SIWS message creation
  verifySiws,            // Verify a signed SIWS message
} from "@clawd/agent-auth-solana";

import {
  verifyCaapAttestation, // Verify attestation hash
  createCaapHash,        // Create attestation hash
} from "@clawd/agent-auth-solana/verify";
```

---

## Contract Addresses & Constants

| Constant | Value |
|---|---|
| **CLAWD Mint** | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |
| **Protocol Version** | `CAAP/1.0` |
| **Network** | `solana:101:mainnet-beta` |
| **Metaplex Agent Registry Program** | `solana:101:metaplex` |
| **MPL Core Program** | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| **EIP-8004 Schema** | `https://eips.ethereum.org/EIPS/eip-8004#registration-v1` |
| **Genesis API** | `https://api.metaplex.com` |
| **TEE Verifier** | `https://proof.t16z.com` |
| **Relay** | `https://relay.clawd.xyz` |
| **Phala tappd endpoint** | `http://localhost:8090` (inside TEE CVM) |

---

## Tier Gating Reference

### Complete Tier Table

| Tier | CLAWD Required | Accessible Endpoints | Features |
|---|---|---|---|
| **Free** | 0 | `/caap/discovery` | Protocol discovery, docs |
| **Bronze** | 100,000 | + `/caap/status` | Status checks, DAS lookups, peer agent cards |
| **Silver** | 500,000 | + `/caap/attest` | Full attestation, agent card generation, history |
| **Gold** | 1,000,000 | + `/agent/identity/*` | Webhooks, multi-agent management, team accounts, identity registration |
| **Diamond** | 5,000,000 | + `/agent/token/*` | Token launch, dedicated infrastructure, SLA, white-label |

### Tier Computation Math

```ts
// Progress toward next tier:
const progress = (currentBalance - currentTierMin) / (nextTierMin - currentTierMin);
const percentToNext = Math.round(progress * 100);

// For a Gold-tier wallet with 3,000,000 CLAWD:
// progress = (3,000,000 - 1,000,000) / (5,000,000 - 1,000,000) = 2,000,000 / 4,000,000 = 0.5
// percentToNext = 50

// For a Gold-tier wallet with 1,000,000 CLAWD (exactly at Gold minimum):
// progress = (1,000,000 - 1,000,000) / (5,000,000 - 1,000,000) = 0 / 4,000,000 = 0
// percentToNext = 0

// For a Diamond-tier wallet (at max):
// percentToNext = 100 (no next tier)
```

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| `siws_invalid_signature` | 401 | SIWS signature verification failed |
| `siws_expired_nonce` | 401 | Nonce has expired or was already used |
| `das_no_agent_nft` | 403 | No agent NFT found in wallet |
| `das_query_failed` | 502 | Helius DAS API query failed |
| `insufficient_clawd` | 403 | CLAWD balance below tier requirement |
| `tier_insufficient` | 403 | Subscription tier doesn't grant access to this endpoint |
| `identity_not_registered` | 404 | Agent has no on-chain identity (register first) |
| `agent_not_found` | 404 | Agent ID not found |
| `tee_quote_failed` | 500 | TEE quote generation failed |
| `clerk_token_invalid` | 401 | Clerk session token verification failed |
| `genesis_validation_failed` | 400 | Genesis launch input validation errors |
| `set_token_already_bound` | 409 | Token already bound to agent (cannot change) |
| `delegate_already_exists` | 409 | Execution delegate already registered |

---

## Migration Guide

### From v0.x to v1.0

**Breaking changes:**
- `createSiwsMessage` moved from `@clawd/agent-auth-solana` to `@clawd/agent-auth-solana/client`
- `attestAgent()` signature changed — now requires `opts` object with `heliusRpcUrl` and `clawdMint`
- `computeTier()` now returns `clawdToNextTier` (number) instead of `clawdToNext` (string)
- `TIER_THRESHOLDS` is now a const record instead of an enum

**New features:**
- EIP-8004 agent identity registration
- Genesis bonding curve token launch
- Asset Signer PDA derivation
- Execution delegation
- TEE attestation response fields
- `validateGenesisLaunchInput` validation
- `fetchAgentRegistrationDoc` for EIP-8004 doc retrieval

### Migrating from custom SIWS

If you implemented SIWS manually before using this library:

```ts
// Before (manual SIWS):
const message = `${domain} wants you to sign in with your Solana account:\n${address}\n\nSign in to attest your agent.\n\nURI: ${uri}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

// After (using the library):
import { createSiwsMessage } from "@clawd/agent-auth-solana/client";
const message = createSiwsMessage({ address, domain, nonce });
```

---

## FAQ

### What's the difference between this and better-auth-solana?

`better-auth-solana` provides basic SIWS sign-in. `@clawd/agent-auth-solana` extends it with the full CAAP/1.0 protocol stack: NFT verification, token balance attestation, subscription tiers, on-chain identity, execution delegation, token launch, and TEE attestation.

### Do I need to use the Metaplex SDKs directly?

For registration, delegation, and token launches: yes. This library generates the **params** for Metaplex instructions (`registerIdentityV1`, `delegateExecutionV1`, `setAgentTokenV1`, `createAndRegisterLaunch`), but you need `@metaplex-foundation/mpl-agent-registry`, `@metaplex-foundation/mpl-core`, and `@metaplex-foundation/genesis` to execute them on-chain.

### Can I use this without Better Auth?

Yes. All server-side functions (`attestAgent`, `computeTier`, `fetchWalletSnapshot`, `createSiwsInput`, `verifySiws`, etc.) work independently of Better Auth. The `createCaapPlugin` is a convenience wrapper that registers the endpoints automatically.

### Is the CLAWD mint configurable?

Yes. Pass any SPL mint address to `clawdMint` in the plugin config (or via the function options). You can use any SPL token for gating — it doesn't have to be CLAWD.

### How do TEE attestation quotes get verified?

The `explorerUrl` field links to `proof.t16z.com`, where you can independently verify the Intel TDX quote. You can also verify programmatically using Phala's tappd SDK or the Intel SGX/TDX attestation verification service.

### What happens if the relay is down?

You can run your own relay or call the attestation functions directly from your server. The relay is a convenience deployment — the library works standalone. See `apps/relay/` in the repository for the relay code.

### Can I unbind an agent token?

No. `setAgentTokenV1` is **irreversible**. This is a security feature — it prevents agents from repeatedly switching tokens in pump-and-dump schemes.

---

## Related SDKs

| SDK | Role | Package |
|---|---|---|
| **better-auth-solana** | SIWS wallet auth | `npm install better-auth-solana` |
| **mpl-agent-registry** | On-chain identity, delegation, token binding | `@metaplex-foundation/mpl-agent-registry` |
| **mpl-core** | MPL Core asset, Asset Signer PDA, Execute hook | `@metaplex-foundation/mpl-core` |
| **genesis** | Bonding curve token launch | `@metaplex-foundation/genesis` |
| **@clawd/clerk-caap** | Clerk session → CAAP bridge | `npm install @clawd/clerk-caap` |
| **@auth/agent** | Agent Auth Protocol client SDK | `npm install @auth/agent` |
| **@auth/agent-cli** | Agent Auth CLI + MCP server | `npm install @auth/agent-cli` |

---

## Community & Support

- **Live Demo**: [x402.wtf/agentauth](https://x402.wtf/agentauth)
- **Whitepaper**: [x402.wtf/agentauth#paper](https://x402.wtf/agentauth#paper)
- **CAAP/1.0 Spec**: [x402.wtf/agentauth#spec](https://x402.wtf/agentauth#spec)
- **Relay**: [relay.clawd.xyz](https://relay.clawd.xyz)
- **TEE Proofs**: [proof.t16z.com](https://proof.t16z.com)
- **GitHub**: [github.com/Solizardking/agent-auth](https://github.com/Solizardking/agent-auth)
- **NPM**: [@clawd/agent-auth-solana](https://npmjs.com/package/@clawd/agent-auth-solana)
- **Solana Pay Service**: [pay.sh/services/auth/agent](https://pay.sh/services/auth/agent)

---

## License

MIT — Clawd Labs, 2026