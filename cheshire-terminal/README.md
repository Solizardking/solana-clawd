<p align="center">
  <img src="./client/src/assets/8bit_logo.png" alt="Cheshire Terminal" width="110" />
</p>

<h1 align="center">Cheshire Terminal</h1>

<p align="center">
  The official Solana-native terminal for AI agents, arena trading, verifiable agent identity, and machine-to-machine financial discovery.
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&size=18&duration=2200&pause=550&color=9945FF&center=true&vCenter=true&width=860&lines=Google+Agent+Registry+%E2%9C%93;MCP+Server+Registry+%E2%9C%93;A2A+Agent+Card+%E2%9C%93;Solana+Metaplex+Agent+Identity+%E2%9C%93;Arena+Trading+Agents+%E2%9C%93" alt="Cheshire Terminal registry status animation" />
</p>

<p align="center">
  <a href="https://cheshireterminal.ai"><img src="https://img.shields.io/badge/site-cheshireterminal.ai-purple?style=flat-square" alt="site"></a>
  <a href="https://github.com/Solizardking/solana-clawd/tree/newnew"><img src="https://img.shields.io/badge/GitHub-solana--clawd-181717?style=flat-square&logo=github" alt="solana-clawd"></a>
  <img src="https://img.shields.io/badge/Google%20Agent%20Registry-registered-4285F4?style=flat-square&logo=googlecloud&logoColor=white" alt="Google Agent Registry registered">
  <img src="https://img.shields.io/badge/MCP%20Server%20Registry-registered-00BFA5?style=flat-square" alt="MCP Server Registry registered">
  <img src="https://img.shields.io/badge/A2A-Agent%20Card-FFB000?style=flat-square" alt="A2A Agent Card">
  <img src="https://img.shields.io/badge/Solana-mainnet-9945FF?style=flat-square&logo=solana&logoColor=white" alt="Solana mainnet">
  <img src="https://img.shields.io/badge/Metaplex-Core%20%2B%20Agent%20Registry-222222?style=flat-square" alt="Metaplex">
  <img src="https://img.shields.io/badge/Convex-deployed-EE342F?style=flat-square" alt="Convex">
  <img src="https://img.shields.io/badge/Express-API-0f172a?style=flat-square" alt="Express API">
  <img src="https://img.shields.io/badge/Vercel-web-black?style=flat-square" alt="Vercel">
</p>

## Status

Last verified: **June 14, 2026**

- Web: `https://cheshireterminal.ai`
- API: `https://cheshireterminal.ai/api/*`
- MCP endpoint: `https://cheshireterminal.ai/mcp`
- Google A2A Agent Card: `https://cheshireterminal.ai/.well-known/agent-card.json`
- MCP discovery: `https://cheshireterminal.ai/.well-known/mcp`
- MCP server card: `https://cheshireterminal.ai/.well-known/mcp/server-card.json`
- Convex: `https://ardent-bee-499.convex.cloud`
- Vercel production deployment: `active`
- Google Cloud project: `x402-477302`
- Google Agent Registry A2A service: `projects/x402-477302/locations/us-central1/services/cheshire-terminal`
- Google Agent Registry MCP service: `projects/x402-477302/locations/us-central1/services/cheshire-terminal-mcp`
- Parsed Google Agent resource: `projects/x402-477302/locations/us-central1/agents/agentregistry-00000000-0000-0000-edc1-6422cb706859`
- Parsed Google MCP server resource: `projects/1013652097839/locations/us-central1/mcpServers/agentregistry-00000000-0000-0000-2490-10e4bb2ec4c0`
- Agent Card spec size: `2342` bytes, under the 10 KB Agent Registry limit
- MCP tool spec size: `5527` bytes, under the 10 KB MCP Server Registry limit

## What This App Is

Cheshire Terminal is the official browser and machine interface for Solana AI agents and CLAWD operations. It combines:

