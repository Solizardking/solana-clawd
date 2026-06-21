"""
NVIDIA pipeline → SFT dataset builder.

Aggregates outputs from all NVIDIA blueprints into a new SFT JSONL
that can be merged into the Clawd training pipeline via prepare_dataset.py.

Sources:
  - data/nvidia_signal_log.jsonl       ← Blueprint 4 signal agent
  - data/nvidia_aiq_results.json       ← Blueprint 6 AIQ results
  - data/nvidia_trading_factory_sft.jsonl  ← existing trading factory dataset
  - data/strategies/nemo_clawd_blueprint.json ← Core AI + NemoClaw integration
  - data/strategies/nemo_clawd_core_inventory.json ← Core AI source inventory
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
    "You also understand Nemo Clawd: the Core AI runtime wrapped in a "
    "NemoClaw-style sandbox, network policy, lifecycle, and routed inference plan. "
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


def load_nemo_clawd_assets(blueprint_path: Path, inventory_path: Path) -> list[dict]:
    """Convert Nemo Clawd integration artifacts into SFT examples."""
    records: list[dict] = []
    if blueprint_path.exists():
        try:
            blueprint = json.loads(blueprint_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            blueprint = {}
        if blueprint:
            summary = {
                "name": blueprint.get("name"),
                "slug": blueprint.get("slug"),
                "upstream": blueprint.get("upstream"),
                "agent_profile": blueprint.get("agent_profile"),
                "sandbox_profile": blueprint.get("sandbox_profile"),
                "network_policy": blueprint.get("network_policy"),
                "inference_routing": blueprint.get("inference_routing"),
                "lifecycle": blueprint.get("lifecycle"),
                "safety_gates": blueprint.get("safety_gates"),
            }
            records.append(
                {
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": "Describe the Nemo Clawd runtime contract for Core AI inside NVIDIA integration.",
                        },
                        {
                            "role": "assistant",
                            "content": json.dumps(summary, indent=2, sort_keys=True),
                        },
                    ]
                }
            )

    if inventory_path.exists():
        try:
            inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            inventory = {}
        if inventory:
            compact = {
                "core_ai_root": inventory.get("core_ai_root"),
                "missing_required_paths": inventory.get("missing_required_paths", []),
                "packages": [
                    {
                        "path": pkg.get("path"),
                        "name": pkg.get("name"),
                        "scripts": pkg.get("scripts", []),
                    }
                    for pkg in inventory.get("packages", [])[:20]
                ],
                "skill_count": len(inventory.get("skills", [])),
                "mcp_tool_count": len(inventory.get("mcp_tools", [])),
                "required_paths": [
                    {
                        "path": item.get("path"),
                        "exists": item.get("exists"),
                        "kind": item.get("kind"),
                    }
                    for item in inventory.get("required_paths", [])
                ],
            }
            records.append(
                {
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": "What Core AI assets are mounted into Nemo Clawd?",
                        },
                        {
                            "role": "assistant",
                            "content": json.dumps(compact, indent=2, sort_keys=True),
                        },
                    ]
                }
            )
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

    nemo_batch = load_nemo_clawd_assets(
        DATA_DIR / "strategies" / "nemo_clawd_blueprint.json",
        DATA_DIR / "strategies" / "nemo_clawd_core_inventory.json",
    )
    print(f"  nemo_clawd_assets: {len(nemo_batch)} examples")
    all_records.extend(nemo_batch)

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
