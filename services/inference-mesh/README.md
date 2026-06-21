# Clawd Inference Mesh

**ZK-verifiable distributed inference on Fly.io — every inference anchored on Solana via Light Protocol.**

This has never been done before as a complete system.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │         Fly.io USA Inference Mesh            │
                    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ │
Client ──────────→  │  │  iad   │ │  ord   │ │  sjc   │ │ lax  │ │
POST /inference     │  │Ollama  │ │Ollama  │ │Ollama  │ │Ollama│ │
                    │  │+ ZK    │ │+ ZK    │ │+ ZK    │ │+ ZK  │ │
                    │  └───┬────┘ └────┬───┘ └───┬────┘ └──┬───┘ │
                    │      └───────────┼──────────┘         │     │
                    │           6PN gossip (load balance)    │     │
                    └───────────────────────────────────────────── ┘
                                        │
                               ZK commitment chain
                                        │
                    ┌───────────────────▼──────────────────────────┐
                    │              Solana Mainnet                    │
                    │                                               │
                    │  ┌─────────────────────┐  ┌───────────────┐  │
                    │  │ solana-ai-inference  │  │   clawd-zk    │  │
                    │  │ Bg96xPuC3...        │  │  (Groth16 +   │  │
                    │  │ submit_inference_    │  │  nullifiers + │  │
                    │  │ result(prediction,  │  │  Light Proto) │  │
                    │  │         proof_hash) │  │               │  │
                    │  └─────────────────────┘  └───────────────┘  │
                    │                                               │
                    │  Light Protocol State Tree (67M leaves)       │
                    │  5k lamports/inference vs 70k regular         │
                    └───────────────────────────────────────────────┘
```

## What's Novel

1. **Verifiable inference**: Every inference generates a ZK commitment `C = SHA256(model_cid || H(input) || H(output) || node_pubkey || slot)` anchored on-chain via `clawd-zk`'s `publish_attestation`.

2. **Light Protocol compression**: Inference attestations stored as compressed accounts — 67M records per state tree at ~5k lamports each (~$0.003) vs ~70k lamports ($0.04) for regular accounts. **14× cheaper at scale.**

3. **Pay-per-inference in $CLAWD**: `solana-ai-inference` on-chain program enforces validator staking + protocol fee (2.5%) + result submission — fully trustless settlement.

4. **6PN mesh load balancing**: Fly.io's private network lets nodes gossip load and route requests to the least-loaded instance in 200ms. No external load balancer needed.

5. **Event-driven mode**: Nodes subscribe to `InferenceRequested` Solana program logs via websocket — requests flow on-chain first, nodes race to fulfill, winner settles.

## V2 Roadmap: True ZK Inference

V1 uses SHA-256 commitment chains (fast, deterministic, cheap).

V2 will use snarkjs Groth16 circuits to prove `output = f(model_cid, input)` without revealing model weights:
- Circuit: verify inference output hash matches a deterministic forward pass over committed weights
- Proving time: ~30-120s per inference on CPU (acceptable for async mode)
- Proof size: 256 bytes (Groth16) stored in Light Protocol compressed account

## Quick Start

```bash
cd services/inference-mesh

# Install deps
npm install

# Dev mode (needs Ollama running locally)
SOLANA_KEYPAIR_B58=... npm run dev

# Test inference (no on-chain submission)
curl -X POST http://localhost:8080/inference \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is a Solana PDA?", "no_chain": true}'

# Deploy to Fly.io
chmod +x scripts/deploy.sh
fly secrets set SOLANA_KEYPAIR_B58=<your-node-keypair>
fly secrets set CLAWD_ZK_PROGRAM=<clawd-zk-program-id>
fly secrets set MESH_ADMIN_KEY=<admin-key>
./scripts/deploy.sh
```

## API

### React Three Fiber Mesh UI

Open the live mesh visualizer:

```text
https://clawd-inference-mesh.fly.dev/
```

The root UI is a React + React Three Fiber app served by the same VM process. It
shows the node identity, Ollama/model inventory, peer routing, public traffic
state, job counts, and recent request flow pulses. Enter the admin key in the UI
to toggle public inference or run a model warmup without leaving the visualizer.

Read-only visualization feeds:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/mesh/visualization` | Combined node, model, mesh, job, and flow state |
| `GET` | `/flow` | Recent chat/inference/warmup events for live animation |

### Sol GPT

Open the free chat app:

```text
https://clawd-inference-mesh.fly.dev/sol-gpt
```

Sol GPT is local-first: requests go to the mesh's Ollama models before any
external fallback. The default local chain is configured by
`SOL_GPT_LOCAL_MODELS`, starting with `qwen2.5:1.5b` for low-latency answers.

OpenRouter fallback is server-side and only activates when the Fly secret
`OPENROUTER_API_KEY` exists. By default Sol GPT only uses model IDs ending in
`:free`, even if paid OpenRouter model env vars are present. Set
`OPENROUTER_ALLOW_PAID_FALLBACKS=true` only if you intentionally want paid
fallbacks.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sol-gpt/status` | Local models, selected default, and fallback readiness |
| `POST` | `/api/sol-gpt/chat` | Sol GPT chat with mesh-first routing and free OpenRouter fallback |
| `POST` | `/sol-gpt/v1/chat/completions` | OpenAI-shaped alias for Sol GPT chat |

Example:

```bash
curl https://clawd-inference-mesh.fly.dev/api/sol-gpt/chat \
  -H "Content-Type: application/json" \
  -d '{"model":"sol-gpt/auto","messages":[{"role":"user","content":"Explain Solana PDAs simply."}]}'
