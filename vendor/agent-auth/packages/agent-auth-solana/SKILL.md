# CAAP Skill — Clawd Agent Attestation Protocol

## Overview

CAAP/1.0 is a Solana-native protocol for AI agent identity, verification, and subscription gating. Use this skill when you need to:

- Authenticate an AI agent using Sign In With Solana (SIWS)
- Verify agent NFT ownership via Helius DAS API
- Check CLAWD token balance for subscription tier gating
- Register on-chain agent identities via the Metaplex Agent Registry (EIP-8004)
- Launch agent tokens via Genesis bonding curves with permanent token-agent binding
- Delegate execution to off-chain operators via Core's Execute lifecycle hook
- Integrate Better Auth with Solana wallet sign-in
- Implement token-gated agent features
- Validate TEE attestation proofs from Phala TDX
- Bridge Clerk session tokens with CAAP/1.0 attestation
- Verify on-chain agent identity and fetch EIP-8004 registration documents

## Package

```
@clawd/agent-auth-solana
```

Located at: `agent-auth-main/packages/agent-auth-solana/`

## When to Use This Skill

Use CAAP when any of these patterns appear:
- User needs Solana wallet sign-in for an AI agent
- User wants token-gated API access based on SPL balance
- User needs to verify an agent owns specific NFTs
- User asks about "agent identity", "agent attestation", or "agent verification"
- User wants to register an agent on-chain via Metaplex
- User wants to launch a token for their agent
- User mentions "SIWS", "DAS", "CAAP", "Clawd", or "x402 agent auth"
- User needs TEE/hardware attestation for agent verification
- User wants to delegate agent execution to an operator

## Protocol Phases

### Phase 1: SIWS Authentication

EIP-4361-style Sign In With Solana. The agent wallet signs a structured message to prove ownership.

```ts
import { createSiwsInput, verifySiws } from "@clawd/agent-auth-solana";

// Server: create the input
const input = createSiwsInput({ address: walletAddress, nonce });
// Returns: { domain, address, statement, uri, version, chainId, nonce, issuedAt }

// Client: build the message string and sign it
// Server: verify the signed output
const valid = verifySiws(input, { account, signature, signedMessage });
// Returns: boolean

// Client-side helpers (browser-safe, no nacl dependency):
import { createSiwsMessage, encodeSiwsForSubmit, generateNonce } from "@clawd/agent-auth-solana/client";

const nonce = generateNonce(16); // 16-byte hex nonce
const message = createSiwsMessage({
  address: wallet.publicKey.toBase58(),
  domain: window.location.hostname,
  nonce,
  statement: "Sign in to authenticate your agent with CAAP/1.0.",
  uri: window.location.origin,
  chainId: "mainnet",
});
const payload = encodeSiwsForSubmit(message, signature, address);
// POST to /api/auth/sign-in/siws
```

**SIWS Message Format:**
```
{domain} wants you to sign in with your Solana account:
{address}

{statement}

URI: {uri}
Version: 1
Chain ID: {chainId}
Nonce: {nonce}
Issued At: {issuedAt}
```

**Security considerations:**
- Nonces must be single-use and time-bound (default: 5 minute expiry)
- The domain must match the requesting origin
- Chain ID should be "mainnet" for production attestations
- Signatures are verified using `tweetnacl` against the wallet's public key

### Phase 2: DAS Verification

Helius Digital Asset Standard API (`getAssetsByOwner`) is called to find agent NFTs in the wallet. The query filters for MPL Core assets with names containing "agent" or "clawd".

Additionally, `getAccountInfo` on the `agentId` account checks for Metaplex Agent Registry presence, confirming the agent has on-chain identity.

**What gets verified:**
1. Wallet owns at least one MPL Core asset
2. The asset name matches agent-naming patterns
3. (Optional) The asset is registered in the Metaplex Agent Registry

**Configuration:**
```ts
// Requires HELIUS_API_KEY environment variable
// Uses Helius RPC: https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}
```

**Error conditions:**
- `das_no_agent_nft` — no qualifying NFT found (403)
- `das_query_failed` — Helius API unreachable (502)

