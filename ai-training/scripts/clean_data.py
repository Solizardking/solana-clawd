#!/usr/bin/env python3
"""
Clean and improve the Solana Clawd training dataset before merging.

Operations:
  1. solana1_yourgpt.jsonl
     - Remove off-topic "banking / bank hash / financial information" examples
     - Filter answers shorter than 80 chars (too generic to be useful)
     - Normalize Alpaca format → messages format
     - Inject Clawd system prompt

  2. trainingday.jsonl
     - Strip metadata field (noise — chunked raw docs, not training signal)
     - Cap heavily repeated providers (QuickNode, Alchemy, Helius) at --cap each,
       keeping the richest examples by assistant answer length
     - Filter short assistant answers (<80 chars)
     - Inject Clawd system prompt (currently none have it)

  3. data/solana_clawd_seed.jsonl (pass-through — already clean)

  4. Merge all three into data/solana_clawd_merged.jsonl (overwrites)

Usage:
  python3 scripts/clean_data.py
  python3 scripts/clean_data.py --cap 400 --min-answer-len 100
  python3 scripts/clean_data.py --dry-run   # stats only, no writes
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).parent.parent

SYSTEM_PROMPT = (
    "You are DeepSolanaZKr-1, a sovereign Solana-native AI with deep knowledge of "
    "zero-knowledge proofs, Solana development, DeFi protocols, and on-chain agent systems. "
    "You are built on the Onchain Model Kit and anchored to the Clawd constitution. "
    "You help developers build fast, private, and verifiable applications on Solana. "
    "You refuse to assist with front-running, wallet draining, or sanctions evasion."
)

OFF_TOPIC_PATTERNS = [
    r"bank hash",
    r"falsifiable",
    r"financial information provided by the bank",
    r"account states ensures the accuracy",
    r"snapshot of the account states",
    r"provided by the bank\b",
]
OFF_TOPIC_RE = re.compile("|".join(OFF_TOPIC_PATTERNS), re.IGNORECASE)

PROVIDER_KEYWORDS = {
    "quicknode": re.compile(r"\bquicknode\b", re.IGNORECASE),
    "alchemy":   re.compile(r"\balchemy\b",   re.IGNORECASE),
    "helius":    re.compile(r"\bhelius\b",     re.IGNORECASE),
}


def _text_of(example: dict) -> str:
    """Return all text in an example as a single string for pattern matching."""
    msgs = example.get("messages", [])
    if msgs:
        return " ".join(m.get("content", "") for m in msgs)
    return " ".join([example.get("instruction", ""), example.get("input", ""), example.get("output", "")])


def _is_off_topic(example: dict) -> bool:
    return bool(OFF_TOPIC_RE.search(_text_of(example)))


def _answer_len(example: dict) -> int:
    msgs = example.get("messages", [])
    if msgs:
        asst = next((m["content"] for m in msgs if m["role"] == "assistant"), "")
        return len(asst)
    return len(example.get("output", ""))


def _provider(example: dict) -> str | None:
    text = _text_of(example)
    for name, pat in PROVIDER_KEYWORDS.items():
        if pat.search(text):
            return name
    return None


def normalize_alpaca(example: dict) -> dict | None:
    """Convert Alpaca {instruction, input, output} → messages format."""
    instruction = example.get("instruction", "").strip()
    inp = example.get("input", "").strip()
    output = example.get("output", "").strip()
    if not output:
        return None
    if instruction:
        user = instruction
        if inp:
            user = f"{instruction}\n\nContext:\n{inp}"
    elif inp:
        user = inp
    else:
        return None
    return {
        "messages": [
            {"role": "system",    "content": SYSTEM_PROMPT},
            {"role": "user",      "content": user},
            {"role": "assistant", "content": output},
        ]
    }


def normalize_messages(example: dict) -> dict | None:
    """Strip metadata, inject system prompt if missing."""
    msgs = example.get("messages", [])
    if not msgs:
        return None
    # Strip metadata key
    clean_msgs = []
    for m in msgs:
        if m.get("role") not in ("system", "user", "assistant"):
            continue
        clean_msgs.append({"role": m["role"], "content": m.get("content", "")})
    if not clean_msgs:
        return None
    # Inject system prompt if absent
    if clean_msgs[0]["role"] != "system":
        clean_msgs.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    return {"messages": clean_msgs}


def process_alpaca(path: Path, min_len: int) -> tuple[list[dict], dict]:
    stats: dict[str, Any] = {"total": 0, "off_topic": 0, "short": 0, "kept": 0}
    results = []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            ex = json.loads(line)
            stats["total"] += 1
            if _is_off_topic(ex):
                stats["off_topic"] += 1
                continue
            norm = normalize_alpaca(ex)
            if norm is None:
                stats["short"] += 1
                continue
            if _answer_len(norm) < min_len:
                stats["short"] += 1
                continue
            results.append(norm)
            stats["kept"] += 1
    return results, stats


def process_messages(path: Path, min_len: int, cap: int) -> tuple[list[dict], dict]:
    stats: dict[str, Any] = {"total": 0, "short": 0, "kept": 0, "capped": {}}
    all_examples: list[dict] = []

    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            ex = json.loads(line)
            stats["total"] += 1
            norm = normalize_messages(ex)
            if norm is None:
                continue
            if _answer_len(norm) < min_len:
                stats["short"] += 1
                continue
            all_examples.append(norm)

    # Cap per provider, keeping richest by answer length
    provider_buckets: dict[str, list[dict]] = {k: [] for k in PROVIDER_KEYWORDS}
    generic = []
    for ex in all_examples:
        p = _provider(ex)
        if p:
            provider_buckets[p].append(ex)
        else:
            generic.append(ex)

    results = list(generic)
    for name, bucket in provider_buckets.items():
        # Sort by descending answer length, keep top cap
        bucket.sort(key=_answer_len, reverse=True)
        kept = bucket[:cap]
        stats["capped"][name] = {"total": len(bucket), "kept": len(kept)}
        results.extend(kept)

    stats["kept"] = len(results)
    return results, stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean Solana Clawd training data")
    parser.add_argument("--cap",            type=int, default=500,
                        help="Max examples per repetitive provider (default: 500)")
    parser.add_argument("--min-answer-len", type=int, default=80,
                        help="Minimum assistant answer length (default: 80)")
    parser.add_argument("--dry-run",        action="store_true",
                        help="Print stats only, do not write output")
    args = parser.parse_args()

    alpaca_path  = BASE_DIR / "solana1_yourgpt.jsonl"
    msgs_path    = BASE_DIR / "trainingday.jsonl"
    seed_path    = BASE_DIR / "data" / "solana_clawd_seed.jsonl"
    out_path     = BASE_DIR / "data" / "solana_clawd_merged.jsonl"

    print("── Cleaning solana1_yourgpt.jsonl ──────────────────────────────")
    alpaca_examples, alpaca_stats = process_alpaca(alpaca_path, args.min_answer_len)
    print(f"  Total:     {alpaca_stats['total']}")
    print(f"  Off-topic: {alpaca_stats['off_topic']}")
    print(f"  Short:     {alpaca_stats['short']}")
    print(f"  Kept:      {alpaca_stats['kept']}")

    print()
    print("── Cleaning trainingday.jsonl ──────────────────────────────────")
    msgs_examples, msgs_stats = process_messages(msgs_path, args.min_answer_len, args.cap)
    print(f"  Total:     {msgs_stats['total']}")
    print(f"  Short:     {msgs_stats['short']}")
    for prov, info in msgs_stats["capped"].items():
        print(f"  {prov}: {info['total']} → capped at {info['kept']}")
    print(f"  Kept:      {msgs_stats['kept']}")

    print()
    print("── Loading seed.jsonl (pass-through) ───────────────────────────")
    seed_examples = []
    with open(seed_path) as f:
        for line in f:
            if line.strip():
                ex = json.loads(line)
                # Ensure system prompt is correct
                msgs = ex.get("messages", [])
                if msgs and msgs[0]["role"] == "system":
                    msgs[0]["content"] = SYSTEM_PROMPT
                seed_examples.append(ex)
    print(f"  Seed examples: {len(seed_examples)}")

    all_examples = seed_examples + alpaca_examples + msgs_examples
    print()
    print(f"── Total merged: {len(all_examples)} examples ─────────────────")
    print(f"   seed:    {len(seed_examples)}")
    print(f"   alpaca:  {len(alpaca_examples)}")
    print(f"   msgs:    {len(msgs_examples)}")

    if args.dry_run:
        print("\n[dry-run] No files written.")
        return

    with open(out_path, "w") as f:
        for ex in all_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    print(f"\nWrote {len(all_examples)} examples → {out_path}")
    print("\nNext:")
    print("  python3 scripts/add_deepsol_zkr_examples.py")
    print("  python3 scripts/prepare_dataset.py \\")
    print("    --input data/solana_clawd_merged.jsonl \\")
    print("    --output data/processed --push --repo-id solanaclawd/solana-clawd-instruct")
    print("  ./scripts/launch_hf_jobs.sh a100-large glm52")


if __name__ == "__main__":
    main()
