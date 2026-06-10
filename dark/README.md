# Dark Workspace

The `dark/` workspace is the public-safe, local-first wallet stack for the
ZOLana build. It keeps the wallet shell, paper-wallet flow, policy lane, DeFi
lane, and swap lane separated so each surface stays understandable and easy to
port forward.

## What Lives Here

| Module | Role |
|---|---|
| `dark-wallet` | Browser wallet shell, paper wallet generator, and staged vault UX |
| `dark-agent` | Policy and automation modes, guardrails, TEE and ZK surface logic |
| `dark-defi` | Vault, yield, risk, shielded pool, and privacy-mix views |
| `dark-swap` | Route previews, quote estimation, and Jupiter V6 concepts |
| `dark-zcash` | Zcash-style privacy primitives adapted for the Solana demo lane |
| `dark-helius` | Helius RPC, DAS, webhooks, and smart-transaction helpers |

## How The Zcash Paper Wallet Was Ported To Solana

In November 2025, the paper-wallet concept from the Zcash `paper/` repo was
ported into the Solana-facing dark wallet instead of being copied verbatim.
The UX stayed the same at a high level:

1. Generate locally.
2. Ask for extra human entropy.
3. Print a cold-storage sheet.
4. Keep the secret key offline.

The cryptographic core changed:

1. Zcash Sapling derivation was replaced with Solana `Keypair.fromSeed`.
2. The printable sheet now shows the Solana public key, secret key JSON, and
   fingerprints instead of Sapling note material.
3. The output is browser-local, so the paper-wallet flow does not need RPC.
4. The wallet shell adds devnet and mainnet-beta support through Helius-aware
   RPC resolution.

The surrounding wallet architecture changed too:

1. The old single-surface wallet concept was split into `wallet`, `paper`,
   `agent`, `defi`, `swap`, and `zolana` tabs.
2. The paper wallet lives beside a Dark Clawd agent sidecar that can review
   public metadata and print posture when `XAI_API_KEY` is configured.
3. A private-payment primitive was added for `x402`, `AP2`, and `M2M` style
   flows so private staging can be described explicitly instead of being hidden
   behind a generic transfer label.

## Runtime Inputs

The Vite app exposes these env vars at build time:

```bash
HELIUS_RPC_URL=
HELIUS_API_KEY=
SOLANA_RPC_URL=
SOLANA_CLUSTER=
XAI_API_KEY=
XAI_BASE_URL=
XAI_MODEL=
```

Use `SOLANA_CLUSTER=devnet` or `SOLANA_CLUSTER=mainnet-beta` to pick the
default cluster. If `HELIUS_API_KEY` is set, the wallet will build the proper
Helius RPC URL automatically unless `HELIUS_RPC_URL` is provided directly.

## Quick Start

```bash
npm run dark:dev
```

Or run the wallet app directly:

```bash
cd dark/dark-wallet
npm install
npm run dev
```

Then open the wallet surface and switch to the `Paper` tab to generate a local
Solana paper wallet, review it with Dark Clawd, stage a private payment
primitive, and print or download the JSON backup.

## Operational Notes

- The paper-wallet generator is browser-local.
- Printing uses the browser print dialog, so `Save as PDF` works without a
  separate PDF library.
- The agent sidecar only sees public metadata and operator instructions.
- The vault history is local-first until the live Solana surfaces are enabled.

## Related Docs

- [dark-wallet README](./dark-wallet/README.md)
- [Root README](../README.md)
