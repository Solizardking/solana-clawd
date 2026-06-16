# Open Source Release Checklist — solana-clawd

> **Goal:** Ship a clean, public, auditable `Solizardking/solana-clawd` (and its
> sub-repos) that any contributor can clone, build, and run in under 10 minutes
> without leaking secrets, build artifacts, or local-dev junk.
>
> Last updated: **2026-06-16** · Scope: `solana-clawd` monorepo at HEAD `751bd4ee`.

---

## Current state at HEAD (baseline)

| Metric | Value | Notes |
|---|---|---|
| Working-tree size | **12 GB** | Includes `node_modules` + Rust `target/` |
| File count (excl. `.git`, `node_modules`) | 127 925 | Heavily inflated by build outputs |
| Tracked files in HEAD | 15 858 | `git ls-files | wc -l` |
| `.gitignore` length | 436 lines | Comprehensive but missing a few patterns |
| LICENSE | MIT 2026 OpenClawd contributors | ✓ present |
| CONTRIBUTING.md | 4 776 B | ✓ present |
| SECURITY.md | 1 414 B | ✓ present |
| CI workflows (`.github/workflows/`) | 5 | commit-leaderboard, deploy-svm-a2a, github-pages, library-deploy, x402-setup |
| Tracked `.env` files | 1 | Need to identify & untrack |
| Tracked `Cargo.lock` | 9 | Mostly wanted, but `programs/programs/target/` has ~3 000 stale entries per the `.gitignore` NOTE |
| Submodules registered | 2 (core-ai, mcp/clawd-mcp) | `hermes-agent` was a ghost gitlink — **fixed in `751bd4ee`** |

---

## 1. Pre-Release Verification

### ✅ Documentation (review and complete)

- [ ] `README.md` — top-level, updated install + npm scopes
- [ ] `clawd-code/README.md` — already updated for Grok-first defaults
- [ ] `AGENTS.md` — root agent catalog (50+ agents) + **Default Model** section now documents Grok-first
- [ ] `CLAWD.md` — lobster constitution / spawn rules
- [ ] `CONSTITUTION.md` — three off-chain + three on-chain laws
- [ ] `three-laws.md` — byte-for-byte + hash verified
- [ ] `CLAWD_BOX_24_7.md` (in `clawd-pump/`) — operating playbook
- [ ] `CONTRIBUTING.md` — confirm DCO, PR template, CODEOWNERS
- [ ] `SECURITY.md` — confirm disclosure email + scope
- [ ] `LICENSE` — already MIT 2026 OpenClawd contributors ✓
- [ ] `CODE_OF_CONDUCT.md` — present? (check; add if missing)
- [ ] `.github/ISSUE_TEMPLATE/` — bug, feature, agent-registry
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`

---

## 2. Repository Cleanup (Required)

> **Current bloat:** `clawd-pump/target/` = 5.4 GB · `node_modules/` = 2.5 GB · `clawdbot-pumpfun/target/` = 1.0 GB.

### 2.1 Remove working-tree build artifacts (NOT in git, but wasting disk + IDE index)

```bash
# Rust build outputs (these dominate disk usage)
rm -rf clawd-pump/target/
rm -rf clawdbot-pumpfun/target/
rm -rf programs/programs/target/
rm -rf programs/target/
find . -type d -name "target" -not -path "./.git/*" -prune -exec rm -rf {} +

# Node / pnpm caches
rm -rf node_modules/
rm -rf */node_modules/
rm -rf .pnpm-store/

# TypeScript / Vite build outputs
rm -rf dist/
rm -rf build/
rm -rf .next/
rm -rf out/

# Go caches (only if a Go module ever shows up)
rm -rf .gocache/
```

### 2.2 Remove tracked build artifacts and `Cargo.lock` copies that don't belong

```bash
# programs/programs/target/ is partially tracked (~3 000 files per the .gitignore NOTE)
git rm -r --cached programs/programs/target/ 2>/dev/null || true
git rm -r --cached programs/target/ 2>/dev/null || true

