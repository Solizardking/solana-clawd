# Chrome Web Store — Listing Copy

Paste-ready fields for [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).

## Package

Run:

```bash
./build-cws.sh
```

Upload `build/clawd-popup-vX.Y.Z.zip`.

## Item Details

**Name** (max 45 chars)
```
Solana Clawd — Wallet, Vault & AI Agent
```

**Summary / Short description** (max 132 chars — already enforced in `manifest.json`)
```
Solana wallet, AI chat, and air-gapped vault in one extension. Free AI via OpenRouter. Your keys never leave your machine.
```

**Category**
```
Productivity
```

**Language**
```
English
```

## Detailed Description

```
Solana Clawd is the first AI-powered browser companion for Solana that keeps your private keys on your machine. Not "encrypted in the cloud." Not "we promise we'll never look." Actually on your machine — talking only to localhost.

WHAT YOU GET

• Wallet Dashboard — SOL balance, SPL portfolio, USD value, trade history with P&L
• AI Chat — multi-turn conversation with Clawd, powered by OpenRouter free models (DeepSeek R1, Llama 3.3, Gemini Flash, Qwen 3 and more — no API credits needed)
• pAGENT Browser Automation — click the ▶ button to run any task in your browser: scrape a page, fill a form, research a token, automate DeFi flows
• Tools — live Helius RPC health, trending Solana tokens, system status, on-chain agent identity mint
• Vault Tab — AES-256-GCM encrypted local wallet vault, bearer-auth, localhost only (no internet calls, ever)
• Seeker Bridge — connect a Solana Seeker phone to your local Clawd daemon
• Mining Fleet — Bitaxe fleet dashboard with live SSE updates

FREE MODELS — NO CREDIT CARD NEEDED

Clawd ships with a curated list of OpenRouter free models (:free tier). Get a free API key at openrouter.ai and start chatting instantly. Available free models include:

• DeepSeek R1 0528 — powerful reasoning model
• DeepSeek V3 — fast general chat
• Gemini 1.5 Flash — Google's fast multimodal model
• Llama 3.3 70B — Meta's flagship open model
• Qwen 3 235B — Alibaba's massive MoE model
• Devstral Small — code-focused model from Mistral
• Phi-4 Reasoning — Microsoft's compact reasoning model

PAGENT BROWSER AUTOMATION

Type any task in the chat box and click ▶ to execute it in your browser via the pAGENT MCP bridge. The extension communicates with the local @openclawd/browser-mcp server, which drives a Chrome tab using the page-agent loop (observe → reason → act). No remote API calls — everything runs locally.

Start the bridge with: npx @openclawd/browser-mcp

CLAWD PRO — HOLD $CLAWD, UNLOCK EVERYTHING

Tier detection is automatic and local. The extension reads your connected wallet's $CLAWD balance from the Clawd daemon's portfolio endpoint, maps it to a tier, and unlocks features in the UI:

• FREE    — 5 daily runs, core 6 tabs, all free AI models
• BRONZE  — 1+ $CLAWD, 20 runs, watchlist & price alerts
• SILVER  — 1,000+ $CLAWD, 50 runs, OODA autopilot, Telegram mirroring
• GOLD    — 10,000+ $CLAWD, 100 runs, multi-agent research, X/Twitter alpha feed
• DIAMOND — 100,000+ $CLAWD, 250 runs, Pump.fun sniper, MEV-aware routing, priority RPC

PRIVACY & SECURITY

• Zero internet calls from the extension itself — the manifest only whitelists 127.0.0.1 and localhost ports
• No bundled API keys, no telemetry, no analytics
• Vault files are chmod 0600, AES-256-GCM encrypted, stored in ~/.agentwallet/
• Source is MIT on GitHub — audit it yourself

REQUIREMENTS

• Clawd daemon running locally (one-shot install at x402.wtf or github.com/Solizardking/solana-clawd)
• OpenRouter API key for AI chat — get a free one at openrouter.ai (no credit card required for free models)
• Optional: @openclawd/browser-mcp for the ▶ pAGENT browser automation button
• Optional: agentwallet-vault running on port 9099 for the Vault tab

LINKS
• GitHub: github.com/Solizardking/solana-clawd
• x402.wtf — agents, skills, gateway, terminal
• $CLAWD on pump.fun: pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
```

## Screenshots (1280×800 or 640×400, PNG/JPG, up to 5)

Suggested shots:

1. **Chat tab** showing free model dropdown + a DeepSeek R1 response
2. **Wallet tab** showing SOL balance, portfolio, trade history
3. **Vault tab** with a generated keypair and the "0600 · AES-256-GCM" footer
4. **Settings panel** showing OpenRouter key field and free model selector
5. **Pro badge** glowing gold/diamond (capture with $CLAWD balance loaded)

Take them at 1280×800 against a dark desktop for consistency with the cyberpunk theme.

## Promotional Images

| Asset | Size | Required |
|---|---|---|
| Small promo tile | 440×280 | Required |
| Large promo tile | 920×680 | Optional |
| Marquee | 1400×560 | Optional |

## Privacy

**Single purpose**
```
Solana wallet dashboard, AI chat companion, and browser automation agent that talks only to a local Clawd daemon and user-supplied OpenRouter key.
```

**Permission justification**

- `storage` — persist the user's settings (daemon URL, OpenRouter API key, model selection, tier state) in `chrome.storage.local`
- `activeTab` — used only when the user clicks "Open in Solscan" to open the current wallet's explorer page
- `alarms` — periodic health check (every 30 s) against the local daemon and pAGENT MCP bridge to update the toolbar badge
- `host_permissions` for `127.0.0.1:*` and `localhost:*` — required to talk to the local Clawd daemon (7777/18800), Seeker gateway (18790), MawdAxe miner API (8420), agentwallet-vault (9099), and the pAGENT MCP bridge (38401). No remote hosts are whitelisted except the user-configured OpenRouter endpoint which the user supplies their own API key for.

**Data usage disclosures** — check all of:
- [x] I do not sell or transfer user data to third parties
- [x] I do not use or transfer user data for unrelated purposes
- [x] I do not use or transfer user data to determine creditworthiness

**Data collection**: None. Set all categories to "Not collected."

## Support

**Support email**
```
support@x402.wtf
```

**Website**
```
https://x402.wtf
```

## Release Checklist

Before publishing:

- [ ] `./build-cws.sh` runs clean and produces `build/clawd-popup-vX.Y.Z.zip`
- [ ] Version bumped in `manifest.json` (CWS rejects re-uploads with the same version)
- [ ] No `console.log` debug statements in `popup.js` or `background.js`
- [ ] No hardcoded API keys (check `OR_BUNDLED_KEY` is empty string)
- [ ] Manifest description ≤ 132 chars
- [ ] Icons are exactly 16 / 32 / 48 / 128 px PNG
- [ ] `host_permissions` contains only localhost/127.0.0.1 entries
- [ ] Free model list in `popup.js` `OR_FREE_MODELS` is up to date
- [ ] Screenshots captured at 1280×800
- [ ] Privacy policy URL added in the dashboard (required for extensions that handle wallet data)
- [ ] Tested on Chrome, Brave, and Edge with `Load unpacked`
- [ ] pAGENT ▶ button tested with `npx @openclawd/browser-mcp` running
- [ ] `clawd-agent/` sub-extension loaded alongside main extension for full pAGENT functionality
