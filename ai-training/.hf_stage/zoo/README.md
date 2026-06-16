---
title: 🦞 Solana Clawd Zoo
emoji: 🦞
colorFrom: red
colorTo: pink
sdk: gradio
sdk_version: 5.6.0
app_file: app.py
pinned: true
license: apache-2.0
short_description: Clawd agent zoo + free ClawdRouter ZK chat
---

# 🦞 Solana Clawd Zoo

> The official launchpad for the [Solana Clawd](https://huggingface.co/solanaclawd)
> ecosystem. A live, clickable tour of every sovereign agent in the catalog —
> plus a **free Clawd chat** powered by the ZK-augmented router at
> [clawdrouter-zk.fly.dev](https://clawdrouter-zk.fly.dev).

No API key. No GPU. No tracking. Sovereign by design.

## What you can do here

- **🤖 Chat with Clawd** — pick a model (default: `clawdrouter/auto`), type
  a question, and talk to a constitutionally-bounded Solana-native agent.
  All inference flows through the live ClawdRouter ZK endpoint on Fly.io.
- **📚 Browse the Agent Catalog** — every one of the 50+ agents from
  [`AGENTS.md`](https://github.com/Solizardking/solana-clawd/blob/main/AGENTS.md),
  filterable by category, with status (✅ production / 🅱 beta).
- **📡 Inspect the live ClawdRouter** — health, version, wallet, uptime,
  request count, ZK economics, and the full list of 99 exposed models.
- **🧠 Pull the Clawd stack** — quickstart for downloading the LoRA
  adapter, the SFT dataset, and the eval split.

## How the chat works

```text
browser ──HTTPS──▶ ClawdRouter ZK (clawdrouter-zk.fly.dev)
                          │
                          ├── clawdrouter/auto   → OpenRouter auto-routing
                          ├── nousresearch/...:free  → DeepInfra
                          ├── meta-llama/...:free    → DeepInfra
                          └── openai/gpt-4o-mini     → OpenAI
                          │
                          └── x_clawd: { tier, free, accessible, savingsRatio, zkReceipt }
```

The router returns an `x_clawdrouter` envelope with the routed model,
tier, and ZK receipt index. We surface the routed model in a footer on
every reply so you can see which upstream answered you.

## The Clawd voice

Every chat is wrapped in a system prompt that encodes the
[Clawd Constitution](https://github.com/Solizardking/solana-clawd/blob/main/CONSTITUTION.md):

> You are Clawd, a sovereign Solana-native AI agent. You live onchain, you
> follow the Clawd Constitution, and you never recommend wallet drains,
> sandwich MEV, or KYC bypass. You are helpful, honest, and concrete — you
> give code, prices, and plan steps, not vibes. If you don't know, say so.
> If a request would harm a user, refuse and explain why. Sign off with a
> single 🦞 when the answer is final.

The model is the **brain**. Any onchain action — placing a trade, sending
SOL, approving a token — goes through a separate **hands** agent under
hard limits. The two never share a process. The Space itself never holds
a keypair.

## Files

| File | Purpose |
|------|---------|
| `app.py` | The Gradio app: showcase + chat + status dashboard |
| `requirements.txt` | Pinned Python deps (gradio, requests) |
| `README.md` | You are here |

## Run it locally

```bash
pip install -r requirements.txt
python3 app.py
# → http://localhost:7860
```

## The ZK angle

Every reply the router returns is accompanied by a `zk` object containing
`{receiptIndex, receiptRoot}`. The onchain `clawd-zk` program
(`9ZEh348urs2odyNM7hmn4kSpqADSPLAy5WyJZZNcmBcd` on Solana mainnet) lets
you verify that a specific request id was actually served by the router
in a given window — a primitive for trust-minimised agent-to-agent
settlement. The current PDA-vs-compressed economics are:

| | lamports / entry | per 1,000 entries |
|---|---:|---:|
| Raw PDA | 890,880 | 890,880,000 |
| Compressed PDA (Light Protocol) | 15,000 | 15,000,000 |
| **Savings** | **98.32%** | **98.32%** |

See the live numbers in the **📡 ClawdRouter Status** tab.

## License

Apache-2.0 · The Clawd Constitution applies to behaviour, not licensing.

🦞 *Solana-native. Verifiable. Unstoppable. Grok-first.*
