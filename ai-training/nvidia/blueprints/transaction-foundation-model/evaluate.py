"""
Blueprint 1 — Transaction Foundation Model evaluator.

Tests the fine-tuned model on Solana tx understanding benchmarks:
  - Swap route identification
  - Instruction count parsing
  - Price impact reasoning
  - Funding rate interpretation
  - PDA derivation knowledge

Writes results to data/tx_foundation_eval.json.

Usage:
    python3 evaluate.py --model outputs/solana-tx-foundation-1.5b/sft
    python3 evaluate.py --model solanaclawd/solana-tx-foundation-1.5b --hub
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from tx_foundation_common import DEFAULT_EVAL_OUTPUT, DEFAULT_HUB_MODEL_ID, DEFAULT_MODEL_OUTPUT

EVAL_CASES = [
    {
        "id": "swap_route",
        "prompt": "A Jupiter swap from SOL to USDC routes through SolFi V2 with 0 price impact. "
                  "What does near-zero price impact suggest about this trade?",
        "keywords": ["liquidity", "deep", "pool", "efficient", "slippage"],
        "category": "swap",
    },
    {
        "id": "instruction_count",
        "prompt": "A Jupiter v2/build swap response returns 4 setup instructions, 1 swap instruction, "
                  "and 1 cleanup instruction. What are the setup instructions likely doing?",
        "keywords": ["token account", "ATA", "associated", "wrap", "unwrap", "rent"],
        "category": "swap",
    },
    {
        "id": "funding_rate",
        "prompt": "Phoenix SOL-PERP has a funding rate of +0.05% per hour. What does a high positive "
                  "funding rate mean for long and short traders?",
        "keywords": ["long", "short", "pay", "receive", "premium", "crowded"],
        "category": "perp",
    },
    {
        "id": "price_impact",
        "prompt": "A BONK → SOL swap of 1 trillion raw units shows 0.001% price impact across "
                  "5 DEX hops. Why does splitting across multiple AMMs reduce price impact?",
        "keywords": ["split", "route", "liquidity", "AMM", "slippage", "aggregate"],
        "category": "swap",
    },
    {
        "id": "pda_derivation",
        "prompt": "On Solana, what is the purpose of the bump seed in PDA derivation, and why "
                  "must a PDA be off the ed25519 curve?",
        "keywords": ["curve", "private key", "sign", "program", "derive", "bump", "invoke_signed"],
        "category": "solana_core",
    },
    {
        "id": "lamport_rent",
        "prompt": "An account storing 100 bytes of data on Solana needs to be rent-exempt. "
                  "Calculate the minimum balance needed given ~6960 lamports/byte/year.",
        "keywords": ["lamport", "rent", "exempt", "year", "2", "multiply", "byte"],
        "category": "solana_core",
    },
    {
        "id": "cpi_depth",
        "prompt": "A Solana program makes a CPI call to a DEX which in turn calls an oracle. "
                  "What is the maximum CPI depth limit and what happens if it is exceeded?",
        "keywords": ["4", "depth", "limit", "error", "fail", "stack"],
        "category": "solana_core",
    },
    {
        "id": "jupiter_v2_build",
        "prompt": "What is the difference between Jupiter's /build endpoint and the /order+/execute flow? "
                  "When would you choose /build?",
        "keywords": ["instruction", "custom", "CPI", "control", "assemble", "sign", "RPC"],
        "category": "swap",
    },
]


def _score(response: str, keywords: list[str]) -> float:
    resp_lower = response.lower()
    hits = sum(1 for kw in keywords if kw.lower() in resp_lower)
    return hits / len(keywords)


def _chat_local(model_path: str, prompt: str, system: str) -> str:
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

        tok = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
        pipe = pipeline(
            "text-generation",
            model=model_path,
            tokenizer=tok,
            torch_dtype=torch.bfloat16,
            device_map="auto",
            max_new_tokens=256,
            temperature=0.1,
            do_sample=False,
        )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        out = pipe(messages)
        return out[0]["generated_text"][-1]["content"]
    except Exception as e:
        return f"[model error: {e}]"


def _chat_api(endpoint: str, model: str, api_key: str, prompt: str, system: str) -> str:
    import urllib.request
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        "max_tokens": 256,
        "temperature": 0.1,
    }).encode()
    req = urllib.request.Request(
        f"{endpoint}/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[api error: {e}]"


SYSTEM = (
    "You are a Solana transaction and DeFi expert. "
    "Answer concisely and accurately about Solana mechanics, Jupiter swaps, and Phoenix perps."
)


def evaluate(model_path: str, use_hub: bool = False) -> dict:
    is_api = model_path.startswith("http")
    results = []
    total_score = 0.0

    for case in EVAL_CASES:
        if is_api:
            key = os.environ.get("CLAWD_API_KEY", os.environ.get("HF_TOKEN", ""))
            resp = _chat_api(model_path, "solana-tx-foundation", key, case["prompt"], SYSTEM)
        else:
            resp = _chat_local(model_path, case["prompt"], SYSTEM)

        score = _score(resp, case["keywords"])
        total_score += score
        result = {
            "id": case["id"],
            "category": case["category"],
            "score": round(score, 3),
            "keywords_hit": [kw for kw in case["keywords"] if kw.lower() in resp.lower()],
            "keywords_miss": [kw for kw in case["keywords"] if kw.lower() not in resp.lower()],
            "response_preview": resp[:200],
        }
        results.append(result)
        print(f"  [{case['category']:12s}] {case['id']:25s}  score={score:.2f}  "
              f"hits={len(result['keywords_hit'])}/{len(case['keywords'])}")

    avg = total_score / len(EVAL_CASES)
    summary = {
        "model": model_path,
        "avg_score": round(avg, 4),
        "n_cases": len(EVAL_CASES),
        "by_category": {},
        "cases": results,
    }

    cats: dict[str, list[float]] = {}
    for r in results:
        cats.setdefault(r["category"], []).append(r["score"])
    summary["by_category"] = {k: round(sum(v) / len(v), 3) for k, v in cats.items()}

    print(f"\n[eval] avg_score={avg:.4f}")
    for cat, sc in summary["by_category"].items():
        print(f"  {cat}: {sc:.3f}")

    return summary


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    default_model = DEFAULT_MODEL_OUTPUT / "sft"
    parser.add_argument("--model", default=str(default_model if default_model.exists() else DEFAULT_HUB_MODEL_ID),
                        help="Local path or HF repo id")
    parser.add_argument("--hub", action="store_true", help="Load from HF Hub")
    parser.add_argument("--output", default=None, help="Save eval JSON (default: data/tx_foundation_eval.json)")
    args = parser.parse_args()

    model = args.model
    if args.hub and not model.startswith("http"):
        model = f"solanaclawd/{model}" if "/" not in model else model

    print(f"[tx-eval] model={model}")
    result = evaluate(model, args.hub)

    out_path = Path(args.output) if args.output else DEFAULT_EVAL_OUTPUT
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(result, f, indent=2)
    print(f"[tx-eval] saved → {out_path}")
