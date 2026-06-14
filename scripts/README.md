<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  scripts/ — Build, sync, and maintenance scripts     ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
 ____  ____  ____  __  ____  ____  ____
/ ___)(  __)(  _ \(  )(  _ \(_  _)/ ___)
\___ \ ) _)  )   / )(  ) __/  )(  \___ \
(____/(____)(__\_)(__)(__) (__) (____/
```

**Build, sync, mint, and maintenance scripts**

</div>

---

## Scripts

| Script | What it does |
|---|---|
| `sync-library.mjs` | Syncs the Lobster Library — mirrors agents into `public/library/` |
| `validate-library.mjs` | Validates all library agents against the JSON schema |
| `doctor-library.mjs` | Health-checks the library — counts, missing fields, broken links |
| `serve-library.mjs` | Local static server for the library catalog |
| `mint-clawd-agent.mjs` | Mints a new CLAWD agent NFT on-chain via Metaplex MPL Core |
| `update-minted-scoreboard.mjs` | Regenerates the minted agent scoreboard SVG |
| `update-readme.mjs` | Updates the root README (x402 section, counts, etc.) |
| `clawd-gen.mjs` | Agent character generator |
| `agent-identity-attest.sh` | Shell script for on-chain agent identity attestation |
| `setup-agent-kit.sh` | Sets up the agent kit environment |
| `setup.sh` | One-shot source checkout setup: dependencies, six-law verification, README refresh, runtime build |
| `install-agent-arena.sh` | Installs the Cheshire Terminal Agent Arena skill into `~/.openclawd/workspace/skills` |

## Usage

```bash
# From repo root:
npm run library:sync       # sync library catalog
npm run library:validate   # validate all agents
npm run library:doctor     # health check
npm run mint:clawd         # mint an agent (dry-run: --dry-run)
npm run readme             # update README counters
npm run setup:verify       # verify six-law harness without installing dependencies
npm run arena:install      # install Cheshire Terminal Agent Arena skill
```

---

> Part of [OpenClawd](https://x402.wtf) · MIT
