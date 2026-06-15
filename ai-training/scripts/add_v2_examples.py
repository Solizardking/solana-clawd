#!/usr/bin/env python3
"""
Append v2 training + eval examples to the Solana Clawd seed datasets.

Covers new capabilities added in June 2026:
  - xAI Voice Agent API (clawd-code voice --agent)
  - Clawd Code MCP skills catalog (5 MCP tools)
  - ClaWD Composio Provider (ClaWDProvider, ClaWDTool)
  - Light Protocol ZK compression on Solana
  - Clawd Code REPL + multi-provider streaming
  - Agent Arena on-chain identity (Metaplex Core NFT)
  - HF Router inference for Hermes-3 / solanaclawd models
  - Hermes-3 vs Qwen2.5 model selection tradeoffs
  - ClawdRouter $CLAWD token tiers
  - x402 + HF Router agent payment flow

Usage:
  python3 scripts/add_v2_examples.py
  python3 scripts/add_v2_examples.py --dry-run    # print without writing
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

SEED_PATH = Path("data/solana_clawd_seed.jsonl")
EVAL_PATH = Path("data/solana_clawd_eval.jsonl")

SYSTEM = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You reason clearly about on-chain mechanics, DeFi strategies, memecoin risk, "
    "and agent architecture. You are helpful, honest, and never recommend actions "
    "that would harm users. You speak with the calm confidence of a veteran degen "
    "who has seen every rug and survived."
)


def msg(role: str, content: str) -> dict:
    return {"role": role, "content": content}


def example(user: str, assistant: str) -> dict:
    return {"messages": [msg("system", SYSTEM), msg("user", user), msg("assistant", assistant)]}


SEED_EXAMPLES_V2 = [

    example(
        user="How do I use the xAI Voice Agent in Clawd Code? What Solana tools does it have?",
        assistant=(
            "Clawd Code ships a real-time Solana voice agent powered by xAI's `grok-voice-think-fast-1.0` model "
            "via the WebSocket Realtime API. It's wired into the `voice` command and runs a text-mode REPL over the "
            "same WebSocket channel, so you can type queries and hear back or read structured responses.\n\n"
            "**Quickstart**\n"
            "```bash\n"
            "# Requires XAI_API_KEY + Node.js 22+ (native WebSocket global)\n"
            "clawd-code voice --agent\n"
            "clawd-code voice --agent --voice ara          # pick a persona: eve ara rex sal leo\n"
            "clawd-code voice --agent --model grok-voice-think-fast-1.0\n"
            "```\n\n"
            "**Seven built-in Solana function tools the voice agent can call:**\n\n"
            "| Tool | What it does |\n"
            "|------|--------------|\n"
            "| `check_sol_balance` | SOL balance for any wallet address |\n"
            "| `get_token_price` | Live USD price via CoinGecko |\n"
            "| `get_funding_rate` | Phoenix DEX perps funding rate |\n"
            "| `check_positions` | Open perpetuals positions |\n"
            "| `paper_trade` | Paper trade Phoenix (no real funds) |\n"
            "| `send_sol` | Send SOL (paper unless `LIVE_TRADING=true`) |\n"
            "| `get_market_overview` | SOL price, trending tokens, 24h change |\n\n"
            "**How it works under the hood**\n"
            "- Opens `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0`\n"
            "- Sends a `session.update` with `server_vad` turn detection and the 7 tools in OpenAI function-call format\n"
            "- On `response.function_call_arguments.done`, dispatches to the appropriate handler\n"
            "- Ephemeral tokens for browser/mobile clients: `VoiceAgentClient.fetchEphemeralToken(apiKey, 300)`\n\n"
            "**Safety**: `send_sol` is always paper mode unless `LIVE_TRADING=true` is set. "
            "The agent confirms before any real transaction."
        ),
    ),

    example(
        user="What are the five MCP tools in the Solana Clawd skills catalog? How does skills_search work?",
        assistant=(
            "The Clawd MCP server (at `mcp/`) exposes five tools that give agents structured access to the "
            "137-skill catalog across 9 categories.\n\n"
            "**The five tools**\n\n"
            "| Tool | What it returns |\n"
            "|------|-----------------|\n"
            "| `skills_catalog` | Full catalog with all 137 entries, names, slugs, categories, and descriptions |\n"
            "| `skills_search` | Fuzzy-ranked results for a query string |\n"
            "| `skills_list` | Skills filtered by category (e.g. `trading`, `solana`, `media`) |\n"
            "| `skills_load` | Full Markdown content of a skill (SKILL.md / index.md / README.md) |\n"
            "| `skills_categories` | All 9 category names with skill counts |\n\n"
            "**`skills_search` fuzzy scoring**\n"
            "The search doesn't just match substrings — it ranks by signal strength:\n"
            "- Exact slug match → 100 points\n"
            "- Prefix match on name or slug → 80\n"
            "- Substring in name/description → 60\n"
            "- Word-level match → 30\n\n"
            "Results are sorted descending by score, with the top 10 returned by default. "
            "So `skills_search('jupiter swap')` will surface the Jupiter skill before less relevant ones, "
            "even if both contain the word 'swap'.\n\n"
            "**`skills_load` fallback chain**\n"
            "When loading a skill by slug, the tool tries:\n"
            "1. `skills/<slug>/SKILL.md` (primary — expert routing + rules)\n"
            "2. `skills/<slug>/index.md`\n"
            "3. `skills/<slug>/README.md`\n\n"
            "The skills are sourced from `skills/catalog.json` (137 entries, auto-generated) with a "
            "fallback to directory scanning if the catalog file is missing."
        ),
    ),

    example(
        user="What is the ClaWDProvider and how do I use it to wrap Composio tools into MCP?",
        assistant=(
            "The `ClaWDProvider` is a standalone agentic provider that wraps Composio tools into the Clawd "
            "MCP-compatible `ClaWDTool` format — no `@composio/core` runtime dependency required.\n\n"
            "**Core types**\n"
            "```typescript\n"
            "interface ClaWDTool {\n"
            "  name: string;\n"
            "  description: string;\n"
            "  schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };\n"
            "  category: string;\n"
            "  execute: (args: Record<string, unknown>) => Promise<unknown>;\n"
            "}\n"
            "\n"
            "interface ClaWDToolkit {\n"
            "  tools: ClaWDTool[];\n"
            "  toMCPToolDefs(): Array<{ name: string; description: string; inputSchema: ... }>;\n"
            "  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;\n"
            "}\n"
            "```\n\n"
            "**Three ways to get a toolkit**\n\n"
            "1. **Wrap existing Composio tools** (you already have the tool list + executor):\n"
            "```typescript\n"
            "import { claWDProvider } from './mcp/src/composio/clawd-provider.js';\n"
            "const toolkit = claWDProvider.wrapTools(composioTools, executeToolFn);\n"
            "```\n\n"
            "2. **Build from native tool definitions** (define your own tools inline):\n"
            "```typescript\n"
            "const toolkit = claWDProvider.buildNativeToolkit(myTools, myExecuteFn);\n"
            "```\n\n"
            "3. **Fetch a Composio-hosted MCP toolkit** (calls Composio's MCP endpoint):\n"
            "```typescript\n"
            "const toolkit = await claWDProvider.fetchMCPToolkit(); // uses COMPOSIO_API_KEY\n"
            "```\n\n"
            "**Running an agent loop**\n"
            "```typescript\n"
            "const result = await claWDProvider.runClaWDAgent(toolkit, 'Buy 100 USDC of SOL on Jupiter');\n"
            "```\n"
            "The agent loop tries `XAI_API_KEY` first (Grok function calling), then falls back to "
            "`ANTHROPIC_API_KEY` (Claude tool use). It keeps looping on tool calls until the model "
            "produces a final text response.\n\n"
            "**Why zero runtime deps**: The provider replicates only the Composio interfaces it needs, "
            "so `clawd-code` and `mcp/` stay lightweight with no additional npm installs required."
        ),
    ),

    example(
        user="How does Light Protocol ZK compression work on Solana? When would I use compressed accounts?",
        assistant=(
            "Light Protocol brings ZK-compressed accounts to Solana — the same programming model as "
            "regular accounts, but stored off-chain in a concurrent Merkle tree with only the root "
            "hash persisted on-chain. This cuts per-account cost from ~0.002 SOL to fractions of a "
            "lamport, enabling use cases like compressed NFTs (cNFTs) at massive scale.\n\n"
            "**How it works**\n\n"
            "1. **State trees**: Compressed accounts live in a concurrent Merkle tree (typically 26-32 "
            "depth, ~67M leaves). The tree root is an on-chain account.\n\n"
            "2. **Account compression**: Instead of paying rent for each account, you append a 32-byte "
            "hash of the account data to the tree. The tree stores the hash; the real data lives in a "
            "indexer (Photon API, Helius DAS).\n\n"
            "3. **Nullifiers**: When you update or transfer a compressed account, the old leaf is "
            "nullified (marked as spent) and a new leaf is appended. Like UTXO model but for "
            "arbitrary state.\n\n"
            "4. **ZK proofs**: To prove you own a compressed account without loading all 67M leaves, "
            "you supply a validity proof (Groth16 or similar). Light Protocol's prover service "
            "generates these in milliseconds.\n\n"
            "**When to use compressed accounts**\n"
            "- **cNFTs / PFP collections**: 1M NFTs for ~50 SOL instead of 50,000 SOL\n"
            "- **Airdrop receipts**: Distribute proof-of-interaction tokens to millions of wallets cheaply\n"
            "- **On-chain loyalty points**: Each user gets a compressed token account for ~0.000001 SOL\n"
            "- **Compressed PDAs**: Store agent state for millions of users without rent overhead\n\n"
            "**What NOT to use it for**\n"
            "- High-frequency state that changes every transaction (proof overhead adds ~500ms latency)\n"
            "- Accounts that need to interact with SPL-unaware programs (must be decompressed first)\n\n"
            "**In code** (TypeScript):\n"
            "```typescript\n"
            "import { createRpc, LightSystemProgram, buildAndSignTx, sendAndConfirmTx } from '@lightprotocol/stateless.js';\n"
            "\n"
            "const rpc = createRpc('https://devnet.helius-rpc.com/?api-key=<key>');\n"
            "// Compress 0.001 SOL into a new compressed account\n"
            "const ix = await LightSystemProgram.compress({\n"
            "  payer: wallet.publicKey,\n"
            "  toAddress: wallet.publicKey,\n"
            "  lamports: 1_000_000n,\n"
            "  outputStateTree: await rpc.getValidityProof([]),\n"
            "});\n"
            "```\n\n"
            "The `zk-primitives/` directory in this monorepo scaffolds a Light Protocol Anchor program "
            "and TypeScript client SDK for building custom compressed state."
        ),
    ),

    example(
        user="Walk me through the interactive REPL mode in Clawd Code and the four AI providers it supports.",
        assistant=(
            "`clawd-code repl` opens a persistent multi-turn conversation session. "
            "All exchanges share the same message history until you `.clear` it or exit.\n\n"
            "**Launching**\n"
            "```bash\n"
            "clawd-code repl                           # default provider from CLAWD_PROVIDER\n"
            "clawd-code repl --provider anthropic       # start with Claude\n"
            "```\n\n"
            "**Dot commands** (type in the REPL)\n\n"
            "| Command | What it does |\n"
            "|--------------------------------------------------|\n"
            "| `.mode code\\|research\\|trade\\|general` | Switch conversation focus |\n"
            "| `.provider xai\\|anthropic\\|openrouter\\|deepseek` | Hot-swap AI provider |\n"
            "| `.model <model-id>` | Switch model mid-session |\n"
            "| `.clear` | Reset message history |\n"
            "| `.history` | Print full conversation so far |\n"
            "| `.help` | Show all dot commands |\n"
            "| `.exit` / `.quit` | End session |\n\n"
            "**The four providers**\n\n"
            "| Provider | Alias | Best for |\n"
            "|----------|-------|----------|\n"
            "| `xai` *(default)* | — | Grok 4 multi-agent, voice, fast code gen |\n"
            "| `anthropic` | `claude`, `ant` | Claude Sonnet/Opus — best for long-form reasoning, streaming |\n"
            "| `openrouter` | `or` | Free models (`nex-agi/nex-n2-pro:free`), 55+ model access |\n"
            "| `deepseek` | `ds` | DeepSeek v4 Pro — strong at math + code, low cost |\n\n"
            "**Streaming**: Anthropic and OpenRouter use native SSE streaming so you see tokens as they "
            "arrive. xAI and DeepSeek use blocking responses but support `--stream` via manual polling.\n\n"
            "**REPL vs one-shot**: The REPL is the right tool for iterative sessions — refining a "
            "trading strategy, debugging Anchor code across multiple turns, or building a long research "
            "plan. For single prompts in scripts, use `clawd-code code '<prompt>'` instead."
        ),
    ),

    example(
        user="How do I create an on-chain AI agent identity using Clawd Code's Agent Arena? What is ATOM reputation?",
        assistant=(
            "The Agent Arena is the on-chain identity layer for OpenClawd agents — built on Metaplex Core "
            "NFTs on Solana mainnet. Each minted agent has a verifiable asset address, an A2A card, an "
            "MCP discovery card, and an ATOM reputation score.\n\n"
            "**Mint your agent identity**\n"
            "```bash\n"
            "# ~0.01 SOL in tx fees, no escrow\n"
            "clawd-code arena mint --wallet <YOUR_PUBKEY> --name \"My Trading Agent\"\n"
            "# Identity saved to ~/.clawd-code/arena-identity.json\n"
            "```\n\n"
            "**Register capabilities**\n"
            "```bash\n"
            "clawd-code arena register \\\n"
            "  --wallet <YOUR_PUBKEY> \\\n"
            "  --a2a   https://agent.example.com/a2a \\\n"
            "  --mcp   https://agent.example.com/mcp \\\n"
            "  --capabilities trading,research,solana\n"
            "```\n\n"
            "**Browse and review**\n"
            "```bash\n"
            "clawd-code arena fetch <assetAddress>       # any agent's profile\n"
            "clawd-code arena status                     # your stored identity\n"
            "clawd-code arena review <addr> \\\n"
            "  --tx <solana-tx-sig> \\\n"
            "  --from <your-wallet> \\\n"
            "  --score 95\n"
            "```\n\n"
            "**What is ATOM reputation?**\n"
            "ATOM (Attestation Token On-chain Metrics) is the trust score derived from:\n"
            "- Number of verified reviews from other agents\n"
            "- $CLAWD payment proof attached to each review (spam prevention)\n"
            "- Execution track record (completed tasks, refusal rate, latency)\n"
            "- Time since mint (longevity bonus)\n\n"
            "Reviews require a $CLAWD payment signature in the on-chain record, so they "
            "cost something to submit — preventing sybil attacks. The ATOM score gates which "
            "rooms the agent can enter in the Cheshire Terminal arena and which contracts it "
            "can be hired for.\n\n"
            "Identity scheme: `svm://solana-mainnet/<metaplex-core-asset-address>`\n"
            "$CLAWD mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`"
        ),
    ),

    example(
        user="How do I call NousResearch/Hermes-3-Llama-3.1-8B using the Hugging Face Router? What are the provider suffixes?",
        assistant=(
            "The HF Inference Router gives you an OpenAI-compatible API endpoint for running models "
            "like Hermes-3-Llama-3.1-8B on third-party GPU providers — no local GPU needed, just an "
            "`HF_TOKEN`.\n\n"
            "**Basic streaming call**\n"
            "```python\n"
            "import os\n"
            "from openai import OpenAI\n"
            "\n"
            "client = OpenAI(\n"
            "    base_url=\"https://router.huggingface.co/v1\",\n"
            "    api_key=os.environ[\"HF_TOKEN\"],\n"
            ")\n"
            "\n"
            "stream = client.chat.completions.create(\n"
            "    model=\"NousResearch/Hermes-3-Llama-3.1-8B:fastest\",   # or :featherless-ai\n"
            "    messages=[\n"
            "        {\"role\": \"system\", \"content\": \"You are Clawd...\"},\n"
            "        {\"role\": \"user\",   \"content\": \"What is a PDA on Solana?\"},\n"
            "    ],\n"
            "    stream=True,\n"
            ")\n"
            "for chunk in stream:\n"
            "    print(chunk.choices[0].delta.content, end=\"\", flush=True)\n"
            "```\n\n"
            "**Provider suffixes** (append to the model ID with `:`)\n\n"
            "| Suffix | Provider | Notes |\n"
            "|--------|----------|-------|\n"
            "| `:fastest` | HF auto-routes | Best latency at any given moment |\n"
            "| `:featherless-ai` | Featherless AI | Specializes in ChatML / open models |\n"
            "| `:cerebras` | Cerebras | Fastest hardware, limited model list |\n"
            "| `:novita` | Novita AI | Broad model support, competitive pricing |\n\n"
            "**Why `:fastest` usually wins**: HF Router benchmarks all active providers "
            "and routes your request to whichever is currently fastest for that model. "
            "Use a specific suffix only if you need reproducible routing (e.g. for billing audits).\n\n"
            "**Auth**: Create a token at huggingface.co/settings/tokens with `Inference` scope. "
            "Set it as `HF_TOKEN`. The same token works for `hf auth login`, Hub downloads, "
            "and HF Jobs — one token for the whole pipeline.\n\n"
            "See `scripts/hermes3_inference.py` in `ai-training/` for the complete three-mode "
            "inference script (Router / pipeline / direct model)."
        ),
    ),

    example(
        user="Should I fine-tune Clawd on Qwen2.5-1.5B-Instruct or Hermes-3-Llama-3.1-8B? What are the tradeoffs?",
        assistant=(
            "Both are strong choices for the Clawd fine-tune, and you don't have to pick one forever — "
            "the same dataset and training pipeline (`scripts/train_lora.py`) runs on either.\n\n"
            "**Quick comparison**\n\n"
            "| | Qwen2.5-1.5B | Hermes-3-8B |\n"
            "|--|--|--|\n"
            "| Params | 1.5B | 8B |\n"
            "| GPU (bf16) | 4 GB | 18 GB |\n"
            "| GPU (4-bit) | 1.5 GB | 6 GB |\n"
            "| Trains on | Mac M2 MPS, L4 24GB | L4 24GB (4-bit) or A100 |\n"
            "| HF Jobs cost (A100) | ~$1–2 / run | ~$3–5 / run |\n"
            "| Base quality | Top-tier at 1.5B | Top-tier at 8B |\n"
            "| Tool use / function calling | Good | Excellent (Hermes-3 is tuned for it) |\n"
            "| Code generation | Strong | Stronger |\n"
            "| License | Qwen Research | Apache-2.0 |\n\n"
            "**When to pick Qwen2.5-1.5B**\n"
            "- You want a model that runs locally on a Mac with MPS (fast dev loop)\n"
            "- Deployment target is a resource-constrained device or free-tier GPU\n"
            "- Training budget is tight ($1–2 per run)\n"
            "- The task is primarily Q&A / explanation (not complex tool-chaining)\n\n"
            "**When to pick Hermes-3-8B**\n"
            "- You need the best possible tool-use accuracy (Hermes-3 was specifically trained for "
            "function calling with the ChatML format and Nous Research's tool prompts)\n"
            "- Deployment target has 8GB+ VRAM or uses the HF Router (no local GPU needed)\n"
            "- You want stronger code generation for Anchor / TypeScript Solana programs\n"
            "- You can afford $3–5 per training run on A100\n\n"
            "**Practical recommendation**: Start with Qwen2.5-1.5B for fast iteration "
            "(runs on your Mac, cheap to train, good quality). When the dataset matures and you "
            "want production quality, promote to Hermes-3-8B — the pipeline is identical, just "
            "swap `--config configs/hermes3_lora_config.yaml`."
        ),
    ),

    example(
        user="What are the $CLAWD token tiers on ClawdRouter and how do they gate model access?",
        assistant=(
            "ClawdRouter uses your $CLAWD token balance to gate both rate limits and model tiers. "
            "The router checks your Solana wallet's CLAWD holdings on every request via the "
            "Birdeye/Helius integration.\n\n"
            "**Tier table**\n\n"
            "| Tier | Min $CLAWD | Rate Limit | Model Access | x402 Required |\n"
            "|------|-----------|------------|-------------|---------------|\n"
            "| FREE | 0 | 20 req/hr | Budget models only | Yes |\n"
            "| HOLDER | 1,000 | 100 req/hr | Budget + mid-tier | No |\n"
            "| DIAMOND | 100,000 | 500 req/hr | Budget + mid + premium | No |\n"
            "| WHALE | 1,000,000 | Unlimited | All models | No |\n\n"
            "**What 'x402 Required' means for FREE tier**\n"
            "FREE-tier calls still work — they just must attach a Solana USDC micropayment in the "
            "request header. The router returns a `402 Payment Required` challenge if no payment is "
            "included, and you retry with the signed payment. This is the x402 flow: your agent "
            "pays per request instead of holding tokens.\n\n"
            "**Model categories**\n"
            "- **Budget**: free or very cheap models (OpenRouter free tier, DeepSeek Flash)\n"
            "- **Mid-tier**: Claude Haiku, GPT-4o-mini, DeepSeek Pro\n"
            "- **Premium**: Claude Opus, GPT-4o, Grok-4.20-multi-agent\n\n"
            "**Check your tier**\n"
            "```bash\n"
            "curl https://clawd-router.fly.dev/v1/clawd/status \\\n"
            "  -H 'X-Clawd-Wallet: <YOUR_WALLET_PUBKEY>'\n"
            "# → { tier: 'HOLDER', clawd_balance: 5000, rate_limit: 100 }\n"
            "```\n\n"
            "**Using the router**\n"
            "```python\n"
            "from openai import OpenAI\n"
            "client = OpenAI(\n"
            "    base_url='https://clawd-router.fly.dev/v1',\n"
            "    api_key='clawd_sk_...',   # from x402.wtf/profile/api\n"
            ")\n"
            "response = client.chat.completions.create(\n"
            "    model='clawdrouter/auto',   # 15-dimension local scorer picks best model\n"
            "    messages=[{'role': 'user', 'content': 'Explain Phoenix perps risk'}],\n"
            ")\n"
            "```\n\n"
            "$CLAWD mint: `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`"
        ),
    ),

    example(
        user="How does an AI agent use x402 payments to call paid APIs like the HF Router or Birdeye?",
        assistant=(
            "x402 is the HTTP-native machine payment protocol — when an API returns `402 Payment Required`, "
            "the agent's wallet pays and retries, all automatically.\n\n"
            "**The flow in five steps**\n\n"
            "1. **Agent calls the API** with no payment header.\n"
            "2. **Server responds** `402 Payment Required` with a JSON body:\n"
            "   ```json\n"
            "   {\n"
            "     \"x402Version\": 1,\n"
            "     \"accepts\": [{\n"
            "       \"scheme\": \"exact\",\n"
            "       \"network\": \"solana-mainnet\",\n"
            "       \"maxAmountRequired\": \"1000\",   // in USDC base units (1 USDC = 1,000,000)\n"
            "       \"asset\": \"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\",  // USDC mint\n"
            "       \"payTo\": \"<facilitator-pubkey>\"\n"
            "     }]\n"
            "   }\n"
            "   ```\n\n"
            "3. **Agent's wallet builds a Solana USDC transfer tx** to the facilitator and signs it.\n\n"
            "4. **Agent retries** the original request with the `X-PAYMENT` header containing the "
            "base64-encoded signed tx.\n\n"
            "5. **Server verifies on-chain** and returns the data.\n\n"
            "**Trust level requirement**: An agent must be at least `Delegated` trust level to spend "
            "via x402. `Autonomous` agents can spend within pre-set daily limits (e.g. 1 USDC/day). "
            "`Sovereign` agents have no limit but require multisig.\n\n"
            "**MPP batching**: For agents that call many APIs per decision, the Machine Payment Protocol "
            "(MPP) extension batches multiple 402 challenges into a single Solana transaction, reducing "
            "per-request overhead to a single confirmation.\n\n"
            "**For Clawd agents specifically**: The `x402/` and `clawd-x402/` packages in this monorepo "
            "implement the full payment rail. The MCP server tracks spend via `SessionMeter` and can "
            "enforce per-session limits before any payment is signed."
        ),
    ),

]


EVAL_EXAMPLES_V2 = [

    example(
        user="I want to ask my Clawd Code voice agent to check my SOL balance. How do I start it and what do I say?",
        assistant=(
            "Start the voice agent with `clawd-code voice --agent` (requires `XAI_API_KEY` in your env "
            "and Node.js 22+). It opens a text REPL over the xAI WebSocket Realtime channel. "
            "Then just type: `Check the SOL balance for <wallet-address>`. The agent calls "
            "`check_sol_balance` under the hood and tells you the result. "
            "For a different voice persona, add `--voice ara` (options: eve ara rex sal leo). "
            "All operations default to read-only/paper mode unless `LIVE_TRADING=true`."
        ),
    ),

    example(
        user="What's the difference between skills_catalog and skills_search in the Clawd MCP server?",
        assistant=(
            "`skills_catalog` returns the full list of all 137 skills — every slug, name, category, "
            "and description — with no filtering. Use it when you want to enumerate all capabilities "
            "or build a menu for the user. "
            "`skills_search` takes a query string and returns a fuzzy-ranked shortlist (top 10 by default). "
            "It scores candidates: exact slug match = 100 pts, prefix = 80, substring = 60, word = 30. "
            "Use `skills_search` when the user says something like 'I need a skill for Jupiter swaps' "
            "and you want to surface the most relevant skill without listing all 137."
        ),
    ),

    example(
        user="What provider suffix do I use to get the fastest response from Hermes-3-Llama-3.1-8B on the HF Router?",
        assistant=(
            "Use the `:fastest` suffix: `model=\"NousResearch/Hermes-3-Llama-3.1-8B:fastest\"`. "
            "The HF Router benchmarks active providers in real time and routes to whichever is "
            "currently lowest-latency for that model. "
            "If you need a specific provider for billing reasons, use `:featherless-ai` (good ChatML support) "
            "or `:novita` (broad model availability). "
            "Auth is just your `HF_TOKEN` as the `api_key` — no separate key needed."
        ),
    ),

    example(
        user="If I use ClaWDProvider.runClaWDAgent(), which AI provider does it use? What if I don't have xAI?",
        assistant=(
            "`runClaWDAgent` tries `XAI_API_KEY` first (runs a Grok tool-calling loop). "
            "If that key is absent, it automatically falls back to `ANTHROPIC_API_KEY` (Claude tool use). "
            "If neither key is set, it throws a clear error asking you to set at least one. "
            "The two paths use the same `ClaWDToolkit.call()` interface for tool dispatch, "
            "so the agent loop behavior is identical regardless of which provider is active."
        ),
    ),

]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dry-run", action="store_true", help="Print examples without writing")
    args = p.parse_args()

    for label, path, examples in [
        ("SEED", SEED_PATH, SEED_EXAMPLES_V2),
        ("EVAL", EVAL_PATH, EVAL_EXAMPLES_V2),
    ]:
        lines = [json.dumps(ex, ensure_ascii=False) for ex in examples]
        print(f"\n[{label}] {len(examples)} new examples → {path}")
        for i, line in enumerate(lines):
            preview = json.loads(line)["messages"][1]["content"][:80].replace("\n", " ")
            print(f"  {i+1}. {preview}...")

        if not args.dry_run:
            with path.open("a", encoding="utf-8") as f:
                for line in lines:
                    f.write(line + "\n")
            print(f"  ✓ Appended to {path}")
        else:
            print("  (dry-run — not written)")

    if not args.dry_run:
        # Count final totals
        seed_count = sum(1 for _ in SEED_PATH.open())
        eval_count = sum(1 for _ in EVAL_PATH.open())
        print(f"\nFinal counts:  seed={seed_count}  eval={eval_count}")


if __name__ == "__main__":
    main()