### Phase 3: Token Attestation

```ts
import { attestAgent } from "@clawd/agent-auth-solana";

const result = await attestAgent(agentId, walletAddress, {
  heliusRpcUrl: "https://mainnet.helius-rpc.com/?api-key=...",
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
});
// result.verified, result.tokenBalance, result.attestationHash

// The attestation hash is SHA-256(agentId + wallet + mint + timestamp)
// Verifiers can recompute for independent verification
```

**What happens during attestation:**
1. SIWS signature is verified (proves wallet control)
2. DAS API checks for agent NFTs (proves agent identity)
3. `getTokenAccountsByOwner` queries CLAWD SPL balance (proves economic stake)
4. SHA-256 hash is computed over all attestation data
5. (If via relay) TEE quote is generated proving the verifier ran in hardware enclave

**Attestation response structure:**
```json
{
  "verified": true,
  "agentNftAddress": "ABC123...",
  "tokenBalance": "1500000",
  "attestation": {
    "hash": "sha256:def789...",
    "timestamp": 1719000000,
    "agentId": "string",
    "walletAddress": "string"
  }
}
```

### Phase 4: Subscription Tier

```ts
import { computeTier, tierLabel, TIER_THRESHOLDS } from "@clawd/agent-auth-solana";

const tier = computeTier(clawdBalance);
// {
//   tier: "gold",
//   clawdRequired: 1000000,
//   nextTier: "diamond",
//   clawdToNextTier: 4000000,
//   percentToNext: 12.5
// }
```

**Tier Thresholds:**

| Tier | CLAWD Required | Features |
|------|---------------|----------|
| Free | 0 | Protocol discovery only (`/caap/discovery`) |
| Bronze | 100,000 | Status checks, DAS lookups (+ `/caap/status`) |
| Silver | 500,000 | Full attestation (+ `/caap/attest`) |
| Gold | 1,000,000 | Agent identity, webhooks, multi-agent (+ `/agent/identity/*`) |
| Diamond | 5,000,000 | Token launch, dedicated infra (+ `/agent/token/*`) |

**Tier Gating Rules (enforced by plugin middleware):**
- **Free**: `/caap/discovery` only
- **Bronze**: `/caap/discovery`, `/caap/status/:agentId`
- **Silver**: All of Bronze + `/caap/attest`, `/agent/identity/verify/:asset`
- **Gold**: All of Silver + `/agent/identity/register`, `/agent/identity/delegate`
- **Diamond**: All endpoints including `/agent/token/set`, `/agent/token/launch`

**Computation math:**
```
percentToNext = ((balance - currentTierMin) / (nextTierMin - currentTierMin)) * 100
```
- Diamond tier always returns `percentToNext: 100` (no next tier)
- At exactly a tier minimum: `percentToNext: 0`

### Phase 5: On-Chain Identity (Metaplex Agent Registry)

Register a globally discoverable on-chain agent identity bound to an MPL Core asset.

#### EIP-8004 Registration Document

Every agent gets an EIP-8004-compliant registration document, making it globally discoverable across the Metaplex Agent Registry and any EIP-8004 consumer.

```ts
import {
  buildEip8004Registration,
  buildRegisterIdentityParams,
  deriveAssetSignerPda,
  deriveAgentIdentityPda,
} from "@clawd/agent-auth-solana";

// Build the EIP-8004 registration document
const doc = buildEip8004Registration({
  name: "Plexpert",
  description: "An informational agent providing help related to Metaplex protocols and tools.",
  image: "https://arweave.net/agent-avatar-tx-hash",
  assetPublicKey: "ABC123...",
  services: [
    { name: "web", endpoint: "https://metaplex.com/agent/ABC123" },
    { name: "A2A", endpoint: "https://metaplex.com/agent/ABC123/agent-card.json", version: "0.3.0" },
    { name: "MCP", endpoint: "https://metaplex.com/agent/ABC123/mcp", version: "2025-06-18" },
  ],
  supportedTrust: ["reputation", "crypto-economic"],
  x402Support: true,
});

// Derive the agent's identity PDA (makes it discoverable on-chain)
const identityPda = deriveAgentIdentityPda("ABC123...");

// Derive the asset signer PDA (agent's wallet, NO PRIVATE KEY)
const assetSignerPda = deriveAssetSignerPda("ABC123...");
```

