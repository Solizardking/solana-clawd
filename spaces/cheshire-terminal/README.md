---
title: Cheshire Terminal
emoji: 😺
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: Voice-controlled Solana terminal · cheshireterminal.ai
---

# 😺 Cheshire Terminal

A voice-controlled Solana terminal — meme launcher, agent staking, x402 trust gate.

This repo is the **clean reference build** for `cheshire-clawd-terminal.fly.dev` /
`cheshireterminal.ai`. The live deployment runs additional LiveKit + Clerk +
x402 server logic; the static landing + the `/api/*` JSON contract that this
build serves is exactly what visitors see at the public hostname.

## Layout

```
cheshire-terminal/
├── Dockerfile         # nginx-alpine image, exposes 8080 (Fly) and 7860 (HF)
├── nginx.conf         # security headers, gzip, /health
├── fly.toml           # Fly.io app config — app = cheshire-clawd-terminal
├── web/
│   └── index.html     # the landing page (matches live title + meta)
└── README.md
```

## Run locally

```bash
docker build -t cheshire-terminal .
docker run -p 8080:8080 cheshire-terminal
# open http://localhost:8080
```

## Deploy to Fly

```bash
fly apps create cheshire-terminal || true     # skip if the live app already exists
fly volumes create cheshire_data --region iad --size 1
fly secrets set SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=..." \
                LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
                --app cheshire-clawd-terminal

fly deploy -c fly.toml --app cheshire-clawd-terminal
```

The deployment is brand-stable: every page (HTML title, meta tags, OG tags,
`og:url`, canonical) says **"Cheshire Terminal — Powered by $CLAWD"** and
points at `https://cheshireterminal.ai`.

## Why the Fly app is named `cheshire-clawd-terminal` but the brand is `Cheshire Terminal`

The Fly-assigned hostname (`cheshire-clawd-terminal.fly.dev`) is a legacy
slug from the first build. The custom domain `cheshireterminal.ai` is
already pointed at it via DNS and TLS, so user-facing branding is
"Cheshire Terminal" everywhere. The internal app name does not affect
the brand. To rename the internal slug (run from this directory so the
fly.toml is in scope):

```bash
fly apps rename cheshire-terminal
```

The new slug is what the new `app = "…"` line in `fly.toml` must match;
update it before the next `fly deploy`.

## Ecosystem

- **Live site:** [cheshireterminal.ai](https://cheshireterminal.ai)
- **Fly hostname:** [cheshire-clawd-terminal.fly.dev](https://cheshire-clawd-terminal.fly.dev)
- **Main site:** [x402.wtf](https://x402.wtf)
- **Org:** [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd)
- **Soft mirror:** [huggingface.co/spaces/solanaclawd/pump-soft](https://huggingface.co/spaces/solanaclawd/pump-soft)
- **GitHub:** [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)
- **Token:** `$CLAWD` — `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

## License

MIT.
