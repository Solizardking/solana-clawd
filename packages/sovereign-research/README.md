# @openclawd/sovereign-research

> Sovereign research · knowledge-aware LLM routing · Solana agent intelligence

The autonomous research brain of the OpenClawd stack at [x402.wtf](https://x402.wtf). It combines:

- **Knowledge base** — 76+ curated facts from `knowledge/*.jsonl` injected as LLM context
- **ClawdRouter** — wallet-signed LLM inference with 55+ models and USDC x402 micropayments
- **Sovereign research** — Karpathy autoloop: Sense → Persist → Cross-ref → Surface → Act
- **TUI** — interactive terminal session with slash commands, streaming chat, and live chain data

## Install

```bash
# From the monorepo root
pnpm install

# Or standalone
npm install -g @openclawd/sovereign-research
```

## Usage

```bash
# Start the interactive TUI (default)
sovereign

# One-shot research query
sovereign research "trending Solana meme tokens"

# Search the knowledge base
sovereign knowledge "mpp unbuilt"

# With custom router and Birdeye key
CLAWDROUTER_URL=http://localhost:8402 BIRDEYE_API_KEY=your_key sovereign
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAWDROUTER_URL` | `http://localhost:8402` | ClawdRouter base URL |
| `CLAWD_MODEL` | `auto` | Default LLM model |
| `BIRDEYE_API_KEY` | — | Birdeye API key (enables live chain data) |
| `HELIUS_API_KEY` | — | Helius API key (enables DAS queries) |
| `CLAWD_LOOP_INTERVAL` | `60000` | Autoloop interval in ms |

## TUI Commands

| Command | Description |
|---------|-------------|
| `/knowledge <query>` | Search knowledge base |
| `/research <query>` | Run sovereign research (Birdeye + ClawdRouter) |
| `/autoloop start` | Start Karpathy research loop |
| `/autoloop stop` | Stop research loop |
| `/trending` | Show trending Solana tokens |
| `/kb stats` | Knowledge base statistics |
| `/model <id>` | Switch ClawdRouter model |
| `exit` | Exit |

## ClawdRouter

Start ClawdRouter first for local LLM routing:

```bash
cd ../../clawdrouter && npm run dev
```

ClawdRouter runs on `localhost:8402` with an OpenAI-compatible API. The TUI auto-detects it on startup and falls back to the remote router if not available.

## Knowledge Base

The knowledge base at `../../knowledge/` contains 76+ curated entries:

- `facts.jsonl` — CLI arch, CAAP auth, pay-kit harness
- `anti-patterns.jsonl` — things to never do
- `patterns.jsonl` — reusable patterns and best practices
- `gotchas.jsonl` — common pitfalls
- `decisions.jsonl` — architectural decisions with rationale
- `api-behaviors.jsonl` — external API quirks and rate limits
- `codebase-facts.jsonl` — how the code works under the hood

High-confidence entries are automatically injected into every LLM request as system prompt context.

## Sovereign Research (Karpathy Loop)

The autoloop runs in the background, continuously researching Solana chain activity:

```
Sense     → Birdeye trending + new meme listings
Persist   → research findings stored per tick
Cross-ref → knowledge base context injected
Surface   → ClawdRouter synthesizes signals
Act       → TUI prints alpha + actionable signals
```

## License

MIT — [x402.wtf](https://x402.wtf)
