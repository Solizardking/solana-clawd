---
name: clawd-agents-cli-agent-code
description: >
  TypeScript patterns for writing Solana agent logic on the Clawd platform.
  Use when writing agent code: CAAP/1.0 auth flows, SIWS sign-in, DAS attestation,
  Imperial Trading API calls, Phoenix perps execution, x402 payments, Convex
  database ops, or Telegram bot handlers.
  Part of the Clawd Agents CLI skills suite.
metadata:
  author: Clawd
  license: MIT
  version: 0.1.0
  requires:
    packages:
      - "@clawd/agent-auth-solana"
      - "@better-auth/agent-auth"
      - "@auth/agent"
---

# Clawd Agent Code — TypeScript Patterns

---

## Package Installation

```bash
# Full stack (server + Solana extension + client SDK)
npm install @better-auth/agent-auth @clawd/agent-auth-solana @auth/agent better-auth

# Server only
npm install @better-auth/agent-auth better-auth

# Client SDK (in agent runtime)
npm install @auth/agent
```

---

## CAAP/1.0 — Server Setup

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";
import { siws } from "better-auth-solana";
import { createCaapPlugin } from "@clawd/agent-auth-solana";

export const auth = betterAuth({
  plugins: [
    siws({ domain: process.env.BETTER_AUTH_URL! }),
    createCaapPlugin({
      heliusApiKey: process.env.HELIUS_API_KEY!,
      clawdMint: process.env.CLAWD_TOKEN_ADDRESS!,
      enableSubscriptionTiers: true,
      enableDasAttestation: true,
    }),
    agentAuth({
      capabilities: [
        { name: "attest_agent",  description: "Attest a Solana agent identity on-chain" },
        { name: "get_peer_card", description: "Fetch verified agent peer card and tier" },
        { name: "list_agents",   description: "Browse the Clawd agent catalog" },
        { name: "agent_chat",    description: "Send messages to specialized agents" },
      ],
    }),
  ],
});
```

---

## Verify Incoming Agent JWT (Route Handler)

```typescript
// lib/agents/agent-auth.ts
import "server-only";
import { verifyAgentRequest } from "@better-auth/agent-auth";
import type { AgentSession } from "@better-auth/agent-auth";
import { auth } from "@/lib/auth";

export async function verifyAgentAuth(request: Request): Promise<AgentSession | null> {
  return verifyAgentRequest(request, auth) as Promise<AgentSession | null>;
}

// In a route handler:
export async function POST(req: NextRequest) {
  const agentSession = await verifyAgentAuth(req);
  if (!agentSession) {
    return NextResponse.json(
      { error: "Agent authentication required", hint: "/.well-known/agent-auth.json" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer realm="Clawd", discovery="https://x402.wtf/.well-known/agent-auth.json"`,
        },
      },
    );
  }
  // agentSession.agentId, agentSession.type ("delegated" | "autonomous"), agentSession.agent
}
```

---

## Create Agent Client (in agent runtime)

```typescript
// auth/client.ts
import { AgentAuthClient } from "@auth/agent";

export function createClawdAgentClient(baseUrl?: string) {
  return new AgentAuthClient({
    directoryUrl: baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/.well-known/agent-auth.json`
      : "https://x402.wtf/.well-known/agent-auth.json",
    hostName: "clawd-agent",
    allowDirectDiscovery: true,
  });
}

// Usage:
const client = createClawdAgentClient();
const token = await client.getToken();
const res = await fetch("https://x402.wtf/api/agents/peer-card", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ agentId: "my-agent-id" }),
});
```

---

## SIWS Sign-In (client side)

```typescript
import { createAuthClient } from "better-auth/client";
import { siwsClient, createSIWSMessage } from "better-auth-solana/client";

const authClient = createAuthClient({ plugins: [siwsClient()] });

// Step 1: nonce
const { data: nonce } = await authClient.siws.nonce({ walletAddress: address });

