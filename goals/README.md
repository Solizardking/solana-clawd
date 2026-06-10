# Solana Clawd Goals

`goals/` is the first-class goal orchestration app for this repository. It turns
operator prompts, uploaded context, perps plans, and research notes into
structured runtime goals that can be reviewed by humans and agents.

## What It Does

- Generates structured goals from prompts and uploaded files
- Keeps local goal history in browser storage
- Provides live preview and TEE/attestation-oriented UI surfaces
- Includes Phoenix perps and Percolator bounty examples
- Exposes an Express/Vite server that can be deployed separately or run locally

## Safety

- Real API keys belong only in ignored local/deployment env files.
- `goals/.env.example` contains placeholders only.
- `goals/.env.local` is ignored and must never be committed.
- The server does not ship embedded provider keys; model providers are enabled
  only when `GEMINI_API_KEY`, `MINIMAX_API_KEY`, `XAI_API_KEY`, or
  `REDPILL_API_KEY` are supplied through the environment.
- Existing generated output in `dist/` and dependencies in `node_modules/` are
  local artifacts, not source-of-truth build inputs.

## Root Scripts

From the repository root:

```bash
npm run goals:dev
npm run goals:build
npm run goals:typecheck
npm run goals:start
npm run goals:clean
```

`npm run build:all` also builds `goals/`.

## Local Development

```bash
cp goals/.env.example goals/.env.local
npm run goals:dev
```

The default local server listens on `http://localhost:3000`.

## Files Of Interest

| Path | Purpose |
|---|---|
| `src/App.tsx` | Goal generator UI and provider status handling |
| `src/components/PhoenixOrchestrator.tsx` | Phoenix/perps orchestration surface |
| `src/components/TeeTerminal.tsx` | TEE/attestation-oriented terminal simulation |
| `server.ts` | Express API and Vite static serving |
| `api/[...path].ts` | Vercel adapter for the bundled server |
| `perps-mq0xu6f9.json` | Example perps goal |
| `percolator-bounty.md` | Example bounty/research goal |
