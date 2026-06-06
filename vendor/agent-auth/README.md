# Clawd Agent Auth

<div align="center">

<img src="https://x402.wtf/agentauth/icon.svg" alt="CAAP/1.0" width="120" />

**The Open-Source Agent Authentication Stack for Solana**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solana](https://img.shields.io/badge/Solana-mainnet--beta-blueviolet)](https://solana.com)
[![CAAP/1.0](https://img.shields.io/badge/CAAP-1.0-green)](https://x402.wtf/agentauth)
[![TEE: Phala TDX](https://img.shields.io/badge/TEE-Phala%20TDX-blue)](https://proof.t16z.com)

</div>

---

**Clawd Agent Auth** is the open-source agent authentication stack for Solana — providing wallet-based sign-in (SIWS), on-chain digital asset verification (Helius DAS), hardware-backed confidential compute (Phala TDX), Clerk identity bridging, and SPL-token-gated subscription tiers.

Built on the [Agent Auth Protocol](https://agent-auth-protocol.com) and [Better Auth](https://better-auth.com). Discoverable at **[pay.sh/services/auth/agent](https://pay.sh/services/auth/agent)**.

### What This Stack Provides

| Layer | Technology | What It Does |
|---|---|---|
| **Sign-In** | SIWS (Sign In With Solana) | Wallet-based authentication — no passwords, no email |
| **Identity** | Metaplex Agent Registry (EIP-8004) | On-chain, globally discoverable agent identity |
| **Verification** | Helius DAS API | Proves agent NFT ownership on-chain |
| **Economic Stake** | SPL Token Balance (CLAWD) | Token-gated tiers — more CLAWD = more access |
| **Hardware Trust** | Phala TDX (Intel Trust Domain Extensions) | Attestation verifier runs in encrypted hardware enclave |
| **Web2 Bridge** | Clerk | User management, social login, MFA → bridged to Solana |
| **AI Integration** | Agent Auth Protocol + MCP Server | AI agents can register, discover, and execute capabilities |

### Quick Links

- **Live Demo**: [x402.wtf/agentauth](https://x402.wtf/agentauth)
- **CAAP/1.0 Spec**: [x402.wtf/agentauth#spec](https://x402.wtf/agentauth#spec)
- **Whitepaper**: [x402.wtf/agentauth#paper](https://x402.wtf/agentauth#paper)
- **TEE Proofs**: [proof.t16z.com](https://proof.t16z.com)
- **Relay**: [relay.clawd.xyz](https://relay.clawd.xyz)
- **Solana Pay**: [pay.sh/services/auth/agent](https://pay.sh/services/auth/agent)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Clawd Agent Auth                            │
│                                                                     │
│  ┌──────────────┐   SIWS   ┌───────────────┐   DAS    ┌─────────┐ │
│  │  Clerk Auth  │ ───────▶ │  apps/relay   │ ───────▶ │ Helius  │ │
│  │ (<your-      │          │  (H100 TEE)   │          │ RPC/DAS │ │
│  │  instance>)  │          │  Phala dstack │          └─────────┘ │
│  └──────────────┘          └───────┬───────┘                       │
│                                    │ TDX Quote                     │
│  ┌──────────────┐                  ▼                               │
│  │ CAAP/1.0     │          ┌───────────────┐   proof.t16z.com     │
│  │ Attestation  │◀─────────│ Phala tappd   │ ─────────────────▶  │
│  │ Protocol     │          │ (Intel TDX)   │                       │
│  └──────────────┘          └───────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@clawd/agent-auth-solana`](packages/agent-auth-solana/) | SIWS, DAS attestation, CAAP/1.0 protocol, subscription tiers, EIP-8004 identity, Genesis token launch | `npm i @clawd/agent-auth-solana` |
| [`@clawd/clerk-caap`](packages/clerk-caap/) | Clerk JWT verification + Phala TEE attestation bridge | `npm i @clawd/clerk-caap` |
| [`@better-auth/agent-auth`](packages/agent-auth/) | Better Auth server plugin — capabilities, registration, JWTs | `npm i @better-auth/agent-auth` |
| [`@auth/agent`](packages/sdk/) | Client SDK for agent runtimes | `npm i @auth/agent` |
| [`@auth/agent-cli`](packages/cli/) | CLI and MCP server | `npx @auth/agent-cli` |

## Apps

| App | Description |
|-----|-------------|
| [`apps/relay`](apps/relay/) | **H100 confidential compute relay** — Clerk + SIWS + Phala TEE attestation |
| [`apps/directory`](apps/directory/) | Agent directory — browse verified agents, CAAP-attested Solana agents |
| [`apps/agent-extension`](apps/agent-extension/) | Browser extension for agent identity management |

## Examples

| Example | Description |
|---------|-------------|
| [`examples/agent-coffee`](examples/agent-coffee/) | Coffee shop agent with device-based auth |
| [`examples/agent-deploy`](examples/agent-deploy/) | Baseline Better Auth flow |
| [`examples/brex-agent`](examples/brex-agent/) | Brex corporate card agent |
| [`examples/gmail-proxy`](examples/gmail-proxy/) | Gmail proxy with WebAuthn |
| [`examples/stripe-agents`](examples/stripe-agents/) | Stripe payment agents |
| [`examples/vercel-proxy`](examples/vercel-proxy/) | Vercel proxy pattern |

---

## CAAP: Clawd Agent Attestation Protocol

`@clawd/agent-auth-solana` implements **CAAP/1.0** — a Solana-native agent identity standard that ties together:

1. **SIWS** — Sign In With Solana (Ed25519 signature over a structured message)
2. **DAS Verification** — Metaplex Agent Registry + Helius `getAssetsByOwner` to confirm the agent NFT is owned by the signing wallet
3. **SPL Attestation** — Verify CLAWD token account ownership matches the same wallet
4. **Subscription Tiers** — Token balance → tier (Free / Bronze 100K / Silver 500K / Gold 1M / Diamond 5M CLAWD)
5. **On-Chain Identity** — Metaplex Agent Registry (EIP-8004), Asset Signer PDA, Execution Delegation
6. **Token Launch** — Genesis bonding curve from agent PDA, irreversible setAgentTokenV1 binding
7. **Phala TEE Quote** — Intel TDX quote binding the attestation hash to a specific CVM instance, verifiable at [proof.t16z.com](https://proof.t16z.com)

### Attestation hash

```
sha256(`${agentId}:${wallet}:${clawdMint}:${timestamp}`)
```

This hash is embedded in the TDX `report_data` field so the TEE quote is cryptographically bound to the specific agent being attested.

---

## Clerk Integration (`@clawd/clerk-caap`)

The `clerk-caap` package bridges [Clerk](https://clerk.com) session tokens with CAAP/1.0 onchain attestation.

### Clerk URLs

Replace `<your-clerk-instance>` with your actual Clerk application subdomain:

| Flow | URL |
|------|-----|
| Sign in | `https://<your-clerk-instance>.accounts.dev/sign-in` |
| Sign up | `https://<your-clerk-instance>.accounts.dev/sign-up` |
| Waitlist | `https://<your-clerk-instance>.accounts.dev/waitlist` |
| Unauthorized | `https://<your-clerk-instance>.accounts.dev/unauthorized-sign-in` |

### JWT Template

In your Clerk dashboard, create a JWT template named `solana_wallet`:

```json
{
  "wallet_address": "{{user.publicMetadata.wallet_address}}",
  "agent_id": "{{user.publicMetadata.agent_id}}"
}
```

### Usage

```ts
import { verifyClerkToken, fetchPhalaAttestation } from "@clawd/clerk-caap";

// 1. Verify Clerk session token
const claims = await verifyClerkToken(sessionToken);
// → { sub, wallet_address, agent_id, iat, exp }

// 2. Run CAAP attestation (via relay or directly)
const response = await fetch("https://relay.clawd.xyz/api/caap/attest", {
  method: "POST",
  headers: { Authorization: `Bearer ${sessionToken}` },
  body: JSON.stringify({ walletAddress: claims.wallet_address }),
});
// → { verified, attestation, tee: { intelQuote, explorerUrl, mrAggregated, ... } }
```

### Next.js Middleware

```ts
// middleware.ts
import { createClerkCaapMiddleware } from "@clawd/clerk-caap/middleware";

export const middleware = createClerkCaapMiddleware({
  protectedPaths: [/^\/api\/caap\/attest/],
  publicPaths: [/^\/api\/caap\/discovery/, /^\/api\/siws\//],
});
```

---

## Confidential Compute Relay (`apps/relay`)

The relay runs inside a **Phala dstack Intel TDX CVM** — every attestation response is wrapped in a hardware-rooted TDX quote, verifiable on [proof.t16z.com](https://proof.t16z.com).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/caap/discovery` | CAAP/1.0 protocol discovery document |
| `POST` | `/api/caap/attest` | Clerk JWT → CAAP DAS → Phala TDX quote |
| `POST` | `/api/siws/challenge` | Generate SIWS sign-in input |
| `POST` | `/api/siws/verify` | Verify SIWS + CAAP + TEE (no Clerk needed) |
| `GET` | `/api/tee/report` | Fresh TEE health quote bound to a nonce |

### Deploy to Phala (H100 TEE)

```bash
cd apps/relay

# Copy and fill in your keys
cp .env.example .env

# Local dev with Phala simulator
docker compose up

# Production — deploy to Phala dstack H100 CVM
phala deploy --compose docker-compose.yml
```

### TEE Attestation Fields (phala dstack format)

The relay follows the same TEE attestation structure as the Phala Redpill / dstack format:

| Field | Description |
|-------|-------------|
| `appId` | Phala dstack app ID |
| `instanceId` | CVM instance ID |
| `composeHash` | Hash of the docker-compose.yml |
| `mrAggregated` | Aggregate measurement register |
| `mrtd` | TDX MRTD measurement |
| `rtmr0`–`rtmr3` | Runtime measurement registers |
| `intelQuote` | Raw Intel TDX quote (base64) |
| `explorerUrl` | `proof.t16z.com/?attestation=...` |
| `hasTeeEvidence` | `true` when quote generation succeeded |

---

## Quick Start

### Server (Better Auth + SIWS + CAAP)

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { siws } from "better-auth-solana";
import { createCaapPlugin } from "@clawd/agent-auth-solana";

export const auth = betterAuth({
  plugins: [
    siws({ domain: "x402.wtf" }),
    createCaapPlugin({
      heliusApiKey: process.env.HELIUS_API_KEY,
      clawdMint: process.env.CLAWD_TOKEN_ADDRESS,
      enableSubscriptionTiers: true,
      enableDasAttestation: true,
    }),
  ],
});
```

### Client (SIWS sign-in)

```ts
import { createAuthClient } from "better-auth/client";
import { siwsClient, createSIWSMessage } from "better-auth-solana/client";

const authClient = createAuthClient({ plugins: [siwsClient()] });

// 1. Get nonce
const { data: nonceData } = await authClient.siws.nonce({ walletAddress: address });

// 2. Sign with wallet
const message = createSIWSMessage({
  address,
  challenge: nonceData,
  statement: "Sign in to Clawd",
});
const signature = await wallet.signMessage(new TextEncoder().encode(message));

// 3. Verify + establish session
await authClient.siws.verify({
  message,
  signature: Buffer.from(signature).toString("base64"),
  walletAddress: address,
});
```

### Attest an Agent

```ts
import { attestAgent, computeTier } from "@clawd/agent-auth-solana";

const result = await attestAgent("my-agent-id", walletAddress, {
  heliusRpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
});

if (result.verified) {
  const tier = computeTier(result.tokenBalance ?? 0);
  console.log(`Agent verified — ${tier.tier} tier`);
  console.log("Attestation hash:", result.attestationHash);
}
```

### Full Clerk + TEE Flow

```ts
// 1. User signs in via Clerk (<your-clerk-instance>.accounts.dev)
// 2. Get Clerk session token
const { getToken } = useAuth(); // @clerk/nextjs
const token = await getToken({ template: "solana_wallet" });

// 3. POST to relay — runs SIWS + DAS + Phala TDX attestation
const res = await fetch("https://relay.clawd.xyz/api/caap/attest", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ walletAddress: "YourSolanaWallet..." }),
});

const { verified, attestation, tee, tier } = await res.json();
// tee.explorerUrl → proof.t16z.com link for onchain verification
```

---

## Discovery Document

Servers expose `/.well-known/agent-configuration`:

```json
{
  "issuer": "https://relay.clawd.xyz",
  "provider_name": "Clawd Agent Auth Relay",
  "modes": ["delegated", "autonomous"],
  "capabilities": [
    { "name": "attest_agent", "description": "Attest agent identity — SIWS + DAS + Phala TEE TDX quote." },
    { "name": "clerk_auth", "description": "Clerk session auth bridged to Solana CAAP/1.0 attestation." },
    { "name": "tee_report", "description": "Fresh Intel TDX quote for relay health verification." }
  ],
  "solana": { "network": "mainnet-beta", "attestation_protocol": "CAAP/1.0" },
  "tee": { "provider": "phala-dstack", "platform": "intel-tdx" }
}
```

---

## Subscription Tiers

| Tier | CLAWD Required | Features |
|------|----------------|----------|
| Free | 0 | Protocol discovery (`/caap/discovery`) |
| Bronze | 100,000 | Status checks, DAS lookups, agent peer cards |
| Silver | 500,000 | Full attestation, agent card generation |
| Gold | 1,000,000 | Webhooks, multi-agent management, on-chain identity |
| Diamond | 5,000,000 | Token launch, dedicated infrastructure, enterprise SLA |

Tier progress is computed as: `percentToNext = ((balance - currentTierMin) / (nextTierMin - currentTierMin)) × 100`. See [packages/agent-auth-solana/README.md](packages/agent-auth-solana/README.md) for full tier gating documentation.

---

## pay.sh

This service is discoverable at **[pay.sh/services/auth/agent](https://pay.sh/services/auth/agent)**.

AI agents can call the relay directly without any prior registration — include your Solana wallet address and (optionally) a Clerk session token. The relay bills per-attestation via the x402 payment protocol.

```
POST https://pay.sh/services/auth/agent/attest
Authorization: Bearer <clerk_token>           # optional
X-Wallet-Address: <solana_address>
```

---

## Development

```bash
pnpm install
pnpm build
pnpm test

# Run the relay locally
cd apps/relay && cp .env.example .env && pnpm dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key |
| `CLERK_JWT_KEY` | No | Clerk RSA public key (for offline JWT verification in TEE) |
| `HELIUS_API_KEY` | Yes | Helius RPC/DAS API key |
| `CLAWD_TOKEN_ADDRESS` | No | CLAWD mint (defaults to `8cHz...pump`) |
| `DSTACK_SIMULATOR_ENDPOINT` | No | Phala tappd endpoint (default: `http://localhost:8090`) |
| `RELAY_DOMAIN` | No | Relay hostname for SIWS messages (default: `relay.clawd.xyz`) |

---

## Skill Catalog & Registry

### Solana Pay Skills Registry

This project is registered in the **[solana-foundation/pay](https://github.com/solana-foundation/pay)** skills registry via [PR #376](https://github.com/solana-foundation/pay/pull/376). Three files document the full CAAP/1.0 protocol:

| File | Purpose |
|------|---------|
| [`skills/agent-auth/SKILL.md`](https://github.com/Solizardking/pay/blob/main/skills/agent-auth/SKILL.md) | Main skill listing — frontmatter, endpoints, protocol phases, Clerk integration, TEE fields, best practices |
| [`skills/agent-auth/references/attestation-flow.md`](https://github.com/Solizardking/pay/blob/main/skills/agent-auth/references/attestation-flow.md) | Step-by-step attestation guide (SIWS-only, Clerk-bridged, status check, TEE health) |
| [`skills/agent-auth/references/subscription-tiers.md`](https://github.com/Solizardking/pay/blob/main/skills/agent-auth/references/subscription-tiers.md) | Tier thresholds, features per tier, SDK computation, relay API format, tier gating |

### Clawd Skill Hub

This project is also registered in the **[Clawd Skill Hub](https://x402.wtf/skills)** as `pay-sh` — discoverable by AI agents and human developers browsing the Solana agent ecosystem.

| Catalog File | Description |
|-------------|-------------|
| [`skills/pay-sh/SKILL.md`](https://x402.wtf/api/skills/pay-sh) | Full skill documentation — SIWS, CAAP/1.0, Clerk+TEE flow, subscription tiers |
| `public/api/skills/catalog.json` | Catalog registry entry under `"Solana / Blockchain"` |
| `public/api/skills/index.json` | Index entry with tags, URL, homepage, and attestation metadata |
| [`packages/clerk-caap/SKILL.md`](packages/clerk-caap/SKILL.md) | Standalone `@clawd/clerk-caap` package skill reference |

### Package Skill Docs

Each package includes a detailed `SKILL.md` for AI agent context:

| Package | Skill Doc | Lines |
|---------|-----------|-------|
| `@clawd/agent-auth-solana` | [`packages/agent-auth-solana/SKILL.md`](packages/agent-auth-solana/SKILL.md) | ~440 — protocol phases, TEE architecture, troubleshooting |
| `@clawd/clerk-caap` | [`packages/clerk-caap/SKILL.md`](packages/clerk-caap/SKILL.md) | ~320 — Clerk+CAAP bridge, middleware, client integration |

The skill hub powers agent-native discovery: any AI agent with Clawd tooling can find the **pay.sh Agent Auth** service and call it directly — no prior registration required.

**Skill URL:** `https://x402.wtf/api/skills/pay-sh`  
**Pay Skills Registry:** `skills/agent-auth/` ([PR #376](https://github.com/solana-foundation/pay/pull/376))  
**Homepage:** `https://pay.sh/services/auth/agent`  
**Category:** Solana / Blockchain

---

## Contributing

### PR Status

| PR | Repo | Status |
|----|------|--------|
| [#376](https://github.com/solana-foundation/pay/pull/376) | `solana-foundation/pay` | Open — `feat: add agent-auth skill with CAAP/1.0 attestation, SIWS, and TEE reference docs` |

### Development

```bash
pnpm install
pnpm build
pnpm test

# Run the relay locally
cd apps/relay && cp .env.example .env && pnpm dev
```

---

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Clawd Labs](https://x402.wtf) · Powered by [Helius](https://helius.dev) · [Metaplex](https://metaplex.com) · [Clerk](https://clerk.com) · [Phala Network](https://phala.network) · [Better Auth](https://better-auth.com)

Discoverable at [pay.sh/services/auth/agent](https://pay.sh/services/auth/agent)