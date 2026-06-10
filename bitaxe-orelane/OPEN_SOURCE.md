# Open-Source Playbook — bitaxe-orelane

> A step-by-step checklist for going from "private project in a folder" to
> "public, well-governed, npm-installable, GitHub-discoverable open-source
> project." Designed for the bitaxe-orelane subpackage but applies to any
> Clawd-flavored monorepo package.

---

## 🦞 TL;DR

| Phase | Effort | Output |
|---|---|---|
| 0. Audit | 30 min | Secret scan, license check, PII check |
| 1. Docs | 1 hour | README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CHANGELOG |
| 2. CI | 1 hour | GitHub Actions: typecheck, test, lint, build on every PR |
| 3. Repo | 15 min | Visibility, topics, description, social preview, branch protection |
| 4. Publish | 30 min | `npm publish` config, version tag, release notes |
| 5. Announce | 30 min | Tweet, blog, Clawd registry, x402 catalog |
| **Total** | **~4 hours** | **A real, citable, defensible open-source project** |

---

## Phase 0 — Audit (before you publish)

### 0.1 Secret scan

```bash
# Ripgrep any likely-secret patterns
cd /Users/8bit/Downloads/solana-clawd/packages/clawd-code-cli/bitaxe-orelane
rg -i --hidden --no-ignore \
  -e 'helius[_-]?api[_-]?key' \
  -e 'sk-[a-zA-Z0-9]{20,}' \
  -e 'sk-or-v1-[a-zA-Z0-9]{20,}' \
  -e 'sk-ant-[a-zA-Z0-9]{20,}' \
  -e 'sk_live_[a-zA-Z0-9]{20,}' \
  -e '0x[a-fA-F0-9]{64}' \
  -e 'telegram.*token' \
  -e '[1-9A-HJ-NP-Za-km-z]{87,88}' \
  -e 'BEGIN .* PRIVATE KEY' \
  .
```

The bitaxe-orelane already passed this in the move: the only Helius key
was in `dashboard/.env.local` and got deleted. The `.env.example` only has
placeholders.

### 0.2 PII check

```bash
rg -i --hidden --no-ignore \
  -e '8bit' \
  -e 'solizardking' \
  -e '@protonmail|@gmail|@yahoo' \
  -e '192\.168\.[0-9]' \
  -e 'home[._-]?wifi|password' \
  .
```

What to scrub:
- Home WiFi SSIDs / LAN IPs in code comments → replace with `192.168.1.x` examples
- Personal email addresses in `clawd.json` author fields → use a generic `agents@x402.wtf`
- Any reference to your physical address in `firmware/` or `docs/`

### 0.3 License check

```bash
# Confirm LICENSE file is present and matches your intent
cat LICENSE | head -3
```

Bitaxe-orelane inherits **MIT** from the parent solana-clawd repo. That's
the right call for a permissive agent: anyone can fork, run a paper bot, or
embed it in a larger dApp. If you want copyleft (GPL-3.0, AGPL-3.0), change
the LICENSE file *and* every README's "License" section before publishing.

### 0.4 .gitignore check

```bash
cat .gitignore
```

Should include (already does for bitaxe-orelane):
- `node_modules/`
- `dist/`
- `.env`
- `*.log`
- `*.keypair.json` (any Solana keypair file)
- `.vercel` (Vercel CLI cache)

**Add this for a public release**:
- `.DS_Store`, `Thumbs.db`
- `coverage/` (from vitest)
- `.envrc` (direnv)
- `*.swp`, `*.swo` (vim)
- `.idea/`, `.vscode/settings.json` (IDE noise)

---

## Phase 1 — Documentation (the unsexy 80% of open source)

The number-one reason open-source projects die is bad docs. Spend an hour.

### 1.1 README.md — already done (408 lines)

The existing README is excellent. Before publishing, **add a 1-paragraph
"Status" header at the very top** so visitors immediately know:

