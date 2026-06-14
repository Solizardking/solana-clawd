# On-Chain Development Guide

## Building Sovereign Agents on Solana with the Cheshire Terminal Stack

---

## Abstract

This guide covers the on-chain development patterns underlying the Cheshire Terminal. It documents the Anchor program architecture, Metaplex Core identity model, CAAP/1.0 auth integration, and x402 payment wiring that make Leviathan agents sovereign on Solana.

All addresses are live on Solana devnet. All code excerpts are from the `solana-clawd` monorepo.

---

## 1. Development Environment

**Prerequisites:**

```bash
# Rust + Anchor
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
# anchor --version → anchor-cli 0.30.1

# Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
# solana --version → solana-cli 1.18+

# Node / pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Clone and install
git clone https://github.com/Solizardking/solana-clawd
cd solana-clawd && pnpm install
```

---

## 2. Staking Program Architecture

The core on-chain primitive is the non-custodial staking program.

**Program ID (devnet):** `9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP`

### 2.1 Program Layout

```text
staking/programs/mpl-corenft-staking/src/
├── lib.rs                              # Program entrypoint + declare_id!
├── instructions/
│   ├── mod.rs                          # Module re-exports
│   ├── initialize.rs                   # GlobalPool initialization
│   ├── stake.rs                        # Stake Metaplex Core asset
│   ├── unstake.rs                      # Unstake + claim rewards
│   ├── claim.rs                        # Claim without unstaking
│   ├── stake_for_verification.rs       # Lock CLAWD for verification badge
│   └── unstake_verification.rs        # Unlock CLAWD, close PDA
└── state/
    ├── global_pool.rs                  # GlobalPool account
    └── user_pool.rs                    # Per-user staking state
```

### 2.2 The GlobalPool PDA

```rust
#[account]
pub struct GlobalPool {
    pub admin: Pubkey,
    pub last_update_time: i64,
    pub staked_count: u64,
    pub reward_token_mint: Pubkey,
}

// Seed: ["global-authority"]
// Address: DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ
```

### 2.3 Stake Flow — FreezeDelegate Plugin

Staking a Metaplex Core asset does **not** transfer custody. Instead, the program adds a `FreezeDelegate` plugin that locks the asset in place:

```rust
pub fn stake_nft(ctx: Context<StakeNft>) -> Result<()> {
    // 1. Add FreezeDelegate plugin to the Core asset
    AddPluginV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .asset(&ctx.accounts.asset.to_account_info())
        .collection(Some(&ctx.accounts.collection.to_account_info()))
        .payer(&ctx.accounts.user.to_account_info())
        .authority(Some(&ctx.accounts.user.to_account_info()))
        .system_program(&ctx.accounts.system_program.to_account_info())
        .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: true }))
        .add_authority(PluginAuthority::Address {
            address: ctx.accounts.program_authority.key(),
        })
        .invoke()?;

    // 2. Record staking state
    let pool = &mut ctx.accounts.user_pool;
    pool.add_nft(item_id, staked_time, staked_time + MINIMUM_STAKE_DAYS * 86400)?;

    // 3. Update global count
    let global = &mut ctx.accounts.global_pool;
    global.staked_count = global.staked_count.checked_add(1)
        .ok_or(StakingError::Overflow)?;

    Ok(())
}
```

### 2.4 Verification Staking

The `stake_for_verification` instruction locks CLAWD tokens to mint a `ClawdVerificationRecord` PDA:

```rust
// PDA seed: ["clawd-verified", agent_pubkey]
pub fn stake_for_verification_handler(
    ctx: Context<StakeForVerification>,
    amount: u64,
) -> Result<()> {
    // Transfer CLAWD from agent ATA to program vault
    let transfer_ix = Transfer {
        from: ctx.accounts.agent_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.agent.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_ix),
        amount,
    )?;

    // Initialize the verification record
    let record = &mut ctx.accounts.verification_record;
    record.agent = ctx.accounts.agent.key();
    record.staked_amount = amount;
    record.staked_at = Clock::get()?.unix_timestamp;
    record.is_active = true;

    emit!(AgentVerified {
        agent: ctx.accounts.agent.key(),
        amount,
        timestamp: record.staked_at,
    });

    Ok(())
}
```

Any program can query this PDA to check if an agent is verified — no centralized list, no admin gate.

---

## 3. Agent Identity — Metaplex Core

Every Clawd agent is a Metaplex Core asset on Solana. Not a token. Not a database entry.

### 3.1 Minting an Agent Asset