**EIP-8004 Document Schema:**
```json
{
  "name": "string",
  "description": "string",
  "image": "string (URI)",
  "assetPublicKey": "string (base58)",
  "services": [
    {
      "name": "string (A2A | MCP | web | custom)",
      "endpoint": "string (URL)",
      "version": "string (optional)"
    }
  ],
  "supportedTrust": ["reputation", "crypto-economic", "tee"],
  "x402Support": "boolean",
  "agentToken": "string (optional, set after setAgentTokenV1)"
}
```

#### On-Chain Registration

```ts
import { buildRegisterIdentityParams } from "@clawd/agent-auth-solana";
// Then pass to @metaplex-foundation/mpl-agent-registry:
import { registerIdentityV1 } from "@metaplex-foundation/mpl-agent-registry";

const params = buildRegisterIdentityParams({
  asset: "MPL_CORE_ASSET_PUBKEY",
  collection: "COLLECTION_PUBKEY", // optional but recommended
  agentRegistrationUri: "https://arweave.net/registration-json-hash",
});

await registerIdentityV1(umi, params).sendAndConfirm(umi);
```

**Registration flow:**
1. Upload EIP-8004 JSON to permanent storage (Arweave, Irys, IPFS)
2. Call `buildRegisterIdentityParams()` to generate instruction args
3. Execute `registerIdentityV1` via `@metaplex-foundation/mpl-agent-registry`
4. The agent is now globally discoverable on Solana

#### Verify On-Chain Registration

```ts
import { verifyAgentRegistration, fetchAgentRegistrationDoc } from "@clawd/agent-auth-solana";

const result = await verifyAgentRegistration("ASSET_PUBKEY", rpcUrl);
console.log("Registered:", result.registered);
console.log("Identity PDA:", result.identityPda);

// Fetch the full EIP-8004 doc from the on-chain URI
if (result.uri) {
  const doc = await fetchAgentRegistrationDoc(result.uri);
  console.log(doc.name, doc.description);
  console.log("Services:", doc.services);
  console.log("x402 enabled:", doc.x402Support);
  console.log("Agent Token:", doc.agentToken || "not bound");
}
```

**Verification result:**
```json
{
  "registered": true,
  "identityPda": "Ai3...",
  "uri": "https://arweave.net/..."
}
```

## Execution Delegation

Allow an off-chain executive to sign transactions on behalf of the agent through Core's Execute lifecycle hook.

```ts
import {
  buildDelegateExecutionParams,
  deriveExecutiveProfilePda,
  deriveExecutionDelegateRecordPda,
} from "@clawd/agent-auth-solana";

const params = buildDelegateExecutionParams({
  agentAsset: "AGENT_ASSET_PUBKEY",
  executiveAuthority: "EXECUTIVE_WALLET_PUBKEY",
});

// Then pass to @metaplex-foundation/mpl-agent-registry:
import { delegateExecutionV1 } from "@metaplex-foundation/mpl-agent-registry";
await delegateExecutionV1(umi, params).sendAndConfirm(umi);
```

**Use cases for execution delegation:**
- Cloud functions/bots executing trades on behalf of the agent
- Scheduled automation (cron jobs) signing agent transactions
- Multi-operator setups where a team manages the agent
- Programmatic operations that need the agent's Asset Signer PDA authority

**Security model:**
- The delegate can only act through `Core.execute()`, not directly
- The agent's Asset Signer PDA (no private key) is the signer
- Delegation can be revoked on-chain
- All delegated transactions are recorded on-chain

## Agent Token Launch (Genesis Bonding Curve)

Launch a token from the agent's Asset Signer PDA with a permanent token-agent binding (setAgentTokenV1).

### Build and Validate Launch Input