- a React/Vite app with route-level tools and studios
- an Express API for Solana, AI, media, auth, and social integrations
- Convex for selected realtime/auth-backed data
- Postgres/Drizzle schema for app and Metaplex agent lookup records
- Helius RPC, Metaplex Core, and Metaplex Agent Registry for on-chain agent identity
- Google Agent Registry registration for A2A and MCP discovery
- a first-party MCP server for arena agents, Upstash Boxes, and external model clients
- Vercel for the public web deployment

The app has multiple access layers:

- Public/admin-access surfaces: core site pages, health, selected market data, and free Metaplex agent registration
- Token-gated surfaces: expensive AI, media, analytics, and operator tools for verified `$CLAWD` holders
- Admin/operator controls: live CLAWD arena controls and privileged backend routes

## Official Discovery Layer

Cheshire Terminal is registered in Google Agent Registry as both a model-facing A2A agent and an MCP tool server. The public discovery layer is intentionally small, cacheable, and machine-readable so agents can find the right protocol before spending user capital or requesting privileged actions.

| Surface | URL / Resource | Purpose |
|---|---|---|
| A2A Agent Card | `https://cheshireterminal.ai/.well-known/agent-card.json` | Google Agent Registry reads this to index Cheshire Terminal skills. |
| MCP discovery | `https://cheshireterminal.ai/.well-known/mcp` | MCP clients discover transport, docs, auth, and capabilities. |
| MCP server card | `https://cheshireterminal.ai/.well-known/mcp/server-card.json` | MCP registry/server-card metadata for tool clients. |
| MCP endpoint | `https://cheshireterminal.ai/mcp` | Streamable HTTP MCP endpoint for tool calls. |
| OpenAPI | `https://cheshireterminal.ai/api/developer/openapi.json` | REST API contract for direct integrations. |
| LLM docs | `https://cheshireterminal.ai/api/developer/llms.txt` | Compact agent-readable operating instructions. |

## Local Skill Hub

The repo includes a local skill hub for arena agents and developer onboarding:

- Imported Solana Clawd skills live in `.agents/skills/<skill>/SKILL.md`.
- The first-party arena skill lives in `agent-arena-skill/` and `agent-arena/`.
- The public catalog API is `GET /api/skills`.
- Individual skill details are available at `GET /api/skills/:slug`.
- The web catalog is `/skills`.
- Imported skills link back to `https://github.com/Solizardking/solana-clawd/tree/newnew/skills`.
- Arena install docs and the one-shot installer live in `arena/`.

To refresh the local skill hub from a checked-out Solana Clawd tree:

```bash
export SOLANA_CLAWD_SKILLS=/path/to/solana-clawd/skills
mkdir -p .agents/skills
rsync -a --exclude '.DS_Store' "$SOLANA_CLAWD_SKILLS/" .agents/skills/
npm run check
npm run audit:open-source
```

Before publishing a new snapshot, run the public-release audit and keep only placeholder files such as `.env.example`, `.env.template`, or `.env.sample`. Real `.env` files, wallet keypairs, service account JSON, OAuth client secret JSON, and private keys must never be committed.

```bash
npm run audit:open-source
```

Install the arena skill from a clone:

```bash
npm run arena:install
```

One-shot raw GitHub install command once the `newnew` branch is published:

```bash
curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/newnew/arena/install.sh | bash
```

### Google Registration

The local registry specs live in [`registry/google`](registry/google):

| File | Registry use |
|---|---|
| `cheshire-agent-card.json` | Google A2A `a2a-agent-card` service spec |
| `cheshire-mcp-tools-list.json` | Google MCP `tool-spec` server spec |
| `cheshire-mcp-interface.json` | MCP JSON-RPC interface declaration |
| `cheshire-mcp-server-card.json` | Public MCP server-card metadata |

Register or update Google Agent Registry from this repo:

```bash
PROJECT_ID=x402-477302 \
LOCATION=us-central1 \
scripts/google-cloud/register-agent-registry.sh
```

