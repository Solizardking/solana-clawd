# Dark Workspace

<div align="center">
  <img src="../assets/dark-workspace-banner.svg" alt="Dark Workspace animated banner" width="100%" />
</div>

Dark is the public-safe workspace for the modular wallet shell. It keeps the
wallet UI, policy lane, DeFi lane, and swap lane split into separate modules
so the code stays easy to reason about and the docs stay free of private
state.

## Layout

- `dark-wallet` - browser wallet shell and demo ledger
- `dark-agent` - guardrails, automation modes, and spend policy
- `dark-defi` - vault, yield, and risk surfaces
- `dark-swap` - route preview and quote estimation

## Integration Notes

- The wallet imports the sibling lanes directly through local Vite aliases.
- Demo mode runs locally without any protocol secrets or private keys.
- Connected mode only reads the injected wallet address and devnet balance
  when a wallet is present.
- No private box internals or local secrets are surfaced in these docs.
- The root package exposes `npm run dark:dev`, `npm run dark:build`,
  `npm run dark:typecheck`, and `npm run dark:preview`.

## Run

```bash
cd dark/dark-wallet
npm install
npm run dev
```

Or from the repo root:

```bash
npm run dark:dev
```

For the wallet surface itself, see [dark-wallet/README.md](./dark-wallet/README.md).
