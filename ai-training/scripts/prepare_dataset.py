#!/usr/bin/env python3
"""
Prepare the Solana Clawd instruction dataset for SFT training.

Reads JSONL files from data/ (each line is {"messages": [...]}) and
emits a Hugging Face Datasets-compatible directory with train/eval/test splits.

Outputs:
  - data/processed/train.parquet
  - data/processed/test.parquet
  - data/processed/dataset_dict.json

By default, splits as 90/5/5. Override with --train-ratio / --eval-ratio.

Usage:
  python3 scripts/prepare_dataset.py \
    --input data/solana_clawd_seed.jsonl \
    --output data/processed \
    --train-ratio 0.9 --eval-ratio 0.05

Push to Hub:
  python3 scripts/prepare_dataset.py --push --repo-id solanaclawd/solana-clawd-instruct
"""
from __future__ import annotations

import argparse
import json
import os
import random
from pathlib import Path
from typing import Any

from datasets import Dataset, DatasetDict


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", nargs="+", default=["data/solana_clawd_seed.jsonl"],
                   help="Input JSONL file(s). Each line: {\"messages\": [...]}")
    p.add_argument("--output", default="data/processed",
                   help="Output directory for processed parquet + dataset_info")
    p.add_argument("--train-ratio", type=float, default=0.9)
    p.add_argument("--eval-ratio", type=float, default=0.05)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--min-messages", type=int, default=2,
                   help="Filter out examples with fewer than N messages")
    p.add_argument("--push", action="store_true", help="Push to Hugging Face Hub after processing")
    p.add_argument("--repo-id", default="solanaclawd/solana-clawd-instruct",
                   help="Hub repo id when --push is set")
    p.add_argument("--private", action="store_true", help="Make the Hub repo private")
    return p.parse_args()


def load_jsonl(paths: list[str]) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    for path in paths:
        p = Path(path)
        if not p.exists():
            print(f"  WARNING: input not found, skipping: {p}")
            continue
        with p.open("r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"  WARNING: {p}:{lineno} invalid JSON: {e}")
                    continue
                if "messages" not in obj or not isinstance(obj["messages"], list):
                    print(f"  WARNING: {p}:{lineno} missing 'messages' list")
                    continue
                examples.append(obj)
    return examples


def validate_example(ex: dict[str, Any], min_messages: int) -> bool:
    msgs = ex.get("messages", [])
    if not isinstance(msgs, list) or len(msgs) < min_messages:
        return False
    roles = {m.get("role") for m in msgs}
    if "user" not in roles and "human" not in roles:
        return False
    if "assistant" not in roles and "gpt" not in roles:
        return False
    for m in msgs:
        if not isinstance(m, dict):
            return False
        if "role" not in m or "content" not in m:
            return False
        if not isinstance(m["content"], str) or not m["content"].strip():
            return False
    return True


def _metadata_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, ensure_ascii=False)
    return str(value)


def normalize_metadata(examples: list[dict[str, Any]]) -> None:
    keys = sorted(
        {
            key
            for ex in examples
            if isinstance(ex.get("metadata"), dict)
            for key in ex["metadata"]
        }
    )
    if not keys:
        return

    for ex in examples:
        metadata = ex.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        ex["metadata"] = {key: _metadata_value(metadata.get(key)) for key in keys}
        if "id" in ex and ex["id"] is not None:
            ex["id"] = str(ex["id"])


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] Loading from: {args.input}")
    raw = load_jsonl(args.input)
    print(f"      loaded {len(raw)} raw examples")

    print(f"[2/4] Validating (min_messages={args.min_messages})")
    valid = [ex for ex in raw if validate_example(ex, args.min_messages)]
    normalize_metadata(valid)
    print(f"      {len(valid)} valid / {len(raw)} total")

    rng.shuffle(valid)
    n = len(valid)
    n_train = int(n * args.train_ratio)
    n_eval = int(n * args.eval_ratio)
    train = valid[:n_train]
    eval_ = valid[n_train : n_train + n_eval]
    test = valid[n_train + n_eval :]
    if not test and eval_:
        # If dataset is tiny, fall back to using eval as test
        test = eval_
        eval_ = eval_

    print(f"[3/4] Splits: train={len(train)}  eval={len(eval_)}  test={len(test)}")

    ds = DatasetDict(
        {
            "train": Dataset.from_list(train),
            "eval": Dataset.from_list(eval_),
            "test": Dataset.from_list(test),
        }
    )

    print(f"[4/4] Saving to {out_dir}/")
    ds.save_to_disk(str(out_dir))

    # Also write parquet for easy Hub upload + inspection
    for split, data in [("train", train), ("eval", eval_), ("test", test)]:
        if data:
            Dataset.from_list(data).to_parquet(str(out_dir / f"{split}.parquet"))

    # Dataset card (README) — written separately as dataset_card.md
    info = {
        "num_examples": n,
        "splits": {"train": len(train), "eval": len(eval_), "test": len(test)},
        "schema": {
            "messages": "list[{role: str, content: str}]",
            "metadata": "optional dict[str, str] normalized across splits",
        },
        "source_files": args.input,
    }
    with (out_dir / "dataset_info.json").open("w") as f:
        json.dump(info, f, indent=2)
    print(json.dumps(info, indent=2))

    if args.push:
        print(f"Pushing to Hub: {args.repo_id}")
        ds.push_to_hub(args.repo_id, private=args.private)
        # Also push the parquets for direct streaming access
        from huggingface_hub import HfApi
        api = HfApi()
        for split in ["train", "eval", "test"]:
            parquet = out_dir / f"{split}.parquet"
            if parquet.exists():
                api.upload_file(
                    path_or_fileobj=str(parquet),
                    path_in_repo=f"data/{split}-00000-of-00001.parquet",
                    repo_id=args.repo_id,
                    repo_type="dataset",
                )
        print(f"  pushed: https://huggingface.co/datasets/{args.repo_id}")


if __name__ == "__main__":
    main()