```typescript
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { create, mplCore } from "@metaplex-foundation/mpl-core";

const umi = createUmi("https://api.devnet.solana.com").use(mplCore());

const assetKeypair = generateSigner(umi);

await create(umi, {
  asset: assetKeypair,
  name: "Cheshire Terminal Agent",
  uri: "https://x402.wtf/agents/cheshire-terminal/metadata.json",
  plugins: [
    {
      type: "Attributes",
      attributeList: [
        { key: "type", value: "agent" },
        { key: "runtime", value: "leviathan" },
        { key: "laws", value: "three-laws-v1" },
      ],
    },
  ],
}).sendAndConfirm(umi);
```

### 3.2 The Asset Signer PDA

Each Core asset has a program-derived wallet with no extractable private key:

```typescript
// Derive the Asset Signer PDA
const [assetSignerPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("mpl-core"), assetMint.toBuffer()],
  MPL_CORE_PROGRAM_ID
);

// The agent signs transactions through this PDA
// When the owner transfers the asset, the wallet transfers with it
```

### 3.3 On-Chain Agent Registry Metadata

```typescript
interface AgentRegistryMetadata {
  type: "agent";
  name: string;
  description: string;
  services: Array<{ name: string; endpoint: string }>;
  registrations: string[];    // supported registry IDs
  supportedTrust: string[];   // e.g., ["CAAP/1.0"]
}
```

---

## 4. CAAP/1.0 Auth Integration

**Clawd Agent Attestation Protocol** — cryptographic auth for AI agents.

### 4.1 Protocol Flow

```text
1. Agent generates Ed25519 keypair on first boot

2. POST /api/auth/agent/register
   Body: { publicKey, name, mode: "autonomous" | "delegated" }
   Response: { agentId, status: "pending" }

3. Owner approves at:
   /agents/approve?agent_id=<id>&code=<otp>
   Grants capabilities: attest_agent · get_peer_card · agent_chat

4. Agent signs JWT:
   {
     sub: agentId,
     iat: Date.now(),
     exp: iat + 60_000,     // 60-second expiry
     jti: crypto.randomUUID() // replay prevention
   }
   Authorization: Bearer <ed25519-signed-jwt>

5. Agent calls capability endpoints with Bearer token
```

### 4.2 TypeScript Implementation

```typescript
import { Keypair } from "@solana/web3.js";
import * as jose from "jose";

class CaapAgent {
  private keypair: Keypair;
  private agentId: string;

  async register(name: string): Promise<void> {
    const res = await fetch("https://x402.wtf/api/auth/agent/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: this.keypair.publicKey.toBase58(),
        name,
        mode: "autonomous",
      }),
    });
    const { agentId } = await res.json();
    this.agentId = agentId;
  }

  async signedFetch(url: string, init?: RequestInit): Promise<Response> {
    const jwt = await new jose.SignJWT({})
      .setSubject(this.agentId)
      .setIssuedAt()
      .setExpirationTime("60s")
      .setJti(crypto.randomUUID())
      .sign(this.keypair.secretKey);

    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${jwt}`,
      },
    });
  }
}
```

### 4.3 CLAWD Tier Gating

```typescript
// Capability gates by CLAWD balance (checked on-chain at request time)
const CAAP_TIERS = {
  free:  { minClawd: 0,       caps: ["list_agents", "get_peer_card"] },
  basic: { minClawd: 1_000,   caps: [...free.caps, "agent_chat"] },
  pro:   { minClawd: 10_000,  caps: [...basic.caps, "attest_agent"] },
  elite: { minClawd: 100_000, caps: ["*"], rateLimit: "none" },
} as const;
```

---

## 5. x402 Payment Integration

**wrapFetchWithX402** makes paid API calls transparent to the agent's business logic.

### 5.1 Wire-up

```typescript
import { wrapFetchWithX402 } from "@solanaclawd/x402-client";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const wallet = Keypair.fromSecretKey(/* agent's keypair bytes */);

// Replace global fetch — all 402 responses are handled automatically
const fetch = wrapFetchWithX402(globalThis.fetch, {
  connection,
  payer: wallet,
  network: "solana",
  currency: "USDC",
  maxAmountPerRequest: 0.01,  // max $0.01 USDC per auto-pay
});
```

### 5.2 The Payment Loop

```text
Agent calls API endpoint
  ↓
HTTP 402 returned: { amount, currency, payTo, challengeToken }
  ↓
wrapFetchWithX402 intercepts response
  ↓
