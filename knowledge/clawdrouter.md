# 🦞 ClawdRouter

<div align="center">

**A lobster-themed multi-protocol agentic payment gateway for Solana**

🦞 *"The lobster that never forgets a route!"* 🦞

</div>

```
    ╔════════════════════════════════════════════════════════════════════════╗
    ║                                                                        ║
    ║   ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄   ║
    ║  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ║
    ║  ▓                                                                ▓   ║
    ║  ▓   ██╗   ██╗ ██████╗ ██████╗ ███╗   ██╗██╗ ██████╗         ▓   ║
    ║  ▓   ██║   ██║██╔═══██╗██╔══██╗████╗  ██║██║██╔════╝         ▓   ║
    ║  ▓   ███████║██║   ██║██████╔╝██╔██╗ ██║██║██║  ███╗        ▓   ║
    ║  ▓   ██╔══██║██║   ██║██╔══██╗██║╚██╗██║██║██║   ██║        ▓   ║
    ║  ▓   ██║   ██║╚██████╔╝██║  ██║██║ ╚████║██║╚██████╔╝        ▓   ║
    ║  ▓   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝         ▓   ║
    ║  ▓                                                                ▓   ║
    ║  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   ║
    ║                                                                        ║
    ║          🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞🦞          ║
    ║                                                                        ║
    ║          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          ║
    ║          ░░  🦞  C L A W D   R O U T E R  🦞  ░░░          ║
    ║          ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          ║
    ║                                                                        ║
    ║          "The LLM Router Built for Autonomous Solana Agents"              ║
    ║                                                                        ║
    ║          ╔════════════════════════════════════════════╗                 ║
    ║          ║   🦞  Solana Blockchain Integration  🦞   ║                 ║
    ║          ║   ┌────────────────────────────────┐     ║                 ║
    ║          ║   │ • 55+ Models across 9 Providers  │     ║                 ║
    ║          ║   │ • USDC x402 Micropayments         │     ║                 ║
    ║          ║   │ • Ed25519 Wallet Authentication  │     ║                 ║
    ║          ║   │ • <1ms Smart Routing             │     ║                 ║
    ║          ║   │ • OODA Loop Strategy             │     ║                 ║
    ║          ║   └────────────────────────────────┘     ║                 ║
    ║          ╚════════════════════════════════════════════╝                 ║
    ║                                                                        ║
    ╚════════════════════════════════════════════════════════════════════════╝
```

> Multi-protocol agentic payment gateway for Solana. One endpoint, four protocols, one settlement layer.

**Gateway:** `x402.wtf`  
**IPFS:** `ipfs.x402.wtf`  
**Settlement:** Solana L1 (SPL USDC + $CLAWD)  
**Revenue:** holders of agents registered in the ClawdRouter registry earn from every call.

## Why this exists

The EVM-first x402 docs assume Base and ERC-20 USDC. $CLAWD lives on Solana. This repo is a drop-in replacement facilitator + gateway that:

1. Speaks **x402** natively on Solana (Ed25519, SPL Token program, Helius RPC).
2. Speaks **MPP** (Machine Payments Protocol, Tempo/Stripe) and bridges its `charge` intent to a Solana transfer.
3. Speaks **AP2** (Google Agent Payments Protocol) — accepts Verifiable Credential payment mandates, settles on Solana.
4. Speaks **A2A** (Google Agent-to-Agent) — wraps A2A task invocations with any of the above payment protocols.
5. Returns the resource via a single content-negotiated response that satisfies whichever protocol the caller picked.

## Revenue Model

Every settled payment is swept into the `clawd-vault` Anchor program. Default split per agent call:

| Recipient | Share | Mechanism |
|-----------|-------|-----------|
| Agent owner | 70% | Direct SPL transfer from vault |
| $CLAWD buyback | 15% | Jupiter swap USDC → $CLAWD → burn or vault |
| ClawdRouter treasury | 10% | Squads multisig |
| Operator (node) | 5% | Whoever ran the facilitator for that call |

Splits are per-agent configurable in the registry PDA. An agent can also be registered as a revenue-share token (a holder who holds N units of a per-agent SPL mint claims a pro-rata share).

## $CLAWD Holder Discount

Every call checks the caller's $CLAWD balance on-chain. Holders get a tiered discount:

| Balance | Discount |
|---------|----------|
| ≥ 100k $CLAWD | 10% |
| ≥ 1M $CLAWD | 25% |
| ≥ 10M $CLAWD | 50% |

The discount is applied to `maxAmountRequired` before the challenge is returned. No post-hoc rebates.

## Layout