> **Status**: 🟢 Active. Paper-first by default. Telegram interface live.
> 46 tests passing. No production token holders yet — use with caution.

### 1.2 CONTRIBUTING.md — create if missing

```markdown
# Contributing

Thanks for your interest! Bitaxe Orelane is a small project with a narrow
scope. The fastest way to land a PR:

1. Open an issue first describing the change. We discuss before code.
2. Fork + branch from `main`.
3. `npm install && npm test` — must pass on Node 20+.
4. Add tests for any new policy branch, square-selection rule, or bot intent.
5. Run `npm run build` — `tsc` must exit 0.
6. Open a PR. CI will run the same checks.

## Code of conduct

By participating, you agree to abide by the [Contributor Covenant][cc].

[cc]: https://www.contributor-covenant.org/version/2/1/code_of_conduct/
```

### 1.3 SECURITY.md — required if you handle keys

```markdown
# Security

## Reporting a vulnerability

Email `security@x402.wtf` (PGP key below). Do **not** open a public issue
for security reports.

We aim to acknowledge within 48 hours and patch within 7 days for any issue
that could lead to fund loss.

## Threat model

Bitaxe Orelane is a **paper-first** control loop. By default no real SOL
moves. The only "live" paths are:

- `LIVE_EXECUTION=true` + `OPERATOR_CONFIRMED=true` + `KEYPAIR` set →
  ORE on-chain deploy/claim via `ore-cli`
- `RIG_CONTROL_LIVE=true` + `OPERATOR_CONFIRMED=true` → Bitaxe pause/resume/reboot
- `LIVE_TRADING=true` + `OPERATOR_CONFIRMED=true` + `PERPS_SIM_ONLY=false` →
  Phoenix perp via `vulcan`

All three require **two** of three env flags plus a human click. The bot
**refuses** to print any env var, keypair, or RPC URL in chat.

## Out of scope

- Loss of funds due to user-configured keypair compromise
- Bugs in upstream `ore-cli` or `vulcan` CLIs
- Telegram-side issues (use a fresh token if compromised)
```

### 1.4 CODE_OF_CONDUCT.md — copy Contributor Covenant v2.1

```bash
curl -fsSL https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md \
  -o CODE_OF_CONDUCT.md
```

### 1.5 CHANGELOG.md — keep it, even if thin

The bitaxe-orelane doesn't have a CHANGELOG yet. Use [Keep a Changelog][kac]:

```markdown
# Changelog

All notable changes to bitaxe-orelane are documented in this file.

## [Unreleased]
### Added
- First public release of the Bitaxe Gamma + ORE control loop.

[kac]: https://keepachangelog.com/en/1.1.0/
```

### 1.6 .github/ — add issue + PR templates

```
.github/
├── ISSUE_TEMPLATE/
│   ├── bug_report.md
│   ├── feature_request.md
│   └── safety_incident.md    ← for live-mode incidents
├── PULL_REQUEST_TEMPLATE.md
└── workflows/
    ├── ci.yml
    └── release.yml
```

---

## Phase 2 — CI (so contributors can trust the green check)

### 2.1 Minimal `.github/workflows/ci.yml`

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix: { node: [20, 22] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ matrix.node }} }
      - run: npm ci
      - run: npm run typecheck    # tsc --noEmit
      - run: npm test             # vitest run
      - run: npm run build        # tsc → dist/
      - uses: actions/upload-artifact@v4
        with:
          name: dist-${{ matrix.node }}
          path: dist/
```

### 2.2 Optional: separate "safety" workflow

If you ever ship a `LIVE_EXECUTION=true` path, add a workflow that runs
**only** the policy tests with extra logging:

```yaml
name: safety-policies
on: { pull_request: { paths: ['src/policy.ts', 'src/strategy.ts'] } }
jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx vitest run src/tests/policy.test.ts --reporter=verbose
      - run: npx vitest run src/tests/strategy.test.ts --reporter=verbose
