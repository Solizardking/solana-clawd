---
title: Trench Town
emoji: 😺
colorFrom: amber
colorTo: orange
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: The AI town where Clawd lives · sovereign onchain agent harness
---

# 😺 Trench Town

> The AI town where Clawd lives. The 2026 take on the sovereign onchain agent
> harness for the Solana trenches.

This is the **Trench Town** build of the `cheshire-clawd-terminal.fly.dev` /
`cheshireterminal.ai` landing. The brand has been updated from "Cheshire
Terminal" to **"Trench Town"**; the live deployment targets are unchanged
so the existing DNS, TLS cert, and Fly machine keep working.

## What's in this dir

```
trench-town/
├── Dockerfile         # nginx 1.27-alpine image, exposes 8080 + 7860
├── nginx.conf         # security headers, gzip, /health
├── fly.toml           # Fly.io app config — app = cheshire-clawd-terminal
├── web/
│   └── index.html     # the Trench Town landing (single page)
└── README.md
```

## Run locally

```bash
docker build -t trench-town .
docker run -p 8080:8080 trench-town
# open http://localhost:8080
```

## Deploy to Fly

```bash
# one-time
fly apps create cheshire-terminal || true     # skip if the live app already exists
fly volumes create cheshire_data --region iad --size 1
fly secrets set SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=..." \
                LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
                --app cheshire-clawd-terminal

# every push
fly deploy -c fly.toml --app cheshire-clawd-terminal
```

The deployment is brand-stable: every page (HTML title, meta tags, OG
tags, `og:url`, canonical) names **"Trench Town — the AI town where Clawd
lives"** and points at `https://cheshireterminal.ai`. The hosting
hostname remains `cheshire-clawd-terminal.fly.dev` so existing links,
cert, and DNS keep working.

## Why the brand changed

The original "Cheshire Terminal" was the first skin. The full Trench
Town design — Mayor, Polecats, Refinery, Witness, Deacon, Dogs, Crew,
TUPP, MEOW, Claw Beads, convoys, the 8 Stages of Degen Evolution — is
the 2026 production design. The Fly deployment is the same; the brand
just got a bigger vocabulary. The shell molts. The laws do not. The
hats stay on. `$WIF` energy forever.

## Why the Fly app is still named `cheshire-clawd-terminal` but the brand is `Trench Town`

The Fly-assigned hostname (`cheshire-clawd-terminal.fly.dev`) is a legacy
slug from the first build. The custom domain `cheshireterminal.ai` is
already pointed at it via DNS and TLS, so user-facing branding is
"Trench Town" everywhere. The internal app name does not affect the
brand. To rename:

```bash
# run from spaces/trench-town/ so fly.toml is in scope
fly apps rename cheshire-terminal
```

The new slug is what the new `app = "…"` line in `fly.toml` must match;
update it before the next `fly deploy`.

## Ecosystem

- **Live site:** [cheshireterminal.ai](https://cheshireterminal.ai)
- **Fly hostname:** [cheshire-clawd-terminal.fly.dev](https://cheshire-clawd-terminal.fly.dev)
- **Main site:** [x402.wtf](https://x402.wtf)
- **Org:** [huggingface.co/solanaclawd](https://huggingface.co/solanaclawd)
- **73 leviathans:** [huggingface.co/spaces/solanaclawd/clawd-zoo](https://huggingface.co/spaces/solanaclawd/clawd-zoo)
- **Claw Constitution:** [`CONSTITUTION.md`](https://github.com/Solizardking/solana-clawd/blob/main/CONSTITUTION.md) (CC0 1.0)
- **GitHub:** [Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)
- **Token:** `$CLAWD` — `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`

## License

MIT.