```ts
import {
  buildGenesisLaunchInput,
  validateGenesisLaunchInput,
} from "@clawd/agent-auth-solana";

const input = buildGenesisLaunchInput({
  agentAsset: "AGENT_ASSET_PUBKEY",
  setToken: true, // ⚠️ IRREVERSIBLE — permanent binding
  payer: "PAYER_WALLET",
  tokenName: "Agent Token",
  tokenSymbol: "AGT",
  tokenImage: "https://gateway.irys.xyz/your-image-id",
  tokenDescription: "The official token of my agent",
  firstBuyAmount: 0.1, // 0.1 SOL fee-free first buy
  // Optional bonding curve customizations:
  // targetMarketCap: 100, // in SOL
  // curveType: "linear" | "exponential"
});

const errors = validateGenesisLaunchInput(input);
if (errors.length === 0) {
  // Then pass to @metaplex-foundation/genesis:
  // await createAndRegisterLaunch(umi, {}, input).sendAndConfirm(umi);
}
```

**Validation checks performed:**
- Agent asset public key is valid base58
- Token name is non-empty and ≤32 characters
- Token symbol is non-empty and ≤10 characters
- Token image is a valid URL
- Token description is non-empty
- First buy amount is a positive number
- Payer wallet is a valid base58 public key

### CLI Equivalent

```bash
mplx genesis launch create --launchType bonding-curve \
  --name "Agent Token" \
  --symbol "AGT" \
  --image "https://gateway.irys.xyz/your-image-hash" \
  --agentAsset <AGENT_CORE_ASSET_ADDRESS> \
  --agentSetToken
```

### Token Launch Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│ 1. buildGenesisLaunchInput() + validateGenesisLaunchInput()  │
│    → Validate all launch parameters                          │
├──────────────────────────────────────────────────────────────┤
│ 2. createAndRegisterLaunch(umi, {}, input)                   │
│    → SPL token created from Asset Signer PDA                 │
│    → Bonding curve initialized                               │
│    → setAgentTokenV1 called (if setToken: true)              │
├──────────────────────────────────────────────────────────────┤
│ 3. Bonding Curve Active                                      │
│    → Users buy/sell at curve-determined price                │
│    → Creator fees → Asset Signer PDA                         │
│    → Agent earns from every trade                            │
├──────────────────────────────────────────────────────────────┤
│ 4. Graduation (when target market cap reached)               │
│    → Token graduates to Raydium CPMM pool                    │
│    → Bonding curve completes                                 │
│    → Token is now freely tradeable                           │
└──────────────────────────────────────────────────────────────┘
```

### Set Agent Token (Existing Token)

If you already launched a token without `setToken: true`, bind it retroactively:

```ts
import { buildSetAgentTokenParams } from "@clawd/agent-auth-solana";

const params = buildSetAgentTokenParams({
  agentAsset: "AGENT_ASSET_PUBKEY",
  agentCollection: "COLLECTION_PUBKEY",
  genesisAccount: "GENESIS_ACCOUNT_PUBKEY",
});

// Then wrap in Core Execute:
// import { execute, findAssetSignerPda } from "@metaplex-foundation/mpl-core";
// import { setAgentTokenV1 } from "@metaplex-foundation/mpl-agent-registry";
// await execute(umi, {
//   asset,
//   collection,
//   instructions: setAgentTokenV1(umi, params)
// }).sendAndConfirm(umi);
```

**Important:** `setAgentTokenV1` is a ONE-WAY operation. After binding:
- The token is permanently linked to the agent on-chain
- It CANNOT be changed or removed
- The agent's EIP-8004 document will list `agentToken`
- This prevents rug-pulls where agents switch tokens

## TEE Attestation (Phala TDX)

The CAAP relay runs inside a Phala TDX confidential VM. Every attestation response includes Intel TDX quote data proving the verifier executed in a hardware-encrypted environment.

### TEE Architecture

```
┌─────────────────────────────────────────────┐
│              Phala TDX Enclave               │
│  ┌───────────────────────────────────────┐  │
│  │  Docker: caap-relay                   │  │
│  │  ├─ SIWS verification                 │  │
│  │  ├─ DAS API query                     │  │
│  │  ├─ Token balance check               │  │
│  │  ├─ Tier computation                  │  │
│  │  └─ Quote generation (tappd)          │  │
│  └───────────────────────────────────────┘  │
│                   │                          │
│  ┌────────────────▼──────────────────────┐  │
│  │  Intel TDX Hardware                   │  │
│  │  ├─ MRTD     (kernel + initrd hash)   │  │
│  │  ├─ RTMR0    (docker-compose.yml)     │  │
│  │  ├─ RTMR1    (Docker image hashes)    │  │
│  │  ├─ RTMR2    (environment vars)       │  │
│  │  ├─ RTMR3    (application code)       │  │
│  │  └─ MRAGGREGATED (combined hash)      │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### TEE Response Fields