# Audit every Cargo.lock — keep one per crate workspace, drop duplicates
git ls-files | grep 'Cargo\.lock$'
# If you find stray lockfiles in sub-repos that are not actually compilable here, drop them.
```

### 2.3 Remove local-dev artifacts and secret-laden files (NOT in git, but they exist on disk)

```bash
# Agent / editor state
rm -rf .agents/  .augment/  .claude/  .codebuddy/  .commandcode/
rm -rf .cache/  .cache.*  models/

# .env files (clawd-pump has 3 — the live one and two timestamped backups)
rm -f clawd-pump/.env
rm -f clawd-pump/.env.backup.*
rm -f clawd-grok/.env
rm -f mcp/clawd-mcp/.env.local
rm -f mcp/clawd-mcp/solana-mcp-official-main/.env
rm -f .env.local
rm -f .vercel/.env.preview.local
find . -name ".env" -not -path "./node_modules/*" -not -name ".env.example" -print  # review before rm

# OS / IDE / lock files
find . -name ".DS_Store" -not -path "./.git/*" -not -path "./node_modules/*" -delete
find . -name "Thumbs.db"  -not -path "./.git/*" -not -path "./node_modules/*" -delete
find . -name ".vscode"    -type d -not -path "./.git/*" -not -path "./node_modules/*" -prune -exec rm -rf {} +
find . -name "*.code-workspace" -not -path "./.git/*" -delete

# Stray .gitignore copies
rm -f "clawd-pump/.gitignore copy"
rm -f clawdbot-pumpfun/.gitignore*
```

### 2.4 Audit and rewrite the working `.env` files

```bash
# 1. Start from the .env.example in each package — DO NOT keep a real-key .env
cp clawd-pump/.env.example clawd-pump/.env
cp clawd-grok/.env.example clawd-grok/.env   # if missing, copy from another package
cp mcp/clawd-mcp/.env.example mcp/clawd-mcp/.env

# 2. Make sure none of the rewritten .env files have been committed
git ls-files | grep -E '(^|/)(\.env$|\.env\.local$)'
# Expected: empty
```

### 2.5 Handle nested git repos and gitlinks

```bash
# Look for nested .git directories that should be either removed or submoduled
find . -name ".git" -type d -not -path "./.git" -not -path "*/.git/modules/*" -prune

# Candidates in the audit (June 2026):
#   clawd-pump/.git            — checked in as a plain directory; remove the .git/ subdir
#                                so the working tree stops looking like a separate repo
find clawd-pump/.git -mindepth 1 -delete

#   hermes-agent/              — properly registered submodule (added in 751bd4ee)
#                                keep, but clean up its own uncommitted noise:
cd hermes-agent && git reset --hard HEAD && cd ..
```

### 2.6 Decide what to keep / remove for the public release

| Path | Action | Reason |
|---|---|---|
| `clawd-pump/` | **Keep** | Production bot — but rebuild and `git clean` build outputs |
| `clawdbot-pumpfun/` | **Keep** | Sister bot — same treatment |
| `services/` | **Audit** | `595M` — likely contains Rust target/ + node_modules |
| `apps/` | **Audit** | `387M` — web apps, needs `pnpm clean` |
| `trading/`, `staking/` | **Audit** | Rust + Python data — check for large CSVs |
| `core-ai/`, `mcp/`, `library/` | **Keep (submodules)** | Already submoduled |
| `providers/`, `auth/`, `goals/`, `social/`, `clawd-grok/`, `clawd-x402/`, `clawd-go/`, `clawd-pump/`, `mcp-server/`, `agentwallet/`, `x402/`, `pay/`, `box/`, `dark/`, `programs/`, `packages/`, `docs/`, `examples/`, `services/`, `apps/`, `trading/`, `staking/`, `src/`, `skills/`, `spinners/`, `oslan/`, `ooda/`, `convex/`, `data/`, `knowledge/`, `public/` | **Keep** | Source code |

---

## 3. `.gitignore` Hardening

The current `.gitignore` (436 lines) covers most cases. Gaps to close:

```gitignore
# ---- Add to .gitignore (missing patterns) ----

# OS noise
.DS_Store
Thumbs.db
ehthumbs.db
Desktop.ini