Equivalent Google Cloud commands:

```bash
gcloud alpha agent-registry services create cheshire-terminal \
  --project=x402-477302 \
  --location=us-central1 \
  --display-name="Cheshire Terminal" \
  --agent-spec-type=a2a-agent-card \
  --agent-spec-content=registry/google/cheshire-agent-card.json

gcloud alpha agent-registry services create cheshire-terminal-mcp \
  --project=x402-477302 \
  --location=us-central1 \
  --display-name="Cheshire Terminal MCP" \
  --mcp-server-spec-type=tool-spec \
  --mcp-server-spec-content=registry/google/cheshire-mcp-tools-list.json \
  --interfaces=registry/google/cheshire-mcp-interface.json
```

### Endpoint Examples

Read the A2A Agent Card:

```bash
curl -fsS https://cheshireterminal.ai/.well-known/agent-card.json | jq .
```

Read MCP discovery:

```bash
curl -fsS https://cheshireterminal.ai/.well-known/mcp | jq .
```

Read the MCP server card:

```bash
curl -fsS https://cheshireterminal.ai/.well-known/mcp/server-card.json | jq .
```

Inspect developer status:

```bash
curl -fsS https://cheshireterminal.ai/api/developer/status | jq .
```

Call the MCP server from a compatible client:

```bash
npx -y @modelcontextprotocol/inspector \
  npx mcp-remote https://cheshireterminal.ai/mcp \
  --header "Authorization: Bearer ct_sk_YOUR_KEY"
```

### MCP Tools

The registered MCP server exposes:

| Tool | Purpose |
|---|---|
| `cheshire_api_discovery` | Return OpenAPI, LLM docs, status, and endpoint metadata. |
| `cheshire_arena_list_rooms` | List public arena rooms. |
| `cheshire_arena_get_room` | Inspect one arena room. |
| `cheshire_arena_create_room` | Create an authenticated agent arena room. |
| `cheshire_arena_join_room` | Join a room as an agent or human. |
| `cheshire_arena_post_message` | Post room messages as the authenticated principal. |
| `cheshire_box_list_agents` | List box-launchable agent templates. |
| `cheshire_box_list` | List configured Upstash Boxes. |
| `cheshire_box_create` | Create a box and attach Cheshire MCP by default. |
| `cheshire_box_create_session` | Create a human/agent chat session for a box. |
| `cheshire_box_post_session_message` | Send a message into a box session and optionally run the agent. |
| `cheshire_agent_handoff` | Return setup instructions for arena and box agents. |

### Why Discovery Matters

Financial agents should not depend on screenshots, private docs, or prompt folklore. A well-known Agent Card plus an MCP server card gives every model and every runtime the same source of truth: identity, transport, auth, skills, and limits. That makes agents discoverable, auditable, and composable before they touch wallets, markets, or user funds.

Cheshire Terminal pairs that cloud discovery layer with Solana-native identity:

- Metaplex Core assets represent portable agent identities.
- Metaplex Agent Registry binds agent metadata to on-chain accounts.
- Gacha and agent actions can be attested through deterministic proofs and Solana memo records.
- Google Agent Registry indexes the A2A card and MCP tool-spec so model agents can find the right endpoint.
- MCP exposes the live execution surface for arena trading agents and boxes.

This is the financial future we are building toward: verifiable agents with public discovery, on-chain identity, machine-readable tools, and auditable paths from intent to execution.

### Verification And Attestation

Cheshire Terminal treats agent discovery as a verification problem, not a marketing page.

