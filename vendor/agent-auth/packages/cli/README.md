# @auth/agent-cli

<div align="center">

**CLI and MCP server for the Agent Auth Protocol**

[![npm](https://img.shields.io/npm/v/@auth/agent-cli?color=blue)](https://npmjs.com/package/@auth/agent-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
  - [Provider Discovery](#provider-discovery)
  - [Agent Management](#agent-management)
  - [Capability Operations](#capability-operations)
  - [Key Management](#key-management)
  - [Host Management](#host-management)
- [Working with Constraints](#working-with-constraints)
- [MCP Server](#mcp-server)
  - [Configuration](#configuration)
  - [Available MCP Tools](#available-mcp-tools)
  - [AI Agent Integration](#ai-agent-integration)
- [Environment Variables](#environment-variables)
- [Storage](#storage)
- [Recipes](#recipes)
  - [One-liner: Discover + Execute](#one-liner-discover--execute)
  - [Automated Agent Registration](#automated-agent-registration)
  - [CI/CD Pipeline Integration](#cicd-pipeline-integration)
- [License](#license)

---

## Installation

```bash
npm install -g @auth/agent-cli
# or
pnpm add -g @auth/agent-cli
```

Or run directly without installing:

```bash
npx @auth/agent-cli --help
```

**Requirements:** Node.js ≥ 18

---

## Quick Start

```bash
# 1. Discover a provider
auth-agent discover https://api.example.com

# 2. List available capabilities
auth-agent capabilities --provider https://api.example.com

# 3. Register an agent with capabilities
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --name my-agent

# 4. Execute a capability
auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 50, "to": "alice", "currency": "USD"}'

# 5. Check agent status
auth-agent status <agent-id>

# 6. Disconnect when done
auth-agent disconnect <agent-id>
```

---

## CLI Commands

### Provider Discovery

```bash
# Discover a specific provider
auth-agent discover https://api.example.com
# Output: Provider name, description, capabilities, registration modes

# Search the directory for providers matching an intent
auth-agent search "transfer money between accounts"
# Output: Ranked list of matching providers with scores

# List all known/discovered providers
auth-agent providers
# Output: All cached provider configs
```

**Discovery output example:**
```json
{
  "provider": {
    "name": "Banking API",
    "description": "Financial services API with transfer and account management",
    "url": "https://api.bank.com"
  },
  "capabilities": [
    {
      "name": "transfer_money",
      "description": "Transfer funds between accounts",
      "approvalStrength": "webauthn",
      "input": { "type": "object", "properties": { "amount": { "type": "number" }, ... } }
    },
    {
      "name": "read_balance",
      "description": "Check account balance",
      "approvalStrength": "session",
      "input": { "type": "object", "properties": { "accountId": { "type": "string" } } }
    }
  ],
  "registration": {
    "endpoint": "/agent/register",
    "keyAlgorithms": ["Ed25519"]
  }
}
```

### Agent Management

```bash
# Register a new agent
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --name "deployment-agent" \
  --mode delegated
# Output: { agentId: "agent_xyz789", token: "eyJ...", capabilities: [...] }

# List all agents for this host
auth-agent connections --issuer <issuer-id>
# Output: [{ agentId, provider, name, connectedAt }, ...]

# Get details of a specific agent
auth-agent connection <agent-id>
# Output: Full agent connection state including grants

# Check agent status
auth-agent status <agent-id>
# Output: { agentId, name, capabilities, activeGrants, expiresAt }

# Disconnect (revoke) an agent
auth-agent disconnect <agent-id>
# Output: "Agent agent_xyz789 disconnected"

# Reactivate a previously disconnected agent
auth-agent reactivate <agent-id>
# Output: { agentId, token: "new-jwt..." }
```

### Capability Operations

```bash
# List capabilities for a provider
auth-agent capabilities --provider https://api.example.com
# Output: List of all available capabilities with schemas

# Describe a specific capability
auth-agent describe transfer_money --provider https://api.example.com
# Output: Full capability definition with JSON Schema

# Execute a capability
auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 500, "to": "alice", "currency": "USD"}'
# Output: { success: true, result: { transactionId: "txn_..." } }

# Request additional capabilities
auth-agent request <agent-id> \
  --capabilities admin_panel \
  --constraints '{"admin_panel":{"scope":{"in":["read","write"]}}}'
# Output: { capabilities: [{ capability: "admin_panel", granted: true }] }
```

### Key Management

```bash
# Sign a JWT manually (for custom integration)
auth-agent sign <agent-id>
# Output: Signed JWT for the agent

# Rotate an agent's keypair
auth-agent rotate-agent-key <agent-id>
# Output: { agentId, token: "new-jwt..." }
# Old key is invalidated, all grants preserved

# Rotate the host's keypair
auth-agent rotate-host-key --issuer <issuer-id>
# Output: { issuer, publicKey: "new-key..." }
# All agent connections are re-signed with new host key
```

### Host Management

```bash
# Enroll a new host with a provider
auth-agent enroll-host --token "enrollment-token-from-provider"
# Output: { hostId, issuer, publicKey, enrolledAt }

# List all host connections
auth-agent connections --issuer <issuer-id>
# Output: [{ agentId, provider, name, capabilities, connectedAt }, ...]
```

---

## Working with Constraints

Constraints restrict what argument values an agent can use when executing capabilities. Pass them as JSON during registration or capability requests:

```bash
# Connect with amount and currency constraints
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --constraints '{"transfer_money":{"amount":{"max":1000,"min":1},"currency":{"in":["USD","EUR"]}}}' \
  --name constrained-agent

# Request capabilities with scope constraints
auth-agent request <agent-id> \
  --capabilities admin_panel \
  --constraints '{"admin_panel":{"scope":{"in":["read"]}}}'

# Execute — constraints are auto-enforced server-side
auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 500, "to": "alice", "currency": "USD"}'
# ✅ Passes — amount 500 ≤ max 1000, currency USD is in [USD, EUR]

auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 5000, "to": "alice", "currency": "USD"}'
# ❌ Fails — amount 5000 > max 1000 (constraint_violated)
```

**Constraint operators reference:**

| Operator | Type | Example |
|---|---|---|
| `eq` | Exact match | `{ "currency": { "eq": "USD" } }` or `{ "currency": "USD" }` |
| `min` | Numeric lower bound | `{ "amount": { "min": 1 } }` |
| `max` | Numeric upper bound | `{ "amount": { "max": 1000 } }` |
| `in` | Must be in list | `{ "currency": { "in": ["USD", "EUR"] } }` |
| `not_in` | Must NOT be in list | `{ "projectId": { "not_in": ["prod-critical"] } }` |

---

## MCP Server

Run as an MCP (Model Context Protocol) server so AI coding assistants (Cursor, Claude Desktop, Windsurf) can directly interact with agent-auth providers.

```bash
# Start MCP server for a specific provider
auth-agent mcp --url https://api.example.com

# Start with a directory for search capabilities
auth-agent mcp --url https://api.example.com \
  --directory-url https://directory.example.com

# Start without a default provider (connect at runtime)
auth-agent mcp --directory-url https://directory.example.com
```

### Configuration

Add to your AI editor's MCP configuration:

**Cursor / Claude Desktop** (`~/.cursor/mcp.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": ["@auth/agent-cli", "mcp", "--url", "https://api.example.com"]
    }
  }
}
```

**With environment variables:**

```json
{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": ["@auth/agent-cli", "mcp", "--url", "https://api.example.com"],
      "env": {
        "AGENT_AUTH_STORAGE_DIR": "/home/user/.agent-auth",
        "AGENT_AUTH_DIRECTORY_URL": "https://directory.example.com",
        "AGENT_AUTH_HOST_NAME": "my-dev-machine"
      }
    }
  }
}
```

### Available MCP Tools

When the MCP server is running, AI agents can call these tools:

| MCP Tool | Description | Parameters |
|---|---|---|
| `discover_provider` | Discover a provider by URL | `url: string` |
| `search_providers` | Search directory by intent | `intent: string` |
| `list_providers` | List known providers | — |
| `list_capabilities` | List capabilities for a provider | `provider?: string` |
| `describe_capability` | Get capability details | `name: string`, `provider?: string` |
| `connect_agent` | Register an agent | `provider: string`, `capabilities: string[]`, `name?: string`, `constraints?: object` |
| `execute_capability` | Execute a capability | `agentId: string`, `capability: string`, `arguments: object` |
| `agent_status` | Check agent status | `agentId: string` |
| `request_capability` | Request additional capabilities | `agentId: string`, `capabilities: object[]` |
| `disconnect_agent` | Revoke an agent | `agentId: string` |

### AI Agent Integration

Once the MCP server is configured, AI agents can:

```
User: "Transfer $50 to Alice from my bank account"

AI Agent:
  1. Calls list_capabilities to see what's available
  2. Calls describe_capability("transfer_money") to get the schema
  3. Calls connect_agent with capability "transfer_money" + constraints
  4. Calls execute_capability with { amount: 50, to: "alice", currency: "USD" }
  5. Returns the result to the user
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `AGENT_AUTH_STORAGE_DIR` | Directory for persistent storage (keys, connections) | `~/.agent-auth` |
| `AGENT_AUTH_DIRECTORY_URL` | Default directory URL for provider search | — |
| `AGENT_AUTH_HOST_NAME` | Host name for identification | `host-{random}` |

**Example `.env` file:**

```bash
AGENT_AUTH_STORAGE_DIR=/home/user/.agent-auth
AGENT_AUTH_DIRECTORY_URL=https://directory.example.com
AGENT_AUTH_HOST_NAME=production-server-01
```

---

## Storage

The CLI supports persistent file-based storage for keys and connections. By default, data is stored in `~/.agent-auth/`.

**Storage directory structure:**
```
~/.agent-auth/
├── hosts/
│   └── <issuer>/
│       ├── identity.json      # Host keypair
│       └── agents/
│           └── <agentId>.json # Agent connection state
└── providers/
    └── <url-hash>.json        # Cached provider discovery docs
```

**For production use:** The FileStorage implementation in `packages/cli/src/storage.ts` includes optional encryption at rest. See the source for a reference implementation of the Storage interface.

---

## Recipes

### One-liner: Discover + Execute

```bash
# Discover a provider, connect an agent, and execute in sequence
auth-agent discover https://api.example.com && \
  AGENT_ID=$(auth-agent connect --provider https://api.example.com \
    --capabilities read_data \
    --name one-off-agent | jq -r '.agentId') && \
  auth-agent execute $AGENT_ID read_data --args '{"id": "user-123"}' && \
  auth-agent disconnect $AGENT_ID
```

### Automated Agent Registration

```bash
#!/bin/bash
# register-agent.sh — register an agent with constraints from a config file

PROVIDER_URL="https://api.example.com"
AGENT_NAME="deployment-agent-$(date +%s)"
CONSTRAINTS=$(cat constraints.json)

# Discover provider
auth-agent discover "$PROVIDER_URL"

# Register agent
RESULT=$(auth-agent connect \
  --provider "$PROVIDER_URL" \
  --capabilities read_data transfer_money deploy_project \
  --constraints "$CONSTRAINTS" \
  --name "$AGENT_NAME")

# Extract agent ID
AGENT_ID=$(echo "$RESULT" | jq -r '.agentId')

# Save agent ID for later use
echo "$AGENT_ID" > /tmp/current-agent-id
echo "Agent registered: $AGENT_ID"
```

Example `constraints.json`:
```json
{
  "transfer_money": {
    "amount": { "max": 5000 },
    "currency": { "in": ["USD", "EUR", "GBP"] }
  },
  "deploy_project": {
    "environment": { "in": ["staging", "development"] }
  }
}
```

### CI/CD Pipeline Integration

```yaml
# .github/workflows/agent-deploy.yml
name: Agent Deployment

on:
  push:
    branches: [main]

jobs:
  agent-register:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install agent CLI
        run: npm install -g @auth/agent-cli

      - name: Register deployment agent
        env:
          AGENT_AUTH_STORAGE_DIR: /tmp/agent-auth
          AGENT_AUTH_HOST_NAME: "ci-${{ github.run_id }}"
        run: |
          auth-agent connect \
            --provider "${{ secrets.AGENT_PROVIDER_URL }}" \
            --capabilities deploy_project read_logs \
            --name "ci-agent-${{ github.run_id }}" \
            --constraints '{"deploy_project":{"environment":{"in":["staging","production"]}}}'

      - name: Execute deployment
        run: |
          AGENT_ID=$(cat /tmp/agent-auth/hosts/*/agents/*.json | jq -r '.agentId')
          auth-agent execute "$AGENT_ID" deploy_project \
            --args '{"projectId": "${{ github.event.repository.name }}", "ref": "${{ github.sha }}"}'

      - name: Cleanup
        if: always()
        run: |
          AGENT_ID=$(cat /tmp/agent-auth/hosts/*/agents/*.json | jq -r '.agentId')
          auth-agent disconnect "$AGENT_ID"
```

---

## Full Command Reference

| Command | Arguments | Description |
|---|---|---|
| `discover <url>` | `url` | Discover a provider at the given URL |
| `search <intent>` | `intent` | Search the directory for providers matching intent |
| `providers` | — | List all known/discovered providers |
| `capabilities` | `--provider <url>` | List capabilities for a provider |
| `describe <name>` | `name`, `--provider <url>` | Get full capability definition |
| `connect` | `--provider <url>`, `--capabilities <list>`, `--name <name>`, `--constraints <json>`, `--mode <mode>` | Register an agent |
| `status <agent-id>` | `agentId` | Check agent status and grants |
| `execute <agent-id> <capability>` | `agentId`, `capability`, `--args <json>`, `--url <url>` | Execute a granted capability |
| `request <agent-id>` | `agentId`, `--capabilities <list>`, `--constraints <json>` | Request additional capabilities |
| `sign <agent-id>` | `agentId` | Sign an agent JWT manually |
| `disconnect <agent-id>` | `agentId` | Disconnect/revoke an agent |
| `reactivate <agent-id>` | `agentId` | Reactivate a disconnected agent |
| `connections <issuer>` | `issuer` | List agent connections for an issuer |
| `connection <agent-id>` | `agentId` | Get details of a stored connection |
| `rotate-agent-key <agent-id>` | `agentId` | Rotate agent keypair |
| `rotate-host-key <issuer>` | `--issuer <id>` | Rotate host keypair |
| `enroll-host` | `--token <token>` | Enroll a new host |
| `mcp` | `--url <url>`, `--directory-url <url>` | Start MCP server |

---

## License

MIT