```

### `POST /inference`

```json
{
  "prompt": "What is a Solana PDA?",
  "system": "You are a Solana expert.",
  "model": "8bit/solana-clawd-core-ai",
  "trading": false,
  "requestId": "optional-idempotency-key",
  "no_chain": false
}
```

Response:
```json
{
  "request_id": "abc123",
  "output": "A Program Derived Address is...",
  "model": "8bit/solana-clawd-core-ai",
  "model_cid": "a1b2c3d4e5f6...",
  "zk": {
    "version": 1,
    "commitment": "deadbeef...",
    "input_hash": "...",
    "output_hash": "...",
    "node_pubkey": "...",
    "slot": "300000000"
  },
  "on_chain": {
    "ai_inference_sig": "5xHJ...",
    "clawd_zk_sig": "3mKP...",
    "slot": "300000000"
  },
  "stats": {
    "prompt_tokens": 12,
    "completion_tokens": 89,
    "elapsed_ms": 2340,
    "peer_count": 3
  }
}
```

### `POST /inference/async` + `GET /inference/:jobId`

Same body as `/inference`, returns `{ job_id, status: "pending" }` immediately.
Poll `GET /inference/:jobId` until `status: "done"`.

### `GET /health`

```json
{ "ok": true, "node": "AbcD1234", "active_reqs": 2, "peers": 3 }
```

### `GET /mesh`

```json
{
  "self": "alloc-id-abc",
  "region": "iad",
  "load": 0.2,
  "peers": [
    { "alloc_id": "alloc-xyz", "region": "ord", "load": 0.1 },
    { "alloc_id": "alloc-qrs", "region": "sjc", "load": 0.0 }
  ]
}
```

### Admin API + VM Dashboard

Set `MESH_ADMIN_KEY` as a Fly secret, then open:

```text
https://clawd-inference-mesh.fly.dev/admin
```

The dashboard is served by the same VM process as the mesh and asks for the
admin key at runtime. The key is stored only in browser `sessionStorage`.

Admin API calls accept either `Authorization: Bearer <key>` or `X-Admin-Key:
<key>`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/api/status` | Node, Ollama, model, job, and mesh status |
| `POST` | `/admin/api/traffic` | Enable/disable public inference |
| `GET` | `/admin/api/jobs` | List in-memory async jobs |
| `POST` | `/admin/api/jobs/clear` | Clear completed/failed async jobs |
| `POST` | `/admin/api/models/pull` | Pull an Ollama model onto the VM |
| `POST` | `/admin/api/models/delete` | Delete an Ollama model from the VM |
| `POST` | `/admin/api/warmup` | Run a short local warmup inference |

Example:

```bash
curl https://clawd-inference-mesh.fly.dev/admin/api/status \
  -H "Authorization: Bearer $MESH_ADMIN_KEY"

curl -X POST https://clawd-inference-mesh.fly.dev/admin/api/traffic \
  -H "Authorization: Bearer $MESH_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

## On-Chain Programs

| Program | ID | Role |
|---------|-----|------|
| `solana-ai-inference` | `Bg96xPuC3Mt2xnEnQPQBJY8QBqD6J7hn3WgnqDK43pKT` | Inference marketplace, validator staking, result settlement |
| `clawd-zk` | `CLAWD_ZK_PROGRAM` env var | Groth16 verification, nullifier registry, Light Protocol compression |

## Environment Variables

| Var | Required | Description |
|-----|----------|-------------|
| `SOLANA_KEYPAIR_B58` | Yes | Base58 node keypair — set via `fly secrets set` only |
| `CLAWD_ZK_PROGRAM` | Yes | clawd-zk program ID — set via `fly secrets set` |
| `SOLANA_RPC_URL` | No | RPC endpoint (default: mainnet-beta) |
| `DEFAULT_INFERENCE_MODEL` | No | Ollama model for general inference |
| `TRADING_INFERENCE_MODEL` | No | Ollama model for trading requests |
| `INFERENCE_MODELS` | No | Comma-separated Ollama models to preload at boot |
| `MESH_ADMIN_KEY` | Yes for admin | Admin API/dashboard bearer key — set via `fly secrets set` only |
| `PUBLIC_INFERENCE_ENABLED` | No | Initial public inference switch, defaults to `true` |
| `SOL_GPT_DEFAULT_MODEL` | No | Fast default local model for `/sol-gpt` |
| `SOL_GPT_LOCAL_MODELS` | No | Comma-separated local model preference chain |
| `OPENROUTER_API_KEY` | No | Server-side fallback key for Sol GPT/OpenRouter |
| `OPENROUTER_FALLBACK_MODELS` | No | Comma-separated free OpenRouter fallback model chain |
| `OPENROUTER_ALLOW_PAID_FALLBACKS` | No | Defaults to false; keep false for free-only fallback |
| `LIGHT_STATE_TREE` | No | Light Protocol state tree pubkey |

**Never put keypairs, tokens, or secrets in fly.toml or config files.**

Default `INFERENCE_MODELS` preloads the full local Clawd fleet:

- `8bit/solana-trading-factory:8b-lora-20260620`
- `8bit/solana-trading-factory:latest`
- `8bit/solana-trading-factory:preview`
- `8bit/solana-clawd-core-ai:1.5b-merged-20260620`
- `8bit/solana-clawd-core-ai:latest`
- `8bit/solana-clawd-core-ai:preview`
- `8bit/solana-clawd:preview`
- `8bit/DeepSolana:latest`
- `hermes3:8b`
- `qwen2.5:1.5b`
- `nemotron3:33b`
