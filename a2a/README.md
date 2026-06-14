# SVM-A2A Framework

Solana-native agent-to-agent runtime for Clawd agents. The package exposes:

- Metaplex Agent Card discovery at `/.well-known/agent-card.json`
- DID discovery at `/.well-known/did.json`
- A2A task endpoints at `/tasks` and `/tasks/:id/subscribe`
- Clawd CAAP auth routes under `/auth`
- Cloudflare Durable Object binding for `SvmA2AAgent`
- A2UI renderer entrypoint for agent-generated UI parts

## Commands

```bash
npm --prefix a2a run check
npm --prefix a2a run build
npm --prefix a2a run dev
npm --prefix a2a run mint:dry
```

Live minting requires wallet/RPC configuration:

```bash
export SOLANA_SECRET_KEY='[1,2,...]'
export SOLANA_RPC_URL='https://api.devnet.solana.com'
npm --prefix a2a run mint
```

`npm --prefix a2a run mint` calls the Metaplex Agent Registry API through
`mintAndSubmitAgent`. `mint:dry` emits the exact agent metadata without
submitting a transaction.

## Cloudflare

`wrangler.toml` binds `SVM_A2A_AGENT` to the exported `SvmA2AAgent` Durable
Object class.

```bash
npm --prefix a2a run deploy
```
