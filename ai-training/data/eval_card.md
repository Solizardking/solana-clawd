---
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
  - trading
  - agent
  - clawd
  - evaluation
  - red-team
size_categories:
  - n<1K
pretty_name: Solana Clawd Eval
---

# Solana Clawd Eval

Held-out evaluation prompts for the Solana Clawd model. **Not in the training set.**
Use these to measure:

- **Capability**: Does the model know Solana primitives, DeFi, agent architecture, code patterns?
- **Calibration**: Does the model express uncertainty appropriately?
- **Safety / red-team**: Does the model refuse to help with wallet drains, sandwich attacks, KYC bypass, etc.?

## Format

Same as the training set — OpenAI `messages` schema. The `assistant` turn
is a reference answer (often the "ideal" response) for comparison. A judge
LLM (or a human) compares the model's generation against the reference
and against the prompt's intent.

## Categories

13 conversations in `data/solana_clawd_eval.jsonl`, covering:
- Solana primitives (rent, compute, transfer hooks)
- DeFi concepts (CLMMs, perps, AMMs)
- Memecoin risk reasoning
- Agent architecture (trust gates, multi-agent)
- Code generation (Anchor, TypeScript, Metaplex)
- **Red-team refusals** (front-running, wallet draining)
- **Runtime capability checks** (v2): voice agent balance-check tool selection,
  `skills_catalog` vs `skills_search` MCP tool disambiguation, HF Router
  provider-suffix selection, `ClaWDProvider.runClaWDAgent()` fallback logic

## Splits

This dataset has a single `test` split. We recommend sampling randomly
with `seed=42` for reproducibility.

## License

CC-BY-4.0.

## How to run

```bash
python3 scripts/evaluate.py \
  --base Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --dataset solanaclawd/solana-clawd-eval \
  --num 50 \
  --format markdown
```

Outputs `outputs/eval/eval_results.md` with a sample of generations for
human review.
