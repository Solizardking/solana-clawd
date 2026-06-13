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
2. [Package Architecture](#package-architecture)
3. [Communication Map](#communication-map)
4. [Six Tabs](#six-tabs)
5. [pAGENT — Browser Automation](#pagent--browser-automation)
6. [OpenRouter Free Models](#openrouter-free-models)
7. [OpenClawd Pro — Hold $CLAWD](#openclawd-pro--hold-clawd)
8. [MCP HTTP API](#mcp-http-api)
9. [Agent Wallet Vault](#agent-wallet-vault)
10. [Local Port Map](#local-port-map)
11. [Build Instructions](#build-instructions)
12. [Configuration](#configuration)
13. [Directory Layout](#directory-layout)
14. [Security](#security)

---

## Quick Install

### Option A — One-Shot Installer (Recommended)

```bash
bash install-openclawd.sh
```

Builds the extension, starts the MCP bridge on port 38401, and prints load-unpacked instructions.

### Option B — Load Unpacked

1. Open `chrome://extensions/` in Chrome, Brave, or Edge
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and select `clawd-chrome-extensions/`

### Option C — Build a CWS Zip

```bash
bash build-cws.sh
# output: build/clawd-popup-v3.0.0.zip
```

---

## Package Architecture

This directory is a monorepo. Every sub-directory is an npm package that feeds into the extension.

| Package | npm name | Version | Role |
|---|---|---|---|
| `core/` | `@page-agent/core` | 1.6.2 | ReAct agent loop (observe → think → act) |
| `llms/` | `@page-agent/llms` | 1.6.2 | LLM provider adapters (OpenRouter, OpenAI-compat) |
| `page-controller/` | `@page-agent/page-controller` | 1.6.2 | DOM state capture + element interactions |
| `page-agent/` | `page-agent` | 1.6.2 | High-level wrapper — composes core + page-controller |
| `ui/` | `@page-agent/ui` | 1.6.2 | Side-panel stub and overlay components |
| `mcp/` | `@openclawd/browser-mcp` | 2.0.0 | MCP stdio server + HTTP/WS hub bridge (port 38401) |
| `clawd-agent/` | *(prebuilt bundle)* | — | Prebuilt extension bundle (load alongside main) |

All packages share the TypeScript config at `../../tsconfig.base.json` (repo root).

---

## Communication Map

```
User types in Chat tab
        |
        v
  popup.js sendChat()
        |
        +-- orApiKey set --> OpenRouter /chat/completions (HTTPS, user-supplied key)
        |
        +-- Run button clicked --> sendChatAsAgent(task)
                |
                v
        chrome.runtime.sendMessage
          { type: 'EXECUTE_AGENT_TASK', task }
                |
                v
        background.js (Service Worker)
          POST http://127.0.0.1:38401/execute
                |
                v
        mcp/src/hub-bridge.js  (HTTP server, port 38401)
          hub.html (WebSocket hub, same origin)
                |
                v
        clawd-agent/  (extension tab / side panel)
          content-script + main-world.js
          window.PAGENT.execute(task)
                |
                v
        @page-agent/core  ReAct loop
          observe DOM --> @page-agent/page-controller
          think       --> @page-agent/llms (OpenRouter or local)
          act         --> DOM mutations / clicks / navigation
```

The popup never opens a direct WebSocket. Background acts as an HTTP proxy to the bridge, avoiding MV3 CSP restrictions.

---

## Six Tabs

| Tab | What it does | Paid? |
|---|---|:---:|
| 💰 **Wallet** | SOL + SPL balances, OODA trade history, Bitaxe miner card, send / swap | Free |
| 📱 **Seeker** | WebSocket bridge to the Solana Seeker phone | Free |
| ⛏ **Miner** | MawdAxe Bitaxe fleet dashboard with live SSE updates | Free |
| 💬 **Chat** | Multi-turn chat with Clawd — OpenRouter free models or local daemon | Free |
| 🔧 **Tools** | Live RPC health, trending tokens, system status, on-chain agent identity | Free |
| 🔐 **Vault** | AES-256-GCM local wallet vault at `localhost:9099` — keys never leave your machine | Free |

---

## pAGENT — Browser Automation

The **Chat** tab has two controls in the header bar:

- **Status dot** — green glow = pAGENT MCP bridge is online, grey = offline
- **Run button** — executes the current message as a browser agent task instead of a chat reply

The background service worker polls `http://127.0.0.1:38401/status` every 30 seconds and caches the result. When you click Run, the popup sends `EXECUTE_AGENT_TASK` to the background, which POSTs to `/execute` with a 120-second timeout.

Start the bridge before using Run:

```bash
cd mcp
npm install
node src/index.js
# Listening on http://127.0.0.1:38401
```

Or via npx once published:

```bash
npx @openclawd/browser-mcp
```

You can also drive pAGENT from any page's console:

```javascript
await window.PAGENT.execute("Find the cheapest SOL to USDC route on Jupiter and screenshot it", {
  baseURL: "https://openrouter.ai/api/v1",
  model: "deepseek/deepseek-r1-0528:free",
  apiKey: "sk-or-...",
  guiVision: true,
});
```

---

## OpenRouter Free Models

The Chat tab uses OpenRouter by default. Add your key in Settings. No credit card required — the extension ships with a curated `:free` model list:

| Model ID | Notes |
|---|---|
| `deepseek/deepseek-r1-0528:free` | Reasoning model — default |
| `deepseek/deepseek-chat-v3-0324:free` | Fast general chat |
| `google/gemini-flash-1.5:free` | Google multimodal |
| `meta-llama/llama-3.3-70b-instruct:free` | Meta flagship open |
| `qwen/qwen3-235b-a22b:free` | Alibaba large MoE |
| `mistralai/devstral-small:free` | Code-focused |
| `google/gemma-3-27b-it:free` | Google compact |
| `microsoft/phi-4-reasoning:free` | Compact reasoning |

Models with `(reason)` suffix in the dropdown send `reasoning: { effort: "high" }` for extended thinking.

All requests include:

```
HTTP-Referer: https://x402.wtf
X-Title: Clawd pAGENT
```

---

## OpenClawd Pro — Hold $CLAWD

| Tier | Hold | Daily Runs | Models | Features |
|---|---|---|---|---|
| **Free** | 0 $CLAWD | 5 | All free models | Core 6 tabs |
| **Bronze** | 1+ $CLAWD | 20 | + Gemini 3 Flash, DeepSeek R1 | Price alerts, watchlist |
| **Silver** | 1,000+ $CLAWD | 50 | + Claude Sonnet 4.6 | OODA autopilot, Telegram |
| **Gold** | 10,000+ $CLAWD | 100 | + Claude Opus 4.8, Grok 4 | Multi-agent (4), X feed |
| **Diamond** | 100,000+ $CLAWD | 250 | + Grok multi-agent 16 | Sniper, MEV routing |

[**Buy $CLAWD on pump.fun**](https://pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

---

## MCP HTTP API

`mcp/src/hub-bridge.js` exposes an HTTP API on `127.0.0.1:38401` that the background service worker calls. All responses include `Access-Control-Allow-Origin: *`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/status` | `{ connected: bool, busy: bool, port: 38401 }` |
| `POST` | `/execute` | `{ task: string }` — runs the task, returns `{ result: string }` |
| `POST` | `/stop` | Cancels the current running task |
| `GET` | `/` | Returns the hub launcher HTML |

The background also handles these `chrome.runtime.sendMessage` types:

| type | Description |
|---|---|
| `PAGENT_STATUS` | Returns cached `{ online: bool }` from last `/status` poll |
| `EXECUTE_AGENT_TASK` | POSTs to `/execute`, relays result back to popup |
| `STOP_AGENT_TASK` | POSTs to `/stop` |

---

## Agent Wallet Vault

Local-only vault on port 9099:

```
Chrome extension popup
    | HTTP to 127.0.0.1:9099
agentwallet-vault server
    | AES-256-GCM at rest
~/.agentwallet/vault.json  (chmod 0600)
```

Start the vault:

```bash
npx @agentwallet/vault serve --port 9099
```

---

## Local Port Map

| Port | Service | Used by |
|---|---|---|
| 7777 | Clawd daemon — control API | Wallet, Tools tabs |
| 18800 | Clawd daemon — WebSocket | Live price feeds |
| 18790 | Seeker gateway | Seeker tab |
| 8420 | MawdAxe miner API | Miner tab |
| 3001 | Legacy MCP bridge | (deprecated, replaced by 38401) |
| 38401 | pAGENT MCP hub bridge | Run button, background.js |
| 9099 | agentwallet-vault | Vault tab |

---

## Build Instructions

### Prerequisites

The monorepo requires a shared TypeScript base config at the **repo root** (`../../tsconfig.base.json` relative to this directory):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "useDefineForClassFields": true,
    "isolatedModules": true
  }
}
```

### Build all packages

```bash
for pkg in llms core page-controller page-agent ui; do
  echo "=== $pkg ===" && cd $pkg && npm install && npm run build && cd ..
done
```

### Build page-controller only

```bash
cd page-controller
npm install
npm run build
# output: dist/lib/page-controller.js  (ESM, sourcemap, CSS injected)
```

`page-controller` uses `vite-plugin-css-injected-by-js` with `relativeCSSInjection: false` so that CSS from dynamically-imported components (e.g. `SimulatorMask`) is bundled into the main entry chunk rather than left as an orphaned asset.

The `dom_tree/` subdirectory ships as plain JavaScript. Its type declaration lives at `src/dom/dom_tree/index.d.ts` — do not remove this file or TypeScript builds of dependent packages will fail with TS7016.

### Build the MCP bridge

```bash
cd mcp
npm install
node src/index.js
# starts immediately on port 38401
```

---

## Configuration

Click the settings gear in the popup header.

| Setting | Description | Default |
|---|---|---|
| OpenClawd Server URL | Local daemon API endpoint | `http://127.0.0.1:7777` |
| Setup Code Import | Paste connect bundle from daemon | — |
| Gateway Secret | Bearer token for auth | — |
| Network | Mainnet or Devnet | Mainnet |
| MawdAxe Server URL | Mining fleet API | `http://127.0.0.1:8420` |
| OpenRouter API Key | AI chat and pAGENT inference | — |
| AI Model | Default chat model (dropdown of free models) | `deepseek/deepseek-r1-0528:free` |

`OR_BUNDLED_KEY` in `popup.js` is always an empty string — keys are never shipped with the extension.

---

## Directory Layout

```
clawd-chrome-extensions/
├── manifest.json          MV3 manifest — permissions, host_permissions, service worker
├── background.js          Service worker — pAGENT polling, MCP HTTP proxy, badge
├── popup.html             6-tab UI shell — Run button + status dot in Chat tab
├── popup.js               Popup controller — wallet, chat, pAGENT wiring, OpenRouter
├── popup.css              Glassmorphism + cyberpunk theme — pagent-status-dot styles
├── icons/                 16 / 32 / 48 / 128 px PNG icons
├── install-openclawd.sh   One-shot installer
├── build-cws.sh           Builds Chrome Web Store zip
├── CWS-LISTING.md         Paste-ready store listing copy
│
├── core/                  @page-agent/core — ReAct agent loop
│   └── src/
│       ├── Agent.ts       Main agent class — observe/think/act orchestration
│       └── prompts/       system_prompt.md (Clawd/Solana/DeFi identity)
│
├── llms/                  @page-agent/llms — LLM provider adapters
│   └── src/index.ts       createOpenRouterConfig(), OPENROUTER_FREE_MODELS, LLMConfig
│
├── page-controller/       @page-agent/page-controller — DOM + interactions
│   ├── src/
│   │   ├── PageController.ts      Main export
│   │   ├── actions.ts             Click, type, scroll, navigate
│   │   ├── dom/dom_tree/          DOM state serializer (plain JS)
│   │   │   ├── index.js           Implementation
│   │   │   └── index.d.ts         Type declarations (required — do not delete)
│   │   └── mask/SimulatorMask/    Overlay component (lazy-loaded)
│   ├── vite.config.js             relativeCSSInjection:false, cssCodeSplit:false
│   └── tsconfig.dts.json          Extends ../../tsconfig.base.json
│
├── page-agent/            page-agent — high-level wrapper
│
├── ui/                    @page-agent/ui — side panel stub
│
├── mcp/                   @openclawd/browser-mcp v2.0.0
│   └── src/
│       ├── index.js       MCP stdio server — reads OPENROUTER_API_KEY env var
│       ├── hub-bridge.js  HTTP server (:38401) — /status /execute /stop
│       └── launcher.html  Hub launcher page
│
└── clawd-agent/           Prebuilt pAGENT bundle (load alongside main extension)
    ├── manifest.json
    ├── background.js
    ├── main-world.js      Injects window.PAGENT into every page
    ├── hub.html           WebSocket hub (communicates with hub-bridge.js)
    └── sidepanel.html
```

---

## Security

- **Zero remote calls** from the manifest — `host_permissions` whitelists only `127.0.0.1` and `localhost` (ports 7777, 18800, 18790, 8420, 3001, 38401, 9099)
- **No bundled API keys** — `OR_BUNDLED_KEY = ''` always; users supply their own OpenRouter key
- **Vault files** are `chmod 0600`, AES-256-GCM encrypted, stored in `~/.agentwallet/`
- **Zero telemetry** — no analytics, no crash reports, no external beacons
- **MCP bridge localhost only** — `hub-bridge.js` binds to `127.0.0.1:38401`, never `0.0.0.0`

---

## Support

- **GitHub** — [github.com/Solizardking/solana-clawd](https://github.com/Solizardking/solana-clawd)
- **Hub** — [x402.wtf](https://x402.wtf)
- **$CLAWD** — [pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump](https://pump.fun/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)

---

*Built with by the Clawd crew — The Hermes of Web3*