```
worker/              Cloudflare Worker gateway + facilitator
  src/
    index.ts         Hono app, routes, middleware wiring
    types.ts         Shared types
    clawd.ts         Holder balance + discount
    revenue.ts       Split math
    protocols/
      negotiate.ts   Content negotiation across x402/MPP/AP2/A2A
      x402.ts        x402 challenge + receipt
      mpp.ts         MPP WWW-Authenticate: Payment scheme
      ap2.ts         AP2 Verifiable Credential mandates
      a2a.ts         A2A task protocol with payment
    solana/
      x402.ts        Solana-native `exact` scheme (Ed25519 + SPL)
      facilitator.ts /verify and /settle endpoints
      registry.ts    On-chain agent registry PDA client
      rpc.ts         Helius primary, SolanaTracker fallback
    ipfs/
      pinata.ts      Pin agent manifests and receipts

programs/
  clawd-vault/       Anchor program for revenue split + buyback
    src/lib.rs

sdk/                 @solanaclawd/x402-client — for agents paying
  src/index.ts

deploy/
  wrangler.jsonc     Production config
```

## Deploy

```sh
# Worker gateway
cd worker
npm install
npx wrangler secret put HELIUS_API_KEY
npx wrangler secret put PINATA_JWT
npx wrangler secret put OPERATOR_KEYPAIR    # base58 signing key for settlement
npx wrangler deploy

# Anchor program
cd programs/clawd-vault
anchor build
anchor deploy --provider.cluster mainnet
```

## Endpoints

| Route | Purpose |
|-------|---------|
| `POST /facilitator/verify` | x402 facilitator verify (Solana `exact` scheme) |
| `POST /facilitator/settle` | x402 facilitator settle (broadcasts to Helius) |
| `GET /facilitator/supported` | Returns supported networks and tokens |
| `ANY /agents/:id/*` | Invoke a registered agent (payment-gated) |
| `POST /registry/register` | Register an agent (creates PDA) |
| `GET /registry/:id` | Fetch agent manifest from IPFS |
| `POST /a2a/:id/tasks/send` | A2A task send (payment-gated) |
| `GET /a2a/:id/.well-known/agent.json` | A2A agent card |

## Status

Core payment flow (x402 + Solana facilitator + registry) is functional. MPP, AP2, A2A handlers are implemented at the protocol-frame level.

## License

MIT — See [`LICENSE`](LICENSE)

---

## Agent Knowledge Summary

> Quick-lookup facts for agent context loading. Cross-references: `codebase-facts.jsonl` cbfact-006 (ClawdRouter vs x402.wtf distinct services), `facts.jsonl` fact-cli-006 (free-key provisioning flow), `api-behaviors.jsonl` api-008 (clawd_free_* key format), `decisions.jsonl` decision-006 (why Fly.io over Vercel/Railway), `anti-patterns.jsonl` anti-009 (hardcoded RPC URLs).

**Deployment:** Cloudflare Worker at `x402.wtf`. NOT the same as `clawdrouter.fly.dev` (which is the LLM proxy). This is the multi-protocol payment gateway + Anchor vault.

**Four protocols handled:**

| Protocol | Description |
|----------|-------------|
| x402 | HTTP 402 on Solana (Ed25519, SPL Token, Helius RPC) |
| MPP | Machine Payments Protocol — `charge` intent → Solana transfer |
| AP2 | Google Agent Payments Protocol — Verifiable Credential mandates |
| A2A | Google Agent-to-Agent — wraps task invocations with payment |

**Revenue split per call (configurable per agent via registry PDA):**

| Recipient | Share |
|-----------|-------|
| Agent owner | 70% |
| $CLAWD buyback (Jupiter USDC→$CLAWD→burn) | 15% |
| ClawdRouter treasury (Squads multisig) | 10% |
| Operator (facilitator runner) | 5% |

**$CLAWD holder discounts:** 100k = 10% off, 1M = 25% off, 10M = 50% off. Applied to `maxAmountRequired` before challenge is returned.

**Key endpoints:**

| Route | Purpose |
|-------|---------|
| `POST /facilitator/verify` | x402 verify (Solana exact scheme) |
| `POST /facilitator/settle` | x402 settle (broadcasts via Helius) |
| `ANY /agents/:id/*` | Invoke registered agent (payment-gated) |
| `POST /registry/register` | Register agent (creates PDA) |
| `POST /a2a/:id/tasks/send` | A2A task send |

**Anchor program:** `clawd-vault` — handles revenue split + $CLAWD buyback. Deploy: `anchor deploy --provider.cluster mainnet`.

**IPFS:** Agent manifests and receipts pinned via Pinata (`PINATA_JWT` secret).

**RPC:** Helius primary, SolanaTracker as fallback (set `HELIUS_API_KEY` in wrangler secrets).