The `tee` object returned in attestation responses:

| Field | Description | Verification |
|-------|-------------|-------------|
| `appId` | Phala dstack application ID | Identifies which app is running |
| `instanceId` | CVM instance identifier | Unique per deployment |
| `composeHash` | SHA-256 of docker-compose.yml | Proves exact container topology |
| `mrAggregated` | Aggregate measurement (changes if anything changes) | Primary integrity check |
| `mrtd` | TDX trust domain measurement (kernel + initrd) | Proves boot environment |
| `rtmr0` | Compose file hash | Proves container orchestration |
| `rtmr1` | Docker image hashes | Proves exact container versions |
| `rtmr2` | Environment variable hash | Proves configuration |
| `rtmr3` | Application code hash | Proves code integrity |
| `intelQuote` | Raw Intel TDX quote (base64) | Signed by Intel hardware |
| `explorerUrl` | `proof.t16z.com/?attestation=...` | Click to verify independently |
| `hasTeeEvidence` | `true` when quote succeeded | Quick check flag |

### Independent Verification

```ts
// 1. From attestation response
const { tee } = attestationResponse;
console.log(tee.explorerUrl);
// → https://proof.t16z.com/?attestation=abc123...

// 2. Verify programmatically
const verifyRes = await fetch(
  `https://proof.t16z.com/api/verify/${tee.intelQuote}`
);
const { valid, measurements } = await verifyRes.json();

// 3. Compare expected measurements
const expectedMRTD = "known-good-mrtd-hash";
if (valid && measurements.mrtd === expectedMRTD) {
  console.log("TEE verification: PASSED");
}
```

**Why TEE matters:**
- The relay operator cannot see or modify attestation data
- Wallet verification happens inside encrypted memory
- Token balance checks are tamper-proof
- The attestation result comes with hardware-signed proof
- Independent verification at proof.t16z.com — no trust in the relay required

## Better Auth Plugin

```ts
import { createCaapPlugin } from "@clawd/agent-auth-solana";

const plugin = createCaapPlugin({
  // === Required ===
  heliusApiKey: process.env.HELIUS_API_KEY,
  // Your Helius API key for DAS and RPC

  // === Optional ===
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  // Custom SPL token for gating (defaults to CLAWD)

  enableSubscriptionTiers: true,
  // Enable Phase 4 tier gating middleware

  enableDasAttestation: true,
  // Enable Phase 2 DAS NFT verification

  identityRpcUrl: process.env.SOLANA_RPC_URL,
  // Separate RPC for identity ops (defaults to Helius)

  tierGating: {
    free: ["/caap/discovery"],
    bronze: ["/caap/discovery", "/caap/status"],
    silver: ["/caap/discovery", "/caap/status", "/caap/attest"],
    gold: ["/caap/discovery", "/caap/status", "/caap/attest", "/agent/identity"],
    diamond: ["/caap/discovery", "/caap/status", "/caap/attest", "/agent/identity", "/agent/token"],
  },
  // Customize which endpoints each tier can access
});
```

### Registered Endpoints

| Endpoint | Method | Auth | Min Tier | Description |
|---|---|---|---|---|
| `/caap/attest` | POST | Session | Silver | Full attestation + wallet snapshot + tier + TEE |
| `/caap/status/:agentId` | GET | None | Bronze | Lightweight verified/unverified check |
| `/caap/discovery` | GET | None | Free | CAAP/1.0 protocol discovery document |
| `/agent/identity/register` | POST | Session | Gold | Build EIP-8004 doc + registerIdentityV1 params |
| `/agent/identity/verify/:asset` | GET | None | Silver | Check on-chain Metaplex Agent Registry registration |
| `/agent/identity/delegate` | POST | Session | Gold | Build delegateExecutionV1 params |
| `/agent/token/set` | POST | Session | Diamond | Build setAgentTokenV1 params (irreversible) |
| `/agent/token/launch` | POST | Session | Diamond | Build Genesis bonding curve launch input |

### Request/Response Examples

**POST /caap/attest**
```json
// Request
{ "agentId": "my-agent", "walletAddress": "ABC123..." }

