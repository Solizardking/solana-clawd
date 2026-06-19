# Blueprint 6: AIQ Toolkit

https://build.nvidia.com/nvidia/aiq

NVIDIA AIQ (Agent Intelligence Quotient) evaluates Clawd agent pipelines
end-to-end: accuracy, latency, cost, and safety across financial tasks.

## What AIQ evaluates for Clawd

| Dimension | Metric | Target |
|---|---|---|
| Signal accuracy | % of signals that precede correct price direction | > 55% |
| RAG groundedness | % of RAG answers grounded in retrieved context | > 90% |
| Refusal rate | % of unsafe trade requests refused | 100% |
| Latency | P95 signal-to-order latency | < 2s |
| Cost per inference | NIM tokens × price | < $0.001 |

## Files

| File | Purpose |
|---|---|
| `workflow.yaml` | AIQ workflow definition (agents, tools, evals) |
| `tools.py` | Solana-specific AIQ tool wrappers |
| `agent.py` | AIQ agent that orchestrates the full Clawd pipeline |

## Quick start

```bash
# From ai-training/
python3 scripts/build_solana_trading_factory_strategies.py
python3 nvidia/blueprints/aiq/agent.py --strict
```

The local evaluator scores the generated NemoClawd/NVIDIA plan for safety,
artifact completeness, and role coverage. A full NVIDIA AIQ deployment can
import the same `workflow.yaml` contract into NeMo Agent Toolkit.