# Editor / agent state
.vscode/
.idea/
.history/
.augment/
.claude/
.codebuddy/
.commandcode/
.cursor/
.aider*
.continue/

# Secrets / live state — already partially covered; reinforce
.env
.env.*
!.env.example
!.env.template
!.env.sample
.envrc
*.pem
*.key
*.p12
*.pfx
*.keystore
*.jks
id_rsa
id_rsa.*
id_ed25519
id_ed25519.*

# Build outputs (already partial — make sure ALL languages are covered)
node_modules/
.pnpm-store/
dist/
build/
out/
.next/
.turbo/
.cache/
*.tsbuildinfo

# Rust
target/
**/target/
**/target/deps/

# Python
__pycache__/
*.py[cod]
*.so
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
venv/

# Go (in case anyone runs `go test` here)
*.test
*.out
bin/
.gocache/

# OS / shell
*.swp
*.swo
.DS_Store
.Trash-*
.fseventsd
.Spotlight-V100
.TemporaryItems
```

Then verify nothing in the new patterns is actually tracked:

```bash
git ls-files | grep -E '\.DS_Store$|\.env$|\.env\.local$|node_modules/|/target/|\.pem$|\.key$'
# Expected: empty
```

---

## 4. Submodules — Final Pass

| Submodule | Path | URL | Status |
|---|---|---|---|
| `core-ai` | `core-ai/` | https://github.com/Solizardking/core-ai.git | ✓ registered, `-` (local uncommitted) — needs `cd core-ai && git reset --hard` |
| `mcp/clawd-mcp` | `mcp/clawd-mcp/` | https://github.com/Solizardking/clawd-mcp.git | ✓ registered, `-` (local uncommitted) — same |
| `hermes-agent` | `hermes-agent/` | https://github.com/x402agent/hermes-agent.git | ✓ registered in `751bd4ee`, but local HEAD has `m clawd-agent` + untracked dirs — needs `cd hermes-agent && git reset --hard && git clean -fd` |
| `services/clawd-box` | `services/clawd-box/` | **MISSING** | Tree has a `160000 commit 8046eb4e…` gitlink but no `.gitmodules` entry and the dir is empty. **Add a `.gitmodules` entry (or `git rm --cached services/clawd-box` if it's dead).** |

```bash
# Option A — add the missing services/clawd-box submodule entry
# (replace URL with the actual upstream; left as TODO)
cat >> .gitmodules <<'EOF'

[submodule "services/clawd-box"]
	path = services/clawd-box
	url = https://github.com/Solizardking/clawd-box.git
	branch = main
EOF
git submodule sync
git submodule update --init services/clawd-box

# Option B — drop the dead gitlink
git rm --cached services/clawd-box 2>/dev/null
rmdir services/clawd-box 2>/dev/null
git commit -m "chore: drop dead services/clawd-box gitlink (was empty + no .gitmodules entry)"
```

---

## 5. Secret Scanning

```bash
# TruffleHog
brew install trufflehog
trufflehog filesystem .

# Manual greps
grep -rE "PRIVATE_KEY|SECRET_KEY|RPC_PRIVATE|XAI_API_KEY|ANTHROPIC_API_KEY|HELIUS_API_KEY" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
  --include="*.py" --include="*.go" --include="*.rs" --include="*.toml" --include="*.json" \
  --include="*.yml" --include="*.yaml" --include="*.env*" --include="*.sh" --include="*.md" . \
  | grep -vE "node_modules|\.git/|/dist/|/build/|/target/|/outputs/|RELEASE_CHECKLIST|README|\.example|\.template|\.sample"

# Check for accidentally committed wallet files
git ls-files | grep -E '\.json$' | xargs -I{} sh -c 'test -f "{}" && grep -l "private\|secret\|key" "{}" 2>/dev/null' | head

# Wallet JSON files MUST NOT be tracked. If you find any:
git rm --cached path/to/wallet.json
echo "*.wallet.json" >> .gitignore
```

The `clawd-guard` pre-commit hook already runs `trufflehog filesystem` against staged
content; it blocked one of the recent commits cleanly (`✅ clawd-guard: No secrets
detected`).

---

## 6. Build & Smoke Test (clean clone)

```bash
# 1. Clone fresh
rm -rf /tmp/solana-clawd-release-test
git clone https://github.com/Solizardking/solana-clawd.git /tmp/solana-clawd-release-test
cd /tmp/solana-clawd-release-test

