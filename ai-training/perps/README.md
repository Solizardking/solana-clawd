# Solana Perps Toolkit

This folder is the model-facing perps tool layer for Solana Clawd. It gives
training jobs and agents structured schemas, function-call tools, and a
paper-first NVIDIA signal handoff for Phoenix perpetual futures.

## Files

| File | What it does |
| --- | --- |
| `schema.py` | Pydantic schemas for trade orders, risk assessments, portfolios, and market signals. |
| `functions.py` | Read-only Solana/perps tools for prices, Phoenix markets, funding, orderbook, positions, risk, and quotes. |
| `functioncall.py` | Function-calling harness for Hermes/OpenAI-compatible models. |
| `prompter.py` | Prompt construction helpers for perps tool use. |
| `nvidia_perps.py` | Writes `data/perps/nvidia_perps_handoff.json` and can run one observer/paper signal tick. |

## NVIDIA Perps Handoff

From `ai-training/`:

```bash
python3 perps/nvidia_perps.py --market SOL --mode observer
```

This writes:

```text
data/perps/nvidia_perps_handoff.json
```

To run one paper tick through the NVIDIA signal agent:

```bash
export RPC_URL=https://api.mainnet-beta.solana.com
python3 perps/nvidia_perps.py --market SOL --mode paper --tick
```

For a continuous paper loop, use the source signal agent directly:

```bash
export RPC_URL=https://api.mainnet-beta.solana.com
export NVIDIA_API_KEY=<set-in-shell-only>
python3 nvidia/blueprints/signal-discovery/perps_signal_agent.py \
  --market SOL \
  --mode paper \
  --loop
```

`NVIDIA_API_KEY` is optional for local deterministic signal scoring and must stay
in the shell or secret manager. Do not write keys to YAML, JSON, markdown,
manifests, commits, or Hub uploads.

## Safety

Default modes are `observer` and `paper`. This folder must not read wallet
private keys, wallet passwords, MCP config secrets, or submit live orders. Any
live Vulcan/Phoenix execution belongs outside this generator and requires an
explicit operator decision, preflight, margin review, position review, market
review, and the execution client's live approval gate.
