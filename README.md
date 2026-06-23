# OpenClawd Solana

OpenClawd Solana is a public monorepo for Solana-native AI agents, tools, and
runtime services. It combines the Leviathan agent runtime, the `clawd-code`
coding CLI, an HTTP/Telegram gateway, a 95+ skill catalog, perps and x402
workflows, model-kit training utilities, and small companion packages for
wallets, registries, research, and agent identity.

The project is built for public development, but it assumes a strict secret
boundary: real `.env` files, wallet keypairs, RPC credentials, API keys, local
session state, and model checkpoints stay out of git.

## What Is Included

| Area | Path | Purpose |
| --- | --- | --- |
| Runtime | `src/`, `packages/` | Leviathan/OpenClawd runtime, registry, wallet, research, guard, and CLI packages |
| Clawd Code | `clawd-code/` | Curl-installable Solana AI coding CLI with Grok-first defaults, wallet helpers, paper-gated perps, voice, research, image, and REPL modes |
| Gateway | `services/gateway/` | Express HTTP gateway, Telegram webhook/long-polling bridge, skill/agent APIs, staking pages, x402 and Clawd Gate access policy |
| Skills | `skills/`, `skills/catalog.json` | 105 local skill entries in this checkout, with public gateway metadata enrichment |
| Agents | `agents/` | Agent catalog, character overlays, staking/minter workspaces, and public discovery docs |
| Trading | `trading/` | Perps agent, formal verification helpers, staking program docs, and trading integrations |
| Model Kit | `ai-training/` | Local/cloud model training, NVIDIA blueprint experiments, dataset tooling, and the `8bitlabs.ai` site package |
| Hermes Oracle | `hermes-blockchain-oracle/` | Python MCP-style Solana oracle smoke-tested against public Solana RPC |
| E2B Runners | `scripts/e2b-clawd-code-sandbox.mjs`, `scripts/e2b-clawd-grok-sandbox.mjs` | Isolated Clawd Code and Clawd Grok sandbox plans/runners for E2B Code Interpreter |

## Quick Start

```bash
pnpm install --frozen-lockfile
npm run audit:repo
npm run check
npm run build
```

Run the main local smoke checks:

```bash
npm --prefix clawd-code run build
npm --prefix clawd-code test
npm --prefix services/gateway test
npm --prefix trading/clawd-perps-agent run build
npm run site:check
npm run e2b:clawd-code:dry
npm run e2b:clawd-grok:dry
```

The gateway smoke binds to `127.0.0.1` and starts an ephemeral local server. The
Hermes oracle live smoke reaches public Solana RPC:

```bash
python3 hermes-blockchain-oracle/test_oracle.py
```

## Clawd Code

`clawd-code/` is the standalone Solana AI coding CLI package.

```bash
cd clawd-code
npm install
npm run build
npm test
node dist/cli.js --help
```

Common commands after installation:

```bash
clawd-code code "Build a Jupiter swap bot in TypeScript"
clawd-code wallet create
clawd-code wallet list
clawd-code trade "funding rate on SOL perps"
clawd-code research --agents 16 "Solana perps funding arb"
clawd-code voice --agent
clawd-code repl
clawd-code /inspect
```

Default models are Grok-first:

| Mode | Default |
| --- | --- |
| `code`, `repl`, `trade` | `grok-4.3` |
| `research` | `grok-4.20-multi-agent` |
| `image` | `grok-imagine-image-quality` |
| `voice --agent` | `grok-voice-think-fast-1.0` |
| fast/cheap | `grok-4.3-fast` |

Configuration lives in `~/.clawd-code/.env`, `./.env`, and optional
`~/.grok/config.toml` / `./.grok/config.toml`. Never commit those real config
files.

## Gateway

The gateway package builds into its own package-local `dist/` directory so it
can resolve `services/gateway/node_modules` in local and container runs.

```bash
npm install --prefix services/gateway
npm --prefix services/gateway test
npm --prefix services/gateway start
```

Important gateway gates:

