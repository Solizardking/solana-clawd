# MCP Workspace

This directory contains MCP-related workspace state for Solana Clawd.

## Tracked project

- `clawd-mcp/` is the MCP server project. It is a nested Git repository tracked
  by the root repository as `mcp/clawd-mcp`.
- Source files live in `clawd-mcp/src/`.
- Runtime and deployment metadata lives in:
  - `clawd-mcp/.env.example`
  - `clawd-mcp/.mcp.json`
  - `clawd-mcp/Dockerfile`
  - `clawd-mcp/fly.toml`
  - `clawd-mcp/install.sh`
  - `clawd-mcp/package.json`
  - `clawd-mcp/package-lock.json`
  - `clawd-mcp/README.md`
  - `clawd-mcp/tsconfig.json`

## Local generated state

These paths are local-only and can be regenerated:

- `.mypy_cache/`
- `clawd-mcp/dist/`
- `clawd-mcp/node_modules/`
- `clawd-mcp/.env.local`
- `.DS_Store` files

Use `npm ci` inside `clawd-mcp/` to restore `node_modules/`, and `npm run build`
inside `clawd-mcp/` to restore `dist/`.
