# Solana Clawd x402 Implementation Map

This repo has two x402 layers:

1. `agents/` exposes the paid-agent catalog, registry JSON, and hub docs.
2. [`solana-clawd-x402/`](../../solana-clawd-x402/README.md) contains the fuller Solana-native x402 gateway, Worker, SDK, vault program, and example agent flows.

Use this document when you need to connect an agent in `agents/src/*.json` to the code that actually prices, challenges, verifies, settles, and receipts paid calls.

## Where the real implementation lives

| Area | Path | Purpose |
| --- | --- | --- |
| Gateway Worker | [`solana-clawd-x402/worker/src/index.ts`](../../solana-clawd-x402/worker/src/index.ts) | Main HTTP entrypoint for health, registry, facilitator, A2A, and paid agent routes |
| Protocol negotiation | [`solana-clawd-x402/worker/src/protocols/`](../../solana-clawd-x402/worker/src/protocols/) | x402, MPP, AP2, and A2A request handling |
| Solana verification | [`solana-clawd-x402/worker/src/solana/x402.ts`](../../solana-clawd-x402/worker/src/solana/x402.ts) | Validates signed payment transactions against the challenge |
| Facilitator | [`solana-clawd-x402/worker/src/solana/facilitator.ts`](../../solana-clawd-x402/worker/src/solana/facilitator.ts) | `/verify`, `/settle`, `/supported` surface for x402-compatible servers |
| Registry reader | [`solana-clawd-x402/worker/src/solana/registry.ts`](../../solana-clawd-x402/worker/src/solana/registry.ts) | Reads pricing, endpoint, and payout config from on-chain accounts |
| Client SDK | [`solana-clawd-x402/sdk/src/index.ts`](../../solana-clawd-x402/sdk/src/index.ts) | Auto-pay and retry client for paid calls |
| Vault program | [`solana-clawd-x402/programs/clawd-vault/src/lib.rs`](../../solana-clawd-x402/programs/clawd-vault/src/lib.rs) | Anchor registry and payout vault |
| Top-level examples | [`solana-clawd-x402/`](../../solana-clawd-x402/) | Example A2A, confidential-agent, p-token, launchpad, and facilitator patterns |

## How `/agents` maps into the x402 implementation

The JSON files in [`agents/src/`](../src/) define the product surface. The `solana-clawd-x402` subtree provides the payment rail behind them.

### Catalog agents backed by the x402 rail

These are the clearest agent-layer entry points today:

| Agent JSON | Role | Implementation anchor |
| --- | --- | --- |
| [`solana-clawd-payment-gateway.json`](../src/solana-clawd-payment-gateway.json) | Resolves paid API calls and retries with proof of payment | Worker gateway + facilitator |
| [`solana-x402-provider-catalog.json`](../src/solana-x402-provider-catalog.json) | Finds the cheapest viable paid provider path | Registry + facilitator + provider routing |
| [`solana-x402-solana-rpc-broker.json`](../src/solana-x402-solana-rpc-broker.json) | Buys Solana RPC / DAS / analytics reads | Worker payment challenge + settlement path |
| [`solana-x402-market-data-buyer.json`](../src/solana-x402-market-data-buyer.json) | Buys paid market data | Same challenge / verify / settle flow |
| [`solana-x402-provider-author.json`](../src/solana-x402-provider-author.json) | Authors or updates paid provider surfaces | Registry and pricing metadata |
| [`solana-x402-research-broker.json`](../src/solana-x402-research-broker.json) | Buys research and data tasks | A2A/x402 paid task execution |
| [`solana-x402-signal-monetizer.json`](../src/solana-x402-signal-monetizer.json) | Sells proprietary signals | Pricing + settlement + receipts |
| [`solana-x402-webhook-settlement.json`](../src/solana-x402-webhook-settlement.json) | Handles webhook-driven settlement workflows | Facilitator + receipt flow |

## Supporting packages already in the repo

