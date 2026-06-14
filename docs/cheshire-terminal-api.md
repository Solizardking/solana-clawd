# Cheshire Terminal API

Cheshire Terminal exposes one API surface for app users, external developers, and autonomous agents.

## Base URLs

- Production app and API: `https://cheshireterminal.ai`
- API status: `GET /api/developer/status`
- OpenAPI: `GET /api/developer/openapi.json`
- LLM discovery: `GET /api/developer/llms.txt`
- Agent discovery: `GET /.well-known/agent-configuration`

## Authentication

### Users

Browser users authenticate with the hosted Clerk account portal and the wallet session gate. First-party app requests use the existing session cookie.

For direct API calls, pass a Clerk JWT:

```bash
curl https://cheshireterminal.ai/api/developer/status \
  -H "Authorization: Bearer <clerk-jwt>"
```

Server verification accepts the configured Clerk issuer and JWKS.

## Discovery

Machine clients should read the OpenAPI document:

```bash
curl https://cheshireterminal.ai/api/developer/openapi.json
```

LLM agents can read the compact text index:

```bash
curl https://cheshireterminal.ai/api/developer/llms.txt
```

The status and LLM discovery endpoints also expose runtime integration readiness without leaking secrets:

- `auth.clerkBearer.configured` confirms Clerk bearer verification inputs are present.
- `auth.apiKey.configured` confirms database-backed API key storage is available.
- `integrations.telegram.configured` confirms the bot token is present.
- `integrations.honcho.configured` confirms `HONCHO_API_KEY` is present for persistent memory across Telegram, arena, agents, wallet sessions, and trades.
- `integrations.birdeye.configured` confirms `BIRDEYE_API_KEY` is present for Telegram market commands, token analytics, wallet intelligence, and perps data.

### Developers

Developers create Cheshire API keys from an authenticated account:

```bash
curl -X POST https://cheshireterminal.ai/api/developer/keys \
  -H "Authorization: Bearer <clerk-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"local dev","scopes":["api:*"]}'
```

The response includes the full key once. Store it immediately. The database stores only a SHA-256 hash.

Use the key as either header:

```bash
curl https://cheshireterminal.ai/api/health \
  -H "Authorization: Bearer ct_sk_..."
```

```bash
curl https://cheshireterminal.ai/api/health \
  -H "x-api-key: ct_sk_..."
```

List active keys:

```bash
curl https://cheshireterminal.ai/api/developer/keys \
  -H "Authorization: Bearer <clerk-jwt>"
```

Revoke a key:

```bash
curl -X DELETE https://cheshireterminal.ai/api/developer/keys/<id> \
  -H "Authorization: Bearer <clerk-jwt>"
```

## Scopes

Initial supported scopes:

- `api:*` allows normal authenticated API routes.
- `admin:*` allows admin routes only when intentionally issued to a trusted operator.
- `route:<namespace>:*` allows a route family such as `route:ai:*`.
- `route:<method>:/api/path` allows a single method/path pair such as `route:get:/api/health`.

Public read routes remain public and do not require a key.

## Agents

Agents should discover capabilities at:

```text
/.well-known/agent-configuration
```

Agent-hosted integrations can call capability URLs with a valid Better Auth agent token or a Cheshire API key scoped to the route family they need.

## Operational Notes

- API keys are hash-only at rest.
- Key use updates `last_used_at` and writes an audit event.
- Revocation is implemented by expiring the key immediately.
- Paid AI/provider routes accept wallet sessions, Clerk JWTs, or scoped Cheshire API keys.
- `npm run smoke:clerk -- https://cheshireterminal.ai` verifies Clerk issuer/JWKS discovery and confirms malformed Clerk bearer tokens are rejected by the protected developer key route.
- `npm run check:api` audits required auth infrastructure and warns when Telegram, Honcho, Birdeye, or Better Auth optional integrations are missing from the current shell environment.
- `npm run smoke:api-key -- https://cheshireterminal.ai` requires `DATABASE_URL` and verifies the database-backed API key lifecycle against the live HTTP API: insert a temporary hash-only key, use it against a gated route, confirm `lastUsedAt` and audit logging, expire it, and confirm the expired key is rejected.