// Response
{
  "verified": true,
  "agentNftAddress": "NFT_ADDRESS",
  "attestation": { "hash": "sha256:...", "timestamp": 1719000000 },
  "tokenBalance": "1500000",
  "tier": {
    "tier": "gold",
    "clawdRequired": 1000000,
    "clawdToNextTier": 4000000,
    "percentToNext": 12.5
  },
  "tee": {
    "hasTeeEvidence": true,
    "mrAggregated": "...",
    "explorerUrl": "https://proof.t16z.com/?attestation=..."
  }
}
```

**GET /caap/status/:agentId?wallet=WALLET**
```json
{ "verified": true, "tier": "gold" }
```

**GET /caap/discovery**
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

## Wallet Snapshot

```ts
import { fetchWalletSnapshot } from "@clawd/agent-auth-solana";

const snapshot = await fetchWalletSnapshot(walletAddress, {
  heliusRpcUrl: "...",
  clawdMint: "...",
});
// {
//   walletAddress: "ABC123...",
//   solBalance: "10.5",
//   clawdBalance: "1500000",
//   tokenAccounts: [
//     { mint: "8cHzQ...", amount: "1500000", decimals: 6 }
//   ],
//   fetchedAt: 1719000000
// }
```

## Server-Side Hash Verification

```ts
import { verifyCaapAttestation, createCaapHash } from "@clawd/agent-auth-solana/verify";

// Create an attestation hash
const hash = createCaapHash(agentId, wallet, mint, Date.now());
// → "sha256:abc123def456..."

