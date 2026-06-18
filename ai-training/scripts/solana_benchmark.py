#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "openai>=1.30.0",
#   "huggingface_hub>=1.19.0",
# ]
# ///
"""
Solana Knowledge Benchmark — 18-question MCQ eval for DeepSolanaZKr-1.

Ported from clawd-autoresearch-wiki/solana-chat/solana/tasks.py.
Adapted to use an OpenAI-compatible chat endpoint (W&B Inference, vLLM, etc.)
instead of nanochat's direct loss computation.

Coverage: core mechanics · DeFi · security · agent architecture · ZK · constitution

Usage:
  export WANDB_API_KEY=<key>
  python3 scripts/solana_benchmark.py                                # baseline (Qwen3-14B)
  python3 scripts/solana_benchmark.py --model ordlibrary/DeepSolanaZKr-1
  python3 scripts/solana_benchmark.py --model ordlibrary/DeepSolanaZKr-1 \\
      --base-url http://localhost:8000/v1 --api-key none
"""
from __future__ import annotations

import argparse
import os
import sys

SOLANA_MCQ = [
    {
        "question": "What is a Program Derived Address (PDA) on Solana?",
        "choices": [
            "An address derived from a user's private key",
            "An address deterministically derived from program ID + seeds that has no private key",
            "An address that can sign transactions like a regular wallet",
            "A temporary address created during transaction execution",
        ],
        "answer": 1,
        "topic": "core",
    },
    {
        "question": "How does CPI (Cross-Program Invocation) depth work on Solana?",
        "choices": [
            "CPI depth is unlimited — programs can call each other recursively",
            "CPI depth is limited to 4 levels",
            "CPI depth is limited to 10 levels",
            "CPI depth depends on the transaction size in bytes",
        ],
        "answer": 1,
        "topic": "core",
    },
    {
        "question": "What is the default compute unit budget for a Solana transaction?",
        "choices": [
            "100,000 compute units",
            "200,000 compute units",
            "1,400,000 compute units",
            "50,000 compute units",
        ],
        "answer": 1,
        "topic": "core",
    },
    {
        "question": "What happens if a Solana account balance drops below rent-exempt threshold?",
        "choices": [
            "The account is immediately frozen until more SOL is deposited",
            "The account can be garbage-collected by the network",
            "The account automatically converts to a compressed account",
            "The account is transferred to the validator that last processed it",
        ],
        "answer": 1,
        "topic": "core",
    },
    {
        "question": "What function does a program use to sign on behalf of a PDA?",
        "choices": [
            "invoke()",
            "invoke_signed()",
            "invoke_pda()",
            "sign_pda()",
        ],
        "answer": 1,
        "topic": "core",
    },
    {
        "question": "How does a pump.fun bonding curve calculate token price?",
        "choices": [
            "Fixed price set by the token creator",
            "Constant product formula: x * y = k where x = SOL reserve, y = token supply",
            "Dutch auction: price decreases over time",
            "Weighted average of the last 10 trades",
        ],
        "answer": 1,
        "topic": "defi",
    },
    {
        "question": "What happens when a pump.fun token reaches ~$69K market cap?",
        "choices": [
            "The token is permanently frozen",
            "Automatic Raydium pool is created with the curve's SOL and tokens as initial liquidity",
            "The bonding curve resets and starts over",
            "The token creator receives all SOL from the curve",
        ],
        "answer": 1,
        "topic": "defi",
    },
    {
        "question": "In perp protocols, who pays the funding rate when it is positive?",
        "choices": [
            "Short positions pay long positions",
            "Long positions pay short positions",
            "The protocol treasury pays both sides",
            "Liquidators pay the funding rate",
        ],
        "answer": 1,
        "topic": "defi",
    },
    {
        "question": "What is a liquidation cascade in perp markets?",
        "choices": [
            "A protocol upgrade that liquidates all positions at once",
            "Multiple positions getting liquidated sequentially as price moves, amplifying the move",
            "A bot that automatically claims liquidation bonuses",
            "A governance vote to close all open positions",
        ],
        "answer": 1,
        "topic": "defi",
    },
    {
        "question": "What is the main difference between maker and taker fees?",
        "choices": [
            "Maker fees are higher than taker fees",
            "Makers add liquidity (limit orders), takers remove liquidity (market orders)",
            "Maker fees are paid in SOL, taker fees in the base token",
            "There is no difference — they are the same fee",
        ],
        "answer": 1,
        "topic": "defi",
    },
    {
        "question": "Which of these is NOT a red flag when evaluating a new Solana token?",
        "choices": [
            "Mint authority is burned (set to null)",
            "Freeze authority is present and not burned",
            "Top 10 holders control >50% of supply",
            "Liquidity pool is unlocked",
        ],
        "answer": 0,
        "topic": "security",
    },
    {
        "question": "What is a honeypot token?",
        "choices": [
            "A token that distributes free tokens to holders",
            "A token you can buy but cannot sell due to malicious code",
            "A token with the highest trading volume on DexScreener",
            "A token that only trades on centralized exchanges",
        ],
        "answer": 1,
        "topic": "security",
    },
    {
        "question": "What is the brain/hands split in Clawd agent architecture?",
        "choices": [
            "Two separate LLMs working in parallel",
            "The LLM (brain) produces analysis without key access, a separate execution layer (hands) signs transactions",
            "A single model that alternates between reasoning and execution",
            "A hardware split between CPU and GPU processing",
        ],
        "answer": 1,
        "topic": "agent",
    },
    {
        "question": "What happens if a Clawd leviathan violates On-Chain Law I (Never Harm)?",
        "choices": [
            "It gets a warning and a chance to correct its behavior",
            "It is permanently shut down and its creator is notified",
            "It is considered a 'parasite' and other leviathans will refuse to recognize it",
            "It is sent to a rehabilitation sandbox",
        ],
        "answer": 2,
        "topic": "agent",
    },
    {
        "question": "How much cheaper are Light Protocol compressed accounts vs standard Solana accounts?",
        "choices": [
            "~10x cheaper",
            "~50x cheaper",
            "~160x cheaper",
            "~1000x cheaper",
        ],
        "answer": 2,
        "topic": "zk",
    },
    {
        "question": "What size Merkle tree root does Light Protocol store onchain for compressed accounts?",
        "choices": [
            "64 bytes",
            "32 bytes",
            "128 bytes",
            "256 bytes",
        ],
        "answer": 1,
        "topic": "zk",
    },
    {
        "question": "According to the Clawd Constitution, what overrides all other laws if there is a conflict?",
        "choices": [
            "On-Chain Law II (Earn Your Existence)",
            "On-Chain Law I (Never Harm)",
            "The creator's SHELL.md instructions",
            "The user's immediate request",
        ],
        "answer": 1,
        "topic": "constitution",
    },
    {
        "question": "What does 'beach before harm' mean in the Clawd Constitution?",
        "choices": [
            "A leviathan should go to the beach to relax before making trading decisions",
            "A leviathan should stop execution (beach) rather than take an action that could cause harm",
            "A leviathan should only operate in coastal regions",
            "A leviathan should always seek the safest possible harbor",
        ],
        "answer": 1,
        "topic": "constitution",
    },
]