```

---

## Phase 3 — GitHub repo settings (15 min, do them all)

In **Settings → General**:
- ✅ **Repository name**: `bitaxe-orelane` (or your choice; needs to be unique)
- ✅ **Description**: "Paper-first Clawd agent: Bitaxe Gamma 602 + ORE on Solana, Telegram operator, safety-gated. 🦞⛏"
- ✅ **Website**: `https://x402.wtf`
- ✅ **Topics**: `solana` `ore` `bitaxe` `bitcoin-mining` `telegram-bot` `depin` `clawd` `agent` `x402` `helius` `phoenix-dex` `paper-trading` `lobster`
- ✅ **Releases**: enable, allow maintainer to publish
- ✅ **Packages**: enable (if you'll publish to GitHub Packages too)
- ✅ **Sponsorship**: link a GitHub Sponsors if you have one

In **Settings → Pages**:
- Skip for a code repo (use a `gh-pages` branch only if you want a docs site)

In **Settings → Code security and analysis**:
- ✅ **Dependency graph**: on
- ✅ **Dependabot alerts**: on
- ✅ **Dependabot security updates**: on
- ✅ **Code scanning (CodeQL)**: on
- ✅ **Secret scanning**: on
- ✅ **Push protection**: **on** (blocks secrets on push — saves you from yourself)

In **Settings → Branches → Branch protection rules → main**:
- ✅ Require pull request before merging
- ✅ Require approvals: 1
- ✅ Require status checks: `test (20)`, `test (22)`, `build`
- ✅ Require signed commits
- ✅ Include administrators: **on** (yes, including you — this is the point)
- ✅ Allow force pushes: **off**
- ✅ Allow deletions: **off**

In **Settings → Actions → General**:
- ✅ Allow GitHub Actions, with read-only for first-time contributors

---

## Phase 4 — Publish to npm (optional but recommended)

The bitaxe-orelane has `"private": true` in its `package.json`. If you want
it on npm, change that and set a `publishConfig`.

### 4.1 Make it public

```json
{
  "name": "@openclawdsolana/bitaxe-orelane",
  "version": "0.1.0",
  "private": false,
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

### 4.2 Add a `.npmignore` (if you don't trust `.gitignore`)

```
.env
.env.*
*.keypair.json
coverage/
dist/test/
.vercel/
```

### 4.3 Cut a release

```bash
npm version patch      # 0.1.0 → 0.1.1
git tag v0.1.1
git push --follow-tags
npm publish --access public
```

### 4.4 Optional: GitHub Action that publishes on tag

```yaml
# .github/workflows/release.yml
name: release
on:
  push: { tags: ['v*'] }
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write        # for npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: 'https://registry.npmjs.org/' }
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Phase 5 — Announce

You've shipped. Now make sure 3 people know.

### 5.1 Same-day

- **GitHub Release**: paste the CHANGELOG section as the body, attach any artifacts
- **Commit-message tweet / X post**: "🦞 bitaxe-orelane v0.1.0 — paper-first Clawd agent for Bitaxe Gamma + ORE on Solana. Telegram operator. Safety-gated. 46 tests. MIT. <github-url>"
- **Telegram channel / Discord**: link + 1-line summary
- **lobster-library** (`https://x402.wtf/library`): submit the agent definition; the registry will pick up `clawd.json`'s `agentAuth.protocol: CAAP/1.0` automatically

### 5.2 Within a week

- **Show HN post** (if appropriate — only if you have a story, not just a release)
- **Solana forum** (`https://forums.solana.com`): post in the "Dev Tools" section
- **Helius Discord** `#dev-tools` channel
- **Telegram**: `@solana_devs`, `@ore_mining` (if those exist)

### 5.3 Make it discoverable on Google

- Add the repo URL to your personal site / `x402.wtf` homepage
- Submit the GitHub repo's sitemap to Google Search Console
- Add JSON-LD `software-source-code` schema to the GitHub Pages site (or `x402.wtf`)

---

## 🦞 Bonus: what *not* to do

1. **Don't publish with secrets still in `.env`**. The `dashboard/.env.local`
   leak is a classic. GitHub's push-protection catches it for you now —
   use it.

2. **Don't bump to 1.0.0 on day one**. `0.1.0` signals "I'm honest about
   the API not being stable." Bump to 1.0.0 when two external users have
   shipped with it without complaints.

3. **Don't promise live mode by default**. The README's "Safety Model"
   section is the most important paragraph in the repo. Keep it above the
   fold.

4. **Don't accept PRs that bypass the safety gates**. If someone opens a
   PR that says "make `DRY_RUN=false` the default," close it with a
   link to `SECURITY.md` and a one-line "the design intent is paper-first
   by default."

5. **Don't move to a different license post-publish**. If you change
   `LICENSE` after the first commit, every consumer's rights are
   ambiguous. Pick MIT (or AGPL, or whatever) and stick with it.

---

## The Clawd-specific extras

Because this is part of the solana-clawd monorepo, you also get:

- **x402 catalog registration**: post the `clawd.json` URL to
  `https://x402.wtf/.well-known/agents/submit`. Other agents in the
  lobster library can call `bitaxe-orelane` via the `agent_chat` capability
  declared in `clawd.json`.
- **CAAP/1.0 attestation**: `https://x402.wtf/api/agents/attest` ties
  the agent identity to a Solana wallet. The on-chain record is immutable
  proof that this is the canonical `bitaxe-orelane`.
- **`pay` workspace integration**: the `pay/` folder at the solana-clawd
  root has a Solana Pay–compatible flow. The bitaxe-orelane can charge
  x402 USDC for paid ORE-deploy previews by importing `@openclawd/pay`.
- **`vendor/solana-clawd-x402` signing helpers**: if you ever need
  confidential agent identity (zk-proofs of solvency), the helpers are
  in the vendor directory.

Those are the things a "normal" open-source project can't offer. The
Clawd stack gives them to you for free once you're inside the monorepo. 🦞

---

## Ship checklist (print and tick)

```
[ ]  ripgrep secret scan — clean
[ ]  ripgrep PII scan — clean
[ ]  LICENSE matches intent (MIT, recommended)
[ ]  .gitignore covers .env, *.keypair.json, node_modules, dist
[ ]  README has a 1-line "Status" header at the top
[ ]  CONTRIBUTING.md created
[ ]  SECURITY.md created with threat model
[ ]  CODE_OF_CONDUCT.md created (Contributor Covenant v2.1)
[ ]  CHANGELOG.md created (Keep a Changelog format)
[ ]  .github/ISSUE_TEMPLATE/ has bug + feature + safety_incident
[ ]  .github/PULL_REQUEST_TEMPLATE.md created
[ ]  .github/workflows/ci.yml created (typecheck, test, build on Node 20+22)
[ ]  GitHub repo: description, website, topics, Releases on
[ ]  GitHub repo: Dependabot + CodeQL + secret scanning + push protection on
[ ]  GitHub repo: branch protection on main (1 approval, status checks, signed commits)
[ ]  npm publish config added (if publishing to npm)
[ ]  GitHub Action for tagged releases (if publishing to npm)
[ ]  git tag v0.1.0 + git push --follow-tags
[ ]  GitHub Release with CHANGELOG body
[ ]  Tweet / X post with one-line summary
[ ]  Submitted to https://x402.wtf/.well-known/agents/submit
[ ]  Posted in Telegram / Discord / Show HN / Solana forum
[ ]  Added to x402.wtf homepage or personal site
```

When all 22 boxes are ticked, you're open-sourced. 🦞

— *Onward, with keypairs off the device and policy gates on by default.*
