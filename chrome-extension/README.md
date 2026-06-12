# OpenClawd — pAGENT Browser

**The autonomous AI browser agent — your keys never leave your machine.**

[![Version](https://img.shields.io/badge/version-3.0.0-9945FF)](manifest.json)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-blue)]()
[![Chrome · Brave · Edge](https://img.shields.io/badge/chrome%20·%20brave%20·%20edge-supported-brightgreen)]()
[![License MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![$CLAWD](https://img.shields.io/badge/%24CLAWD-pump.fun-ff69b4)](https://pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

> **The Hermes of Web3** — AI agent browser with wallet, trading, and harness integration.

---

## Table of Contents

1. [Quick Install](#quick-install)
2. [One-Shot Installer](#one-shot-installer)
3. [Six Tabs](#six-tabs)
4. [OpenClawd Pro — Hold $CLAWD](#openclawd-pro--hold-clawd)
5. [pAGENT — GUI Vision Browser Agent](#pagent--gui-vision-browser-agent)
6. [Agent Wallet Vault](#agent-wallet-vault)
7. [MCP Bridge](#mcp-bridge)
8. [SolanaOS Integration](#solanaos-integration)
9. [Configuration](#configuration)
10. [Directory Layout](#directory-layout)

---

## Quick Install

### Option A — One-Shot Installer (Recommended)

```bash
cd chrome-extension
bash install-openclawd.sh
```

This installs the Chrome extension AND starts the OpenClawd MCP bridge automatically.

### Option B — Load Unpacked

1. Open `chrome://extensions/` in Chrome, Brave, or Edge
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and select one:
   - `chrome-extension/` → popup build (wallet + chat + tools + vault + miner + seeker)
   - `chrome-extension/clawd-agent/` → full pAGENT build with side panel + GUI-vision automation

### Option C — Build and Load

```bash
bash build-cws.sh
# → build/openclawd-popup-v3.0.0.zip
```

---

## One-Shot Installer

The `install-openclawd.sh` script:

1. ✅ Builds the Chrome extension
2. ✅ Starts the OpenClawd MCP bridge (port 3001)
3. ✅ Creates Claude Desktop MCP config
4. ✅ Generates extension configuration
5. ✅ Prints installation instructions

```bash
bash chrome-extension/install-openclawd.sh
```

Output includes:
- Extension location
- How to load unpacked
- Claude Desktop integration
- Running services

---

## Six Tabs

| Tab | What it does | Paid? |
|---|---|:---:|
| 💰 **Wallet** | SOL + SPL balances, OODA trade history, Bitaxe miner card, send / swap | Free |
| 📱 **Seeker** | WebSocket bridge to the Solana Seeker phone | Free |
| ⛏  **Miner** | MawdAxe Bitaxe fleet dashboard with SSE live updates | Free |
| 💬 **Chat** | Multi-turn chat with OpenClawd — routes to OpenRouter or the local daemon | Free |
| 🔧 **Tools** | Live RPC health, trending tokens, system status, on-chain agent identity mint | Free |
| 🔐 **Vault** | AES-256-GCM local wallet vault at `localhost:8421` — keys never leave your box | Free |
| 🧠 **pAGENT** | GUI-vision browser agent, `window.PAGENT.execute("...")` on any page | Free core, **Pro unlocks more** |

---

## OpenClawd Pro — Hold $CLAWD

OpenClawd is free to use. **OpenClawd Pro** unlocks premium features based on $CLAWD holdings.

| Tier | Hold | Daily Runs | Models | Features |
|---|---|---|---|---|
| **Free** | 0 $CLAWD | 5 | Claude Haiku, GPT-4.1-nano | Core 6 tabs |
| **Bronze** | 1+ $CLAWD | 20 | + Gemini 3 Flash, DeepSeek R1 | Price alerts, watchlist |
| **Silver** | 1,000+ $CLAWD | 50 | + Claude Sonnet 4.6 | OODA autopilot, Telegram |
| **Gold** | 10,000+ $CLAWD | 100 | + Claude Opus 4.6, Grok 4 | Multi-agent (4), X feed |
| **Diamond** | 100,000+ $CLAWD | 250 | + Grok multi-agent 16 | Sniper, MEV routing |

### Grab $CLAWD

[**pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump →**](https://pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

---

## pAGENT — GUI Vision Browser Agent

pAGENT injects `window.PAGENT` into every page. Drive your browser with natural language:

```javascript
await window.PAGENT.execute("Find the cheapest SOL→USDC route on Jupiter and screenshot it", {
  baseURL: "https://api.openrouter.ai/v1",
  model: "anthropic/claude-sonnet-4-6",
  apiKey: "sk-or-...",
  guiVision: true,
  onStatusChange: (s) => console.log(s),
});
```

**What makes it different:**
- **GUI vision** — screenshots parsed by vision model, not just DOM
- **Re-Act loop** — think / act / observe / repeat until task is done
- **MCP bridge** — plugs into Claude Desktop, Cursor, Cline via stdio

---

## Agent Wallet Vault

Local-only vault server at `localhost:8421`:

```
Chrome extension popup
    ↓ HTTP to 127.0.0.1:8421
OpenClawd Wallet API
    ↓ AES-256-GCM at rest
~/.openclawd/vault.json  (chmod 0600)
```

Start the vault:
```bash
npx @openclawd/wallet serve --port 8421
```

---

## MCP Bridge

The `mcp/` package bridges pAGENT to Claude Desktop:

```bash
cd chrome-extension/mcp
LLM_BASE_URL=https://api.openrouter.ai/v1 \
LLM_API_KEY=sk-or-... \
LLM_MODEL_NAME=anthropic/claude-sonnet-4-6 \
node src/index.js
```

Add to Claude Desktop (`~/.claude.json`):

```json
{
  "mcpServers": {
    "openclawd-browser": {
      "command": "node",
      "args": ["/Users/8bit/openclawd/chrome-extension/mcp/src/index.js"]
    }
  }
}
```

---

## SolanaOS Integration

OpenClawd connects to the SolanaOS Go binary for:

| Service | Port | OpenClawd Connection |
|---------|------|---------------------|
| Gateway WS | 18790 | WebSocket client |
| Control UI | 7777 | HTTP API |
| Wallet API | 8421 | REST client |
| MawdAxe | 8420 | SSE client |
| MCP Bridge | 3001 | stdio + HTTP |

See [`INTEGRATION_STRATEGY.md`](INTEGRATION_STRATEGY.md) for full integration guide.

---

## Configuration

Click ⚙️ in the popup header.

| Setting | Description | Default |
|---|---|---|
| OpenClawd Server URL | Local orchestrator API endpoint | `http://127.0.0.1:7777` |
| Setup Code Import | Paste connect bundle | — |
| Gateway Secret | Bearer token for auth | — |
| Network | Mainnet or Devnet | Mainnet |
| MawdAxe Server URL | Mining fleet API | `http://127.0.0.1:8420` |
| OpenRouter API Key | AI chat routing | — |
| AI Model | Default chat model | `anthropic/claude-sonnet-4-6` |

---

## Directory Layout

```
chrome-extension/
├── manifest.json        Popup Manifest V3 (OpenClawd branded)
├── background.js        Service worker — status polling, badge updates
├── popup.html           6-tab UI shell (OpenClawd branded)
├── popup.js             Popup controller — wallet, chat, mining, seeker, vault
├── popup.css            Glassmorphism + cyberpunk theme
├── icons/               16/32/48/128 extension icons
├── install-openclawd.sh # One-shot installer
├── build-cws.sh         Builds Chrome Web Store zip
├── CWS-LISTING.md       Paste-ready store listing
│
├── clawd-agent/         Prebuilt pAGENT bundle (load for GUI vision)
│   ├── manifest.json
│   ├── background.js
│   ├── main-world.js    Injects window.PAGENT
│   ├── hub.html         WebSocket hub for MCP
│   ├── sidepanel.html
│   └── ...
│
├── core/                @page-agent/core — Re-Act agent loop
├── page-controller/     @page-agent/page-controller — DOM state + actions
├── page-agent/          High-level wrapper
├── ui/                  @page-agent/ui — Panel stub
├── llms/                LLM provider adapters
└── mcp/                 Browser MCP server for AI clients
```

---

## Security

- **Zero internet calls** from extension popup. Only `127.0.0.1` / `localhost` in `host_permissions`
- **No bundled secrets** — users supply their own API keys
- **Vault files** are `chmod 0600`, AES-256-GCM encrypted
- **Zero telemetry** — no analytics, no crash reports

---

## Support

- **GitHub Issues** — [github.com/x402agent/openclawd/issues](https://github.com/x402agent/openclawd/issues)
- **Hub** — [hub.solanaclawd.com](https://hub.solanaclawd.com)
- **Website** — [solanaclawd.com](https://solanaclawd.com)

---

*Built with 🦞 by the OpenClawd crew — The Hermes of Web3*