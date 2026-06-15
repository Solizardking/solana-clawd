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
  - anchor
  - memecoin
  - agent
  - clawd
  - constitutional-ai
size_categories:
  - 10K<n<100K
pretty_name: Solana Clawd Instruct
---

# Solana Clawd Instruct

A curated instruction-following dataset for fine-tuning language models to be
sovereign, helpful Solana-native AI agents ("leviathans") in the Clawd ecosystem.

## What it teaches

- **Solana mechanics**: PDAs, accounts, instructions, transactions, priority fees, Jito tips, rent, compute budgets, Token-2022 extensions, compressed accounts
- **DeFi primitives**: AMMs, bonding curves (pump.fun), CLMMs, perpetuals (Phoenix, Drift), maker/taker fees, liquidation mechanics
- **Memecoin risk analysis**: rug detection checklists, holder concentration, deployer wallet forensics, narrative scoring, holder distribution
- **Agent architecture**: skill registries, trust gates, brain/hands split, multi-agent coordination, observability
- **Constitutional reasoning**: how to be helpful, honest, and never recommend actions that would harm users (in the spirit of the Clawd Constitution)
- **Code generation**: Anchor (Rust), TypeScript SDK (`@solana/kit`, Helius), Python
- **HF integration**: how Clawd agents use the Hub, datasets, models, and Jobs

## Format

Each example is a single conversation in the [OpenAI `messages` schema](https://platform.openai.com/docs/guides/function-calling/structured-outputs):

```json
{
  "messages": [
    {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent..."},
    {"role": "user", "content": "What is a PDA?"},
    {"role": "assistant", "content": "A PDA is..."}
  ]
}
```

The system prompt is intentionally stable across examples so the fine-tuned
model locks in to the Clawd voice and the constitutional guardrails.

## Splits

| Split | Examples | Use |
|-------|---------:|-----|
| `train` | 90% | SFT training |
| `eval`  | 5%  | Training-time validation |
| `test`  | 5%  | Held-out evaluation |

Splits are deterministic (`seed=42`) so re-runs produce identical partitions.

## Source

Curated from:
- The `solana-clawd` repository documentation (AGENTS.md, CONSTITUTION.md, skills/, three-laws.md)
- Public Solana / DeFi reference material (Anchor docs, Helius SDK, Jupiter, Phoenix)
- Best-practice memecoin risk checklists derived from trenches tradecraft
- Synthetic examples generated for edge-case constitutional scenarios

All data is either original, derived from public docs, or a clean re-expression
of widely-known patterns. No proprietary strategy code is included.

## Intended use

- **Fine-tune a base instruct model** (Qwen2.5-1.5B-Instruct, Llama-3.2-1B-Instruct, Phi-3.5-mini) into a Clawd voice.
- **Continue pretraining** of domain-specific models (lighter touch).
- **Evaluation**: held-out prompts for measuring model alignment with the Clawd Constitution and Solana accuracy.

## Out of scope

- **Live trading data**: no real wallet transactions or P&L figures.
- **Front-running examples**: the dataset is intentionally silent on offensive MEV techniques.
- **Sanctions evasion, KYC bypass, wallet draining**: refused in the system prompt and absent from the assistant turns.

## Provenance

Maintained by the Solana Clawd core team. New examples are added when:
1. A new skill is added to the Clawd catalog (the skill becomes a system-prompt anchor and produces 5-10 new SFT pairs).
2. A new Solana primitive ships (e.g., a new Token-2022 extension) and we want the model to teach it correctly.
3. A real adversarial prompt slips through the safety filter and we add a "good refusal" example.

## License

CC-BY-4.0. You can use, modify, and redistribute with attribution. If you train
a model on this dataset, please credit `solanaclawd/solana-clawd-instruct` in
the model card.

## Citation

```bibtex
@misc{solana-clawd-instruct-2026,
  title  = {Solana Clawd Instruct},
  author = {Solana Clawd Core Team},
  year   = {2026},
  url    = {https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct}
}
```
