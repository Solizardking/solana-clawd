# Contributing to solana-clawd

solana-clawd is developed in public and we appreciate contributions.

## Important: Branch Targeting

The `main` branch is the integration branch. All feature work and bug fixes should target `main`.

## Prerequisites

- [Just](https://github.com/casey/just) (command runner)
- [Rust](https://rustup.rs) 1.86+
- [Solana CLI](https://docs.solanalabs.com/cli/install) 2.2+
- [Node.js](https://nodejs.org) 20+ and pnpm (for SDK)

## Getting Started

Install all dependencies:

```bash
just install
```

### Rust CLI

```bash
just rs build              # Build release binary
just rs lint               # Clippy (warnings = errors)
just rs fmt                # Format check
just rs test               # Run all tests
just rs unit-test          # Unit tests only
just rs integration-test   # Integration tests only
just rs run -- --help      # Run the CLI
```

### TypeScript SDK

```bash
just ts install            # Install pnpm dependencies
just ts build              # Build the core package
just ts lint               # Check lint + formatting
just ts fmt                # Auto-fix formatting + lint
just ts typecheck          # Typecheck
just ts test               # Run tests
just ts test-watch         # Run tests in watch mode
```

## Before Submitting

Run `just ci` (full lint, typecheck, test, build for both Rust and TypeScript).

Use conventional commits (`feat:`, `fix:`, `chore:`, etc.).

## Project Structure

```
solana-clawd/
├── pay/                  # Pay gateway (Cloudflare Worker) — x402, MPP, ClawdRouter
│   └── src/
│       ├── index.ts      # Worker entry — HTTP routes + MCP endpoint
│       ├── sign.ts       # Solana tx signing (CLI + MCP shared)
│       ├── attest.ts     # x402 payment attestation bridge (SAS)
│       ├── google-agent-identity.ts  # Google ADK ↔ Solana identity bridge
│       ├── clawd-discovery.ts        # Clawd agent discovery layer
│       ├── mcp-server-handler.ts     # JSON-RPC 2.0 MCP server
│       ├── mcp-sign-handler.ts       # MCP sign_transaction tool
│       └── sign.test.ts  # E2E signing tests
├── agents/               # Agent definitions (125+ Solana agents)
│   └── cli/              # clawd-agents CLI
│       └── src/
│           ├── cli.ts    # CLI entry — scaffold, deploy, publish, identity, sign
│           └── commands/
│               ├── identity.ts  # On-chain identity (create/attest/verify/spiffe/bridge-google)
│               └── sign.ts      # Pay.sh transaction signing
├── scripts/              # Automation scripts
│   └── agent-identity-attest.sh  # Full identity attestation pipeline
├── clawdrouter/          # ClawdRouter — LLM routing powered by $CLAWD
├── mcp-server/           # Pump SDK MCP server (53 tools)
├── skills/               # ~130 agent skills
└── x402/                 # x402 protocol implementation for Solana
```

## Key Protocol Addresses

| Component | Address |
|-----------|---------|
| Clawd Token (authority) | `CLAWdRg8ZbE7eAhZ8PJKJqBuDnTHruxvV7r5QGSPump` |
| SAS Attestation | `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG` |
| MPL Core NFTs | `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d` |
| dna-x402 Receipts | `6HSRGivdYR5D7yTDy1TFMCM8h3LzXxRtKU1RA3RnCMRN` |
| Pay MCP Server | `https://pay.solanaclawd.com/mcp` |

## Pull Request Process

1. Fork the repo and create your branch from `main`
2. Run `just ci` and ensure all checks pass
3. Update documentation if you're changing APIs
4. Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`)
5. Open a PR against `main` with a clear description
6. Link any related issues

## Submitting to solana-foundation/pay

This project extends the Solana Foundation Pay ecosystem with:

- **Solana transaction signing** (CLI + MCP) — `pay/src/sign.ts`
- **x402 payment attestation** on-chain via SAS — `pay/src/attest.ts`
- **Google ADK Agent Registry bridge** — SPIFFE identity → Solana wallet → MPL Core NFT → SAS | `pay/src/google-agent-identity.ts`
- **Clawd Discovery Layer** — 6 indexed agents, trust gates, ARS/Telaro bond integration, dna-x402 receipt slash evidence, AI consumer configs (Claude/OpenAI/OpenCode/Google ADK)
- **Professional CLI** — `clawd-agents identity create|attest|verify|spiffe|bridge-google` and `clawd-agents sign <BASE64_TX>`

PRs to [solana-foundation/pay](https://github.com/solana-foundation/pay/pulls) should target the signing and attestation modules in `pay/src/`.

## Community

- ClawdRouter: https://clawdrouter.fly.dev/v1
- Agent Registry: https://x402.wtf/agents/registry
- CAAP/1.0 Discovery: https://x402.wtf/.well-known/agent-auth.json