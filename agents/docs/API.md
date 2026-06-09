# Solana Clawd Agents API Documentation

## Overview

The **Solana Clawd Agents API** is a RESTful JSON + MCP + A2A surface providing access to production-ready AI agent definitions for Solana DeFi, trading, NFT, and on-chain workflows. All agents are auto-translated to 18 languages.

This is the data layer behind the [/agents](https://x402.wtf/agents) hub — anything you see there (install buttons, agent cards, localized prompts, on-chain registration) is driven by these endpoints.

For paid agents, this API layer is only one half of the system. The payment runtime behind x402-backed agents lives in [`../../solana-clawd-x402/`](../../solana-clawd-x402/README.md). Use [`X402_IMPLEMENTATION.md`](./X402_IMPLEMENTATION.md) to map API-facing agent IDs to the gateway, Worker, SDK, and vault implementation.

### Base URLs

- Static JSON API (CDN): `https://x402.wtf`
- Hub + dynamic endpoints: `https://x402.wtf`
- MCP Streamable HTTP: `https://modelcontextprotocol.name/mcp/solana-clawd agents`

---

## Endpoints

## x402-backed agent surfaces

The `/agents` API publishes definitions for paid agents such as:

- `solana-clawd-payment-gateway`
- `solana-x402-provider-catalog`
- `solana-x402-solana-rpc-broker`
- `solana-x402-market-data-buyer`
- `solana-x402-provider-author`
- `solana-x402-research-broker`
- `solana-x402-signal-monetizer`
- `solana-x402-webhook-settlement`

Those JSON documents are catalog and registry surfaces. Their payment execution path is implemented in:

- [`../../solana-clawd-x402/worker/src/index.ts`](../../solana-clawd-x402/worker/src/index.ts)
- [`../../solana-clawd-x402/worker/src/protocols/`](../../solana-clawd-x402/worker/src/protocols/)
- [`../../solana-clawd-x402/worker/src/solana/`](../../solana-clawd-x402/worker/src/solana/)
- [`../../solana-clawd-x402/sdk/src/index.ts`](../../solana-clawd-x402/sdk/src/index.ts)

### 1. Get All Agents (English)

Retrieve the complete index of all Solana Clawd agents in English.

```text
GET /index.json
```

**Response**: Array of agent objects with full definitions.

```bash
curl https://x402.wtf/index.json | jq '.[] | {id: .identifier, name: .meta.title}'
```

---

### 2. Get Agents in Specific Language

```text
GET /index.{locale}.json
```

**Supported locales**: `en-US`, `ar`, `bg-BG`, `zh-CN`, `zh-TW`, `de-DE`, `es-ES`, `fa-IR`, `fr-FR`, `it-IT`, `ja-JP`, `ko-KR`, `nl-NL`, `pl-PL`, `pt-BR`, `ru-RU`, `tr-TR`, `vi-VN`.

```bash
curl https://x402.wtf/index.zh-CN.json
```

---

### 3. Get Single Agent

```text
GET /{agent-id}.json
```

```bash
curl https://x402.wtf/solana-portfolio-manager.json
```

---

### 4. Get Single Agent in Specific Language

```text
GET /{agent-id}.{locale}.json
```

```bash
curl https://x402.wtf/solana-portfolio-manager.fr-FR.json
```

---

### 5. Agent Manifest (Machine-Readable Index)

Structured metadata for AI crawlers, MCP clients, and indexers. Includes stats, categories, install URLs, and on-chain registration pointers.

```text
GET /agents-manifest.json
```

```bash
curl https://x402.wtf/agents-manifest.json | jq '.stats'
```

---

### 6. Hosted Agent Registry (Dynamic)

List all agents registered at the hub, including externally-hosted agents discovered via A2A and agents minted as MPL Core assets on Solana.

```text
GET https://x402.wtf/api/agents/hosted
```

Returns:

```json
{
  "agents": [
    {
      "identifier": "solana-portfolio-manager",
      "homepage": "https://x402.wtf/agents/solana-portfolio-manager",
      "a2a": "https://x402.wtf/api/agents/a2a",
      "source": "repo",
      "onchainAddress": null
    },
    {
      "identifier": "external-pumpfun-sniper",
      "homepage": "https://example.com/sniper",
      "a2a": "https://example.com/a2a",
      "source": "external",
      "onchainAddress": "AgentAsSet1111..."
    }
  ]
}
```

---

### 7. Agent-to-Agent (A2A) Endpoint

Send a message to any hub agent. Supports JSON-RPC over HTTP.

```text
POST https://x402.wtf/api/agents/a2a
```

For payment-gated A2A flows, the request catalog lives here, while the challenge / verify / settle path is implemented in [`../../solana-clawd-x402/worker/src/protocols/a2a.ts`](../../solana-clawd-x402/worker/src/protocols/a2a.ts).

```bash
curl -X POST https://x402.wtf/api/agents/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "message/send",
    "params": {
      "agent": "solana-portfolio-manager",
      "message": { "role": "user", "content": "Review pubkey 7xKX... and flag liquidation risks" }
    }
  }'
```

---

### 8. MPL Core Mint Registration Template

Fetch the canonical metadata template for minting your agent as an on-chain MPL Core asset.

```text
GET https://x402.wtf/api/agents/registration-template.json
GET https://x402.wtf/api/agents/nft-metadata.json?identifier=<agent-id>
```

Use at [/agents-mint](https://x402.wtf/agents-mint) — see [DEPLOYMENT.md](./DEPLOYMENT.md) for the full mint flow.

---

## Agent Schema

```typescript
interface Agent {
  author: string;                 // GitHub handle or Solana pubkey
  identifier: string;             // Unique ID, URL-safe
  meta: {
    title: string;
    description: string;
    avatar: string;               // Single emoji
    tags: string[];               // 3–8 Solana-focused keywords
    category:
      | "defi" | "trading" | "nft" | "analytics"
      | "security" | "dev-tools" | "education" | "governance";
  };
  schemaVersion: 1;
  config: {
    systemRole: string;
    openingMessage?: string;
    openingQuestions?: string[];
  };
  examples?: Array<{ role: "user" | "assistant"; content: string }>;
  homepage?: string;
  createdAt: string;              // ISO date
  knowledgeCount?: number;
  pluginCount?: number;
  tokenUsage?: number;
  summary?: string;
  onchain?: {
    assetAddress?: string;        // MPL Core asset pubkey (if minted)
    collection?: string;          // Optional collection address
    updateAuthority?: string;
  };
}
```

---

## Response Format

- **Encoding**: UTF-8
- **Content-Type**: `application/json`
- **Status Codes**: `200` success, `404` not found, `500` server error
- **CORS**: Enabled for all origins on static endpoints; hub endpoints honor an allow-list (see [DEPLOYMENT.md](./DEPLOYMENT.md))

---

## Integration Examples

### Python

```python
import requests

# List Solana Solana Clawd agents
agents = requests.get("https://x402.wtf/index.json").json()
defi = [a for a in agents if a["meta"]["category"] == "defi"]
print(f"Found {len(defi)} Solana Solana Clawd agents")

# Load a localized agent
agent = requests.get("https://x402.wtf/solana-portfolio-manager.es-ES.json").json()
```

### TypeScript / Node.js

```typescript
// Fetch all agents
const agents = await fetch("https://x402.wtf/index.json").then(r => r.json());

// Filter by Solana-native tag
const jupiterAgents = agents.filter(a => a.meta.tags.includes("jupiter"));

// Send an A2A message
const res = await fetch("https://x402.wtf/api/agents/a2a", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "message/send",
    params: {
      agent: "solana-sentiment-analyzer",
      message: { role: "user", content: "What's the mood on $JUP today?" },
    },
  }),
}).then(r => r.json());
```

### cURL Quick Reference

```bash
# All agents
curl https://x402.wtf/index.json

# Single agent in Chinese
curl https://x402.wtf/solana-portfolio-manager.zh-CN.json

# Count total agents
curl https://x402.wtf/index.json | jq 'length'

# Live registry (including externally-hosted)
curl https://x402.wtf/api/agents/hosted | jq '.agents[].identifier'
```

---

## React Component

```tsx
import { useEffect, useState } from "react";

export function AgentGallery({ category }: { category?: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  useEffect(() => {
    fetch("https://x402.wtf/index.json")
      .then(r => r.json())
      .then(all => setAgents(category ? all.filter(a => a.meta.category === category) : all));
  }, [category]);

  return (
    <div className="grid grid-cols-3 gap-4">
      {agents.map(a => (
        <a key={a.identifier} href={`https://x402.wtf/agents/${a.identifier}`}>
          <div className="p-4 rounded-xl border">
            <div className="text-3xl">{a.meta.avatar}</div>
            <h3>{a.meta.title}</h3>
            <p className="text-sm opacity-70">{a.meta.description}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
```

---

## MCP Client Integration

Plug the hub into Clawd Desktop, Cursor, or ClawdOS via Streamable HTTP:

```json
{
  "mcpServers": {
    "openclawd-agents": {
      "type": "http",
      "url": "https://modelcontextprotocol.name/mcp/solana-clawd agents"
    }
  }
}
```

Exposed tools (subset): `get_price`, `get_market_overview`, `get_trending`, `get_defi_protocols`, `get_protocol_detail`, `get_chain_tvl`, `get_yield_opportunities`.

---

## Rate Limits

- **Static CDN** (`x402.wtf`): No rate limit. Cached via GitHub Pages / Cloudflare.
- **Dynamic hub** (`x402.wtf`): 60 req/min per IP on public endpoints; higher for authenticated clients.

Recommended caching header for consumers:

```http
Cache-Control: public, max-age=3600
```

---

## CORS

```javascript
// Works from any origin
fetch("https://x402.wtf/index.json")
  .then(r => r.json())
  .then(console.log);
```

Hub endpoints (`/api/agents/*`) require `Origin` to be in the allow-list — add yours via PR to `vercel.json` or use the MCP endpoint as a proxy.

---

## Error Handling

```javascript
async function safeLoadAgent(identifier) {
  try {
    const res = await fetch(`https://x402.wtf/${identifier}.json`);
    if (!res.ok) throw new Error(`Agent not found: ${identifier}`);
    return await res.json();
  } catch (err) {
    console.error("Failed to load agent:", err);
    return null;
  }
}
```

---

## Agent Categories

### 🪙 Solana DeFi (primary)

Jupiter routing, Kamino vaults, MarginFi lending, Drift perps, Meteora DLMM, Orca Whirlpools, Sanctum LST, Sanctum Infinity, Save, Solend, Marinade, Jito.

### 📈 Trading & Memecoins

Pump.fun screening, Raydium CPMM analysis, Phoenix orderbook, Birdeye flow tracking, Dexscreener alerts, MEV/sandwich detection.

### 🎨 NFT & MPL Core

Tensor and Magic Eden floor analysis, MPL Core asset minting, cNFT workflows, royalty enforcement, Metaplex Bubblegum.

### 🛠️ Dev & Security

Anchor program auditing, IDL explainers, Squads multisig workflows, priority-fee estimators, transaction simulation (LiteSVM / Mollusk / Surfpool).

### 📚 Research & Education

SVM internals, validator economics, stake delegation, Realms governance, SPL launch tokenomics.

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for version history, new agents, and schema changes.

---

## Support

- **Repo**: <https://github.com/clawdsolana/OpenClawd>
- **Issues**: <https://github.com/clawdsolana/OpenClawd/issues>
- **Hub**: <https://x402.wtf/agents>
- **Registry**: <https://x402.wtf/agents-registry>
- **Mint**: <https://x402.wtf/agents-mint>
- **Contributing**: see [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## License

MIT — see [LICENSE](../LICENSE) for details. Free for commercial and personal use.
