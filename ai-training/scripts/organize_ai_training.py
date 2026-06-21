#!/usr/bin/env python3
"""Inventory and verify the Solana Clawd AI training layout."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any


AI_TRAINING_DIR = Path(__file__).resolve().parents[1]

LAYOUT: list[dict[str, Any]] = [
    {
        "path": "README.md",
        "area": "entrypoint",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Public project entrypoint and one-shot bootstrap.",
    },
    {
        "path": "STRUCTURE.md",
        "area": "entrypoint",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Human-readable ownership map for source, generated, and cache lanes.",
    },
    {
        "path": ".gitignore",
        "area": "entrypoint",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Ignore policy for weights, generated outputs, build artifacts, caches, and secrets.",
    },
    {
        "path": "requirements.txt",
        "area": "entrypoint",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Python dependency baseline.",
    },
    {
        "path": "model_card.md",
        "area": "release",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Model card template and release notes.",
    },
    {
        "path": "dataset_card.md",
        "area": "release",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Dataset card template and provenance notes.",
    },
    {
        "path": "onchain.md",
        "area": "onchain",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Onchain registration notes.",
    },
    {
        "path": "onchainai.md",
        "area": "onchain",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Solana AI network notes.",
    },
    {
        "path": "clawd_solana_svm_ai_compute_design.md",
        "area": "onchain",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "SVM AI compute design document.",
    },
    {
        "path": "SESSIONS.md",
        "area": "operations",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Session notes and operational history.",
    },
    {
        "path": "Anchor.toml",
        "area": "programs",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Anchor workspace configuration.",
    },
    {
        "path": "Cargo.toml",
        "area": "programs",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Rust workspace manifest.",
    },
    {
        "path": "Cargo.lock",
        "area": "programs",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Locked Rust dependency graph.",
    },
    {
        "path": "model-kit",
        "area": "model-kit",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "One-shot model kit CLI, frontend, onboarding, Hugging Face, Unsloth, Ollama, and x402 docs.",
    },
    {
        "path": "model-kit/bin",
        "area": "model-kit",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Terminal entrypoints for the model kit.",
    },
    {
        "path": "model-kit/docs",
        "area": "model-kit",
        "classification": "docs",
        "required": True,
        "expected_kind": "directory",
        "description": "Model-kit guides.",
    },
    {
        "path": "model-kit/docs/PERPS.md",
        "area": "model-kit",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Perps tool lane guide for the model kit.",
    },
    {
        "path": "model-kit/frontend",
        "area": "model-kit",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Static frontend console.",
    },
    {
        "path": "model-kit/clawd_model_kit.py",
        "area": "model-kit",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Model-kit Python CLI wrapper.",
    },
    {
        "path": "model-kit/config.example.yaml",
        "area": "model-kit",
        "classification": "config",
        "required": True,
        "expected_kind": "file",
        "description": "Example project and lane defaults.",
    },
    {
        "path": "configs",
        "area": "training",
        "classification": "config",
        "required": True,
        "expected_kind": "directory",
        "description": "Training and LoRA configuration files.",
    },
    {
        "path": "data",
        "area": "training",
        "classification": "data",
        "required": True,
        "expected_kind": "directory",
        "description": "Dataset inputs, manifests, processed splits, and strategy handoffs.",
    },
    {
        "path": "data/model_kit",
        "area": "model-kit",
        "classification": "generated",
        "required": False,
        "expected_kind": "directory",
        "description": "Generated optimized datasets, quality reports, and processed splits for model-kit reruns.",
    },
    {
        "path": "dao",
        "area": "onchain",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "DAO design, model registration scripts, and attestation helpers.",
    },
    {
        "path": "docs",
        "area": "docs",
        "classification": "docs",
        "required": False,
        "expected_kind": "directory",
        "description": "Optional long-form docs beyond the public README and cards.",
    },
    {
        "path": "memory",
        "area": "runtime",
        "classification": "source",
        "required": False,
        "expected_kind": "directory",
        "description": "Local memory integration helpers.",
    },
    {
        "path": "echo",
        "area": "legacy",
        "classification": "generated",
        "required": False,
        "expected_kind": "directory",
        "description": "Legacy scratch or placeholder lane.",
    },
    {
        "path": "dirs created",
        "area": "legacy",
        "classification": "generated",
        "required": False,
        "expected_kind": "directory",
        "description": "Legacy scratch or placeholder lane.",
    },
    {
        "path": "nvidia",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "NVIDIA AI Blueprint integration lane.",
    },
    {
        "path": "nvidia/README.md",
        "area": "nvidia",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "NVIDIA integration entrypoint.",
    },
    {
        "path": "nvidia/NEMOTRON_ULTRA_AGENT.md",
        "area": "nvidia",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Nemotron Ultra agent notes.",
    },
    {
        "path": "nvidia/nemotron_ultra_agent.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Nemotron Ultra agent script.",
    },
    {
        "path": "nvidia/integration",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Bridge source between NVIDIA Blueprints, Clawd, Trading Factory, Hugging Face, and Ollama.",
    },
    {
        "path": "nvidia/integration/README.md",
        "area": "nvidia",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Detailed integration ownership and command map.",
    },
    {
        "path": "nvidia/integration/clawd_nim_bridge.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Routed NIM/HF/Clawd/Ollama chat bridge.",
    },
    {
        "path": "nvidia/integration/dataset_nvidia_sft.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "NVIDIA blueprint output to SFT dataset builder.",
    },
    {
        "path": "nvidia/integration/nemo_clawd.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Core AI inventory and NemoClawd blueprint writer.",
    },
    {
        "path": "nvidia/integration/nemo_clawd_agent.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "NVIDIA Clawd agent plan writer.",
    },
    {
        "path": "nvidia/integration/trading_factory_nvidia.py",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Signal discovery to Trading Factory paper-strategy bridge.",
    },
    {
        "path": "nvidia/scripts",
        "area": "nvidia",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "NVIDIA setup and verification scripts.",
    },
    {
        "path": "nvidia/outputs",
        "area": "nvidia",
        "classification": "generated",
        "required": False,
        "expected_kind": "directory",
        "description": "Generated NVIDIA blueprint outputs and local model artifacts.",
    },
    {
        "path": "ollama",
        "area": "publish",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Ollama Modelfiles and local build/push helper.",
    },
    {
        "path": "outputs",
        "area": "release",
        "classification": "generated",
        "required": False,
        "expected_kind": "directory",
        "description": "Generated release cards, audits, job logs, bundles, and preflight summaries.",
    },
    {
        "path": "perps",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Phoenix/Vulcan model-facing perps tool interface.",
    },
    {
        "path": "perps/README.md",
        "area": "tools",
        "classification": "docs",
        "required": True,
        "expected_kind": "file",
        "description": "Perps source toolkit documentation.",
    },
    {
        "path": "perps/functions.py",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "OpenAI/Hermes perps function-call tools.",
    },
    {
        "path": "perps/functioncall.py",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Hermes perps function-calling harness.",
    },
    {
        "path": "perps/nvidia_perps.py",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "NVIDIA perps handoff writer.",
    },
    {
        "path": "perps/prompter.py",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Perps prompt construction helpers.",
    },
    {
        "path": "perps/schema.py",
        "area": "tools",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Perps Pydantic schemas.",
    },
    {
        "path": "programs",
        "area": "programs",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Anchor programs for Clawd core, registry, and treasury.",
    },
    {
        "path": "schemas",
        "area": "contracts",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "JSON schemas and contract definitions.",
    },
    {
        "path": "schemas/ai_training_layout.schema.json",
        "area": "contracts",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Schema for this layout inventory.",
    },
    {
        "path": "scripts",
        "area": "operations",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Training, dataset, release, and verification scripts.",
    },
    {
        "path": "scripts/organize_ai_training.py",
        "area": "operations",
        "classification": "source",
        "required": True,
        "expected_kind": "file",
        "description": "Layout inventory and check script.",
    },
    {
        "path": "sdk",
        "area": "sdk",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Python and TypeScript SDK surfaces.",
    },
    {
        "path": "space",
        "area": "demo",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Hugging Face Space demo app.",
    },
    {
        "path": "studio",
        "area": "frontend",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Local frontend studio for the training stack.",
    },
    {
        "path": "target",
        "area": "programs",
        "classification": "build",
        "required": False,
        "expected_kind": "directory",
        "description": "Rust/Anchor build output.",
    },
    {
        "path": "tests",
        "area": "tests",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Program and integration tests.",
    },
    {
        "path": "trading_factory",
        "area": "trading-factory",
        "classification": "source",
        "required": True,
        "expected_kind": "directory",
        "description": "Trading Factory, auto-research wiki, cuFOLIO references, and Solana factory.",
    },
    {
        "path": "solana1_yourgpt.jsonl",
        "area": "training",
        "classification": "data",
        "required": True,
        "expected_kind": "file",
        "description": "Legacy/source training JSONL input.",
    },
    {
        "path": "trainingday.jsonl",
        "area": "training",
        "classification": "data",
        "required": True,
        "expected_kind": "file",
        "description": "Legacy/source training JSONL input.",
    },
    {
        "path": "nvidia/integration/__pycache__",
        "area": "nvidia",
        "classification": "cache",
        "required": False,
        "expected_kind": "directory",
        "description": "Generated Python bytecode cache.",
    },
]


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def actual_kind(path: Path) -> str:
    if path.is_file():
        return "file"
    if path.is_dir():
        return "directory"
    if path.exists():
        return "other"
    return "missing"


def entry_for(spec: dict[str, Any]) -> dict[str, Any]:
    path = AI_TRAINING_DIR / spec["path"]
    entry = dict(spec)
    entry["exists"] = path.exists()
    entry["actual_kind"] = actual_kind(path)
    if path.is_file():
        entry["size_bytes"] = path.stat().st_size
    elif path.is_dir():
        children = sorted(child.name for child in path.iterdir())
        entry["child_count"] = len(children)
        entry["sample_children"] = children[:30]
    return entry


def build_inventory() -> dict[str, Any]:
    entries = [entry_for(spec) for spec in LAYOUT]
    missing_required = [
        entry["path"]
        for entry in entries
        if entry["required"]
        and (not entry["exists"] or entry["actual_kind"] != entry["expected_kind"])
    ]
    summary = {
        "total": len(entries),
        "present": sum(1 for entry in entries if entry["exists"]),
        "missing": sum(1 for entry in entries if not entry["exists"]),
        "required": sum(1 for entry in entries if entry["required"]),
        "missing_required": len(missing_required),
    }
    return {
        "schema_version": "1.0",
        "generated_at": utc_now(),
        "root": AI_TRAINING_DIR.as_posix(),
        "summary": summary,
        "entries": entries,
        "missing_required": missing_required,
        "policy": {
            "source_lanes": sorted(
                entry["path"]
                for entry in entries
                if entry["classification"] in {"source", "config", "docs"}
            ),
            "generated_lanes": sorted(
                entry["path"] for entry in entries if entry["classification"] == "generated"
            ),
            "cache_lanes": sorted(
                entry["path"] for entry in entries if entry["classification"] in {"cache", "build"}
            ),
        },
    }


def resolve_output(raw_output: str) -> Path:
    output = Path(raw_output)
    if not output.is_absolute():
        output = AI_TRAINING_DIR / output
    output = output.resolve()
    try:
        output.relative_to(AI_TRAINING_DIR.resolve())
    except ValueError as exc:
        raise SystemExit(f"Refusing to write outside ai-training: {output}") from exc
    return output


def print_summary(inventory: dict[str, Any]) -> None:
    summary = inventory["summary"]
    print(
        "[layout] "
        f"present={summary['present']}/{summary['total']} "
        f"required_missing={summary['missing_required']}"
    )
    if inventory["missing_required"]:
        print("[layout] missing required paths:")
        for path in inventory["missing_required"]:
            print(f"FAIL {path}")
    else:
        print("[layout] OK required source/docs/config paths are present")

    generated = [
        entry["path"]
        for entry in inventory["entries"]
        if entry["classification"] in {"generated", "cache", "build"} and entry["exists"]
    ]
    if generated:
        print("[layout] generated/cache/build lanes present:")
        for path in generated:
            print(f"INFO {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail when a required path is missing or has the wrong kind.")
    parser.add_argument("--json", action="store_true", help="Print the full inventory JSON.")
    parser.add_argument("--write", action="store_true", help="Write the inventory JSON.")
    parser.add_argument("--output", default="outputs/ai_training_inventory.json", help="Inventory output path under ai-training.")
    args = parser.parse_args()

    inventory = build_inventory()

    if args.write:
        output = resolve_output(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"[layout] wrote {output.relative_to(AI_TRAINING_DIR).as_posix()}")

    if args.json:
        print(json.dumps(inventory, indent=2, sort_keys=True))
    else:
        print_summary(inventory)

    if args.check and inventory["missing_required"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
