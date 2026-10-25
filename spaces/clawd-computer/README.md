---
title: Clawd Computer
emoji: 🦞
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: Web homebase for Clawd agents — swap $CLAWD, run models
---

# 🦞 Clawd Computer

A real, browser-accessible **homebase** for the [Clawd](https://huggingface.co/solanaclawd) agents — running on Hugging Face Spaces. Powered by [x402.wtf](https://x402.wtf).

It is a Docker Space that boots a Debian userland, serves a static homebase with `nginx`, and hosts two client-side widgets: a **Jupiter swap panel** (locked to `$CLAWD`) and a **HF Router model picker**. No shell is exposed — the previous `ttyd`-based terminal was retired after Hugging Face's abuse handler paused the Space (see [RECOVERY.md](./RECOVERY.md)).

## What's inside (v2)

| Layer | Tool |
|---|---|
| Static homebase | `nginx` serving `web/index.html` |
| Process manager | `supervisord` |
| Runtime | Python 3, Node.js 20, git, curl, jq, ripgrep, `hf` CLI |
| Swap widget | [Jupiter Plugin](https://plugin.jup.ag/) — locked output mint = `$CLAWD` |
| Model widget | [HF Router](https://huggingface.co/docs/inference-providers) chat completions |

## Ecosystem

- **Main site:** [x402.wtf](https://x402.wtf)
- **Cheshire:** [cheshireterminal.ai](https://cheshireterminal.ai)
- **Org:** [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd)
- **GitHub:** [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)
- **Token:** `$CLAWD` — `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

## Layout

- `/` — the homebase: sidebar + swap panel + model panel

## Secrets

Set in **Space Settings → Secrets**:

| Secret | Required? | Used by |
|---|---|---|
| `SOLANA_RPC_URL` | optional | Recommended — your personal Solana RPC (Helius / Triton / QuickNode). The Jupiter plugin uses the user's browser wallet, but a personal RPC keeps quote latency low. |
| `HF_TOKEN` | optional | The model panel needs it for >rate-limited inference on the free tier. |
| `JUP_REFERRAL` | optional | Your Jupiter referral account — earns 0.5% on each swap. |

> **How secrets are exposed:** the Space does not proxy secrets. The Docker image reads them at container start and writes them to `window.HF_TOKEN` / `window.JUP_REFERRAL` in `index.html` via a tiny `entrypoint.sh` (see [INTEGRATION.md](./INTEGRATION.md) — not bundled in v2; if you need it, open an issue).

For v2 the secrets are read **client-side**: the user pastes their own `HF_TOKEN` in DevTools if they want. The personal RPC URL is the only secret worth wiring in, and the user can do that themselves in their browser wallet's network settings.

## Run locally

```bash
docker build -t clawd-computer .
docker run -p 7860:7860 \
  -e SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY" \
  -e HF_TOKEN="hf_xxx" \
  clawd-computer
# open http://localhost:7860
```

## Recovery from the v1 abuse flag

See [RECOVERY.md](./RECOVERY.md). TL;DR — the v1 Space was paused on 2026-06-07 by the HF abuse-handler because `supervisord` ran a `ttyd` web shell that opened a connection to `huggingface.co`. v2 ships no shell, no PTY, no outbound traffic. Pushing v2 to the same Space and letting it rebuild usually clears the flag; if not, appeal via the Help button on the Space page.

---

🦞 Clawd Computer · [solanaclawd](https://huggingface.co/solanaclawd) · [x402.wtf](https://x402.wtf) · MIT
