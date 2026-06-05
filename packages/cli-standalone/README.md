# @openclawdsolana/clawd-standalone

Clawd CLI Standalone — a lobster agent with Grok AI, Solana tools, and MCP server support. Ships pre-built (no compile step required) and runs as a terminal chat interface.

## Install

```bash
npm install -g @openclawdsolana/clawd-standalone
```

Or run without installing:

```bash
npx @openclawdsolana/clawd-standalone
```

## Quick Start

```bash
# Set your Grok API key
export XAI_API_KEY=xai-...

# Start the chat interface
clawd-standalone

# Or use the full leviathan runtime from the repo root:
npm run clawd:start
```

## Environment Variables

| Variable | Description |
|---|---|
| `XAI_API_KEY` | Grok API key (required for AI features) |
| `SOLANA_PRIVATE_KEY` | Base58 keypair for on-chain actions |
| `HELIUS_API_KEY` | Helius RPC key for enhanced Solana data |
| `ANTHROPIC_API_KEY` | Claude API key (alternative model) |

## MCP Server Support

The standalone CLI supports MCP (Model Context Protocol) servers — connect external tools to the agent's reasoning loop:

```bash
# List configured MCP servers
clawd-standalone mcp list

# Add an MCP server
clawd-standalone mcp add --name my-tool --command "npx my-mcp-server"
```

## Features

- Terminal chat UI via Ink (React for the terminal)
- Grok 4 / Claude reasoning layer
- Solana wallet tools (balance, send, swap)
- MCP server integration
- Confirmation prompts before on-chain actions
- Settings persistence

## Relationship to Leviathan

`clawd-standalone` is a pre-built, dependency-light snapshot of the `clawd` TUI agent — use it when you want to run the agent without cloning the full monorepo. For the full runtime with OODA loops, agent spawning, and x402 payment rails, use the root package (`@openclawdsolana/leviathan`).

## License

MIT
