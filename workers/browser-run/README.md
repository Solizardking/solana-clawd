# Cheshire Browser Run Worker

First-party Cloudflare Browser Run service for Cheshire Terminal. It exposes a small authenticated API for screenshot, text, and HTML extraction without depending on Browser Use's hosted session API.

## Setup

```bash
cd workers/browser-run
pnpm install
npx wrangler kv namespace create BROWSER_CACHE
npx wrangler kv namespace create BROWSER_CACHE --preview
npx wrangler secret put BROWSER_RUN_TOKEN
```

Put the two KV IDs into `wrangler.jsonc`, then deploy:

```bash
pnpm deploy
```

Add the deployed worker URL and the same token to the Cheshire server environment:

```bash
CLOUDFLARE_BROWSER_WORKER_URL=https://cheshire-browser-run.<subdomain>.workers.dev
CLOUDFLARE_BROWSER_WORKER_TOKEN=<same token>
```

## API

All non-health requests require `Authorization: Bearer <BROWSER_RUN_TOKEN>`.

- `GET /health`
- `POST /v1/screenshot` with `{ "url": "https://example.com" }`
- `POST /v1/extract` with `{ "url": "https://example.com", "format": "text" }`
- `POST /v1/extract` with `{ "url": "https://example.com", "format": "html" }`