There are two lighter-weight surfaces alongside the main subtree:

| Package | Path | Purpose |
| --- | --- | --- |
| `@pump-fun/x402` | [`x402/`](../../x402/README.md) | Library package for HTTP 402 payment middleware and client helpers |
| `@openclawd/agents-x402` | [`packages/agents-x402-solana/`](../../packages/agents-x402-solana/README.md) | Thin MCP/HTTP monetization wrapper for paid tools and handlers |

Use `solana-clawd-x402/` when you need the full Solana-native gateway + Worker + program stack. Use the package surfaces when you only need embeddable middleware or helpers.

## Integration rules for new paid agents

When adding or updating a paid agent in `agents/src/`:

1. Keep the agent JSON focused on product behavior, routing policy, spend controls, and UX.
2. Point operational implementation back to the `solana-clawd-x402` subtree rather than duplicating payment logic.
3. Reuse the existing x402 terminology consistently: `challenge`, `verify`, `settle`, `receipt`, `payer`, `payTo`, `allowedAssets`, `maxAmount`.
4. Keep payment network declarations aligned with the gateway implementation: Solana mainnet plus supported protocols (`x402`, `mpp`, optionally `ap2` / `a2a`).
5. If you add a new protocol or settlement mode in the Worker, update the agent docs here and in [`agents/README.md`](../README.md).

## File-level guide to the standalone examples

These top-level files in `solana-clawd-x402/` are examples and design references, not the canonical runtime entrypoints:

| File | Use |
| --- | --- |
| [`a2a-agent.ts`](../../solana-clawd-x402/a2a-agent.ts) | Agent-to-agent paid JSON-RPC flow |
| [`client-sdk.ts`](../../solana-clawd-x402/client-sdk.ts) | Client-side payment + retry usage |
| [`confidential-agent.ts`](../../solana-clawd-x402/confidential-agent.ts) | Paid confidential or gated agent pattern |
| [`dark-defi.ts`](../../solana-clawd-x402/dark-defi.ts) | Example DeFi-oriented paid-agent flow |
| [`EXAMPLE.md`](../../solana-clawd-x402/EXAMPLE.md) | End-to-end usage example and walkthrough material |
| [`gateway-index.ts`](../../solana-clawd-x402/gateway-index.ts) | Alternate gateway wiring sketch |
| [`p-token.ts`](../../solana-clawd-x402/p-token.ts) | p-token flow reference |
| [`p-token-launchpad.ts`](../../solana-clawd-x402/p-token-launchpad.ts) | Launchpad pattern |
| [`p-token-stream-facilitator.ts`](../../solana-clawd-x402/p-token-stream-facilitator.ts) | Streaming facilitator example |
| [`paysh-facilitator.ts`](../../solana-clawd-x402/paysh-facilitator.ts) | pay.sh-style facilitator example |
| [`solana-x402-scheme.ts`](../../solana-clawd-x402/solana-x402-scheme.ts) | Shared scheme and protocol shape reference |
| [`clawd-vault-program.rs`](../../solana-clawd-x402/clawd-vault-program.rs) | Top-level Rust sketch for the vault program |

## Recommended read order

1. [`solana-clawd-x402/README.md`](../../solana-clawd-x402/README.md)
2. [`solana-clawd-x402/worker/src/index.ts`](../../solana-clawd-x402/worker/src/index.ts)
3. [`solana-clawd-x402/worker/src/protocols/x402.ts`](../../solana-clawd-x402/worker/src/protocols/x402.ts)
4. [`solana-clawd-x402/worker/src/solana/x402.ts`](../../solana-clawd-x402/worker/src/solana/x402.ts)
5. [`solana-clawd-x402/sdk/src/index.ts`](../../solana-clawd-x402/sdk/src/index.ts)
6. [`solana-clawd-x402/programs/clawd-vault/src/lib.rs`](../../solana-clawd-x402/programs/clawd-vault/src/lib.rs)
