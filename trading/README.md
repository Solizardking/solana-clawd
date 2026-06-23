<!-- ╔══════════════════════════════════════════════════════╗ -->
<!-- ║  trading/ — Trading utilities and AI agents          ║ -->
<!-- ╚══════════════════════════════════════════════════════╝ -->

<div align="center">

```
████████╗██████╗  █████╗ ██████╗ ██╗███╗   ██╗ ██████╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║██╔════╝
   ██║   ██████╔╝███████║██║  ██║██║██╔██╗ ██║██║  ███╗
   ██║   ██╔══██╗██╔══██║██║  ██║██║██║╚██╗██║██║   ██║
   ██║   ██║  ██║██║  ██║██████╔╝██║██║ ╚████║╚██████╔╝
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝  ╚═══╝ ╚═════╝
```

**Solana trading utilities and AI trading agents**

[![Solana](https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Phoenix](https://img.shields.io/badge/Phoenix-DEX-orange?style=flat-square)](https://ellipsis.finance)

</div>

---

## What it does

The `trading/` folder is the integration lane for Solana trading, mining, risk,
and verification projects. These packages intentionally keep their own local
toolchains and lockfiles; the repo integrates them through root npm aliases,
agent manifests, gateway imports, and hub discovery instead of forcing every
folder into the root pnpm workspace.

| Directory | Role | Integration status |
|---|---|---|
| `clawd-perps-agent/` | Phoenix/Vulcan/Imperial perps agent | Canonical trading agent. Root README and smoke checks already use `npm --prefix trading/clawd-perps-agent ...`. |
| `formal_verification/` | STRIDE/Kani/SAS-style verification gates for skills, agents, and risk surfaces | Used by `services/gateway/src/skillHub.ts`; outputs should stay under `trading/formal_verification/`. |
| `hedge/` | Hedge and investor persona bundle | JSON package for character overlays; validate with `jq -e . trading/hedge/*.json >/dev/null`. |
| `ore/` | ORE v3 strategy docs and OODA mining notes | Documentation/reference lane consumed by ORE-adjacent agents. |
| `staking/` | Agent staking Anchor program mirror | Mirrors root `staking/`; root `staking/` is currently the gateway/hub canonical path. |
| `bitaxe-orelane/` | Bitaxe Gamma + ORE + Telegram + perps control plane | Diverged from `packages/clawd-code-cli/bitaxe-orelane`; reconcile ownership before promoting either copy as canonical. |
| `Solana-Trading-AI-Agent/` | Placeholder for an upstream trading agent | Currently contains no runnable project files. Treat as unintegrated until populated or vendored cleanly. |

## Integration rules

- Keep live execution gated: `LIVE_TRADING=true`, `OPERATOR_CONFIRMED=true`,
  and the package-specific sim/live flags must be explicit.
- Use `npm --prefix trading/<package>` for standalone Node packages.
- Keep Anchor/Rust commands package-local for staking and formal proofs.
- Do not add broad `trading/*` workspace globs until lockfile ownership is
  resolved. Several folders are standalone npm or Anchor workspaces by design.
- Do not place wallets, API keys, RPC credentials, or real `.env` files in this
  tree.

## Useful root aliases

```bash
npm run trading:perps:typecheck
npm run trading:perps:build
npm run trading:formal:typecheck
npm run trading:hedge:validate
npm run trading:bitaxe:build
```

## Quick start

```bash
# Perps agent
npm install --prefix trading/clawd-perps-agent
npm --prefix trading/clawd-perps-agent run typecheck
npm --prefix trading/clawd-perps-agent run build

# Formal verification gate typecheck
npx tsc --noEmit --allowJs false \
  --target ES2022 \
  --module NodeNext \
  --moduleResolution NodeNext \
  trading/formal_verification/gate.ts \
  trading/formal_verification/skill-hub.ts \
  trading/formal_verification/stride.ts

# Hedge persona validation
jq -e . trading/hedge/*.json >/dev/null
```

---

> See also: [clawd-perps-agent/](./clawd-perps-agent/) · [formal_verification/](./formal_verification/) · [packages/percolator/](../packages/percolator/) · MIT
