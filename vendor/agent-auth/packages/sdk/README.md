# @auth/agent

<div align="center">

**Client SDK for the Agent Auth Protocol — agent identity, registration, and capability-based authorization**

[![npm](https://img.shields.io/npm/v/@auth/agent?color=blue)](https://npmjs.com/package/@auth/agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Table of Contents

- [Why @auth/agent?](#why-authagent)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Client Configuration](#client-configuration)
- [Provider Discovery](#provider-discovery)
- [Agent Lifecycle](#agent-lifecycle)
  - [Registration](#registration)
  - [Connecting with Constraints](#connecting-with-constraints)
  - [Capability Execution](#capability-execution)
  - [Key Rotation](#key-rotation)
  - [Revocation & Reactivation](#revocation--reactivation)
- [AI Framework Integration](#ai-framework-integration)
  - [Vercel AI SDK](#vercel-ai-sdk)
  - [OpenAI Function Calling](#openai-function-calling)
  - [Anthropic Claude](#anthropic-claude)
  - [Error Handling](#error-handling)
- [SDK Tools Reference](#sdk-tools-reference)
  - [All Tools](#all-tools)
  - [Filtering Tools](#filtering-tools)
- [Constraints (Section 2.13)](#constraints-section-213)
- [Storage](#storage)
  - [Built-in Storage Adapters](#built-in-storage-adapters)
  - [Custom Storage](#custom-storage)
  - [Storage Interface](#storage-interface)
- [Subpath Imports](#subpath-imports)
- [WebAuthn / Proof of Presence](#webauthn--proof-of-presence)
- [Host Enrollment](#host-enrollment)
- [Error Codes](#error-codes)
- [TypeScript Types](#typescript-types)
- [FAQ](#faq)
- [License](#license)

---

## Why @auth/agent?

This is the official client SDK for the [Agent Auth Protocol](https://github.com/better-auth/agent-auth-protocol). It handles everything an AI agent needs to interact with agent-auth-compatible services:

- **Provider discovery** — find agent-compatible APIs
- **Agent registration** — register with Ed25519 keypairs + capability requests
- **Capability execution** — call APIs with argument-level constraint enforcement
- **AI SDK integration** — native tools for Vercel AI SDK, OpenAI, and Anthropic
- **Pluggable storage** — persist agent state with your backend of choice
- **Host enrollment** — manage host identity for multi-tenant deployments

### What This SDK Handles

| Task | Manual | With @auth/agent |
|---|---|---|
| Key generation | `tweetnacl` + Base64 encoding | `new AgentAuthClient()` auto-generates host keypair |
| Provider discovery | HTTP fetch + JSON parse | `client.discoverProvider(url)` |
| Agent registration | Ed25519 JWT construction | `client.connectAgent({ capabilities })` |
| Capability execution | JWT signing per request | `client.executeCapability({ capability, arguments })` |
| AI tool generation | Schema mapping per SDK | `toAISDKTools()`, `toOpenAITools()`, `toAnthropicTools()` |
| State persistence | Write your own DB layer | Pluggable `Storage` interface |
| Constraint enforcement | Manual validation | Built into `connectAgent` and `requestCapability` |

---

## Installation

```bash
npm install @auth/agent
# or
pnpm add @auth/agent
```

**Requirements:** Node.js ≥ 18, or compatible runtime (Edge, Bun)

---

## Quick Start

```ts
import { AgentAuthClient } from "@auth/agent";

// Initialize the client
const client = new AgentAuthClient({
  directoryUrl: "https://directory.example.com",
});

// Step 1: Discover a provider
const config = await client.discoverProvider("https://api.example.com");
// → { provider: { name, description }, capabilities: [...], registration: {...} }

// Step 2: Connect an agent with constrained capabilities
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: [
    "read_data",
    {
      name: "transfer_money",
      constraints: {
        amount: { max: 1000, min: 1 },
        currency: { in: ["USD", "EUR"] },
      },
    },
  ],
  name: "my-assistant",
});
// → { agentId, token, capabilities: [...] }

// Step 3: Execute a capability
const result = await client.executeCapability({
  agentId: agent.agentId,
  capability: "read_data",
  arguments: { id: "user-123" },
});
// → { success: true, data: {...} }
```

---

## Client Configuration

```ts
const client = new AgentAuthClient({
  // === Optional ===
  directoryUrl: "https://directory.example.com",
  // URL of the agent auth directory for provider search
  // Default: undefined (disables search/listing features)

  storage: myCustomStorage,
  // Pluggable storage backend (defaults to MemoryStorage)
  // Implement the Storage interface for persistence

  hostName: "my-agent-host",
  // Name for this host (used during host enrollment)
  // Default: "host-" + random suffix
});
```

---

## Provider Discovery

Before registering with a service, agents need to know what capabilities are available:

```ts
// Discover a single provider by URL
const config = await client.discoverProvider("https://api.example.com");
// Fetches GET /.well-known/agent-configuration
// Returns normalized provider config

// List all providers known to the client
const providers = await client.listProviders();
// → [{ url: "https://api.example.com", name: "My Service", ... }]

// Search the directory for providers by intent
const results = await client.searchProviders("transfer money");
// → [{ url: "https://payments.example.com", score: 0.95, ... }]
```

**Discovery flow:**
1. Client calls `GET {providerUrl}/.well-known/agent-configuration`
2. Provider returns capabilities, registration modes, key algorithms
3. Client caches the config locally (via Storage interface)
4. Client can now register agents with this provider

---

## Agent Lifecycle

### Registration

```ts
// Register a new agent with the provider
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  name: "my-agent",
  capabilities: ["read_data", "list_projects"],
  mode: "delegated", // or "autonomous"
  // Optionally pass constraints per capability:
  // capabilities: [
  //   "read_data",
  //   { name: "transfer_money", constraints: { amount: { max: 1000 } } }
  // ]
});

// What happens under the hood:
// 1. Generates Ed25519 keypair for the agent
// 2. Sends POST /agent/register with public key + capabilities
// 3. Receives agentId + JWT + capability grant status
// 4. Stores connection state in Storage

console.log(agent.agentId);  // "agent_xyz789"
console.log(agent.token);    // JWT for capability execution
console.log(agent.capabilities);
// [{ capability: "read_data", granted: true }, { capability: "list_projects", granted: true }]
```

### Connecting with Constraints

```ts
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  name: "constrained-agent",
  capabilities: [
    "read_data",
    {
      name: "transfer_money",
      constraints: {
        amount: { max: 1000, min: 1 },
        currency: { in: ["USD", "EUR"] },
      },
    },
    {
      name: "delete_project",
      constraints: {
        projectId: { not_in: ["prod-critical-1", "prod-critical-2"] },
      },
    },
  ],
});
```

### Capability Execution

```ts
// Execute a capability that was granted during registration
const result = await client.executeCapability({
  agentId: agent.agentId,
  capability: "transfer_money",
  arguments: {
    amount: 500,
    to: "alice",
    currency: "USD",
  },
});
// → { success: true, result: { transactionId: "txn_abc123" } }

// Execute with custom URL (if the capability has a custom location)
const result2 = await client.executeCapability({
  agentId: agent.agentId,
  capability: "custom_action",
  arguments: { param: "value" },
  url: "https://api.example.com/custom/endpoint", // override default
});

// Request additional capabilities (may require user approval)
await client.requestCapability(agent.agentId, {
  capabilities: [{ name: "admin_panel", constraints: { scope: { in: ["read"] } } }],
});

// Check agent status and active grants
const status = await client.agentStatus(agent.agentId);
// → { agentId, name, capabilities: [...], activeGrants: [...], expiresAt }
```

### Key Rotation

```ts
// Rotate the agent's keypair (generates new key, preserves all grants)
const updatedAgent = await client.rotateAgentKey(agent.agentId);
// → { agentId, token: "new-jwt...", ... }

// Old key is automatically invalidated
// All capability grants are preserved with the new key
// The SDK automatically updates its stored state
```

### Revocation & Reactivation

```ts
// Revoke an agent (invalidates JWTs, removes all grants)
await client.disconnectAgent(agent.agentId);
// The agent can no longer execute capabilities
// State is removed from storage

// Reactivate a previously revoked agent
const reactivated = await client.reactivateAgent(agent.agentId);
// → { agentId, token: "new-jwt...", ... }
// Re-registers with the provider
// New capabilities must be requested if old grants expired
```

---

## AI Framework Integration

The SDK can auto-generate LLM tool definitions from provider capabilities, enabling AI models to directly call agent-authorized APIs.

### Vercel AI SDK

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { AgentAuthClient, getAgentAuthTools, toAISDKTools } from "@auth/agent";

const client = new AgentAuthClient();
const rawTools = getAgentAuthTools(client);
const tools = await toAISDKTools(rawTools);

const { text, toolCalls } = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Transfer $50 to Alice in USD",
  maxSteps: 5, // Allow the model to make multiple tool calls
});
```

**Pass jsonSchema explicitly** (avoids dynamic import):

```ts
import { jsonSchema } from "ai";
const tools = await toAISDKTools(getAgentAuthTools(client), { jsonSchema });
```

**What the AI SDK integration does:**
- Each agent capability becomes a tool the LLM can call
- JSON Schema input definitions are auto-converted to AI SDK tool schemas
- Capability constraints are reflected in the tool descriptions
- The LLM can choose which capability to call based on the user's prompt
- Execution results are returned to the LLM for follow-up

### OpenAI Function Calling

```ts
import OpenAI from "openai";
import { AgentAuthClient, getAgentAuthTools, toOpenAITools } from "@auth/agent";

const openai = new OpenAI();
const client = new AgentAuthClient();
const { definitions, execute } = toOpenAITools(getAgentAuthTools(client), {
  strict: true, // Enforce structured outputs — prevents hallucinated arguments
});

const messages = [{ role: "user", content: "Transfer $50 to Alice" }];

const res = await openai.chat.completions.create({
  model: "gpt-4o",
  tools: definitions,
  messages,
});

// Execute any tool calls the model made
for (const call of res.choices[0].message.tool_calls ?? []) {
  const result = await execute(call.function.name, JSON.parse(call.function.arguments));
  console.log(`${call.function.name}:`, result);
}
```

**OpenAI-specific features:**
- `strict: true` enables OpenAI structured outputs mode
- This guarantees the model only produces valid JSON for arguments
- Prevents hallucinated capability names or invalid argument types
- Auto-maps capability JSON Schemas to OpenAI function schemas

### Anthropic Claude

```ts
import Anthropic from "@anthropic-ai/sdk";
import { AgentAuthClient, getAgentAuthTools, toAnthropicTools } from "@auth/agent";

const anthropic = new Anthropic();
const client = new AgentAuthClient();
const { definitions, processToolUse } = toAnthropicTools(getAgentAuthTools(client));

const messages: Anthropic.MessageParam[] = [
  { role: "user", content: "Transfer $50 to Alice" },
];

const res = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  tools: definitions,
  messages,
});

// Process tool use blocks from Claude's response
const toolUseBlocks = res.content.filter((b) => b.type === "tool_use");
if (toolUseBlocks.length > 0) {
  const results = await processToolUse(toolUseBlocks);

  // Send results back to Claude for follow-up
  messages.push(
    { role: "assistant", content: res.content },
    { role: "user", content: results }
  );

  const followUp = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    tools: definitions,
    messages,
  });
}
```

**Claude-specific features:**
- Auto-maps capability schemas to Anthropic tool definitions
- Processes `tool_use` blocks and returns formatted results for the conversation
- Supports multi-turn tool use (Claude can make multiple tool calls in sequence)

### Error Handling

All adapters wrap tool execution errors as structured objects instead of throwing exceptions. This lets LLMs recover gracefully from errors:

```json
// On success:
{ "success": true, "data": { "id": "user-123", "name": "Alice" } }

// On capability not granted:
{ "error": "Capability not granted", "code": "capability_not_granted" }

// On constraint violation:
{ "error": "Argument 'amount' exceeds maximum constraint of 1000", "code": "constraint_violated" }

// On auth failure:
{ "error": "Agent session expired", "code": "agent_expired" }
```

The LLM can see these error messages in context and:
- Try a different approach (e.g., lower transfer amount)
- Ask the user for clarification
- Re-register or re-authenticate if the session expired

---

## SDK Tools Reference

### All Tools

The SDK exposes protocol tools that map to the agent lifecycle:

| Tool | Description | Method |
|---|---|---|
| `list_providers` | List discovered/configured providers | `client.listProviders()` |
| `search_providers` | Search registry by intent | `client.searchProviders(intent)` |
| `discover_provider` | Look up a provider by URL | `client.discoverProvider(url)` |
| `list_capabilities` | List provider capabilities | `client.listCapabilities(provider)` |
| `describe_capability` | Get full capability definition | `client.describeCapability(provider, name)` |
| `connect_agent` | Register an agent (with optional constraints) | `client.connectAgent(params)` |
| `execute_capability` | Execute a granted capability | `client.executeCapability(params)` |
| `request_capability` | Request additional capabilities | `client.requestCapability(agentId, params)` |
| `agent_status` | Check agent status and grants | `client.agentStatus(agentId)` |
| `sign_jwt` | Sign an agent JWT manually | `client.signJwt(agentId, claims)` |
| `disconnect_agent` | Revoke an agent | `client.disconnectAgent(agentId)` |
| `reactivate_agent` | Reactivate an expired agent | `client.reactivateAgent(agentId)` |
| `rotate_agent_key` | Rotate agent keypair | `client.rotateAgentKey(agentId)` |
| `rotate_host_key` | Rotate host keypair | `client.rotateHostKey(issuer)` |
| `enroll_host` | Enroll host with enrollment token | `client.enrollHost(token)` |
| `list_connections` | List agent connections for an issuer | `client.listConnections(issuer)` |
| `get_connection` | Get a stored connection | `client.getConnection(agentId)` |

### Filtering Tools

Use `filterTools` to expose only the tools your agent needs:

```ts
import { getAgentAuthTools, filterTools } from "@auth/agent";

const allTools = getAgentAuthTools(client);

// Minimal — only execution and status
const minimal = filterTools(allTools, {
  only: ["execute_capability", "agent_status"],
});

// Safe — exclude sensitive operations
const safe = filterTools(allTools, {
  exclude: ["sign_jwt", "rotate_host_key", "disconnect_agent"],
});

// By category — capability-related only
const capabilityOnly = filterTools(allTools, {
  pattern: /capability/, // matches list_capabilities, describe_capability, execute_capability, request_capability
});
```

**When to filter tools:**
- Production agents that only need `execute_capability` and `agent_status`
- User-facing agents where key rotation should be admin-only
- CI/CD agents that shouldn't modify host configuration
- Read-only agents that should never request new capabilities

---

## Constraints (Section 2.13)

Pass constraints when connecting or requesting capabilities to restrict argument values:

```ts
await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: [
    "read_data",
    {
      name: "transfer_money",
      constraints: {
        amount: { max: 1000, min: 1 },
        currency: { in: ["USD", "EUR"] },
      },
    },
  ],
});
```

Constraint grants are returned in the agent's `capabilityGrants[].constraints`:

```ts
const status = await client.agentStatus(agent.agentId);
console.log(status.capabilities);
// [{ capability: "transfer_money", constraints: { amount: { max: 1000 }, currency: { in: ["USD", "EUR"] } } }]
```

---

## Storage

The SDK uses pluggable storage for persisting host identity, agent connections, and provider configs.

### Built-in Storage Adapters

| Adapter | Persistence | Use Case |
|---|---|---|
| `MemoryStorage` (default) | None (in-memory only) | Development, testing, stateless agents |
| `FileStorage` (in `@auth/agent-cli`) | Filesystem | Local CLI usage, single-machine agents |
| Custom (implement `Storage`) | Your choice | Production databases, KV stores, etc. |

### Custom Storage

```ts
import { AgentAuthClient } from "@auth/agent";
import type { Storage } from "@auth/agent";

class PostgresStorage implements Storage {
  async getHostIdentity(issuer: string) { /* query DB */ }
  async setHostIdentity(issuer: string, identity: HostIdentity) { /* upsert DB */ }
  async deleteHostIdentity(issuer: string) { /* delete DB */ }
  async getAgentConnection(agentId: string) { /* query DB */ }
  async setAgentConnection(agentId: string, connection: AgentConnection) { /* upsert DB */ }
  async deleteAgentConnection(agentId: string) { /* delete DB */ }
  async getProviderConfig(url: string) { /* query DB */ }
  async setProviderConfig(url: string, config: ProviderConfig) { /* upsert DB */ }
  async listProviderConfigs() { /* query DB */ }
}

const client = new AgentAuthClient({
  storage: new PostgresStorage(),
});
```

### Storage Interface

```ts
interface Storage {
  // Host identity — the keypair for this host
  getHostIdentity(issuer: string): Promise<HostIdentity | null>;
  setHostIdentity(issuer: string, identity: HostIdentity): Promise<void>;
  deleteHostIdentity(issuer: string): Promise<void>;

  // Agent connections — per-agent state, grants, and keypairs
  getAgentConnection(agentId: string): Promise<AgentConnection | null>;
  setAgentConnection(agentId: string, connection: AgentConnection): Promise<void>;
  deleteAgentConnection(agentId: string): Promise<void>;

  // Provider configs — cached discovery documents
  getProviderConfig(url: string): Promise<ProviderConfig | null>;
  setProviderConfig(url: string, config: ProviderConfig): Promise<void>;
  listProviderConfigs(): Promise<ProviderConfig[]>;
}
```

---

## Subpath Imports

For lighter imports when you only need tools + adapters (no client, crypto, or storage):

```ts
// Full SDK (includes client, crypto, storage, tools)
import { AgentAuthClient, getAgentAuthTools, toAISDKTools } from "@auth/agent";

// Tools-only (lighter, no client state)
import { getAgentAuthTools, toOpenAITools, filterTools } from "@auth/agent/tools";

// Storage interface only (for implementing custom storage)
import type { Storage } from "@auth/agent/storage";
```

**Bundle size comparison:**
- Full SDK: ~45KB gzipped (includes client, crypto, storage, tools)
- Tools-only: ~12KB gzipped (adapters only, no client state)

---

## WebAuthn / Proof of Presence

When a provider requires WebAuthn proof-of-presence for a capability:

```ts
// The execute call will throw with a WebAuthn challenge
try {
  await client.executeCapability({
    agentId: agent.agentId,
    capability: "delete_project",
    arguments: { projectId: "proj-123" },
  });
} catch (error) {
  if (error.code === "webauthn_required") {
    // error.options contains the WebAuthn challenge
    const assertion = await navigator.credentials.get({
      publicKey: error.options,
    });

    // Retry with the WebAuthn assertion
    await client.executeCapability({
      agentId: agent.agentId,
      capability: "delete_project",
      arguments: { projectId: "proj-123" },
      webauthnAssertion: assertion,
    });
  }
}
```

---

## Host Enrollment

Manage host identity for deployments where the host needs its own on-chain or provider-registered identity:

```ts
// Enroll this host with a provider using an enrollment token
const host = await client.enrollHost("enrollment-token-from-provider");
// → { hostId, issuer, publicKey, enrolledAt }

// List all agents connected by this host
const connections = await client.listConnections(host.issuer);
// → [{ agentId, provider, name, capabilities, connectedAt }]

// Rotate the host's keypair
await client.rotateHostKey(host.issuer);
// All agent connections are re-signed with the new host key
```

---

## Error Codes

| Code | Description | Recovery |
|---|---|---|
| `capability_not_granted` | Agent hasn't been granted this capability | Request the capability |
| `constraint_violated` | Argument violates a constraint | Adjust the argument value |
| `agent_expired` | Agent session expired | Reactivate or re-register |
| `agent_revoked` | Agent has been revoked | Re-register the agent |
| `provider_not_found` | Provider discovery failed | Check the URL |
| `registration_failed` | Agent registration rejected | Check capability constraints |
| `webauthn_required` | Capability needs biometric proof | Complete WebAuthn ceremony |
| `network_error` | Network request failed | Retry with backoff |
| `storage_error` | Storage operation failed | Check storage backend |

---

## TypeScript Types

```ts
import type {
  AgentAuthClient,       // Main client class
  AgentConnection,       // { agentId, token, provider, name, capabilities, keypair, ... }
  ProviderConfig,        // Parsed discovery document
  Capability,            // { name, description, input, approvalStrength, ... }
  CapabilityGrant,       // { capability, constraints, grantedAt, expiresAt }
  CapabilityConstraint,  // { max?, min?, in?, not_in?, eq? }
  HostIdentity,          // { hostId, issuer, publicKey, privateKey }
  Storage,               // Storage interface
  ExecuteResult,         // { success: boolean, [key: string]: any }
  AgentMode,             // "delegated" | "autonomous"
} from "@auth/agent";
```

---

## FAQ

### Do I need to manage Ed25519 keypairs manually?

No. The SDK auto-generates keypairs during registration. Manual key management is available via `signJwt()` if you need custom flows.

### How do agents persist across restarts?

Use a persistent Storage implementation (database, KV store, filesystem). The default `MemoryStorage` loses everything on restart.

### Can I use this with non-JavaScript agents?

Yes. The protocol is HTTP-based. The SDK handles JWT signing and request formatting, but any language with Ed25519 support can implement the protocol directly.

### What happens if the provider changes its capabilities?

Call `client.discoverProvider(url)` to refresh the cached configuration. Compare the new capabilities list against the agent's current grants to see what's changed.

### Can agents have capabilities from multiple providers?

Yes. Each agent connection is scoped to a single provider, but you can create multiple agent connections across different providers.

### Is there rate limiting?

The SDK does not enforce rate limits, but providers may. Implement exponential backoff in your custom `executeCapability` wrapper if needed.

---

## License

MIT