```bash
CLAWD_PRODUCTION_MODE=true
CLAWD_MIN_LIVE_TIER=SHORELINE
CLAWD_GATE_PAID_FEATURES=true
CLAWD_MIN_PAID_TIER=SHALLOW
GATEWAY_ADMIN_KEY=<server-side-admin-key>
```

Public read-only routes remain open. Live mutation routes and paid hosted
features require either `X-Clawd-Wallet` holder access or `X-Gateway-API-Key`
admin access.

## Perps Agent

The TypeScript perps agent in `trading/clawd-perps-agent/` now depends on the
public npm package `@openclawdsolana/clawd-perps` instead of a local
`openclawd-framework` symlink.

```bash
npm install --prefix trading/clawd-perps-agent
npm --prefix trading/clawd-perps-agent run typecheck
npm --prefix trading/clawd-perps-agent run build
```

Perps and trading flows are paper-first. Live execution must be explicitly
armed:

```bash
LIVE_TRADING=true
OPERATOR_CONFIRMED=true
PERPS_SIM_ONLY=false
```

## Environment

Start from `.env.example` files and copy them locally:

```bash
cp .env.example .env
cp clawd-code/.env.example ~/.clawd-code/.env
```

Common optional keys:

| Category | Variables |
| --- | --- |
| AI providers | `XAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` |
| Solana | `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `SOLANA_RPC_URL`, `SOLANA_PUBLIC_KEY` |
| Gateway | `GATEWAY_PORT`, `GATEWAY_ADMIN_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL` |
| x402 | `X402_ENABLED`, `X402_NETWORK`, `X402_FACILITATOR_URL`, `X402_MAX_PER_REQUEST` |
| E2B | `E2B_API_KEY`, `CLAWD_E2B_REPO`, `CLAWD_E2B_BRANCH`, `CLAWD_E2B_PASS_PROVIDER_KEYS` |

The public `8bitlabs.ai` Clawd Grok sandbox computer is additionally holder
gated: browser launches require a Phantom/Solana wallet signature and a mainnet
`$CLAWD` balance of at least `1,000` before the API creates an E2B sandbox.

Do not commit real values. `.env`, `.env.*`, wallet/keypair files, raw key dumps,
databases, local sessions, generated outputs, and model artifacts are ignored.

## Security And Public Release Rules

This repo is intended for public GitHub publishing with clean history.

- Publish from a sanitized fresh export, not the old local git history.
- Do not publish `.env`, wallet JSON, keypairs, private keys, service-account
  files, local sessions, `.clawd/`, `.claude/`, `node_modules/`, `dist/`,
  `outputs/`, or model checkpoint files.
- Do not publish local symlinks such as `openclawd-framework`.
- Keep examples placeholder-shaped, not secret-shaped. For example, use
  `replace-with-clawd-api-key`, not a value that looks like a live key.
- Run `npm run audit:repo` before every public push.

The gateway currently has remaining moderate `uuid` advisories through
`@solana/web3.js` / Metaplex dependency chains with no npm fix available. The
high `form-data` advisory was removed during this pass.

## Verified Smoke Status

Verified locally on June 23, 2026:

| Check | Result |
| --- | --- |
| `npm run audit:repo` | Pass: 0 tracked secret filenames, 0 unapproved secret-pattern hits |
| `npm run check` | Pass |
| `npm run build` | Pass |
| `bash -n install.sh` | Pass |
| `bash install.sh --help` | Pass |
| `npm --prefix clawd-code run build` | Pass |
| `npm --prefix clawd-code test` | Pass: 62 tests |
| `npm run site:check` | Pass |
| `npm run e2b:clawd-code:dry` | Pass, no provider keys forwarded |
| `npm run e2b:clawd-grok:dry` | Pass, no provider or Solana read keys forwarded |
| `npm --prefix services/gateway test` | Pass: 130 agents, 105 skills |
| `npm --prefix trading/clawd-perps-agent run typecheck` | Pass |
| `npm --prefix trading/clawd-perps-agent run build` | Pass |
| `npm --prefix trading/clawd-perps-agent audit --audit-level=high` | Pass |
| `python3 hermes-blockchain-oracle/test_oracle.py` | Pass with network access |

## License

MIT. See [LICENSE](./LICENSE).
