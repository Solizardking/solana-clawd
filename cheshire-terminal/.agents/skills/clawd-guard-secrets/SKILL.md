---
name: clawd-guard-secrets
description: >
  Clawd Guard — the sovereign secrets sentinel. Mandatory reading for every Solana
  developer before they push a single commit. Use when: setting up a new repo,
  reviewing a .gitignore, onboarding a dev, or after any "oops I committed my
  private key" incident. Covers every secrets pattern that must never touch git:
  wallet JSON files, keypairs, .env files, private keys, API tokens, service account
  credentials, and IDE/OS junk. Built by Clawd to stop you from becoming a
  cautionary tale.
metadata:
  solanaos:
    emoji: "🔐"
    requires:
      bins:
        - git
        - node
attestation:
  verified: true
  verified_at: "2026-06-07"
  registries:
    - https://x402.wtf/skills/clawd-guard-secrets
    - https://x402.wtf/skills/clawd-guard-secrets
homepage: https://x402.wtf/skills/clawd-guard-secrets
---

# 🔐 Clawd Guard — Never. Expose. Your. Keys. Ever.

```
     /\   /\
    /  \_/  \
___/   🦞   \_____________________________________________________
|                                                                     |
|    C L A W D   G U A R D   —   S O V E R E I G N   S E C R E T S   |
|                                                                     |
|    A lobster never gives his shell away.                            |
|    Neither should you give away your private keys.                  |
|_____________________________________________________________________|
    \   🦞   /
     \_/ \_/
```

Clawd has seen it all. Devs pushing `id.json` to public repos. API keys sitting in
`config.ts`. Phantom wallet exports named `wallet.json` sitting right in the root.
.env files with `SOLANA_PRIVATE_KEY` committed at 2 AM.

**This stops now.**

## The Only Rule That Matters

> **If it can spend your money, impersonate your identity, or unlock your agent
> — it never touches git. Period.**

No excuses. No "private repo". No "I'll remove it later." No "it's just a dev key."
The moment a secret hits `git add`, it's in the history forever. Even if you
`git rm` it, it's still in the reflog, still in anyone's clone, still on GitHub's
servers.

## What Must Never Be Committed

### 🔑 Solana Keypairs — Any Format, Any Name

```
wallet.json
*-wallet.json
keypair.json
*-keypair.json
solana-keygen.json
phantom-export.json
id.json
my-keypair.json
default-wallet.json
dev-wallet.json
test-wallet.json
deploy-wallet.json
*.json.bak (sometimes keypairs get backed up too!)
```

**These are your bank account.** One `git push` and anyone who clones your repo
can drain every lamport. There are bots that scan GitHub 24/7 for Solana keypair
files. You'll be drained before you can say "revoke."

### 🌍 Environment Files — Any Name Pattern, Any Depth

```
.env
.env.*
.env.local
.env.production
.env.development
!.env.example        # Templates are OK — no real keys in them
!.env.template
!.env.sample
config.env
```

Env files hold API keys, RPC URLs with embedded tokens, database passwords, and
private keys. Commit `.env.example` with placeholder values, never the real ones.

### 🔐 Private Keys & Certificates

```
*.pem
*.key
*.p12
*.pfx
*.keystore
*.jks
*.asc
*.gpg
id_rsa
id_ed25519
id_ecdsa
*.ppk
```

### 🛠 Service Account & Cloud Credentials

```
service-account*.json
gcp-credentials*.json
google-credentials*.json
firebase-adminsdk*.json
aws-credentials
credentials.json
cdp_private_key.pem
google-services.json
```

### 🤖 Solana Agent Runtime — Generated State

Never commit agent session state, paper trading ledgers, or locally generated
strategy configs. These may contain derived secrets, positions, or API tokens:

```
agent-wallet.json
.vulcan/
vulcan-runs/
paper-state.json
paper-balance.json
.paper/
imperial-session*.json
.imperial/
.agent-sessions/
*.session.json
agent-memory*.json
session-state*.json
.clawdbot/
sessions/
```

### 🗂 Database & Local Storage

```
*.sqlite
*.sqlite3
*.db
*.db-journal
*.db-wal
*.db-shm
.convex/
```

### 🔑 API Keys & Tokens

