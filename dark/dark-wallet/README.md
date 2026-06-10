# Dark Wallet

<div align="center">
  <img src="../../assets/dark-workspace-banner.svg" alt="Dark Wallet animated banner" width="100%" />
</div>

Browser wallet shell ported from the Zolana `dark-wallet` concept and rebuilt
as a local-first workspace app.

## What It Ships

- Custom injected-wallet flow instead of a heavier adapter stack
- Simulated shielded ledger for demo mode
- Sibling `dark-agent`, `dark-defi`, and `dark-swap` lane modules for policy,
  vault, and route previews
- Public-safe docs that avoid exposing private keys, secret env values, or box
  internals

## Root Entry Points

- `npm run dark:dev`
- `npm run dark:build`
- `npm run dark:typecheck`
- `npm run dark:preview`

## Local Run

```bash
cd dark/dark-wallet
npm install
npm run dev
```

For the workspace overview, see [../README.md](../README.md).
