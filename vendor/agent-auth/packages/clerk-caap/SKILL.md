---
name: clerk-caap
description: >
  Bridge Clerk session tokens with Solana CAAP/1.0 on-chain attestation. Verifies
  Clerk JWTs, attaches Phala TEE hardware-rooted TDX proof, and provides Next.js
  middleware for protecting CAAP attestation endpoints. Use when integrating Clerk
  auth with Solana agent identity, building token-gated agent features, or adding
  TEE attestation to Clerk-protected routes.
license: MIT
metadata:
  author: clawd-labs
  version: "0.1.0"
  homepage: https://pay.sh/services/auth/agent
  repo: https://github.com/Solizardking/agent-auth
  package: "@clawd/clerk-caap"
---

# Clerk CAAP Bridge

Bridges [Clerk](https://clerk.com) session tokens with CAAP/1.0 on-chain attestation. Uses the `<your-clerk-instance>` Clerk instance.

## Overview

`@clawd/clerk-caap` ties Clerk identity to Solana agent attestation and Phala TEE hardware proofs. When a user signs in via Clerk, their Solana wallet address (stored in `publicMetadata`) is used to run a full CAAP/1.0 attestation flow — DAS NFT verification, SPL token balance check, and Phala TDX quote binding.

### Why Clerk + CAAP?

Combining Clerk (web2 identity) with CAAP (web3 attestation) gives you the best of both worlds:

- **Clerk handles user management** — sign-up, sign-in, password reset, MFA, social login
- **CAAP handles agent identity** — wallet verification, NFT ownership, token balance, TEE proofs
- **Together they bridge web2 and web3** — users sign in with their existing Clerk accounts, and agents get Solana-native attestation without users managing separate keys

### Architecture

```
┌────────────┐     ┌─────────────────┐     ┌───────────────────┐     ┌──────────────┐
│   User     │     │  Clerk          │     │  CAAP Relay       │     │  Phala TEE   │
│  Browser   │     │  (Web2 Auth)    │     │  (Verification)   │     │  (TDX)       │
└─────┬──────┘     └────────┬────────┘     └─────────┬─────────┘     └──────┬───────┘
      │                     │                        │                      │
      │ 1. Sign in via      │                        │                      │
      │    Clerk UI         │                        │                      │
      │────────────────────►│                        │                      │
      │                     │                        │                      │
      │ 2. Clerk session    │                        │                      │
      │    token returned   │                        │                      │
      │◄────────────────────│                        │                      │
      │                     │                        │                      │
      │ 3. POST /caap/attest│                        │                      │
      │    Auth: Bearer <session>                     │                      │
      │──────────────────────────────────────────────►│                      │
      │                     │                        │                      │
      │                     │  4. verifyClerkToken()  │                      │
      │                     │◄───────────────────────│                      │
      │                     │  claims: { sub,        │                      │
      │                     │    wallet_address }    │                      │
      │                     │────────────────────────►                      │
      │                     │                        │                      │
      │                     │                        │ 5. Helius DAS query   │
      │                     │                        │ (NFT ownership)       │
      │                     │                        │                      │
      │                     │                        │ 6. Solana RPC query   │
      │                     │                        │ (CLAWD balance)       │
      │                     │                        │                      │
      │                     │                        │ 7. Phala tappd        │
      │                     │                        │─────────────────────►│
      │                     │                        │ Intel TDX Quote       │
      │                     │                        │◄─────────────────────│
      │                     │                        │                      │
      │ 8. Attestation      │                        │                      │
      │    response + TEE   │                        │                      │
      │◄──────────────────────────────────────────────│                      │
      │                     │                        │                      │
```

## Clerk Instance

Configure your Clerk application before using this package:

1. **Create a Clerk application** at [clerk.com](https://clerk.com)
2. **Store the Solana wallet address** in user `publicMetadata.wallet_address`
3. **Create a JWT template** named `solana_wallet`
4. **Note your Clerk instance domain** (e.g., `<your-clerk-instance>.accounts.dev`)

| Flow | URL |
|------|-----|
| Sign in | `https://<your-clerk-instance>.accounts.dev/sign-in` |
| Sign up | `https://<your-clerk-instance>.accounts.dev/sign-up` |
| Waitlist | `https://<your-clerk-instance>.accounts.dev/waitlist` |
| Unauthorized | `https://<your-clerk-instance>.accounts.dev/unauthorized-sign-in` |

> **Replace `<your-clerk-instance>` with your actual Clerk application subdomain.**

## JWT Template

In your Clerk dashboard, create a JWT template named `solana_wallet`:

```json
{
  "wallet_address": "{{user.publicMetadata.wallet_address}}",
  "agent_id": "{{user.publicMetadata.agent_id}}"
}
```

**Setup steps:**
1. Go to Clerk Dashboard → JWT Templates
2. Click "New Template"
3. Name it `solana_wallet`
4. Add the claims above
5. Set token lifetime: 1 minute (short-lived for attestation usage)
6. Save

## Usage

### Verify Clerk Token

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

### Error Handling

```ts
import { verifyClerkToken, ClerkTokenError } from "@clawd/clerk-caap";

try {
  const claims = await verifyClerkToken(sessionToken);
  // Claims verified — proceed with attestation
} catch (error) {
  if (error instanceof ClerkTokenError) {
    console.error(`Clerk token verification failed: ${error.code}`);
    // Handle specific errors:
    // - "token_expired" — user needs to re-authenticate
    // - "token_invalid" — token was tampered with or is malformed
    // - "wallet_not_found" — user hasn't linked a Solana wallet
  }
}
```

### Next.js Middleware

```ts
// middleware.ts
import { createClerkCaapMiddleware } from "@clawd/clerk-caap/middleware";

export const middleware = createClerkCaapMiddleware({
  protectedPaths: [/^\/api\/caap\/attest/],
  publicPaths: [/^\/api\/caap\/discovery/, /^\/api\/siws\//],
});

// Config for Next.js middleware matcher
export const config = {
  matcher: [
    // Match CAAP and SIWS endpoints
    "/api/caap/:path*",
    "/api/siws/:path*",
  ],
};
```

**Middleware behavior:**
- `protectedPaths` — Routes that require a valid Clerk session token (e.g., attestation endpoint)
- `publicPaths` — Routes that skip Clerk authentication (e.g., discovery, SIWS initiation)
- Unauthenticated requests to protected paths → `401` with redirect to Clerk sign-in
- The middleware sets `req.clerkSession` for downstream handlers to use

### TEE Attestation Fields

The relay follows the Phala Redpill / dstack TEE attestation structure:

| Field | Description | Example |
|-------|-------------|---------|
| `appId` | Phala dstack app ID | `"caap-relay-01"` |
| `instanceId` | CVM instance ID | `"cvm-abc123"` |
| `composeHash` | SHA-256 of docker-compose.yml | `"sha256:def456..."` |
| `mrAggregated` | Aggregate measurement register | `"abc123..."` |
| `mrtd` | TDX MRTD measurement | `"def456..."` |
| `rtmr0`–`rtmr3` | Runtime measurement registers | `"ghi789..."` |
| `intelQuote` | Raw Intel TDX quote (base64) | `"AQIDBAUG..."` |
| `explorerUrl` | `proof.t16z.com/?attestation=...` | URL for independent verification |
| `hasTeeEvidence` | `true` when quote generation succeeded | `true` / `false` |
| `tcbInfo` | TCB recovery status (if available) | `{ status: "ok", ... }` |

**Understanding TEE attestation:**
- `hasTeeEvidence: true` means the attestation verifier ran inside a Phala TDX confidential VM
- The `explorerUrl` can be opened to independently verify the Intel TDX quote at proof.t16z.com
- Measurement registers change if the relay code, Docker images, or environment changes
- Known-good measurements can be published for users to verify against

## Exports

| Module | Description | Import |
|--------|-------------|--------|
| `@clawd/clerk-caap` | Main entry — `verifyClerkToken`, `fetchPhalaAttestation`, `ClerkTokenError` | `import { verifyClerkToken } from "@clawd/clerk-caap"` |
| `@clawd/clerk-caap/middleware` | Next.js middleware factory | `import { createClerkCaapMiddleware } from "@clawd/clerk-caap/middleware"` |
| `@clawd/clerk-caap/tee` | TEE attestation helpers (tappd integration) | `import { getTeeEvidence } from "@clawd/clerk-caap/tee"` |
| `@clawd/clerk-caap/verify` | Clerk JWT verification utilities | `import { verifyClerkJwt } from "@clawd/clerk-caap/verify"` |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLERK_SECRET_KEY` | Yes | Clerk secret key for JWT verification |
| `CLERK_JWT_KEY` | No | Clerk RSA public key (for offline JWT verification inside TEE) |
| `HELIUS_API_KEY` | Yes | Helius RPC/DAS API key for Solana queries |
| `DSTACK_SIMULATOR_ENDPOINT` | No | Phala tappd endpoint (default: `http://localhost:8090`) |
| `CLERK_INSTANCE_DOMAIN` | No | Override Clerk instance domain (default: derived from secret key) |

## Full Clerk + TEE Flow

```ts
// 1. User signs in via Clerk (<your-clerk-instance>.accounts.dev)
// 2. Get Clerk session token
const { getToken } = useAuth(); // @clerk/nextjs
const token = await getToken({ template: "solana_wallet" });

// 3. Verify the token server-side
const claims = await verifyClerkToken(token);

// 4. POST to relay — runs SIWS + DAS + Phala TDX attestation
const res = await fetch("https://relay.clawd.xyz/api/caap/attest", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ walletAddress: claims.wallet_address }),
});

const { verified, attestation, tee, tier } = await res.json();
// verified: boolean — agent identity confirmed
// attestation: { hash, timestamp } — attestation proof
// tee: { explorerUrl, mrAggregated, ... } — TEE evidence
// tier: { tier, clawdRequired, percentToNext } — subscription tier

// 5. Verify TEE evidence independently
if (tee.hasTeeEvidence) {
  console.log(`TEE attestation verified. View proof: ${tee.explorerUrl}`);
  // Verify programmatically:
  // const verifyRes = await fetch(`https://proof.t16z.com/api/verify/${tee.intelQuote}`);
}
```

## Client-Side Integration (React)

```tsx
// components/AgentAttestation.tsx
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

export function AgentAttestation() {
  const { getToken } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAttestation = async () => {
    setLoading(true);
    try {
      // Get Clerk session token with Solana wallet claim
      const token = await getToken({ template: "solana_wallet" });

      // Call the attestation endpoint
      const res = await fetch("/api/caap/attest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error("Attestation failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={runAttestation} disabled={loading}>
        {loading ? "Attesting..." : "Run Agent Attestation"}
      </button>

      {result && (
        <div>
          <p>Verified: {result.verified ? "✅" : "❌"}</p>
          <p>Tier: {result.tier?.tier}</p>
          <p>CLAWD Balance: {result.tokenBalance}</p>
          {result.tee?.hasTeeEvidence && (
            <p>
              TEE Verified:{" "}
              <a href={result.tee.explorerUrl} target="_blank" rel="noopener">
                View Proof
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Server-Side API Route (Next.js App Router)

```ts
// app/api/caap/attest/route.ts
import { verifyClerkToken } from "@clawd/clerk-caap";
import { auth } from "@/lib/auth"; // Your Better Auth instance

export async function POST(request: Request) {
  // Extract the Clerk session token
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return Response.json({ error: "Missing authorization" }, { status: 401 });
  }

  // Verify the Clerk token
  const claims = await verifyClerkToken(token);

  // Extract wallet address from claims
  const { wallet_address, agent_id } = claims;

  // Run CAAP attestation
  const result = await auth.api.caapAttest({
    body: {
      agentId: agent_id,
      walletAddress: wallet_address,
    },
    headers: request.headers,
  });

  return Response.json(result);
}
```

## Troubleshooting

### "Clerk token verification failed"

1. Check that `CLERK_SECRET_KEY` is set correctly
2. Verify the JWT template `solana_wallet` exists in Clerk dashboard
3. Confirm the token hasn't expired (default: 1 minute)
4. Check the user has `publicMetadata.wallet_address` set

### "Wallet address not found in Clerk metadata"

1. Go to Clerk Dashboard → Users → select user → Metadata
2. Add `wallet_address` to public metadata (e.g., `{ "wallet_address": "ABC123..." }`)
3. Users must connect their Solana wallet before attestation works

### "TEE evidence not available"

1. The relay at `relay.clawd.xyz` may be running outside TEE (hasTeeEvidence: false)
2. Check `DSTACK_SIMULATOR_ENDPOINT` if running locally
3. TEE quotes can fail if the Phala tappd service is unreachable
4. Development/staging environments may not have TEE support

### Middleware not triggering

1. Verify `config.matcher` in middleware.ts covers your CAAP routes
2. Check that `protectedPaths` regexes match your endpoint URLs
3. Ensure Clerk middleware is also configured if using Clerk's own middleware

## Reference: Phala TDX Quote Verification

The TEE attestation in this flow uses Intel TDX (Trust Domain Extensions) via Phala Network's dstack:

1. **At deployment**: The relay Docker image is hashed and measured
2. **At boot**: Intel hardware measures the kernel, initrd, and boot parameters (MRTD)
3. **At runtime**: The docker-compose.yml (RTMR0), Docker images (RTMR1), environment (RTMR2), and application code (RTMR3) are measured
4. **On request**: The Phala tappd generates an Intel-signed TDX quote containing all measurements
5. **Verification**: The quote can be independently verified at proof.t16z.com

## Requirements

- **Clerk account** with a configured application
- **Clerk secret key** (`CLERK_SECRET_KEY` environment variable)
- **Helius API key** (`HELIUS_API_KEY`) for Solana DAS queries
- **Solana wallet** linked to the Clerk user via `publicMetadata.wallet_address`
- **JWT template** named `solana_wallet` in the Clerk dashboard
- **Node.js ≥ 18** (for the server-side package)
- **Next.js ≥ 14** (for the middleware)

## Related Packages

| Package | Purpose |
|---------|---------|
| `@clawd/agent-auth-solana` | Full CAAP/1.0 protocol (SIWS, DAS, tiers, EIP-8004, Genesis) |
| `@clawd/clerk-caap` | This package — Clerk → CAAP bridge |
| `better-auth-solana` | Solana SIWS for Better Auth |
| `@clerk/nextjs` | Clerk React/Next.js SDK |

## Source Files

| File | Purpose |
|------|---------|
| `packages/clerk-caap/src/index.ts` | Main exports: `verifyClerkToken`, `fetchPhalaAttestation`, `ClerkTokenError` |
| `packages/clerk-caap/src/middleware.ts` | Next.js middleware factory |
| `packages/clerk-caap/src/tee.ts` | TEE attestation helpers |
| `packages/clerk-caap/src/verify.ts` | Clerk JWT verification utilities |