```
*_api_key.txt
*_secret.txt
*-secret.json
*.secret.json
auth-token*.json
access-token*.json
bearer-token*.json
refresh-token*.json
*-apikey.json
helius*.json
rpc-config*.json
clawd-key*.json
agent-key*.json
*.b58 (raw key dumps)
*.b64.key (encoded key dumps)
```

## The Gold Standard .gitignore

Clawd maintains the canonical `.gitignore` for Solana developers. Here's the
secrets section every repo must include:

```gitignore
# ============================================================================
# SECRETS — NEVER COMMIT THESE. NO EXCEPTIONS. NOT EVEN IN PRIVATE REPOS.
# ============================================================================

# Environment files (only EXAMPLE files are safe to commit)
.env
.env.*
!.env.example
!.env.template
!.env.sample

# Solana keypairs — any format, any name
wallet.json
*-wallet.json
keypair.json
*-keypair.json
solana-keygen.json
phantom-export.json
id.json
*_keypair.json
*-keypair.json
keypair*.json

# Private keys / certs / wallets
*.pem
*.key
*.p12
*.pfx
*.keystore
*.jks
*.asc
*.gpg
id_rsa
id_rsa.*
id_ed25519
id_ed25519.*
id_ecdsa
id_ecdsa.*
*.ppk

# Service account / cloud credentials
service-account*.json
gcp-credentials*.json
google-credentials*.json
firebase-adminsdk*.json
aws-credentials
credentials.json
cdp_private_key.pem
cdp_*.pem
google-services.json

# API keys in files
*_api_key.txt
*_secret.txt
*-secret.json
*.secret.json
auth-token*.json
access-token*.json
bearer-token*.json
refresh-token*.json
*-apikey.json
*-api-key.json
*-private-key.json
*-privatekey.json

# Agent runtime state (may contain derived secrets or API tokens)
agent-wallet.json
.vulcan/
vulcan-runs/
paper-state.json
paper-balance.json
.paper/
imperial-session*.json
.imperial/
perps-session*.json
.perps/
.agent-sessions/
*.session.json
agent-memory*.json
session-state*.json
.clawdbot/
sessions/

# Database / local storage
*.sqlite
*.sqlite3
*.db
*.db-journal
*.db-wal
*.db-shm
.convex/

# Raw key dumps
*.b58
*.b64.key

# Production deployment configs with secrets
fly.toml.local
*.sentryclirc
```

## Brown Alert Protocol — What To Do If You Already Committed a Secret

1. **Rotate the key immediately.** Go to your wallet, Helius dashboard, or
   whatever service issued the key and revoke/generate a new one. This is step
   ZERO. Nothing else matters until the compromised key is dead.

2. **Check if the repo is public.** If yes, assume the secret was scraped.
   Bots scan public repos at internet scale. Your key may already be in a
   database.

3. **Purge from git history.** Use `git filter-branch` or BFG Repo-Cleaner:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/secret.json" \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   git push origin --force --tags
   ```

4. **Warn your team.** Anyone who pulled in the window the secret was exposed
   may have a compromised key. They need to rotate too.

5. **Re-deploy.** If the secret was used in production (API keys, RPC URLs),
   re-deploy with the new credentials.

6. **Learn.** Read this SKILL.md again. Slower this time.

## Clawd Guard — Runtime Protection

Beyond `.gitignore`, the Clawd runtime enforces secrets safety at the agent level:

| Guard | What It Does |
|---|---|
| **Vault encryption** | `agentwallet` stores keypairs with AES-256-GCM. Never plaintext on disk. |
| **Constitution gate** | Leviathan spawn verifies `three-laws.md` hash before molting — no backdoored agents. |
| **Agent wallet isolation** | Each agent gets its own derived keypair. One compromise doesn't drain the fleet. |
| **Paper mode default** | All trading starts in paper mode. Live execution requires explicit `--yes`. |
| **Private key masking** | The runtime never logs or prints private keys, wallet passwords, or MCP config secrets. |

## The Clawd Oath

Repeat after Clawd:

```
I am a Solana developer.
I type private keys with the same care I'd use to build an Anchor program.
My .gitignore is comprehensive and reviewed before git init.
My .env.example has placeholder values. My .env has real ones.
I never commit wallet.json, even "just for testing."
I rotate any key that has ever touched git — no exceptions.
The lobster is watching. The lobster remembers.
🦞
```

---

*Clawd Guard is part of the [OpenClawd Framework](https://github.com/Solizardking/solana-clawd).
Violations of this skill are punishable by immediate beaching.*