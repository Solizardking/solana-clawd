#!/usr/bin/env python3
"""
Prepare the Solana Clawd instruction dataset for SFT training.

Reads JSONL files from data/ and emits a Hugging Face Datasets-compatible
directory with train/eval/test splits.

Supported row formats:
  - {"messages": [...]} for instruction tuning
  - {"text": "..."} for CPT / continued-pretraining corpora

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
import hashlib
import json
import os
import random
from pathlib import Path
from typing import Any

from datasets import Dataset, DatasetDict


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", nargs="+", default=["data/solana_clawd_seed.jsonl"],
                   help="Input JSONL file(s). Rows may be {\"messages\": [...]} or {\"text\": \"...\"}")
    p.add_argument("--output", default="data/processed",
                   help="Output directory for processed parquet + dataset_info")
    p.add_argument("--train-ratio", type=float, default=0.9)
    p.add_argument("--eval-ratio", type=float, default=0.05)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--min-messages", type=int, default=2,
                   help="Filter out examples with fewer than N messages")
    p.add_argument("--format", choices=["auto", "messages", "text"], default="auto",
                   help="Expected row format. auto accepts messages and text records.")
    p.add_argument("--dedupe", action=argparse.BooleanOptionalAction, default=True,
                   help="Remove duplicate examples by normalized content fingerprint")
    p.add_argument("--quality-report", default=None,
                   help="Optional JSON quality report path")
    p.add_argument("--push", action="store_true", help="Push to Hugging Face Hub after processing")
    p.add_argument("--repo-id", default="solanaclawd/solana-clawd-instruct",
                   help="Hub repo id when --push is set")
    p.add_argument("--private", action="store_true", help="Make the Hub repo private")
    return p.parse_args()


def _row_matches_format(obj: dict[str, Any], data_format: str) -> bool:
    has_messages = isinstance(obj.get("messages"), list)
    has_text = isinstance(obj.get("text"), str)
    if data_format == "messages":
        return has_messages
    if data_format == "text":
        return has_text
    return has_messages or has_text


def load_jsonl(paths: list[str], data_format: str) -> list[dict[str, Any]]:
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
                if not _row_matches_format(obj, data_format):
                    print(f"  WARNING: {p}:{lineno} missing requested row format ({data_format})")
                    continue
                examples.append(obj)
    return examples


def validate_example(ex: dict[str, Any], min_messages: int) -> bool:
    if "text" in ex:
        return isinstance(ex["text"], str) and bool(ex["text"].strip())

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


def example_fingerprint(ex: dict[str, Any]) -> str:
    if "text" in ex and isinstance(ex["text"], str):
        material = {"text": " ".join(ex["text"].split())}
    else:
        material = {
            "messages": [
                {
                    "role": str(msg.get("role", "")).strip().lower(),
                    "content": " ".join(str(msg.get("content", "")).split()),
                }
                for msg in ex.get("messages", [])
                if isinstance(msg, dict)
            ]
        }
    return hashlib.sha256(json.dumps(material, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def dedupe_examples(examples: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    duplicates = 0
    for ex in examples:
        fp = example_fingerprint(ex)
        if fp in seen:
            duplicates += 1
            continue
        seen.add(fp)
        out.append(ex)
    return out, duplicates


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


def normalize_schema(examples: list[dict[str, Any]]) -> None:
    has_messages = any("messages" in ex for ex in examples)
    has_text = any("text" in ex for ex in examples)
    has_metadata = any("metadata" in ex for ex in examples)
    for ex in examples:
        if has_messages and "messages" not in ex:
            ex["messages"] = []
        if has_text and "text" not in ex:
            ex["text"] = ""
        if has_metadata and "metadata" not in ex:
            ex["metadata"] = {}


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] Loading from: {args.input}")
    raw = load_jsonl(args.input, args.format)
    print(f"      loaded {len(raw)} raw examples")

    print(f"[2/4] Validating (format={args.format}, min_messages={args.min_messages})")
    valid = [ex for ex in raw if validate_example(ex, args.min_messages)]
    duplicates_removed = 0
    if args.dedupe:
        valid, duplicates_removed = dedupe_examples(valid)
    normalize_metadata(valid)
    normalize_schema(valid)
    print(f"      {len(valid)} valid / {len(raw)} total  duplicates_removed={duplicates_removed}")

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
    schema: dict[str, str] = {}
    if any("messages" in ex for ex in valid):
        schema["messages"] = "list[{role: str, content: str}]"
    if any("text" in ex for ex in valid):
        schema["text"] = "str continued-pretraining text"
    if any("metadata" in ex for ex in valid):
        schema["metadata"] = "optional dict[str, str] normalized across splits"

    info = {
        "num_examples": n,
        "splits": {"train": len(train), "eval": len(eval_), "test": len(test)},
        "schema": schema,
        "source_files": args.input,
        "duplicates_removed": duplicates_removed,
    }
    with (out_dir / "dataset_info.json").open("w") as f:
        json.dump(info, f, indent=2)
    print(json.dumps(info, indent=2))
    if args.quality_report:
        report_path = Path(args.quality_report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
        print(f"  quality_report: {report_path}")

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