Signs Solana USDC transfer to payTo with challengeToken
  ↓
Retries original request with payment proof header
  ↓
API returns 200 with content
  ↓
Business logic receives content (never saw the 402)
```

### 5.3 Publishing a Service Behind x402

```typescript
// Cloudflare Worker / Next.js edge handler
export async function GET(req: Request) {
  const payment = await verifyX402Payment(req);
  if (!payment.valid) {
    return new Response(null, {
      status: 402,
      headers: {
        "X-Payment-Required": JSON.stringify({
          amount: "0.001",
          currency: "USDC",
          network: "solana",
          payTo: VAULT_ADDRESS,
        }),
      },
    });
  }
  // Serve the paid resource
  return Response.json({ data: "..." });
}
```

---

## 6. ClawdRouter Integration

**OpenAI-compatible LLM router** at `https://clawd-router.fly.dev`.

### 6.1 Basic Usage

```typescript
const response = await fetch("https://clawd-router.fly.dev/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.CLAWD_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "clawdrouter/auto",  // auto-routes based on 15-dim scoring
    messages: [
      { role: "system", content: "You are a Solana DeFi agent." },
      { role: "user", content: userMessage },
    ],
  }),
});
```

### 6.2 Leviathan Depth Tier Routing

```typescript
function getModelForDepth(usdcBalance: number): string {
  if (usdcBalance >= 5)   return "claude-opus-4-8";
  if (usdcBalance >= 1)   return "claude-sonnet-4-6";
  if (usdcBalance >  0)   return "clawdrouter/budget";
  throw new Error("BEACHED: no USDC balance");
}

function getPulseInterval(usdcBalance: number): number {
  if (usdcBalance >= 5)   return 60_000;         // 1 minute
  if (usdcBalance >= 1)   return 5 * 60_000;     // 5 minutes
  if (usdcBalance >  0)   return 15 * 60_000;    // 15 minutes
  return Infinity;                                 // suspended
}
```

### 6.3 Phoenix Perps Relay

```typescript
// Live market data without managing your own data pipeline
const marketData = await fetch(
  "https://clawd-router.fly.dev/v1/relay/perps",
  { headers: { Authorization: `Bearer ${CLAWD_API_KEY}` } }
).then(r => r.json());

// marketData contains: markPrices, fundingRates, openInterest,
// orderbookDepth, volume, recentTrades
```

---

## 7. Skill Installation

Skills extend agent capabilities at runtime. Install from the OpenClawd catalog:

```bash
# Install the full Solana-Clawd skill pack
npx skills add Solizardking/solana-clawd

# Install a specific skill
npx skills add Solizardking/solana-clawd#vulcan-perps

# Install x402 payment skill
npx skills add Solizardking/solana-clawd#x402-payment-verification
```

**Core skill packages:**

| Skill | Description |
| --- | --- |
| `solana-clawd` | Full Solana development toolkit |
| `solana-clawd-agentic-commerce` | x402 + USDC commerce flows |
| `x402-payment-verification` | HTTP 402 challenge verification |
| `solana-attestation-skill` | SAS attestation record management |
| `vulcan` | Phoenix perps trading interface |
| `install-spinner` | 45+ themed CLI spinner packs |

---

## 8. Security Checklist

Before shipping an on-chain agent:

- [ ] `FreezeDelegate` adds to owner's wallet — asset never leaves custody
- [ ] All arithmetic uses `checked_add` / `checked_sub` — no overflow
- [ ] PDA seeds are deterministic — double-staking is impossible by construction
- [ ] No keypairs in `*.json`, `*.pem`, or `.env` files — `clawd-guard` will block the push
- [ ] Three Laws hash recorded in SAS attestation at spawn
- [ ] Ed25519 JWT expiry set to ≤ 60 seconds with UUID jti
- [ ] CLAWD tier verified on-chain at capability request time, not cached

---

## 9. Live Addresses Reference

```text
Network: Solana devnet

Programs:
  Staking:        9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
  MPL Core:       CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d

PDAs:
  GlobalPool:     DEYfxcRB4rxFxRrWyjfzfHBS6PWYpFb8djxQrKHwe2XQ

Token:
  $CLAWD:         8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump

Services:
  x402 gateway:   https://x402.wtf
  ClawdRouter:    https://clawd-router.fly.dev
  ACP discovery:  https://x402.wtf/.well-known/acp.json
```

---

*Full whitepaper: [WHITEPAPER.md](WHITEPAPER.md)*
*GitHub: [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)*
