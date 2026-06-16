---
title: 🪐 SolGPT
emoji: 🪐
colorFrom: purple
colorTo: green
sdk: gradio
sdk_version: 5.6.0
app_file: app.py
pinned: true
license: apache-2.0
short_description: Free Solana-native AI chat, powered directly by OpenRouter
---

# 🪐 SolGPT

> A free, Solana-native AI chat. No API key, no sign-up, no wallet. The
> Space holds a server-side `OPENROUTER_API_KEY` and defaults to
> OpenRouter's free model tier, so every visitor's chat costs them
> nothing.

Inspired by [`ordlibrary/solgpt`](https://huggingface.co/spaces/ordlibrary/solgpt),
rebuilt on the [Solana Clawd](https://github.com/Solizardking/solana-clawd)
stack with direct OpenRouter integration (no proxy hop).

## What you can do here

- **💬 Chat with SolGPT** — ask anything about building, trading, or
  staying safe on Solana: Anchor/Pinocchio programs, PDAs, SPL
  Token/Token-2022, Phoenix/Drift perps, Jupiter routing, pump.fun
  bonding curves, RPC providers, wallet security, rug detection.
- **📡 Check status** — confirms the Space can reach OpenRouter, shows
  the masked key, free-tier flag, and current usage/limit.

## How it works

```text
browser ──HTTPS──▶ this Space (Gradio) ──HTTPS──▶ openrouter.ai/api/v1/chat/completions
                                                          │ Authorization: Bearer <OPENROUTER_API_KEY>
                                                          ▼
                                          nex-agi/nex-n2-pro:free  (default, $0/chat)
                                          nvidia/nemotron-3-ultra-550b-a55b:free
                                          nousresearch/hermes-3-llama-3.1-405b:free
                                          meta-llama/llama-3.3-70b-instruct:free
                                          openai/gpt-4o-mini            (opt-in, paid)
                                          anthropic/claude-3.5-sonnet   (opt-in, paid)
```

If the requested free model 400s or returns no choices (a model was
deprecated upstream), the app walks the free-tier fallback chain so the
user never sees a raw error. Paid models are never silently substituted.

## Required Space secret

Set this under **Space → Settings → Variables and secrets**:

| Name | Value |
|------|-------|
| `OPENROUTER_API_KEY` | Get a free key (no credit card) at [openrouter.ai/keys](https://openrouter.ai/keys) |

The same key is already provisioned for this monorepo's `clawdrouter`,
`clawd-code`, and `clawd-pump` services — copy it from whichever local
`.env` you already trust, or mint a fresh one for this Space alone.

Optional:

| Name | Default | Purpose |
|------|---------|---------|
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Override for a self-hosted OpenRouter-compatible gateway |
| `SOLGPT_APP_URL` | this repo's URL | Sent as `HTTP-Referer` for OpenRouter attribution |

## Files

| File | Purpose |
|------|---------|
| `app.py` | The Gradio app: chat + status, direct OpenRouter calls |
| `requirements.txt` | Pinned Python deps (gradio, requests) |
| `README.md` | You are here |

## Run it locally

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
pip install -r requirements.txt
python3 app.py
# → http://localhost:7860
```

## Why direct-to-OpenRouter instead of ClawdRouter?

The sibling Space [`clawd-zoo`](../clawd-zoo) proxies chat through
`clawdrouter-zk.fly.dev` for ZK receipts and tier gating. SolGPT is the
simpler, single-purpose sibling: one key, one provider, one job — be
the best free place to ask Solana questions. No infra dependency beyond
OpenRouter itself.

## License

Apache-2.0.
