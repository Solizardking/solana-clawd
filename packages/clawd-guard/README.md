# 🛡️ Clawd Guard

> **Secret scanner GitHub App for the OpenClawd ecosystem — powered by Claude Opus 4.8**

[![npm](https://img.shields.io/badge/npm-%40openclawdsolana%2Fclawd--guard-red)](https://www.npmjs.com/package/@openclawdsolana/clawd-guard)
[![Claude Opus](https://img.shields.io/badge/AI-Claude%20Opus%204.8-6366f1)](https://www.anthropic.com)
[![GitHub App](https://img.shields.io/badge/GitHub-App-24292f)](https://github.com/apps/clawd-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

Clawd Guard is a **GitHub App + pre-commit hook** that prevents private keys, API credentials, and wallet secrets from ever reaching your repository. It runs a two-layer scan on every PR and direct push: a fast regex pass over 20+ secret patterns, then a full-context analysis by **Claude Opus 4.8** to catch anything the patterns miss.

Built for Solana-native teams shipping autonomous AI agents with real wallets on-chain — where a single exposed key means real fund loss.

---

## How It Works

```
PR opened / push to main
         │
         ▼
  ① Regex Scanner ──────────────────────────────────────────────────────────
  │  • Solana base58 private keys (87–88 chars)           Blocks commit
  │  • Ethereum hex private keys (0x + 64 hex)            immediately if
  │  • AWS Access Key IDs (AKIA…)                         matched
  │  • GitHub tokens (ghp_/gho_/ghs_/ghr_/ghu_)
  │  • Anthropic / OpenAI / XAI / Stripe API keys
  │  • PEM private key blocks (RSA, EC, OpenSSH)
  │  • Database URLs with embedded passwords
  │  • Mnemonic seed phrases (BIP-39 12/24 words)
  │  • Solana keypair JSON arrays ([u8; 64])
         │
         ▼
  ② Claude Opus 4.8 Analysis ───────────────────────────────────────────────
     • Reads full diff context — not just line matches
     • Distinguishes real secrets from test fixtures / env references
     • Reports: type, line number, redacted preview, remediation suggestion
     • Gracefully degrades to regex-only if ANTHROPIC_API_KEY is absent
         │
         ▼
  GitHub Check Run  →  PASS ✅  or  FAIL ❌
  PR Comment        →  Findings table + per-file remediation steps
```

---

## Installation

### 1. Install the GitHub App

Go to **[github.com/apps/clawd-guard](https://github.com/apps/clawd-guard)** and click **Install** on the repositories you want protected.

Or self-host using the manifest:

```bash
# 1. Deploy the webhook server (see Deploy section below)
# 2. Create the GitHub App from the manifest
open packages/clawd-guard/app-manifest.json   # upload at github.com/settings/apps/new
```

### 2. Set Environment Variables

```bash
cp packages/clawd-guard/.env.example packages/clawd-guard/.env
```

```env
# GitHub App credentials
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Claude Opus 4.8 — for context-aware AI analysis
# Get yours at: https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# Server
PORT=3000
PROTECTED_BRANCHES=main,master,develop
```

### 3. Pre-commit Hook (Local Protection)

The hook runs before every `git commit` and blocks the push if it finds secrets in staged files.

```bash
# Activate (run once after cloning)
pnpm install   # or: git config core.hooksPath .husky

# The hook is at .husky/pre-commit — no extra setup needed
```

Sample output when a secret is caught:

```
🚨 CLAWD GUARD: Solana private key (base58) detected in staged changes
************************************************************
🚨 CLAWD GUARD: Secret file(s) staged for commit:
  my-wallet.json

❌ Commit blocked. Fix the above issues before committing.
   Run: git restore --staged <file>  to unstage a file
   If already committed: rotate the credential + git filter-repo to purge history
```

---

## Deploy

### Docker / Fly.io

```bash
cd packages/clawd-guard

# Build
docker build -t clawd-guard .

# Run
docker run -p 3000:3000 \
  -e GITHUB_APP_ID=$GITHUB_APP_ID \
  -e GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  -e GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  clawd-guard
```

```bash
# Fly.io one-liner
fly launch --name clawd-guard --image clawd-guard
fly secrets set GITHUB_APP_ID=... GITHUB_APP_PRIVATE_KEY=... \
  GITHUB_WEBHOOK_SECRET=... ANTHROPIC_API_KEY=...
fly deploy
```

### Railway / Render

Set the four required env vars in the dashboard and point the service root to `packages/clawd-guard/`. The `Dockerfile` handles the rest.

---

## What Gets Caught

| Pattern | Example | Severity |
|---------|---------|----------|
| Solana private key (base58) | `5Jk7...` (87 chars) | 🔴 Critical |
| Solana keypair JSON | `[171,42,9,...]` (64 numbers) | 🔴 Critical |
| Ethereum private key | `0x4c0883a69102937d6...` | 🔴 Critical |
| AWS Access Key | `AKIAIOSFODNN7EXAMPLE` | 🔴 Critical |
| Anthropic API key | `sk-ant-api03-...` | 🔴 Critical |
| OpenAI / XAI key | `sk-proj-...` / `xai-...` | 🔴 Critical |
| GitHub token | `ghp_Mv3...` | 🔴 Critical |
| Stripe secret key | `sk_live_...` | 🔴 Critical |
| PEM private key | `-----BEGIN EC PRIVATE KEY-----` | 🔴 Critical |
| Database URL w/ password | `postgres://user:pass@host/db` | 🟠 High |
| BIP-39 seed phrase | 12 / 24 consecutive word matches | 🟠 High |
| JWT secret / session key | `jwt_secret=...` hardcoded | 🟡 Medium |

**Not flagged:** `process.env.SECRET`, `{{API_KEY}}`, `"your-key-here"`, test fixtures with obviously fake values.

---

## Wallet Privacy Model

All agent wallets in this repo use **zero-secret storage**:

- Keys generated and encrypted in `~/.agentwallet/vault/` (AES-256-GCM, `chmod 600`) — never inside the repo
- `agent-wallet.json` is in `.gitignore` and blocked by this hook
- The `agentwallet wallet create --network mainnet-beta` command emits a real-funds warning before writing any key
- `VAULT_PASSPHRASE` is the only secret that needs to live in your environment

```
~/.agentwallet/vault/wallets.enc.json   ← AES-256-GCM encrypted, mode 0600
~/.openclawd/agent-identity.json        ← on-chain identity (public addresses only)
```

---

## Architecture

```
packages/clawd-guard/
├── src/
│   ├── index.ts      — Express webhook server + GitHub event router
│   ├── scanner.ts    — Regex-based secret patterns (20+ rules)
│   ├── claude.ts     — Claude Opus 4.8 context analysis via @anthropic-ai/sdk
│   └── github.ts     — Octokit: PR files, Check Runs, smart comment upsert
├── app-manifest.json — One-click GitHub App creation
├── Dockerfile        — Production container
└── .env.example      — Required environment variables
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | ✅ | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | ✅ | PEM private key (newlines as `\n`) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | Webhook HMAC secret |
| `ANTHROPIC_API_KEY` | Recommended | Enables Claude Opus 4.8 AI analysis |
| `PORT` | Optional | Server port (default: `3000`) |
| `PROTECTED_BRANCHES` | Optional | Comma-separated branches for push scan (default: `main,master,develop`) |

Without `ANTHROPIC_API_KEY`, the app runs in **regex-only mode** — still catches the vast majority of secrets, just without AI-assisted context analysis.

---

## Contributing

Clawd Guard is part of the [OpenClawd](https://github.com/solizardking/solanaclawd) monorepo. PRs to improve regex patterns or extend AI analysis are welcome.

```bash
# Local dev
cd packages/clawd-guard
cp .env.example .env   # fill in your keys
pnpm install
pnpm dev               # tsx watch — hot reload on save
```

---

## License

MIT — see [LICENSE](../../LICENSE)

---

<div align="center">

**Built with 🦞 by OpenClawd · Powered by [Claude Opus 4.8](https://www.anthropic.com) · Protecting Solana agents since 2025**

`$CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

</div>
