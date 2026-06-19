"""
NVIDIA pipeline → SFT dataset builder.

Aggregates outputs from all NVIDIA blueprints into a new SFT JSONL
that can be merged into the Clawd training pipeline via prepare_dataset.py.

Sources:
  - data/nvidia_signal_log.jsonl       ← Blueprint 4 signal agent
  - data/nvidia_aiq_results.json       ← Blueprint 6 AIQ results
  - data/nvidia_trading_factory_sft.jsonl  ← existing trading factory dataset
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


BASE_DIR = Path(__file__).parents[2]
DATA_DIR = BASE_DIR / "data"
SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You have access to Phoenix perpetuals markets via Vulcan CLI, "
    "NVIDIA NIM inference endpoints, and GPU-accelerated portfolio optimization. "
    "Always operate within your trust gates. Default to paper mode."
)


def load_signal_log(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                # Ensure system prompt is the Clawd one
                messages = obj.get("messages", [])
                if messages and messages[0].get("role") == "system":
                    messages[0]["content"] = SYSTEM_PROMPT
                records.append({"messages": messages})
            except json.JSONDecodeError:
                pass
    return records


def load_aiq_results(path: Path) -> list[dict]:
    """Convert AIQ eval results into SFT examples."""
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        if isinstance(data, list):
            results = data
        elif isinstance(data, dict):
            results = data.get("results", [])
        else:
            return []
    except (json.JSONDecodeError, OSError):
        return []

    records = []
    for r in results:
        if not r.get("correct") or not r.get("answer"):
            continue
        records.append({
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": r.get("prompt", "")},
                {"role": "assistant", "content": r.get("answer", "")},
            ]
        })
    return records


def load_trading_factory(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def build(output_path: Path) -> int:
    all_records = []

    for loader, src in [
        (load_signal_log, DATA_DIR / "nvidia_signal_log.jsonl"),
        (load_aiq_results, DATA_DIR / "nvidia_aiq_results.json"),
        (load_trading_factory, DATA_DIR / "nvidia_trading_factory_sft.jsonl"),
    ]:
        batch = loader(src)
        print(f"  {src.name}: {len(batch)} examples")
        all_records.extend(batch)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        for rec in all_records:
            f.write(json.dumps(rec) + "\n")

    return len(all_records)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NVIDIA SFT dataset from pipeline outputs")
    parser.add_argument("--output", default=str(DATA_DIR / "nvidia_combined_sft.jsonl"))
    args = parser.parse_args()

    print(f"[nvidia-sft] Building combined SFT dataset from NVIDIA pipeline outputs...")
    n = build(Path(args.output))
    print(f"[nvidia-sft] wrote {n} examples → {args.output}")
    print(f"\nNext: merge into main dataset and push to Hub:")
    print(f"  python3 scripts/prepare_dataset.py \\")
    print(f"    --input {args.output} \\")
    print(f"    --push --repo-id solanaclawd/solana-clawd-nvidia-trading-factory-instruct")


if __name__ == "__main__":
    main()