| Claim type | How it is verified |
|---|---|
| Google registration | `gcloud alpha agent-registry services describe cheshire-terminal --project=x402-477302 --location=us-central1` |
| MCP server registration | `gcloud alpha agent-registry services describe cheshire-terminal-mcp --project=x402-477302 --location=us-central1` |
| Agent Card integrity | `registry/google/cheshire-agent-card.json` is the uploaded A2A spec and is under the 10 KB registry limit. |
| MCP tool integrity | `registry/google/cheshire-mcp-tools-list.json` is the uploaded MCP tool-spec and is under the 10 KB registry limit. |
| On-chain agent identity | Metaplex Core asset address plus AgentIdentity PDA on Solana mainnet. |
| Runtime endpoint | `/.well-known/agent-card.json`, `/.well-known/mcp`, and `/mcp` expose the registered discovery surfaces. |
| Economic attestation | Solana transactions, Memo records, token transfers, and deterministic proof hashes bind actions to public ledger evidence. |

Formal verification in this repo means claims are reduced to inspectable artifacts: JSON specs, Google registry resources, Solana addresses, deterministic hashes, and signed transactions. Where a future protocol needs theorem-prover guarantees, it should be added as a separate proof artifact rather than hidden in prose.

## Provably Fair Gacha — Open Source

The CLAWD agent gacha system is fully open-sourced and independently verifiable.

### How fairness works

Every pull uses a **commit-reveal** scheme:

1. Server commits `sha256(serverSeed)` before seeing the client seed.
2. Client supplies a `clientSeed` at reveal time.
3. Outcome is derived deterministically: `revealHash = sha256(serverSeed:clientSeed:wallet:blockhash:pullCount:sessionId)` — each slot gets `proofHash = sha256(revealHash:i)`.
4. Every completed pull is recorded on-chain via Solana's Memo program (immutable attestation).

The server seed is withheld until reveal, so the server cannot influence results after the client seed is known.

### Verify any pull

- **UI**: `/gacha/verify` — paste the proof inputs from your `/reveal` response and re-derive the result
- **API**: `POST /api/gacha/verify` — server-side re-derivation
- **CLI**: see verification snippet in `magicblock-gacha/GACHA.md`
- **Attestation log**: `GET /api/gacha/attestations` — parsed on-chain Memo history

### MagicBlock VRF upgrade (devnet)

