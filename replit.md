# Open Clawd Terminal

Voice-controlled meme token launcher for Solana — CLAWD & CODEX brand. Mint tokens, launch AI agents on-chain, generate AI art/video, and chat with the CLAWD lobster AI terminal.

## Run & Operate
- `npm run dev` — starts Express + Vite (port 5000)
- `npm run build` — production build
- `npm run check` — TypeScript check
- DB: `node -e "..."` raw pg for schema changes (drizzle-kit 0.19.1 is too old for `push`)

## Stack
- **Frontend**: React 18, Vite, Wouter, TanStack Query v5, shadcn/Tailwind, Solana wallet adapter
- **Backend**: Express, tsx, Drizzle ORM (node-postgres), pg
- **AI**: OpenAI (gpt-image-1, DALL-E), DeepSeek V4 (via OpenAI SDK), XAI/Grok, FAL AI (SeeAnce 2.0), ElevenLabs TTS
- **Blockchain**: Metaplex UMI (mpl-core, mpl-agent-registry), Helius RPC, Pump.fun

## Where things live
- `shared/schema.ts` — Drizzle table definitions (source of truth for all types)
- `server/db.ts` — pg Pool + drizzle connection
- `server/storage.ts` — MemStorage (in-memory for most data)
- `server/routes/*.ts` — one file per domain (deepseek, fal, nft, birdeye, metaplex-agents…)
- `client/src/pages/` — page components (route-based)
- `client/src/components/` — shared UI components

## Architecture decisions
- **MemStorage** for most data; PostgreSQL only for deepseek_sessions, deepseek_messages, agent_deployments
- **drizzle-kit 0.19.1** doesn't support `push` — tables must be created via raw SQL (`node -e "..."`)
- DeepSeek route uses OpenAI SDK pointed at `https://api.deepseek.com` with thinking via `extra_body`
- FAL video gen uses queue API directly (`queue.fal.run`) with polling on `/status/:requestId`
- Birdeye trending ticker runs in the top bar (every 30s refresh, `data.tokens` array)

## Product
- **Home** — voice-controlled token launcher, CLAWD pixel pet, trending tokens
- **CLAWD Terminal** (`/clawd`) — DeepSeek V4 Pro/Flash chat with thinking, Honcho memory, 7 Solana tools, animated lobster
- **CLAWD Gate** (`/token-gated`) — token-gate requiring 1+ CLAWD token; shows net worth, PnL, CLAWD balance; unlocks full platform
- **NFT Studio** — mint Metaplex Core NFTs with gpt-image-1 generation
- **Video Gen** — FAL SeeAnce 2.0 text-to-video + image-to-video
- **Agent Registry** — Metaplex mpl-agent-registry on-chain agent ops
- **Gacha / Burn / DEX** — token utility features

## User preferences
- CLAWD & CODEX brand throughout; lobster + Cheshire cat aesthetic
- No Smart Contract page (removed); CLAWD Terminal is the primary AI feature
- DeepSeek V4 (not Claude/GPT) for the main chat; Honcho for persistent memory
- Token gate: hold ≥1 CLAWD (`8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`) → full site access
- GEMINI_API_KEY pending (requested but not yet set by user)

## Gotchas
- Telegram bot fails (401) — token needs updating but it's non-blocking
- XAI TTS returns 403 (team not authorized) — non-blocking, voice uses fallback
- FAL_API_KEY also exposed as VITE_FAL_API_KEY — minor security note
- Vite HMR WebSocket errors in screenshots are cosmetic (proxy config) — app fully works
- Birdeye `/wallet/v2/current-net-worth` requires `flags[]=include_low_liquidity` as array in URL (not URLSearchParams)

## Pointers
- Birdeye API: `GET /api/birdeye/trending-tokens?limit=20` → `data.tokens[]`
- Birdeye wallet: `GET /api/birdeye/wallet/net-worth?wallet=`, `GET /api/birdeye/wallet/pnl?wallet=`, `POST /api/birdeye/wallet/token-balance`
- Helius CLAWD verify: `GET /api/helius/verify-clawd?wallet=` → `{ isHolder, balance, rawBalance }`
- Token gate context: `client/src/contexts/TokenGateContext.tsx` — `useTokenGate()` hook
- FAL queue: `POST queue.fal.run/{model}` → `request_id`, poll `GET …/requests/{id}/status`
- DeepSeek tools: search_web, get_token_price, get_wallet_balance, mint_solana_agent, register_solana_agent, list_deployed_agents, get_rpc_status
