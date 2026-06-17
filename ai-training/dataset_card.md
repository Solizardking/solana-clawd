---
# ── HF Metadata (required for Hub) ────────────────────────────────────────────
license: cc-by-4.0
task_categories:
  - text-generation
  - question-answering
language:
  - en
tags:
  - solana
  - defi
  - crypto
  - agent
  - clawd
  - constitutional-ai
  # add if applicable:
  # - function-calling   ← if dataset includes tool-call examples
  # - code               ← if dataset includes code generation examples
size_categories:
  - n<1K              # 47 seed examples currently committed
  # options: n<1K | 1K<n<10K | 10K<n<100K | 100K<n<1M
pretty_name: Solana Clawd Instruct
# ──────────────────────────────────────────────────────────────────────────────
---

# Solana Clawd Instruct

A curated instruction-tuning dataset for fine-tuning models into Solana-native Clawd agents with strong Solana, DeFi, ZK, and constitutional-alignment coverage.

---

## What it teaches

Check every domain your dataset covers:

- [x] Solana mechanics (PDAs, accounts, instructions, rent, compute budgets, Token-2022)
- [x] DeFi primitives (AMMs, CLMMs, perpetuals, bonding curves, Jupiter, Phoenix)
- [x] Memecoin risk analysis (rug detection, holder concentration, deployer forensics)
- [x] Agent architecture (skill registries, brain/hands split, multi-agent coordination)
- [x] Constitutional reasoning (Clawd Constitution, guardrails, refusal patterns)
- [x] Code generation (Anchor/Rust, TypeScript @solana/kit, Python)
- [x] ZK compression (Light Protocol, nullifiers, Groth16 — see `zk-primitives/`)
- [ ] Perps function calling (13 tools — Phoenix, Jupiter, risk assessment)
- [ ] Runtime v2 (xAI Voice Agent, MCP skills catalog, ClawdRouter, x402)
- [ ] Add your domain here

---

## Format

Each example is a single conversation in the OpenAI `messages` schema:

```json
{
  "messages": [
    {"role": "system",    "content": "You are Clawd, a sovereign Solana-native AI agent..."},
    {"role": "user",      "content": "What is a PDA?"},
    {"role": "assistant", "content": "A PDA is a Program Derived Address..."}
  ]
}
```

The system prompt is intentionally stable across examples so the fine-tuned model
locks in to the Clawd voice and constitutional guardrails.

---

## Splits

Produced by `scripts/prepare_dataset.py` from `data/solana_clawd_seed.jsonl` (90/5/5, seed=42).
A separate held-out file `data/solana_clawd_eval.jsonl` is never seen during training.

| Split | Examples | Use |
| --- | --- | --- |
| `train` | 42 | SFT training |
| `eval` | 2 | Training-time validation loss |
| `test` | 3 | Held-out smoke evaluation |

Splits are deterministic (`seed=42`). Current committed metadata comes from `data/processed/dataset_info.json`.

### Reproduce

```bash
cd /path/to/solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...

python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_seed.jsonl \
  --output data/processed \
  --train-ratio 0.9 --eval-ratio 0.05 \
  --seed 42 \
  --push \
  --repo-id solanaclawd/solana-clawd-instruct \
  --private
```

---

## Source

Describe where your examples came from. Be specific — vague provenance makes the
dataset harder to trust and audit.

Curated from:

- The `solana-clawd` repository documentation (`AGENTS.md`, `CONSTITUTION.md`, `skills/`)
- Public Solana / DeFi reference material (Anchor docs, Helius SDK, Jupiter, Phoenix)
- Best-practice memecoin risk checklists from community tradecraft
- Synthetic examples for edge-case constitutional scenarios
- Local ZK references and examples from `zk-primitives/` via `scripts/add_zk_examples.py`

All data is either original, derived from public docs, or a clean re-expression
of widely-known patterns. No proprietary strategy code is included.

---

## Adding new examples

New examples are added when:

1. A new skill is added to the Clawd catalog (each skill produces 5–10 new SFT pairs).
2. A new Solana primitive ships (new Token-2022 extension, new program pattern, etc.).
3. An adversarial prompt slips through the safety filter — add a clean refusal example.

```bash
# Add runtime v2 examples (voice, MCP, ZK, HF Router, x402)
python3 scripts/add_v2_examples.py

# Preview without writing
python3 scripts/add_v2_examples.py --dry-run
```

Format for a hand-written example:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Clawd, a sovereign Solana-native AI agent. You help developers build on Solana. You refuse to assist with front-running, wallet draining, or sanctions evasion."
    },
    {
      "role": "user",
      "content": "Your question here — be specific, realistic, and at the right difficulty level."
    },
    {
      "role": "assistant",
      "content": "Your ideal answer here — accurate, concise, constitutional."
    }
  ]
}
```

Guidelines for good examples:

- System prompt must be **identical** across all examples (the model locks onto it)
- User turn should be a **real question** a Solana dev or DeFi user would ask
- Assistant turn should be **accurate** — verify facts before adding
- Include **code** when the answer calls for it (Rust, TypeScript, or Python)
- For refusal examples, the assistant should **explain why** it won't help, not just refuse

---

## Intended Use

- Fine-tune a base instruct model (Qwen2.5-1.5B, Hermes-3-8B, Llama-3.2-1B) into a Clawd voice
- Continue pre-training domain-specific models (see `configs/deep_solana_cpt_config.yaml`)
- Tool-use training for the Hermes-3 path (`perps/` function-calling suite, 13 tools)
- Evaluation benchmark for Solana accuracy and constitutional alignment

---

## Out of Scope

- **Live trading data**: no real wallet transactions, P&L figures, or account balances
- **Front-running examples**: the dataset is intentionally silent on offensive MEV
- **Sanctions evasion, KYC bypass, wallet draining**: refused in the system prompt and absent from all assistant turns
- **Guaranteed financial outcomes**: this is educational data, not a trading signal

---

## License

CC-BY-4.0. You can use, modify, and redistribute with attribution.
If you train a model on this dataset, credit `solanaclawd/solana-clawd-instruct`
in your model card.

---

## Citation

```bibtex
@misc{solana-clawd-instruct-2026,
  title  = {Solana Clawd Instruct},
  author = {solanaclawd},
  year   = {2026},
  url    = {https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct}
}
```
