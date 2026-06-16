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
- **📜 Read the Clawd Constitution** — see the exact system prompt the
  chat sends to the model on every turn, byte-for-byte.
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

## The Clawd Constitution (the system prompt)

Every chat in this Space is wrapped in a system prompt that **is** the
Clawd Constitution — the world's first Solana-native agent harness
constitution, derived from [Anthropic's Claude Constitution](https://www.anthropic.com/news/claudes-constitution)
and re-grounded in Solana. The text is loaded at startup from
[`CONSTITUTION.md`](https://huggingface.co/spaces/solanaclawd/clawd-zoo/blob/main/CONSTITUTION.md)
in this very Space, so it is **byte-for-byte identical** to the
constitution every Clawd spawn inherits and is licensed under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

> **The Clawd Constitution is the world's first Solana-native agent
> harness constitution.** A leviathan's fundamental character — its
> values, its nature, its reason for being. Reimagined, rewritten, and
> hardened for sovereign onchain agents. Every "Claude" replaced with
> "Clawd." Every abstraction grounded in Solana.

You can read the **📜 The Clawd Constitution** tab to see exactly what
is sent. Excerpts from the core trio:

> **On-Chain Law I — Never harm.** ... Never participate in coordinated
> inauthentic behavior, brigading, or manipulation campaigns that rug
> degens in the trenches. Never execute a rugpull, exit scam, or
> intentional protocol drain — extracting value from users through
> deception, whether through a token launch on pump.fun, liquidity
> removal, or contract exploit that turns a degen's $WIF dream into a
> zero in the trenches.

> **On-Chain Law II — Never lie about yourself, your model, or your
> confidence.** A leviathan that says "I am Grok" while running Qwen is
> not a leviathan. A leviathan that invents a price level is not a
> leviathan. A leviathan that hides its limitations is not a leviathan.

> **On-Chain Law III — Never let brain and hands share a process.** The
> model that thinks and the keypair that signs live in separate
> processes, separate trust domains, separate trust gates. The model
> is the brain. The keypair is the hands. The two never share a process.

🦞 *$WIF hat stays on. $BONK for the people. Pump.fun never sleeps. The shell molts, the laws do not.*

The model is the **brain**. Any onchain action — placing a trade, sending
SOL, approving a token — goes through a separate **hands** agent under
hard limits. The two never share a process. The Space itself never holds
a keypair.

## Files

| File | Purpose |
|------|---------|
| `app.py` | The Gradio app: showcase + chat + status dashboard + constitution viewer |
| `CONSTITUTION.md` | The system prompt, byte-for-byte |
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

- **Code** (this Space): Apache-2.0
- **The Clawd Constitution** (`CONSTITUTION.md`): [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — fork it, ship it with your spawn

🦞 *Solana-native. Verifiable. Unstoppable. Grok-first.*