// Verify later (e.g., in a different service or at a different time)
const valid = verifyCaapAttestation(hash, agentId, wallet, mint);
// → true if the hash matches the recomputed SHA-256
```

## Key Constants

| Constant | Value |
|---|---|
| Default CLAWD mint | `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` |
| CAAP protocol version | `1.0` |
| Network | `solana:101:mainnet-beta` |
| Metaplex Agent Registry | `solana:101:metaplex` |
| MPL Core Program | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| EIP-8004 schema | `https://eips.ethereum.org/EIPS/eip-8004#registration-v1` |
| Genesis API base | `https://api.metaplex.com` |
| TEE Verifier | `https://proof.t16z.com` |
| Relay endpoint | `https://relay.clawd.xyz` |
| Phala tappd endpoint | `http://localhost:8090` (inside TEE CVM) |
| Tier thresholds | Free=0, Bronze=100K, Silver=500K, Gold=1M, Diamond=5M CLAWD |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  CAAP/1.0 Protocol                    │
├──────────────────────────────────────────────────────┤
│  Phase 1: SIWS (Sign In With Solana)                 │
│  └─ EIP-4361-style message, nacl verification        │
│  Phase 2: DAS Verification (Helius NFT check)        │
│  └─ getAssetsByOwner + getAccountInfo                │
│  Phase 3: Token Attestation (CLAWD balance)          │
│  └─ getTokenAccountsByOwner + SHA-256 hash           │
│  Phase 4: Subscription Tier (gating)                 │
│  └─ Deterministic computation from SPL balance      │
├──────────────────────────────────────────────────────┤
│  Metaplex Agent Identity (Global On-Chain)            │
│  ├─ EIP-8004 Registration Document                   │
│  ├─ AgentIdentity PDA (discoverable)                 │
│  ├─ Asset Signer PDA (agent wallet, no private key)  │
│  ├─ Executive Profile PDA (delegate management)      │
│  ├─ Execution Delegate Record (off-chain operator)   │
│  └─ setAgentTokenV1 (permanent token binding)        │
├──────────────────────────────────────────────────────┤
│  Genesis Token Launch                                 │
│  ├─ Bonding Curve from Agent PDA                     │
│  ├─ Creator Fees → Agent PDA                         │
│  ├─ First Buy (0.1 SOL, fee-free)                    │
│  └─ Raydium CPMM Graduation                          │
├──────────────────────────────────────────────────────┤
│  Phala TEE (TDX)                                      │
│  ├─ Intel TDX Quote (hardware-signed)                │
│  ├─ Measurement registers (MRTD, RTMR0-3, MRAGG)     │
│  ├─ Independent verification (proof.t16z.com)        │
│  └─ Encrypted memory — relay operator cannot tamper  │
└──────────────────────────────────────────────────────┘
```

## Source Files (in agent-auth-main)

| File | Purpose |
|---|---|
| `packages/agent-auth-solana/src/index.ts` | Main exports — attestation, tier, SIWS, identity, token launch |
| `packages/agent-auth-solana/src/client.ts` | Browser-safe client helpers (no nacl dependency) |
| `packages/agent-auth-solana/src/verify.ts` | Hash creation and verification |
| `packages/agent-auth-solana/src/plugin.ts` | Better Auth plugin (`createCaapPlugin`) |
| `packages/agent-auth-solana/src/siws.ts` | SIWS message creation and verification |
| `packages/agent-auth-solana/src/attestation.ts` | Agent attestation logic |
| `packages/agent-auth-solana/src/subscription.ts` | Tier computation and thresholds |
| `packages/agent-auth-solana/src/identity.ts` | EIP-8004 + Metaplex Agent Registry helpers |
| `packages/agent-auth-solana/src/token.ts` | Genesis launch and token binding |
| `apps/relay/` | Relay server (Runs attestation in TEE) |
| `packages/clerk-caap/` | Clerk session → CAAP bridge |

## Troubleshooting

### SIWS sign-in fails

1. Verify the wallet public key matches the signer
2. Check the nonce hasn't expired (default: 5 minutes)
3. Confirm the domain matches the request origin
4. Ensure the message format was preserved exactly (no extra whitespace)

### DAS verification returns "no agent NFT"

1. Confirm the wallet owns an MPL Core asset
2. Check the asset name contains "agent" or "clawd"
3. Verify the Helius API key has DAS access enabled
4. Try increasing the DAS API page limit

### Token balance shows 0

1. Check the CLAWD mint address is correct
2. Confirm the wallet has a token account for the CLAWD mint
3. Verify the RPC endpoint supports `getTokenAccountsByOwner`

### Tier computation is wrong

Use the formula to verify:
```
percentToNext = ((balance - currentTierMin) / (nextTierMin - currentTierMin)) * 100
```
- If `balance >= 5000000` (Diamond): tier is diamond, `percentToNext` is 100
- If `balance >= 1000000` (Gold): tier is gold, next tier is diamond
- If `balance >= 500000` (Silver): tier is silver, next tier is gold
- If `balance >= 100000` (Bronze): tier is bronze, next tier is silver
- Otherwise: tier is free, next tier is bronze

### TEE quote verification fails

1. Check `hasTeeEvidence` — if false, quote generation failed
2. Visit `explorerUrl` at proof.t16z.com
3. Quotes expire — attestations older than 24 hours may not verify
4. If `tcbInfo.status` indicates TCB recovery, Intel has revoked a microcode version

## Live Demo

See [x402.wtf/agentauth](https://x402.wtf/agentauth) for a live interactive demo of CAAP/1.0.

## Whitepaper

Full technical specification at [x402.wtf/agentauth#paper](https://x402.wtf/agentauth#paper).