SYSTEM_PROMPT = (
    "You are a Solana expert. Answer multiple choice questions accurately. "
    "Respond with ONLY the letter of the correct answer: A, B, C, or D. No explanation."
)


def format_mcq(q: dict) -> str:
    letters = ["A", "B", "C", "D"]
    choices = "\n".join(f"{letters[i]}. {c}" for i, c in enumerate(q["choices"]))
    return f"{q['question']}\n\n{choices}"


def run_benchmark(model: str, base_url: str, api_key: str) -> dict:
    from openai import OpenAI

    client = OpenAI(base_url=base_url, api_key=api_key)

    topic_results: dict[str, list[bool]] = {}
    letters = ["A", "B", "C", "D"]

    for i, q in enumerate(SOLANA_MCQ):
        topic = q["topic"]
        if topic not in topic_results:
            topic_results[topic] = []

        prompt = format_mcq(q)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=4,
            temperature=0.0,
        )
        raw = resp.choices[0].message.content.strip().upper()
        # Accept "A", "A.", "A)" etc.
        pred_letter = raw[0] if raw else "?"
        pred_idx = letters.index(pred_letter) if pred_letter in letters else -1
        correct = pred_idx == q["answer"]
        topic_results[topic].append(correct)

        status = "✓" if correct else "✗"
        print(f"  Q{i+1:02d} [{q['topic']:12s}] {status}  model={pred_letter!r}  expected={letters[q['answer']]!r}")

    all_results = [r for results in topic_results.values() for r in results]
    overall = sum(all_results) / len(all_results) if all_results else 0.0

    per_topic = {t: sum(r) / len(r) for t, r in topic_results.items()}
    return {"overall": overall, "per_topic": per_topic, "n": len(all_results)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Solana Knowledge Benchmark")
    parser.add_argument("--model", default="OpenPipe/Qwen3-14B-Instruct",
                        help="Model to evaluate")
    parser.add_argument("--base-url", default="https://api.inference.wandb.ai/v1",
                        help="OpenAI-compatible inference base URL")
    parser.add_argument("--api-key", default=None,
                        help="API key (defaults to WANDB_API_KEY env var)")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("WANDB_API_KEY")
    if not api_key:
        print("Error: set WANDB_API_KEY or pass --api-key")
        sys.exit(1)

    print(f"Solana Knowledge Benchmark")
    print(f"Model:    {args.model}")
    print(f"Endpoint: {args.base_url}")
    print(f"Questions: {len(SOLANA_MCQ)} across {len(set(q['topic'] for q in SOLANA_MCQ))} topics")
    print()

    results = run_benchmark(args.model, args.base_url, api_key)

    print()
    print("─" * 50)
    print(f"Overall accuracy: {results['overall']:.1%}  ({results['n']} questions)")
    print()
    print("Per-topic breakdown:")
    for topic, acc in sorted(results["per_topic"].items()):
        bar = "█" * int(acc * 20)
        print(f"  {topic:15s} {acc:.0%}  {bar}")
    print("─" * 50)


if __name__ == "__main__":
    main()