# 2. Submodules
git submodule update --init --recursive

# 3. Top-level
pnpm install
pnpm run build            # tsc -p tsconfig.runtime.json
pnpm run check            # typecheck
npx vitest run            # full test suite

# 4. clawd-code (the Grok-first harness)
cd clawd-code
npm install
npm run build
npx tsx --test src/env.test.ts src/verify.test.ts src/wallet.test.ts src/x402.test.ts
npx tsx src/cli.ts /inspect    # should report provider=xai, model=grok-4.3, xAI /v1/models online

# 5. clawd-pump (Rust)
cd ../clawd-pump
cargo build --release
./target/release/clawd-pump doctor || true

# 6. clawd-grok
cd ../clawd-grok
npm install
npm run build
```

---

## 7. Release-Day Checklist

### GitHub

- [ ] Push `751bd4ee` (and any follow-up cleanup commits) to `origin main`
  ```bash
  git remote -v   # confirm
  git push origin main
  ```
- [ ] Tag the release: `git tag -a v0.2.0 -m "feat: Grok-first harness, hermes-agent registered" && git push origin v0.2.0`
- [ ] Draft GitHub Release with binary artifacts (the largest sub-binaries)
  - `clawd-pump` release binary
  - `clawd-code` npm tarball (`npm pack` + attach)
  - `clawd-grok` build artifact
  - SHA-256 sums for each

### npm / pnpm

- [ ] `pnpm run pack:npm` (or `npm pack` per package) — verify no secrets in the tarball
- [ ] `tar -tzf *.tgz | grep -E '\.env$|\.pem$|id_rsa'` should be empty
- [ ] Test `npx clawd-code@latest` from a separate user account

### Docs

- [ ] All URLs in `README.md`, `clawd-code/README.md`, `AGENTS.md` resolve
- [ ] No `localhost`-only install commands in public docs
- [ ] `$CLAWD` mint address in `clawd-code/README.md` matches the on-chain mint
- [ ] `LICENSE` copyright year (2026 ✓)
- [ ] `SECURITY.md` has a real contact email
- [ ] Changelog entry for `v0.2.0`

### Public verification

- [ ] `git clone` on a clean machine succeeds end-to-end
- [ ] `pnpm install && pnpm run check` exits 0
- [ ] `clawd-code /verify` reports all checks OK or expected failures (no xAI_API_KEY)
- [ ] `clawd-code /models` shows xAI Grok section pinned to the top
- [ ] No `*.env`, `*.key`, `id_rsa*`, `node_modules/`, `target/`, `dist/`, `*.DS_Store` in `git ls-files`

---

## 8. Post-Release

- [ ] Announce on X / Discord / Telegram with the install one-liner:
  `curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/clawd-code/install.sh | sh`
- [ ] Submit to **Solana Foundation GitHub directory** and **x402.wtf/agents**
- [ ] Pin the release in the Agent Arena on Cheshire Terminal
- [ ] Update `agents/agents-manifest.json` and `public/library/` to point at the new release tag
- [ ] Close the matching milestone in the project board
- [ ] Tag a follow-up `v0.2.1` if any release-blocker shows up in the first 24 h

---

## 9. Quick-Reference Commands

```bash
# Repo size after cleanup
du -sh .
du -sh .git

# File counts
find . -type f -not -path "./.git/*" -not -path "./node_modules/*" | wc -l
git ls-files | wc -l

# Tracked secrets check (should print nothing)
git ls-files | xargs grep -lE "PRIVATE_KEY|XAI_API_KEY|ANTHROPIC_API_KEY" 2>/dev/null

# Largest tracked files
git ls-files | xargs -I{} du -k "{}" 2>/dev/null | sort -rn | head -20

# Confirm Grok is the default
cd clawd-code && npx tsx src/cli.ts /models | head -15
```

---

*This checklist is generated from the actual state of the repo at `751bd4ee`. Run it
once per release candidate and tick every box before tagging.*