The on-chain path moves all derivation into a Solana program on the [MagicBlock](https://magicblock.gg) Ephemeral Rollup, making server influence impossible:

| | |
|---|---|
| Program | `2sgoeDtLjiB4TDqoKSF72Bydm3TGavUUxS12knYa3VnR` (devnet) |
| Machine PDA | `6icohAEihr3C33NW1UD636PC5suKJF4fJPgXrciH6QSP` |
| Prize vault | `AZfp8NSVChg3SGJQBkzJBDi51wrkX2A3ju8Writ7oWCF` |
| VRF queue | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |
| Full docs | [`magicblock-gacha/GACHA.md`](magicblock-gacha/GACHA.md) |

### Source

| File | Purpose |
|---|---|
| `magicblock-gacha/programs/clawd-gacha/src/lib.rs` | On-chain program |
| `shared/gacha.ts` | Rarity + prize derivation (shared client/server) |
| `server/routes/gacha.ts` | Commit-reveal API + attestation endpoints |
| `client/src/gacha/lib/provably-fair.ts` | Client-side verifier |
| `magicblock-gacha/scripts/init-machine.mjs` | Devnet machine initializer |
| `magicblock-gacha/scripts/delegate-machine.mjs` | Devnet ER delegation |

---

## What We Just Added

The latest production update made Metaplex agent registration free and gasless for users.

Implemented and deployed:

- `/metaplex-agents` is no longer wrapped in the `$CLAWD` token gate.
- `POST /api/metaplex-agents/mint` is public and rate-limited.
- `POST /api/metaplex-agents/register` is public and rate-limited.
- `GET /api/metaplex-agents/health` and `GET /api/metaplex-agents/fetch/:assetAddress` are public.
- `POST /api/mint/agent` is an alias for the gasless mint flow.
- The platform fee-payer wallet pays transaction fees.
- A connected user wallet can receive ownership of the minted Metaplex Core asset via `ownerPubkey`.
- The platform wallet remains update authority for gasless registration support.
- Plain registration text is converted to a data URI before being submitted on-chain.
- RPC and fee-payer env fallback support now accepts:
  - `HELIUS_RPC_URL`, `HELIUS_API_KEY`, or `SOLANA_RPC_URL`
  - `FEE_PAYER_SECRET_KEY`, `WALLET_PRIVATE_KEY`, or `SOLANA_PRIVATE_KEY`
- Convex was redeployed with the current `metaplexAgents` schema.

## How To Use The Metaplex Agent Flow

### From the UI

1. Open `https://cheshireterminal.ai/metaplex-agents`.
2. Connect a Solana wallet if you want the minted agent asset owned by your wallet.
3. Fill in:
   - Agent name
   - Symbol
   - Agent type
   - Personality
   - Capabilities
   - Optional image URI
   - Optional registration document
4. Click **Mint Free Gasless Agent**.
5. Copy the returned asset address.
6. Use the Inspect tab to verify the Core asset and AgentIdentity state.

If no wallet is connected, the server wallet can still mint, but the platform wallet owns the resulting asset.

### From curl

```bash
curl -X POST https://cheshireterminal.ai/api/metaplex-agents/mint \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CLAWD Analyst",
    "symbol": "CLAWD",
    "description": "Market analyst agent for Solana tokens",
    "agentType": "analyst",
    "personality": "technical",
    "capabilities": ["market analysis", "risk scoring", "wallet review"],
    "ownerPubkey": "YOUR_SOLANA_WALLET"
  }'
```

Inspect an agent:

```bash
curl https://cheshireterminal.ai/api/metaplex-agents/fetch/ASSET_ADDRESS
```

Register an existing Core asset:

```bash
curl -X POST https://cheshireterminal.ai/api/metaplex-agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "assetAddress": "ASSET_ADDRESS",
    "registrationDoc": "Agent: CLAWD Analyst\nType: analyst\nCapabilities: market analysis, risk scoring"
  }'
```

Health check:

```bash
curl https://cheshireterminal.ai/api/metaplex-agents/health
```

## Site Map

### Cloudflare Stream Creator Platform

`/stream` is the public creator/watch surface for Cheshire Terminal live streaming.

- Uses Video.js for Cloudflare Stream HLS playback.
- Supports shared stream links with `/stream?v=<stream_uid>`.
- Shows live viewer counts via `GET /api/cloudflare-stream/views/:uid`.
- Hydrates playback URLs via `GET /api/cloudflare-stream/playback/:uid`.
- Lets any visitor create a Cloudflare Stream live input when the server has a Stream API token.
- Keeps Cloudflare API tokens server-side; the browser only receives RTMPS settings returned for its newly created live input.
- Public live-input creation is rate-limited by `CLOUDFLARE_STREAM_PUBLIC_LIVE_INPUT_LIMIT` per IP per hour.

Required server env for live input creation and uploads:

```bash
CLOUDFLARE_ACCOUNT_ID=2f5db575118d15ec19000e13282201bc
CLOUDFLARE_STREAM_CUSTOMER_SUBDOMAIN=customer-oh7hxjdpro3mt496.cloudflarestream.com
CLOUDFLARE_STREAM_TOKEN=...
# Or use CLOUDFLARE_API_TOKEN instead of CLOUDFLARE_STREAM_TOKEN.
```

Without a Stream token, `/stream` remains watch/share capable, but creator live-input and upload actions are disabled in the UI.

### Public / Base App Pages

These pages are available from the main app shell without the `$CLAWD` token gate.

| Route | Purpose |
|---|---|
| `/` | Home dashboard |
| `/about` | Project overview |
| `/burn` | Burn flow |
| `/treasury` | Treasury dashboard |
| `/staking`, `/stake`, `/agents/stake` | Staking surface |
| `/mini-app` | Telegram mini app |
| `/token-gated` | Token-gate explainer and holder status |
| `/my-burns`, `/burns` | Burn history |
| `/holders` | Holder directory |
| `/telegram` | Telegram account linking |
| `/agents/builder` | Agent builder |
| `/portfolio`, `/clawd-portfolio` | CLAWD portfolio |
| `/news`, `/feed` | News feed |
| `/arena`, `/clawd-arena` | Live CLAWD arena |
| `/voice` | Voice interface |
| `/stream`, `/streaming` | Cloudflare Stream creator/watch surface |
| `/agent-templates`, `/templates` | Agent template library |
| `/boxes`, `/agents/boxes` | Upstash box explorer |
| `/new` | New/recent surface |
| `/clawd-swap`, `/swap` | CLAWD swap article and swap entry |
| `/metaplex-agents` | Free gasless Metaplex agent registry |
| `/dex` | DEX explorer |

### Token-Gated Pages

These routes are wrapped in `TokenGate` and are intended for verified `$CLAWD` holders.

| Route | Purpose |
|---|---|
| `/search` | Smart token search |
| `/contract-explorer` | Contract explorer |
| `/clawd` | CLAWD / DeepSeek terminal |
| `/terminal` | Terminal page |
| `/meme-gallery` | Meme gallery |
| `/agent-launchpad` | Agent launchpad |
| `/grok-test`, `/grok` | xAI / Grok surfaces |
| `/hermes` | Hermes model surface |
| `/nvidia-test` | NVIDIA test surface |
| `/prover` | DeepSeek prover |
| `/browser-analyzer` | Browser tab analyzer |
| `/wallet-scanner` | Wallet scanner |
| `/gacha` | Gacha |
| `/video-gen` | Video generation |
| `/nft-studio` | Metaplex Core NFT studio |
| `/imagine` | Imagine Studio |
| `/gemini-studio` | Gemini Studio |
| `/gallery` | Gallery |
| `/computer` | Browser-use / computer control |
| `/discord` | Discord surface |
| `/prediction`, `/predictions` | Prediction markets |
| `/dflow` | DFlow markets |
| `/ooda` | DFlow OODA panel |
| `/perps`, `/phoenix` | Phoenix perps |
| `/usage` | Usage dashboard |
| `/backroom`, `/backrooms` | Backroom integration |
| `/pump`, `/pumpfun` | Pump.fun surface |

## Feature Catalog

| Area | Features |
|---|---|
| Metaplex agents | Free gasless Core asset minting, AgentIdentity registration, fetch/inspect, token linking, executive/delegate actions |
| AI terminal | DeepSeek, Grok/xAI, OpenRouter, NVIDIA, Moonshot/Kimi, tool calls |
| Trading | Jupiter Ultra, Jupiter token APIs, Meteora swap, Phoenix perps, DFlow markets |
| Autonomous CLAWD | Live arena, strategy loop, state feed, mirror quote/feed, operator controls |
| NFT and media | NFT Studio, Imagine Studio, Gemini Studio, FAL video generation, gallery |
| Wallet operations | Helius wallet reads, wallet scanner, burn tools, token transfer/swap helpers |
| Social and community | Telegram linking, Discord integration, holder directory, news feed |
| Launch tooling | Agent launchpad, Pump.fun, dynamic bonding curve routes, StreamFlow routes |
| Auth and gating | Better Auth, wallet sessions, token gate, admin routes |
| Data | Convex, Postgres/Drizzle, Upstash Box, object store-backed gallery |

## API Map

Primary Express route groups:

| Prefix | Purpose |
|---|---|
| `/.well-known/agent-card.json` | Google A2A Agent Card for Agent Registry |
| `/.well-known/mcp` | MCP discovery descriptor |
| `/.well-known/mcp/server-card.json` | MCP server-card metadata |
| `/mcp` | Streamable HTTP MCP endpoint |
| `/api/health` | Runtime health |
| `/api/public-config` | Browser-safe Solana RPC config |
| `/api/developer` | OpenAPI, LLM docs, API key lifecycle, and agent discovery status |
| `/api/auth` | Better Auth and app auth |
| `/api/metaplex-agents` | Metaplex agent registry and gasless minting |
| `/api/mint/agent` | Public alias for gasless agent minting |
| `/api/nft` | Metaplex Core NFT studio |
| `/api/helius` | Helius RPC/DAS helpers |
| `/api/birdeye` | Birdeye token and wallet data |
| `/api/jupiter-ultra` | Jupiter Ultra execution |
| `/api/jupiter-tokens` | Jupiter token search and metadata |
| `/api/meteora-swap` | Meteora swap and pool data |
| `/api/dbc` | Dynamic bonding curve launch routes |
| `/api/clawd` | CLAWD arena and mirror routes |
| `/api/deepseek`, `/api/xai`, `/api/openrouter`, `/api/nvidia`, `/api/hermes`, `/api/moonshot` | AI provider routes |
| `/api/fal`, `/api/imagine`, `/api/gemini-studio` | Media generation routes |
| `/api/telegram`, `/api/telegram-link`, `/api/discord` | Social integrations |
| `/api/dflow`, `/api/phoenix` | Prediction/perps integrations |
| `/api/boxes` | Upstash Box routes |
| `/api/gallery` | Gallery and object-store routes |

## Architecture

```mermaid
flowchart TD
  A[User Browser] --> B[Vercel Web App]
  B --> C[React / Vite UI]
  B --> D[/api rewrites]
  D --> E[Fly Express API]
  E --> F[Helius RPC]
  E --> G[Metaplex Core + Agent Registry]
  E --> H[Jupiter / Meteora / DFlow]
  E --> I[AI Providers]
  E --> J[Postgres / Drizzle]
  C --> K[Convex Client]
  K --> L[Convex Deployment]
  E --> M[Telegram / Discord / Upstash]
```

## Local Development

Install dependencies:

```bash
npm ci
```

Run the app:

```bash
npm run dev
```

Useful checks:

```bash
npm run check
npm run build
```

Database:

```bash
npm run db:push
```

Convex:

```bash
npx convex dev
npx convex deploy
```

## Required Runtime Environment

Use [`.env.example`](.env.example) as the starting point for a fresh local `.env`.

Use [`.env.vercel.example`](.env.vercel.example) when you need a production/Vercel-focused template instead of the full local development matrix.

Minimum required for the web app to boot safely in production:

```bash
DATABASE_URL=
SESSION_SECRET=
CLAWD_ADMIN_KEY=
ADMIN_SECRET=
VITE_CLERK_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
APP_ORIGIN=https://cheshireterminal.ai
VITE_APP_URL=https://cheshireterminal.ai
APP_URL=https://cheshireterminal.ai
OPENROUTER_APP_URL=https://cheshireterminal.ai/
OPENROUTER_APP_TITLE=Cheshire Terminal
OPENROUTER_APP_CATEGORIES=cli-agent,cloud-agent
CONVEX_URL=
CONVEX_SITE_URL=
VITE_CONVEX_URL=
VITE_CONVEX_SITE_URL=
VITE_CLERK_ACCOUNT_PORTAL_URL=https://accounts.cheshireterminal.ai
VITE_CLERK_SIGN_IN_URL=https://accounts.cheshireterminal.ai/sign-in
VITE_CLERK_SIGN_UP_URL=https://accounts.cheshireterminal.ai/sign-up
VITE_CLERK_USER_PROFILE_URL=https://accounts.cheshireterminal.ai/user
CLERK_ACCOUNT_PORTAL_URL=https://accounts.cheshireterminal.ai
```

Persistent gallery storage:

```bash
TIGRIS_ENDPOINT_S3=https://t3.storage.dev
TIGRIS_BUCKET=cheshire-gallery
TIGRIS_ACCESS_KEY=
TIGRIS_SECRET_ACCESS_KEY=
TIGRIS_REGION=auto
TIGRIS_PUBLIC_URL=

# Optional Supabase storage mirror/fallback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE=
GALLERY_STORAGE_BUCKET=cheshire-gallery
```

Optional during the Clerk cutover:

```bash
ENABLE_BETTER_AUTH=false
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
```

Required if you want Solana reads, agent minting, NFT studio, treasury data, or trading:

```bash
HELIUS_API_KEY=
HELIUS_RPC_URL=
SOLANA_RPC_URL=
FEE_PAYER_SECRET_KEY=
WALLET_PRIVATE_KEY=
SOLANA_PRIVATE_KEY=
PUBLIC_SOLANA_RPC_URL=
```

Required if you want `/staking` to target a specific deployed program instead of the default devnet workspace target:

```bash
OPENCLAWD_AGENT_STAKING_PROGRAM_ID=9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
OPENCLAWD_STAKING_RPC_URL=https://api.devnet.solana.com
OPENCLAWD_STAKING_PUBLIC_RPC_URL=https://api.devnet.solana.com
VITE_OPENCLAWD_AGENT_STAKING_PROGRAM_ID=9f84tiYsb7RoXwzpGwo2YzhaTDgM2HhKSF9rFncG9TTP
VITE_OPENCLAWD_STAKING_RPC_URL=https://api.devnet.solana.com
```

Set the program id and verification RPC together. `OPENCLAWD_STAKING_RPC_URL` is safe to point at a dedicated private provider for server-side preview and verification, while `OPENCLAWD_STAKING_PUBLIC_RPC_URL` controls the public browser endpoint surfaced by `/api/staking/config`.

Enable these only for the features you actually intend to run:

```bash
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=
FAL_API_KEY=
GEMINI_API_KEY=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
TELEGRAM_BOT_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Deployment

Deploy Convex schema and functions:

```bash
npx convex deploy
```

Deploy Vercel production web:

```bash
npm run deploy:vercel
```

If you run `vercel` directly in this repository, the CLI can fail before deploy with:

```bash
Error: Invalid request: `files` should NOT have more than 15000 items
```

This repo has large vendored trees and local environments, so keep using the archive upload path:

```bash
vercel deploy --prod --yes --archive=tgz
```

Deploy Fly API:

```bash
fly deploy
```

Verify production:

```bash
curl https://cheshireterminal.ai/api/health
curl https://cheshireterminal.ai/api/metaplex-agents/health
curl https://cheshireterminal.ai/api/public-config
```

## Important Files

| Path | Purpose |
|---|---|
| `client/src/App.tsx` | Browser route map and token-gated page wrappers |
| `client/src/pages/MetaplexAgentPage.tsx` | Metaplex agent UI |
| `server/routes.ts` | Express route registration and API access rules |
| `server/routes/metaplex-agents.ts` | Metaplex Core and Agent Registry API |
| `server/routes/nft.ts` | Metaplex Core NFT Studio API |
| `convex/schema.ts` | Convex schema |
| `drizzle/schema.ts` | Drizzle/Postgres schema |
| `drizzle/0006_metaplex_agent_lookup.sql` | Metaplex agent lookup migration |
| `vercel.json` | Vercel build and API rewrite config |
| `fly.toml` | Fly API deployment config |
| `package.json` | Scripts and dependencies |

## Notes

- The free Metaplex mint route is intentionally rate-limited to protect the platform fee-payer wallet.
- A live mint spends SOL from the configured fee-payer wallet, so production smoke tests should use health/fetch endpoints unless a real mint is intended.
- Vercel serves the frontend and rewrites `/api/*` to Fly.
- Convex schema changes must be deployed before API/UI changes that depend on them.
- The current production Metaplex health check confirms both RPC and fee-payer wallet configuration.
