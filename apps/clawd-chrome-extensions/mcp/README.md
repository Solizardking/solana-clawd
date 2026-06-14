# @solana-clawd/browser-mcp

MCP server that lets AI agent clients control your browser through the Clawd pAGENT extension.

## Prerequisites

- Node.js >= 20
- Clawd pAGENT extension installed in Chrome, Brave, or Edge
- One LLM API key: `XAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, or generic `LLM_API_KEY`

## Installation

### Clawd Desktop

Add to `~/Library/Application Support/Clawd/clawd_desktop_config.json`:

```json
{
    "mcpServers": {
        "page-agent": {
            "command": "npx",
            "args": ["-y", "@solana-clawd/browser-mcp"],
            "env": {
                "XAI_API_KEY": "xai-...",
                "XAI_MODEL_NAME": "grok-4.3"
            }
        }
    }
}
```

### Cursor / Copilot

Same format — add the config to the MCP settings of your client.

## MCP Tools

| Tool           | Input              | Description                                          |
| -------------- | ------------------ | ---------------------------------------------------- |
| `execute_task` | `{ task: string }` | Execute a browser task in natural language. Blocking. |
| `get_status`   | —                  | Returns `{ connected, busy }`                        |
| `stop_task`    | —                  | Stop the currently running task.                     |

## Environment Variables

| Variable         | Default | Description           |
| ---------------- | ------- | --------------------- |
| `LLM_BASE_URL`   | —       | LLM API base URL      |
| `LLM_API_KEY`    | —       | LLM API key           |
| `LLM_MODEL_NAME` | —       | Model name            |
| `XAI_API_KEY`    | —       | xAI API key for Grok vision-capable inference |
| `XAI_MODEL_NAME` | `grok-4.3` | xAI model override |
| `GOOGLE_API_KEY` | —       | Google Gemini API key |
| `GOOGLE_MODEL_NAME` | `gemini-2.5-flash` | Gemini model override |
| `OPENROUTER_API_KEY` | —    | OpenRouter API key |
| `PORT`           | `38401` | HTTP + WebSocket port |

## How It Works

```
┌──────────────┐  stdio   ┌──────────────────┐  WebSocket   ┌──────────────┐
│ Clawd /     │◄────────►│ Clawd pAGENT MCP │◄────────────►│ Hub tab      │
│ Copilot      │  (MCP)   │ (Node.js)        │  (localhost) │ (extension)  │
└──────────────┘          └──────────────────┘              └──────┬───────┘
                                   │                               │
                                   │ HTTP                          │ useAgent
                                   ▼                               ▼
                          ┌──────────────────┐              ┌──────────────┐
                          │ Launcher page    │              │ MultiPage    │
                          │ (localhost:PORT) │              │ Agent        │
                          └──────────────────┘              └──────────────┘
```

1. Agent client starts the MCP server via stdio (`npx @solana-clawd/browser-mcp`).
2. Server starts HTTP + WS on `localhost:PORT`, opens the launcher page in browser.
3. Launcher page triggers the extension to open a **hub tab** (`hub.html?ws=PORT`).
4. Hub connects to the WS server. MCP tools now proxy tasks to the hub.

The hub tab speaks a generic WebSocket protocol (defined in `hub-ws.ts` in the extension package) and has no knowledge of MCP. See the hub's protocol docs for message format details.

## Architecture

Pure JS ESM, no build step. Source files are the published artifacts.

```
src/
├── index.js        # CLI entry: MCP server (stdio) + opens launcher
├── hub-bridge.js   # HTTP server + WebSocket bridge to hub tab
└── launcher.html   # Bootstrap page: detects extension, triggers hub open
```

## Dev

```bash
npm run build:libs
npm run dev:ext
npx @modelcontextprotocol/inspector node packages/mcp/src/index.js
```
