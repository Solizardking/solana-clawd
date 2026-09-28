---
title: CLAWD Pump Soft
emoji: 🦞
colorFrom: purple
colorTo: green
sdk: static
pinned: false
license: mit
short_description: Soft, read-only mirror of the pump-mcp tool surface for the CLAWD agent
---

# 🦞 CLAWD · Pump Soft

A **soft**, read-only mirror of [`ordlibrary/pump-mcp`](https://huggingface.co/spaces/ordlibrary/pump-mcp) hosted on the
[`solanaclawd`](https://huggingface.co/solanaclawd) HF org. No MCP, no signing, no `PRIVATE_KEY`, no custody — just
a static page that lets you read quotes and inspect the tool surface from your browser.

## What "soft" means

| Surface | Full `pump-mcp` | This soft mirror |
|---|---|---|
| 53 tools, 3 prompts, 3 resources | ✅ | ❌ (read-only preview of 12) |
| MCP stdio server | ✅ | ❌ |
| `PRIVATE_KEY` custody | ✅ (agent keypair) | ❌ (browser wallet only) |
| Quote-only routes | ✅ | ✅ (Jupiter public API) |
| Real buy/sell on PumpFun + PumpSwap | ✅ | ❌ |
| Fee claiming, share config, lifecycle | ✅ | ❌ |
| Inspectors (holders, AMM, royalty, graduation) | ✅ | ⚠️ listed, not yet wired to a live RPC |

For the real tools, install the [Pump MCP Server](https://github.com/Solizardking/solana-clawd/tree/main/skills/pump-mcp-server)
into your agent, or open the [Cheshire Terminal](https://cheshire-clawd-terminal.fly.dev) for a voice-controlled UI.

## What this Space does

- Serves a single static `index.html` with the full CLAWD brand (matrix rain, mint/purple, JetBrains Mono).
- Embeds a "quote a buy on a Pump mint" box that calls the public Jupiter Quote API in the browser.
- Links to the Clawd org, the training dataset, `x402.wtf`, `cheshireterminal.ai`, and the upstream Space.
- Embeds the `$CLAWD` token mint prominently (`8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`).

## Files

- `index.html` — single-file landing (~12 KB) with the matrix-rain canvas + Jupiter quote box
- `style.css` — thin stylesheet override (mirrors upstream Space's siblings)
- `.gitattributes` — LFS rules
- `README.md` — this file

## Deploy

This is a `static` Space. Push to a new repo at
`huggingface.co/spaces/solanaclawd/pump-soft` and HF will serve it from CDN. No build step, no runtime cost.

## License

MIT. CLAWD brand is the property of the solana-clawd core team. `$CLAWD` mint is referenced
as a public constant for convenience; verify on-chain before transacting.