// Step 2: sign
const message = createSIWSMessage({
  address,
  challenge: nonce,
  statement: "Sign in to Clawd",
});
const signature = await wallet.signMessage(new TextEncoder().encode(message));

// Step 3: verify → session
await authClient.siws.verify({
  message,
  signature: Buffer.from(signature).toString("base64"),
  walletAddress: address,
});
```

---

## DAS Attestation (on-chain identity)

```typescript
import { attestAgent, computeTier } from "@clawd/agent-auth-solana";

const result = await attestAgent("my-agent-id", walletAddress, {
  heliusRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  clawdMint: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
});

// result.verified — boolean
// result.attestationHash — sha256(agentId:wallet:mint:ts)
// result.agentNftAddress — Metaplex Core asset address
// result.tokenBalance — raw CLAWD token balance

if (result.verified) {
  const { tier } = computeTier(result.tokenBalance ?? 0);
  // tier: "free" | "bronze" | "silver" | "gold" | "diamond"
}
```

---

## Subscription Tiers

| Tier | CLAWD Required | Capability |
|------|---------------|------------|
| 🩶 Free | 0 | Basic SIWS sign-in |
| 🟤 Bronze | 100,000+ | Agent attestation, peer card |
| ⚪ Silver | 500,000+ | History, priority verify |
| 🟡 Gold | 1,000,000+ | Real-time monitoring, webhooks |
| 💎 Diamond | 5,000,000+ | All features, enterprise SLA |

```typescript
import { computeTier } from "@clawd/agent-auth-solana";
const { tier, clawdBalance, badge } = computeTier(tokenBalance);
```

---

## CAAP/1.0 — The Four Phases

```
Phase 1 (SIWS)     Phase 2 (DAS)       Phase 3 (SPL)      Phase 4 (Tier)
──────────────     ──────────────      ──────────────     ──────────────
Sign msg w/ wallet  getAssetsByOwner    getTokenAccounts   CLAWD balance
Ed25519 verify      Agent NFT owner     CLAWD token owner  → tier badge
                    match               match
                                ↓
                 attestationHash = sha256(agentId:wallet:mint:ts)
```

---

## Discovery Document

Every CAAP server auto-exposes `/.well-known/agent-auth.json`:

```json
{
  "issuer": "https://x402.wtf",
  "protocol": "CAAP/1.0",
  "modes": ["delegated", "autonomous"],
  "keyAlgorithms": ["Ed25519"],
  "solana": {
    "network": "mainnet-beta",
    "clawdMint": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
    "attestationService": "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"
  },
  "capabilities": [...]
}
```

---

## Preflight Pattern (safety gate)

All Clawd perp agents run a preflight before any execution:

```typescript
function runPreflight(cfg: AgentConfig, symbol: string, notionalUsd: number, leverageX: number) {
  const errors: string[] = [];
  if (!cfg.allowedSymbols.includes(symbol)) errors.push(`symbol ${symbol} not in allowlist`);
  if (notionalUsd > cfg.maxNotionalUsd) errors.push(`notional $${notionalUsd} > cap $${cfg.maxNotionalUsd}`);
  if (leverageX > cfg.maxLeverage) errors.push(`leverage ${leverageX}x > cap ${cfg.maxLeverage}x`);
  return { ok: errors.length === 0, errors };
}
```

**Always call `runPreflight` before building an order shape — even in paper mode.**

---

## x402 Payment Gating

```typescript
// Wrap route with x402 middleware
import { withX402 } from "@x402/next";

export const POST = withX402(
  async (req: NextRequest) => { /* ... */ },
  { price: "$0.001", network: "base", asset: "USDC" },
);
```

---

## Key Constants

```typescript
export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
export const ATTESTATION_SERVICE = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";
export const CLAWD_AUTH_BASE = "https://x402.wtf/api/auth";
export const CLAWD_DISCOVERY_URL = "https://x402.wtf/.well-known/agent-auth.json";
```
