# Bitaxe Orelane — Integration into `clawd-code-cli`

> **Source**: Originally developed at `/Users/8bit/Documents/New project 2/`
> **Lives here**: `packages/clawd-code-cli/bitaxe-orelane/`
> **Moved**: 2026-06-09 — moved into the solana-clawd monorepo so the rig controller, Telegram bot, ORE policy, and dashboard ship as part of the same workspace as the Clawd CLI, x402, Pay, and vendor SDKs.

---

## What this is

`bitaxe-orelane` is a **paper-first Clawd agent** that runs a safety-gated control loop for a single Bitaxe Gamma 602 ASIC (BM1370) and an ORE miner on Solana. It exposes:

- A **Telegram operator bot** with natural-language routing (DeepSeek → OpenRouter → keyword fallback)
- An **ORE decision engine** (`policy` + `strategy`) — hold / checkpoint / claim / deploy
- A **Bitaxe HTTP bridge** to AxeOS — hashrate, efficiency, freq, pause, resume, reboot
- A **Phoenix perp bridge** via the `vulcan` CLI — paper + live (gated) perps trading
- A **Helius DAS client** — wallet asset lookup, SOL/ORE balance, NFT count
- A **Next.js dashboard** at `dashboard/` for live rig telemetry
- An **ESP-Miner firmware overlay** at `firmware/esp-miner-overlay/` that lets the BM1370 report rig state to the controller without ever storing a Solana key on-device

It is **paper-first by default**. Live execution requires all of: `DRY_RUN=false`, `LIVE_EXECUTION=true`, `OPERATOR_CONFIRMED=true`, plus passing Bitaxe safety gates (temp, CPU, heap, WiFi, pause state).

---

## Layout inside `clawd-code-cli/`

```
packages/clawd-code-cli/
├── bitaxe-orelane/                ← this project
│   ├── src/                       # controller, policy, bot, perps-bridge, helius, etc.
│   ├── tests/                     # 46 vitest tests
│   ├── dashboard/                 # Next.js rig dashboard
│   ├── firmware/esp-miner-overlay # ESP-Miner patch + orelane API
│   ├── docs/                      # architecture, ORE v3, telegram bot
│   ├── clawd.json                 # Clawd agent definition (paper-first, CAAP/1.0)
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── src/                           # existing Clawd CLI (grok, MCP, DFlow, etc.)
├── package.json
└── …
```

The project is a **standalone subpackage** — it has its own `package.json` and is *not* a workspace of the solana-clawd root. This is intentional: it keeps the bitaxe-orelane dependency tree small (`@solana/web3.js`, `bs58`, `chalk` + `vitest`/`tsx`) and avoids forcing it to inherit the larger `@openclawdsolana/*` workspace deps.

---

## Running it from inside the monorepo

### Direct (from `bitaxe-orelane/`)

```bash
cd packages/clawd-code-cli/bitaxe-orelane
cp .env.example .env                 # fill in Helius + Telegram
npm install
npm run build                        # tsc → dist/
npm test                             # 46 vitest tests
npm run status                       # dry-run, reads live Bitaxe + ORE chain
npm run bot:test -- /help            # exercise bot intent router
npm run bot                          # start the Telegram bot
npm start                            # full control loop
```

### Dashboard

```bash
cd packages/clawd-code-cli/bitaxe-orelane/dashboard
cp .env.example .env.local           # fill in Bitaxe + Helius URLs
npm install
npm run dev                          # http://localhost:3000
```

---

## Where it talks to in the monorepo

| Touchpoint | Path | What flows |
|---|---|---|
| `clawd.json` (CAAP/1.0) | `bitaxe-orelane/clawd.json` | The agent publishes to the same `x402.wtf` registry the rest of `solana-clawd` uses |
| `agentAuth` registration | `https://x402.wtf/api/auth/agent/register` | Same endpoint as `@openclawdsolana/agent-registry` |
| `pay` workspace | `solana-clawd/pay/` | Bitaxe-orelane can consume `pay --sandbox clawd` for paid Telegram commands |
| `x402` workspace | `solana-clawd/x402/` | Future: paid ORE-deploy previews via x402 |
| `vendor/solana-clawd-x402` | `solana-clawd/vendor/solana-clawd-x402/` | Shared x402 signing helpers |
| `clawd-code-cli/src/` (sibling) | `packages/clawd-code-cli/src/` | Same root user can `clawd` and `bitaxe-orelane` from one checkout |

---

## What did NOT move

- `node_modules/` — regenerate with `npm install`
- `.env` — kept in the source checkout only; copy `.env.example` and fill in secrets
- `dist/` — regenerate with `npm run build`
- `.git/` — uses the solana-clawd monorepo git history from now on

---

## Source history

The original repo is at https://github.com/Solizardking/btcoreminingonsolana — git history is preserved there.
