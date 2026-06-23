# Repository Map

This checkout is a public monorepo. Keep source, docs, generated output, and
private runtime state separated so deploys can stay small and safe.

## Primary Workspaces

| Path | What Lives Here | Public-Share Rule |
| --- | --- | --- |
| `src/` | Core Leviathan/OpenClawd runtime, identity, setup, and services | Source only; no local vaults or generated state |
| `packages/` | Reusable packages: agent hub, wallet, registry, guard, SDKs, CLIs | Package source and examples only |
| `clawd-code/` | Standalone Clawd Code CLI and web console | Keep real `~/.clawd-code/.env` outside git |
| `services/gateway/` | HTTP/Telegram gateway deployed by Fly | Configure secrets with `fly secrets set`, not `fly.toml` |
| `agents/` | Agent catalog, registry metadata, overlays, and public discovery files | Public metadata only |
| `skills/` | Skill catalog and local skill definitions | Instructions and examples only; no credentials |
| `trading/` | Perps agent, formal verification helpers, staking and trading integrations | Paper-first defaults; live config stays in local env |
| `x402/` | x402 payment examples and Solana commerce plumbing | No wallet keys or paid-provider secrets |
| `hermes-blockchain-oracle/` | Python Solana oracle package and smoke tests | Public RPC defaults only |
| `ai-training/` | Local/cloud model training and site package | Local-only by default; do not mirror private datasets or checkpoints |
| `gfx2/`, `assets/`, `public/` | Public screenshots, static library assets, and docs images | Use inspectable public assets only |
| `docs/` | Design notes, update logs, and release documentation | No private URLs, tokens, or operator details |

## Local-Only State

These paths are intentionally ignored or deployment-excluded:

- `.env`, `.env.*`, `.vercel/`, `.solana/`, `.claude/`, `.clawd/`, `.grok/`
- `agent-wallet.json`, wallet/keypair JSON, raw key dumps, private keys, service accounts
- `.agent-sessions/`, `.vulcan/`, `.paper/`, `.perps/`, databases, local session logs
- `node_modules/`, `dist/`, `outputs/`, `hf/`, model checkpoints, caches, test reports

Run `npm run audit:repo` before pushing or deploying from this tree.
