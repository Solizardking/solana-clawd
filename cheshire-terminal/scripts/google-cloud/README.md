# Google Agent Registry

Cheshire Terminal exposes a Google Agent Registry compatible A2A Agent Card at:

- `https://cheshireterminal.ai/.well-known/agent-card.json`

The local spec used for manual registration is:

- `registry/google/cheshire-agent-card.json`
- `registry/google/cheshire-mcp-tools-list.json`
- `registry/google/cheshire-mcp-interface.json`

Register it with Google Cloud:

```bash
PROJECT_ID=your-google-cloud-project \
LOCATION=us-central1 \
scripts/google-cloud/register-agent-registry.sh
```

The script validates the Agent Card is under the 10 KB Agent Registry limit and
the MCP tool spec is under the 10 KB MCP Server Registry limit. It then creates
or updates two Google Agent Registry services:

- `cheshire-terminal` — A2A/model agent service (`a2a-agent-card`)
- `cheshire-terminal-mcp` — MCP server service (`tool-spec`)

Current registered project/location:

- `projects/x402-477302/locations/us-central1/services/cheshire-terminal`
- `projects/x402-477302/locations/us-central1/services/cheshire-terminal-mcp`

The script runs the equivalent of:

```bash
gcloud alpha agent-registry services create cheshire-terminal \
  --project=PROJECT_ID \
  --location=LOCATION \
  --display-name="Cheshire Terminal" \
  --agent-spec-type=a2a-agent-card \
  --agent-spec-content=registry/google/cheshire-agent-card.json

gcloud alpha agent-registry services create cheshire-terminal-mcp \
  --project=PROJECT_ID \
  --location=LOCATION \
  --display-name="Cheshire Terminal MCP" \
  --mcp-server-spec-type=tool-spec \
  --mcp-server-spec-content=registry/google/cheshire-mcp-tools-list.json \
  --interfaces=registry/google/cheshire-mcp-interface.json
```

MCP discovery for model/tool clients is served separately:

- `https://cheshireterminal.ai/.well-known/mcp`
- `https://cheshireterminal.ai/.well-known/mcp/server-card.json`
- `https://cheshireterminal.ai/mcp`
