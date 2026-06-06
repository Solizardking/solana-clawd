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
- Registering on-chain agent identities via the Metaplex Agent Registry (EIP-8004)
- Launching agent tokens via Genesis bonding curves with permanent token-agent binding
- Delegating execution to off-chain operators via Core's Execute lifecycle hook

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

### Phase 5 — On-Chain Identity (Metaplex Agent Registry)

Register a globally discoverable on-chain agent identity bound to an MPL Core asset, with EIP-8004 metadata, Asset Signer PDA wallet, and execution delegation.

```ts
import {
  buildEip8004Registration,
  buildRegisterIdentityParams,
  deriveAssetSignerPda,
  deriveAgentIdentityPda,
  buildDelegateExecutionParams,
} from "@clawd/agent-auth-solana";

// 1. Build the EIP-8004 registration document
const doc = buildEip8004Registration({
  name: "My Agent",
  description: "An autonomous agent that...",
  image: "https://arweave.net/avatar-hash",
  assetPublicKey: "<CORE_ASSET>",
  services: [
    { name: "A2A", endpoint: "https://myagent.com/agent-card.json", version: "0.3.0" },
    { name: "MCP", endpoint: "https://myagent.com/mcp", version: "2025-06-18" },
  ],
  supportedTrust: ["reputation", "crypto-economic"],
  x402Support: true,
});

// 2. Derive PDAs
const identityPda = deriveAgentIdentityPda(assetPublicKey);
const walletPda = deriveAssetSignerPda(assetPublicKey); // agent's wallet, no private key

// 3. Build registerIdentityV1 params → pass to @metaplex-foundation/mpl-agent-registry
const params = buildRegisterIdentityParams({
  asset: assetPublicKey,
  collection: collectionPublicKey,
  agentRegistrationUri: "https://arweave.net/registration-json",
});

// 4. Delegate execution to an off-chain operator
const delegateParams = buildDelegateExecutionParams({
  agentAsset: assetPublicKey,
  executiveAuthority: executiveWallet,
});
```

### Phase 6 — Token Launch (Genesis Bonding Curve)

Launch an agent token from the Asset Signer PDA with permanent token-agent binding via `setAgentTokenV1`.

```ts
import { buildGenesisLaunchInput, validateGenesisLaunchInput } from "@clawd/agent-auth-solana";

const input = buildGenesisLaunchInput({
  agentAsset: "<CORE_ASSET>",
  setToken: true,        // irreversible — permanent token-agent binding
  payer: "<PAYER>",
  tokenName: "Agent Token",
  tokenSymbol: "AGT",
  tokenImage: "https://gateway.irys.xyz/your-image-id",
  tokenDescription: "The official token of my agent",
  firstBuyAmount: 0.1,   // 0.1 SOL fee-free first buy
});

const errors = validateGenesisLaunchInput(input);
// → pass to @metaplex-foundation/genesis to execute
```

**CLI equivalent:**

```bash
mplx genesis launch create --launchType bonding-curve \
  --name "Agent Token" --symbol "AGT" \
  --image "https://gateway.irys.xyz/your-image-hash" \
  --agentAsset <AGENT_CORE_ASSET_ADDRESS> --agentSetToken
```

## Tier Thresholds

| Tier    | CLAWD Required | Notes                        |
|---------|---------------|------------------------------|
| free    | 0             | Basic read access            |
| bronze  | 100,000       | DAS lookup, peer card        |
| silver  | 500,000       | History, multi-agent mgmt    |
| gold    | 1,000,000     | Webhooks, team accounts      |
| diamond | 5,000,000     | Dedicated node, SLA, white-label |

## Better Auth Plugin

Registers eight endpoints on a Better Auth server covering CAAP attestation, Metaplex identity registration, execution delegation, and token launch:

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
      identityRpcUrl: process.env.SOLANA_RPC_URL,  // optional
    }),
  ],
});
```

**Registered endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/caap/attest` | POST | Full attestation + wallet snapshot + tier |
| `/caap/status/:agentId` | GET | Lightweight verified/unverified check |
| `/caap/discovery` | GET | CAAP/1.0 protocol discovery document |
| `/agent/identity/register` | POST | Build EIP-8004 doc + registerIdentityV1 params |
| `/agent/identity/verify/:asset` | GET | Check on-chain Metaplex Agent Registry registration |
| `/agent/identity/delegate` | POST | Build delegateExecutionV1 params |
| `/agent/token/set` | POST | Build setAgentTokenV1 params (irreversible binding) |
| `/agent/token/launch` | POST | Build Genesis bonding curve launch input |

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

## On-Chain Identity Verification

```ts
import { verifyAgentRegistration, fetchAgentRegistrationDoc } from "@clawd/agent-auth-solana";

// Check if an MPL Core asset has a registered identity
const result = await verifyAgentRegistration(assetPublicKey, rpcUrl);
// result: { registered: boolean, identityPda?: string, uri?: string }

// Fetch the full EIP-8004 registration document
if (result.uri) {
  const doc = await fetchAgentRegistrationDoc(result.uri);
  // doc: { name, description, services[], x402Support, agentToken, ... }
}
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
- Metaplex Agent Registry: `solana:101:metaplex`
- EIP-8004 schema: `https://eips.ethereum.org/EIPS/eip-8004#registration-v1`
- Genesis API base: `https://api.metaplex.com`
- Token program: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  CAAP/1.0 Protocol                    │
├──────────────────────────────────────────────────────┤
│  Phase 1: SIWS (Sign In With Solana)                 │
│  Phase 2: DAS Verification (Helius NFT check)        │
│  Phase 3: Token Attestation (CLAWD balance)          │
│  Phase 4: Subscription Tier (gating)                 │
├──────────────────────────────────────────────────────┤
│  Metaplex Agent Identity (Global On-Chain)            │
│  ├─ EIP-8004 Registration Document                   │
│  ├─ AgentIdentity PDA (discoverable)                 │
│  ├─ Asset Signer PDA (agent wallet, no private key)  │
│  ├─ Execution Delegate Record (off-chain operator)   │
│  └─ setAgentTokenV1 (permanent token binding)        │
├──────────────────────────────────────────────────────┤
│  Genesis Token Launch                                 │
│  ├─ Bonding Curve from Agent PDA                     │
│  ├─ Creator Fees → Agent PDA                         │
│  ├─ First Buy (fee-free)                             │
│  └─ Raydium CPMM Graduation                          │
└──────────────────────────────────────────────────────┘
```

## Demo and Spec

- Live demo: [x402.wtf/agentauth](https://x402.wtf/agentauth)
- Whitepaper: [x402.wtf/agentauth#paper](https://x402.wtf/agentauth#paper)
- Source: `agent-auth-main/packages/agent-auth-solana/`
- Main project SIWS: `src/lib/agents/siws.ts`
- Main project attestation: `src/lib/agents/attestation.ts`
- Main project subscription: `src/lib/agents/subscription.ts`