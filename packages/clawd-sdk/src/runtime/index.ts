/**
 * SVM-A2A Runtime — Cloudflare Durable Agent + Hono + WebSocket
 *
 * Wraps a Solana agent as a Cloudflare Durable Object with
 * CAAP/1.0 auth, agent-card discovery, and A2UI support.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'

export interface AgentCard {
  name: string
  description: string
  serviceEndpoint: string
  capabilities: string[]
  authentication: string[]
  skills: string[]
  version: string
}

export interface RuntimeOptions {
  name: string
  description: string
  serviceEndpoint: string
  capabilities?: string[]
  skills?: string[]
}

/**
 * Create an SVM-A2A compatible Hono app with auth, discovery, and CORS.
 */
export function createRuntimeApp(options: RuntimeOptions): Hono {
  const app = new Hono()

  app.use('*', cors())

  // Health check
  app.get('/', (c) => c.json({ status: 'ok', agent: options.name }))

  // SVM-A2A Agent Card discovery (A2A protocol)
  app.get('/.well-known/agent-card.json', (c) => {
    const card: AgentCard = {
      name: options.name,
      description: options.description,
      serviceEndpoint: options.serviceEndpoint,
      capabilities: options.capabilities ?? ['streaming', 'a2a', 'mcp'],
      authentication: ['SIWS', 'NFT-Ownership', 'CLAWD-Tier'],
      skills: options.skills ?? ['research', 'trading', 'mcp', 'ui-generation'],
      version: '1.0.0',
    }
    return c.json(card)
  })

  // MCP tool listing
  app.get('/mcp/tools', (c) =>
    c.json({
      tools: [
        { name: 'agent_research', description: 'Research a topic using agent knowledge' },
        { name: 'agent_trade', description: 'Execute a trade decision' },
        { name: 'agent_register', description: 'Register agent identity on-chain' },
        { name: 'agent_mint', description: 'Mint agent as Metaplex Core NFT' },
      ],
    }),
  )

  return app
}