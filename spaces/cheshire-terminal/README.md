---
title: Cheshire Terminal (DEPRECATED — see Trench Town)
emoji: 🦞
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: DEPRECATED — rebranded to Trench Town
---

# 🦞 Cheshire Terminal (DEPRECATED — see [`Trench Town`](../trench-town/))

> The brand has been **rebranded to Trench Town** as of 2026-06-16. The
> live deployment (`cheshire-clawd-terminal.fly.dev` /
> `cheshireterminal.ai`) is unchanged; the new landing page is in
> [`spaces/trench-town/`](../trench-town/).
>
> The directory you are looking at is kept for historical reference and
> to backstop the existing Fly app's deployment pipeline. New work
> goes in `spaces/trench-town/`.

## Migration

| Old (`cheshire-terminal/`) | New (`trench-town/`) |
|---|---|
| Brand: "Cheshire Terminal — Powered by $CLAWD" | Brand: **"Trench Town — the AI town where Clawd lives"** |
| Hero copy: "voice-controlled meme token launcher, agent staking" | Hero copy: **Mayor, Polecats, Refinery, Witness, Deacon, Dogs, Crew** + TUPP, MEOW, Claw Beads, convoys, the 8 Stages of Degen Evolution |
| Fly slug: `cheshire-clawd-terminal` (unchanged) | Fly slug: `cheshire-clawd-terminal` (unchanged — the brand lives in the landing page, not the hostname) |

## Files (kept for the existing Fly deploy)

```
cheshire-terminal/
├── Dockerfile         # nginx 1.27-alpine, exposes 8080 + 7860
├── nginx.conf         # security headers, gzip, /health
├── fly.toml           # app = cheshire-clawd-terminal
└── web/
    └── index.html     # the original "Cheshire Terminal" landing
```

## New work

See [`../trench-town/`](../trench-town/) for the rebrand.

## License

MIT.
