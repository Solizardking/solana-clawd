# Agent Auth Plugin

<div align="center">

**Better Auth plugin for the Agent Auth Protocol — agent-based authentication and capability authorization**

[![npm](https://img.shields.io/npm/v/@better-auth/agent-auth?color=blue)](https://npmjs.com/package/@better-auth/agent-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: Agent Auth](https://img.shields.io/badge/Protocol-Agent%20Auth-green)](https://github.com/nicepkg/agent-auth-protocol)

</div>

---

## Table of Contents

- [Why agent-auth?](#why-agent-auth)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Basic Setup](#basic-setup)
  - [Expose Discovery Document](#expose-discovery-document)
- [Configuration Reference](#configuration-reference)
  - [Plugin Options](#plugin-options)
  - [Capability Definition](#capability-definition)
  - [onExecute Handler](#onexecute-handler)
- [Constraints (Section 2.13)](#constraints-section-213)
  - [Constraint Operators](#constraint-operators)
  - [Client-Side Constraints](#client-side-constraints)
  - [Constraint Validation](#constraint-validation)
- [Proof of Presence / WebAuthn (Section 8.11)](#proof-of-presence--webauthn-section-811)
  - [Configuring Approval Strength](#configuring-approval-strength)
  - [Approval Strength Levels](#approval-strength-levels)
  - [The WebAuthn Ceremony](#the-webauthn-ceremony)
  - [OpenAPI Integration](#openapi-integration)
- [Endpoint Reference](#endpoint-reference)
  - [All Registered Endpoints](#all-registered-endpoints)
  - [Request/Response Examples](#requestresponse-examples)
- [Agent Lifecycle](#agent-lifecycle)
  - [Registration](#registration)
  - [Capability Request](#capability-request)
  - [Capability Execution](#capability-execution)
  - [Key Rotation](#key-rotation)
  - [Revocation](#revocation)
- [Agent session outside onExecute](#agent-session-outside-onexecute)
  - [Using auth.api.getAgentSession](#using-authapigetagentsession)
  - [Using verifyAgentRequest](#using-verifyagentrequest)
- [OpenAPI Auto-Generation](#openapi-auto-generation)
- [Host Management](#host-management)
- [Security Considerations](#security-considerations)
- [Error Codes](#error-codes)
- [FAQ](#faq)
- [License](#license)

---

## Why agent-auth?

Traditional API authentication assumes a human user sitting behind every request. AI agents operate differently:

1. **Agents act autonomously** — they make decisions, call APIs, and execute capabilities without a human clicking "approve" each time
2. **Agents need scoped access** — you wouldn't give an agent full admin access; you'd grant it exactly what it needs
3. **Agents can be delegated** — a human delegates specific capabilities to their agent, with constraints on what it can do
4. **Sensitive operations need proof of presence** — some capabilities (like deleting projects or transferring large amounts) should require the human to be physically present

The Agent Auth Protocol solves all four. This plugin implements it as a Better Auth plugin — drop it in, define your capabilities, and agents can register, request access, and execute within their granted scope.

### What You Get

| Concern | Without This Plugin | With This Plugin |
|---|---|---|
| Agent registration | Build custom key-pair management | Built-in Ed25519 key registration with constraints |
| Capability execution | Write per-endpoint auth middleware | Single `onExecute` handler + constraint validation |
| Scoped access | Manual checks on every argument | Declarative constraints on capabilities |
| Non-human auth | JWT-only without agent awareness | Agent-specific JWT with capability grants embedded |
| WebAuthn gating | Build custom WebAuthn integration | `approvalStrength: "webauthn"` per capability |
| OpenAPI → capabilities | Translate specs manually | `createFromOpenAPI(spec)` auto-generates capabilities |
| Key rotation | Manual key distribution | `/agent/rotate-key` with automatic re-registration |
| Host enrollment | Manual token management | `/host/create` + `/host/enroll` with enrollment tokens |

---

## How It Works

```
┌─────────┐                    ┌──────────────────────┐              ┌─────────────┐
│  Agent   │                    │  Better Auth Server   │              │  Resource   │
│  (Client)│                    │  (agent-auth plugin)  │              │  (Your API) │
└────┬────┘                    └──────────┬───────────┘              └──────┬──────┘
     │                                    │                                 │
     │  1. Discover provider              │                                 │
     │  GET /.well-known/agent-config     │                                 │
     │◄───────────────────────────────────│                                 │
     │  capabilities, registration modes  │                                 │
     │                                    │                                 │
     │  2. Register agent                 │                                 │
     │  POST /agent/register              │                                 │
     │  (Ed25519 public key, capabilities)│                                 │
     │◄───────────────────────────────────│                                 │
     │  agentId, JWT                      │                                 │
     │                                    │                                 │
     │  3. Execute capability             │                                 │
     │  POST /capability/execute          │                                 │
     │  Authorization: Bearer <JWT>       │                                 │
     │  { capability: "read_data", ... }  │                                 │
     │◄───────────────────────────────────│                                 │
     │  { success: true, data: ... }      │                                 │
     │                                    │                                 │
     │  OR: Execute on your own route     │                                 │
     │────────────────────────────────────┼────────────────────────────────►│
     │  Authorization: Bearer <JWT>       │                                 │
     │  GET /api/data                     │                                 │
     │◄───────────────────────────────────│◄────────────────────────────────│
     │  Data (after server verifies JWT)  │                                 │
     │                                    │                                 │
```

---

## Installation

```bash
npm install @better-auth/agent-auth better-auth
# or
pnpm add @better-auth/agent-auth better-auth
```

**Requirements:**
- `better-auth` ≥ 1.0
- Node.js ≥ 18
- For WebAuthn support: also install `better-auth` with passkey plugin

---

## Quick Start

### Basic Setup

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      providerName: "my-service",
      providerDescription: "My API service for agent interactions",
      capabilities: [
        {
          name: "read_data",
          description: "Read user data",
          input: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
        {
          name: "transfer_money",
          description: "Transfer funds between accounts",
          approvalStrength: "webauthn", // requires biometric verification
          input: {
            type: "object",
            required: ["amount", "to"],
            properties: {
              amount: { type: "number", description: "Amount to transfer" },
              to: { type: "string", description: "Recipient account ID" },
              currency: { type: "string", description: "Currency code" },
            },
          },
        },
      ],
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        // Handle capability execution
        // args are already validated against constraints
        // agentSession contains the authenticated agent's info

        switch (capability) {
          case "read_data":
            const data = await db.users.findById(args.id);
            return { success: true, data };

          case "transfer_money":
            const result = await transferFunds(args);
            return { success: true, result };

          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
      },
    }),
  ],
});
```

### Expose Discovery Document

**Critical:** You must expose the discovery document at `/.well-known/agent-configuration` in your app for agents to discover your provider. This is REQUIRED per the Agent Auth Protocol specification.

#### Next.js App Router

```ts
// app/.well-known/agent-configuration/route.ts
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  return auth.api.getAgentConfiguration({ headers: req.headers });
}
```

#### Next.js Pages Router

```ts
// pages/.well-known/agent-configuration.ts
import { auth } from "@/lib/auth";

export default async function handler(req, res) {
  const response = await auth.api.getAgentConfiguration({ headers: req.headers });
  // Forward the response
  res.status(response.status).json(await response.json());
}
```

#### Express / Generic Node.js

```ts
app.get("/.well-known/agent-configuration", async (req, res) => {
  const response = await auth.api.getAgentConfiguration({
    headers: new Headers(req.headers as Record<string, string>),
  });
  res.status(response.status).json(await response.json());
});
```

---

## Configuration Reference

### Plugin Options

| Option | Type | Default | Description |
|---|---|---|---|
| `providerName` | `string` | **Required** | Provider name for discovery document |
| `providerDescription` | `string` | **Required** | Human-readable description of the service |
| `modes` | `AgentMode[]` | `["delegated", "autonomous"]` | Supported agent registration modes |
| `capabilities` | `Capability[]` | **Required** | Capability definitions (see below) |
| `onExecute` | `function` | **Required** | Capability execution handler |
| `approvalMethods` | `string[]` | `["ciba", "device_authorization"]` | Supported approval methods |
| `allowedKeyAlgorithms` | `string[]` | `["Ed25519"]` | Allowed key algorithms for agent registration |
| `agentSessionTTL` | `number` | `3600` | Agent session TTL in seconds (1 hour) |
| `agentMaxLifetime` | `number` | `86400` | Maximum agent lifetime in seconds (24 hours) |
| `maxAgentsPerUser` | `number` | `25` | Maximum active agents per user |
| `blockedCapabilities` | `string[]` | `[]` | Capabilities that cannot be granted |
| `requireAuthForCapabilities` | `boolean` | `false` | Require authentication to list capabilities |
| `deviceAuthorizationPage` | `string` | `"/device/capabilities"` | Device authorization approval page URL |
| `proofOfPresence` | `object` | `{ enabled: false }` | WebAuthn proof-of-presence configuration |
| `trustProxy` | `boolean` | `false` | Trust `X-Forwarded-Proto` header |
| `baseURL` | `string` | auto | Base URL for the auth server (auto-detected) |

### Capability Definition

Each capability object defines what agents can do:

```ts
interface Capability {
  name: string;              // Unique capability name (e.g., "read_data")
  description: string;       // Human-readable description
  input: JSONSchema;         // JSON Schema for arguments
  approvalStrength?: "none" | "session" | "webauthn";  // Required approval level
  location?: string;         // Custom URL path for execution (defaults to /capability/execute)
  output?: JSONSchema;       // JSON Schema for return value (for documentation)
}
```

### onExecute Handler

```ts
type ExecuteHandler = (params: {
  capability: string;              // The capability being executed
  arguments: Record<string, any>;  // Validated arguments
  agentSession: {                  // The agent's session info
    agent: {
      agentId: string;
      name: string;
      capabilityGrants: CapabilityGrant[];
      // ... other agent fields
    };
    user: {                        // The user who registered the agent
      id: string;
      // ... other user fields
    };
    session: {                     // The session
      id: string;
      // ... other session fields
    };
  };
  request?: Request;               // The raw HTTP request (if available)
}) => Promise<{ success: boolean; [key: string]: any }>;
```

---

## Constraints (Section 2.13)

Capabilities can be granted with scoped constraints that restrict the allowed input values. This is one of the most powerful features of the protocol — it lets users grant "transfer up to $1000" instead of "unlimited transfers."

### Constraint Operators

| Operator | Description | Example |
|---|---|---|
| `eq` | Exact value match (also shorthand: bare primitive) | `{ "eq": "USD" }` or just `"USD"` |
| `min` | Inclusive lower bound (numeric) | `{ "min": 0 }` |
| `max` | Inclusive upper bound (numeric) | `{ "max": 1000 }` |
| `in` | Value must be in list | `{ "in": ["USD", "EUR"] }` |
| `not_in` | Value must NOT be in list | `{ "not_in": ["BTC"] }` |

### Client-Side Constraints

When an agent registers or requests capabilities, it can pass constraints:

```json
{
  "capabilities": [
    "read_data",
    {
      "name": "transfer_money",
      "constraints": {
        "amount": { "max": 1000, "min": 1 },
        "currency": { "in": ["USD", "EUR"] }
      }
    }
  ]
}
```

This means the agent can only:
- Transfer amounts between 1 and 1000
- Transfer in USD or EUR (not any other currency)

### Constraint Validation

Constraints are validated at execution time:
- If an argument violates a constraint → `403 constraint_violated`
- If a constraint uses an unknown operator → `400 unknown_constraint_operator`
- Constraints are additive — if a user passes multiple constraints for the same field, all must be satisfied

**Constraint grant storage:**

```json
// In capabilityGrants[]
{
  "capability": "transfer_money",
  "constraints": {
    "amount": { "max": 1000, "min": 1 },
    "currency": { "in": ["USD", "EUR"] }
  },
  "grantedAt": "2026-06-05T12:00:00Z",
  "expiresAt": "2026-06-06T12:00:00Z"
}
```

---

## Proof of Presence / WebAuthn (Section 8.11)

Some operations are too sensitive to let an AI agent auto-approve — they require the human to be physically present. The protocol supports three approval strengths:

### Configuring Approval Strength

```ts
agentAuth({
  capabilities: [
    {
      name: "read_data",
      description: "Read user data",
      approvalStrength: "session", // default — normal session-based approval
    },
    {
      name: "delete_project",
      description: "Delete a project",
      approvalStrength: "webauthn", // requires fingerprint/face scan/hardware key
    },
    {
      name: "health_check",
      description: "Basic health ping",
      approvalStrength: "none", // auto-grant, no user interaction needed
    },
  ],
  proofOfPresence: {
    enabled: true,
    // rpId and origin are auto-derived from baseURL if omitted
    // rpId: "example.com",
    // origin: "https://example.com",
  },
  onExecute: async ({ capability, arguments: args }) => {
    return { success: true };
  },
});
```

### Approval Strength Levels

| Level | Description | When to Use |
|---|---|---|
| `"none"` | Auto-grant, no user interaction | Read-only operations, status checks |
| `"session"` | Standard session-based approval (default) | Normal operations, CRUD actions |
| `"webauthn"` | Requires WebAuthn assertion with `userVerification: "required"` | Destructive operations, large transfers, setting changes |

### The WebAuthn Ceremony

When a capability requires WebAuthn approval:

```
1. Agent calls POST /capability/execute with capability="delete_project"
2. Server responds: { code: "webauthn_required", options: { challenge, rpId, ... } }
3. Client shows the user a prompt: "Approve delete project?"
4. User authenticates with fingerprint / face scan / hardware key
5. Client calls navigator.credentials.get({ publicKey: options })
6. Client retries POST /capability/execute with { webauthnAssertion: result }
7. Server verifies the assertion, executes the capability
8. Response: { success: true }
```

**Requirements:**
- The Better Auth passkey plugin must be set up for passkey registration
- Users must have registered a passkey (fingerprint, face, or security key) before agents can use WebAuthn-gated capabilities
- WebAuthn assertions must include `userVerification: "required"`

### OpenAPI Integration

When using `createFromOpenAPI`, set `approvalStrength` by HTTP method:

```ts
import { createFromOpenAPI } from "@better-auth/agent-auth";

const capabilities = createFromOpenAPI(openApiSpec, {
  baseUrl: "https://api.example.com",
  approvalStrength: {
    GET: "session",       // Reading data → just needs session
    POST: "webauthn",     // Creating data → requires biometric proof
    PUT: "webauthn",      // Updating data → requires biometric proof
    DELETE: "webauthn",   // Deleting data → requires biometric proof
    PATCH: "webauthn",
  },
});
```

---

## Endpoint Reference

### All Registered Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/agent/session` | Session | Resolve agent JWT → session JSON (for custom route handlers) |
| GET | `/agent-configuration` | None | Discovery document (Section 5.1) |
| GET | `/.well-known/agent-configuration` | None | Well-known discovery (Section 5.1) |
| GET | `/capability/list` | None* | List capabilities (Section 5.2) |
| GET | `/capability/describe` | None* | Describe a specific capability (Section 5.2.1) |
| POST | `/agent/register` | Session | Register an agent (Section 6.3) |
| POST | `/agent/request-capability` | Agent JWT | Request capabilities (Section 6.4) |
| GET | `/agent/status` | Agent JWT | Agent status + active grants (Section 6.5) |
| POST | `/capability/execute` | Agent JWT | Execute a capability (Section 6.11) |
| POST | `/agent/introspect` | Session | Introspect/validate a token |
| POST | `/agent/revoke` | Session | Revoke an agent |
| POST | `/agent/rotate-key` | Session | Rotate agent keypair (Section 6.8) |
| POST | `/agent/reactivate` | Session | Reactivate an expired agent |
| POST | `/agent/approve-capability` | Session | Approve/deny pending capability requests |
| POST | `/agent/grant-capability` | Session | Directly grant capabilities to an agent |
| POST | `/host/create` | Session | Create a host identity |
| POST | `/host/enroll` | Host token | Enroll a host with enrollment token |
| POST | `/host/revoke` | Session | Revoke a host |

\* `*requireAuthForCapabilities` option controls whether endpoints are public

### Request/Response Examples

#### POST /agent/register

```json
// Request
{
  "name": "my-assistant",
  "publicKey": "ed25519:abc123...",
  "mode": "delegated",
  "capabilities": [
    "read_data",
    {
      "name": "transfer_money",
      "constraints": {
        "amount": { "max": 1000 },
        "currency": { "in": ["USD", "EUR"] }
      }
    }
  ]
}

// Response
{
  "agentId": "agent_xyz789",
  "token": "eyJhbGciOiJFZDI1NTE5...",
  "expiresAt": "2026-06-06T12:00:00Z",
  "capabilities": [
    { "capability": "read_data", "granted": true },
    { "capability": "transfer_money", "granted": false, "pendingApproval": true }
  ]
}
```

#### POST /capability/execute

```json
// Request
{
  "capability": "transfer_money",
  "arguments": {
    "amount": 500,
    "to": "alice",
    "currency": "USD"
  }
}

// Response (success)
{
  "success": true,
  "result": {
    "transactionId": "txn_abc123",
    "amount": 500,
    "to": "alice"
  }
}

// Response (constraint violation)
{
  "error": "Argument 'amount' exceeds maximum constraint",
  "code": "constraint_violated"
}

// Response (WebAuthn required)
{
  "code": "webauthn_required",
  "options": {
    "challenge": "base64...",
    "rpId": "example.com",
    "allowCredentials": [...]
  }
}
```

#### GET /capability/list

```json
// Response
{
  "capabilities": [
    {
      "name": "read_data",
      "description": "Read user data",
      "input": {
        "type": "object",
        "properties": { "id": { "type": "string" } }
      },
      "approvalStrength": "session"
    },
    {
      "name": "transfer_money",
      "description": "Transfer funds",
      "input": {
        "type": "object",
        "required": ["amount", "to"],
        "properties": {
          "amount": { "type": "number" },
          "to": { "type": "string" },
          "currency": { "type": "string" }
        }
      },
      "approvalStrength": "webauthn"
    }
  ]
}
```

#### GET /agent-configuration (Discovery)

```json
{
  "provider": {
    "name": "my-service",
    "description": "My API service for agent interactions",
    "url": "https://api.example.com"
  },
  "modes": ["delegated", "autonomous"],
  "registration": {
    "endpoint": "/agent/register",
    "keyAlgorithms": ["Ed25519"]
  },
  "capabilities": {
    "listEndpoint": "/capability/list",
    "describeEndpoint": "/capability/describe",
    "executeEndpoint": "/capability/execute"
  },
  "approval": {
    "methods": ["ciba", "device_authorization"],
    "deviceAuthorizationPage": "/device/capabilities"
  },
  "version": "1.0"
}
```

---

## Agent Lifecycle

### Registration

```ts
// 1. Agent generates an Ed25519 keypair
import { generateKeyPair } from "@auth/agent";
const keys = generateKeyPair();

// 2. Register with the provider
const response = await fetch("https://api.example.com/agent/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${userSessionToken}` },
  body: JSON.stringify({
    name: "my-agent",
    publicKey: keys.publicKey,
    mode: "delegated",
    capabilities: ["read_data", { name: "transfer_money", constraints: { amount: { max: 1000 } } }],
  }),
});

const { agentId, token } = await response.json();
// Store agentId and token securely
```

### Capability Request

If some capabilities require approval:

```ts
// Request additional capabilities
const response = await fetch("https://api.example.com/agent/request-capability", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${agentJWT}`,
  },
  body: JSON.stringify({
    capabilities: [{ name: "admin_panel", constraints: { scope: { in: ["read", "write"] } } }],
  }),
});

// The user must approve via the device authorization page
// Once approved, the agent can execute the new capability
```

### Capability Execution

```ts
// Execute a granted capability
const response = await fetch("https://api.example.com/capability/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${agentJWT}`,
  },
  body: JSON.stringify({
    capability: "read_data",
    arguments: { id: "user-123" },
  }),
});

const result = await response.json();
// { success: true, data: { id: "user-123", name: "Alice" } }
```

### Key Rotation

```ts
// Rotate agent keypair (generates new key, preserves grants)
const response = await fetch("https://api.example.com/agent/rotate-key", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userSessionToken}`,
  },
  body: JSON.stringify({ agentId: "agent_xyz789", newPublicKey: newKeys.publicKey }),
});

// Response includes new JWT signed with new key
// Old key is immediately invalidated
```

### Revocation

```ts
// Revoke an agent (invalidate all JWTs, remove grants)
await fetch("https://api.example.com/agent/revoke", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userSessionToken}`,
  },
  body: JSON.stringify({ agentId: "agent_xyz789" }),
});

// Agent's JWTs are now invalid
// All capability grants are revoked
// Agent can be reactivated later with /agent/reactivate
```

---

## Agent session outside `onExecute`

Capabilities with a custom **`location`** are invoked on your own HTTP routes. The agent sends **`Authorization: Bearer`** with its JWT.

### Using auth.api.getAgentSession

```ts
// Your custom route handler
export async function GET(request: Request) {
  const agentSession = await auth.api.getAgentSession({
    headers: request.headers,
  });

  if (!agentSession) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if agent has the required capability grant
  const grant = agentSession.agent.capabilityGrants?.find(
    (g) => g.capability === "read_data"
  );

  if (!grant) {
    return Response.json({ error: "Capability not granted", code: "capability_not_granted" }, { status: 403 });
  }

  // Enforce constraints manually
  if (grant.constraints) {
    // Validate request against grant.constraints
  }

  // Execute the operation
  const data = await fetchData();
  return Response.json(data);
}
```

### Using verifyAgentRequest

```ts
export async function POST(request: Request) {
  // verifyAgentRequest extracts the agent session and returns it
  const { agentSession } = await auth.api.verifyAgentRequest(request);

  // Same as above — check capability grants, enforce constraints, execute
  // ...
}
```

**Important:** When using custom `location` routes, constraint validation is NOT run automatically. You must check `capabilityGrants` and enforce constraints in your handler.

---

## OpenAPI Auto-Generation

Convert an OpenAPI spec directly into agent capabilities:

```ts
import { createFromOpenAPI } from "@better-auth/agent-auth";

const spec = {
  openapi: "3.0.0",
  info: { title: "My API", version: "1.0.0" },
  paths: {
    "/users/{id}": {
      get: {
        summary: "Get user",
        parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
      },
      delete: {
        summary: "Delete user",
        parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
      },
    },
    "/transfers": {
      post: {
        summary: "Create transfer",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  amount: { type: "number" },
                  to: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

import { agentAuth, createFromOpenAPI } from "@better-auth/agent-auth";

agentAuth({
  providerName: "my-service",
  providerDescription: "Service with OpenAPI-generated capabilities",
  capabilities: createFromOpenAPI(spec, {
    baseUrl: "https://api.example.com",
    approvalStrength: {
      GET: "session",
      POST: "webauthn",
      DELETE: "webauthn",
    },
  }),
  onExecute: async ({ capability, arguments: args }) => {
    // Route to the appropriate handler based on capability name
    // Capability names are derived from OpenAPI operationIds or path+method
  },
});
```

**Generated capability naming:**
- If `operationId` is set: uses that (e.g., "getUser", "deleteUser")
- If no `operationId`: uses `METHOD /path` (e.g., "GET /users/{id}", "DELETE /users/{id}")

---

## Host Management

Hosts represent the infrastructure where agents run. The protocol supports host identity for multi-tenant deployments:

```ts
// 1. Create a host
const host = await auth.api.createHost({
  body: { name: "production-server-1", description: "Main production host" },
  headers,
});

// 2. Enroll the host with the enrollment token
const enrolled = await auth.api.enrollHost({
  body: { enrollmentToken: host.enrollmentToken },
  headers,
});

// 3. Revoke a host (invalidates all agent sessions on that host)
await auth.api.revokeHost({
  body: { hostId: host.hostId },
  headers,
});
```

---

## Security Considerations

1. **Key algorithm enforcement** — Only allow Ed25519 by default. This is the standard for Solana-native agents. If you need RSA or ECDSA, add them to `allowedKeyAlgorithms` with caution.

2. **Agent session TTL** — Default 1 hour. For autonomous agents that run continuously, rotate keys or use shorter TTLs.

3. **Max agents per user** — Default 25. This prevents a single compromised user from registering thousands of agents. Adjust based on your use case.

4. **WebAuthn for sensitive operations** — Always require `approvalStrength: "webauthn"` for destructive operations (delete, transfer large amounts, change settings).

5. **Blocklist capabilities** — Use `blockedCapabilities` to prevent any agent from being granted certain capabilities (e.g., "full_admin_access").

6. **Constraint enforcement** — Constraints are validated server-side at execution time. Never trust client-side constraint enforcement.

7. **Key rotation** — Rotate agent keys regularly. Agents that hold long-lived JWTs are vulnerable to key compromise.

8. **TEE deployment** — For maximum security, deploy the agent-auth server in a TEE (Trusted Execution Environment) so even the server operator cannot tamper with attestation logic.

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| `agent_not_found` | 404 | Agent ID does not exist |
| `agent_expired` | 401 | Agent session has expired |
| `agent_revoked` | 401 | Agent has been revoked |
| `capability_not_granted` | 403 | Agent does not have this capability |
| `capability_blocked` | 403 | Capability is on the blocklist |
| `constraint_violated` | 403 | Argument violates a constraint |
| `unknown_constraint_operator` | 400 | Constraint uses an unsupported operator |
| `webauthn_required` | 401 | Capability requires WebAuthn proof of presence |
| `webauthn_failed` | 401 | WebAuthn assertion verification failed |
| `invalid_key_algorithm` | 400 | Key algorithm not in allowed list |
| `max_agents_exceeded` | 403 | User has reached max agent limit |
| `host_not_found` | 404 | Host ID does not exist |
| `enrollment_token_invalid` | 401 | Host enrollment token is invalid/expired |

---

## FAQ

### When should I use agent-auth vs. standard user auth?

Use agent-auth when:
- An AI agent (not a human) is calling your API
- You want per-capability access control (not all-or-nothing)
- You want to enforce argument-level constraints (e.g., "transfer up to $1000")
- You need WebAuthn proof-of-presence for sensitive operations

Use standard user auth when:
- A human is directly interacting with your app
- You only need simple role-based access (admin/user)

### How is this different from OAuth?

OAuth grants *scopes* (broad permissions). Agent Auth grants *capabilities with constraints* (narrow, scoped permissions with argument validation).

OAuth: "App can read your emails" (all or nothing)
Agent Auth: "Agent can transfer up to $1000 in USD or EUR" (constrained)

### Can agents have multiple capabilities?

Yes. Agents request a set of capabilities during registration and can request more later via `/agent/request-capability`. Each capability has independent constraints.

### Do I need WebAuthn for all capabilities?

No. Use `approvalStrength: "session"` (the default) for normal operations. Only set `"webauthn"` for destructive or high-value operations.

### What happens when an agent's JWT expires?

The agent must either:
- Re-authenticate with a user session token
- Use a refresh mechanism (if implemented)
- Register a new agent session

JWTs have a configurable TTL (`agentSessionTTL`, default 1 hour) and maximum lifetime (`agentMaxLifetime`, default 24 hours).

### Can I use this with non-Solana chains?

Yes. While the `@clawd/agent-auth-solana` package is Solana-specific for SIWS and on-chain attestation, the `@better-auth/agent-auth` plugin is chain-agnostic. It works with any authentication provider.

---

## License

MIT