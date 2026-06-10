# Dark Wallet

Browser wallet shell for the ZOLana workspace. This version combines the
wallet, paper wallet, agent, DeFi, and swap lanes into one local-first UI.

## What It Does

- Shows transparent balances from the selected Solana cluster.
- Stages shield, unshield, private transfer, and private payment primitives in
  a local vault ledger.
- Generates a Solana paper wallet locally from browser entropy and optional
  typed entropy.
- Prints a cold-storage sheet or downloads a JSON backup for offline use.
- Optionally asks the Dark Clawd agent sidecar to review the public metadata
  and operator instructions.

## Build and Run

```bash
cd dark/dark-wallet
npm install
npm run dev
```

The root workspace also exposes:

```bash
npm run dark:dev
npm run dark:build
npm run dark:typecheck
npm run dark:preview
```

## Environment

The Vite build exposes these values at compile time:

```bash
HELIUS_RPC_URL=
HELIUS_API_KEY=
SOLANA_RPC_URL=
SOLANA_CLUSTER=
XAI_API_KEY=
XAI_BASE_URL=
XAI_MODEL=
```

- `HELIUS_RPC_URL` overrides the RPC endpoint directly.
- `HELIUS_API_KEY` is used to build the devnet or mainnet-beta Helius RPC URL.
- `SOLANA_CLUSTER` chooses the default cluster shown in the UI.
- `XAI_API_KEY` enables the Dark Clawd review sidecar.

## Paper Wallet Flow

The `Paper` tab mirrors the offline-first feel of the Zcash paper-wallet repo:

1. Type extra entropy.
2. Generate a keypair locally.
3. Reveal the secret only when you are ready to print.
4. Use the browser print dialog to save a PDF or send it to a printer.
5. Download the JSON backup if you want a machine-readable copy.

The sheet shows:

- Label
- Network
- Public key
- Secret key JSON
- Seed and public fingerprints

## Port Notes

The Zcash paper-wallet pattern was adapted rather than copied:

- Sapling key derivation was replaced with Solana keypair generation.
- The printable output was kept, but the data model now carries Solana keys.
- The wallet stays browser-local until you opt into live Solana balance reads.
- The agent sidecar never sees secret key material.

## Related

- [../README.md](../README.md)
- [Root README](../../README.md)
