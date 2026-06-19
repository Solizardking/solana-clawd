#!/usr/bin/env python3
"""Verify the full solana-clawd Core AI training/release goal.

This is the broad completion gate for the persistent setup task. It checks:

- every core-ai and ai-training path named in the setup request;
- public Hugging Face dataset repos and parquet artifacts;
- the Core AI LoRA adapter repo files;
- local dataset manifests; and
- common credential patterns in release-facing docs/manifests.

The script never prints secret values.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from huggingface_hub import HfApi


SCRIPT_DIR = Path(__file__).resolve().parent
AI_TRAINING_DIR = SCRIPT_DIR.parent
REPO_ROOT = AI_TRAINING_DIR.parent

CORE_AI_DIRS = [
    "core-ai",
    "core-ai/.agents",
    "core-ai/.clawd-plugin",
    "core-ai/.github",
    "core-ai/clawd-agents",
    "core-ai/clawd-code",
    "core-ai/clawd-grok",
    "core-ai/docs",
    "core-ai/helius-cli",
    "core-ai/helius-cursor",
    "core-ai/helius-mcp",
    "core-ai/helius-plugin",
    "core-ai/helius-skills",
    "core-ai/knowledge",
    "core-ai/mcp-server",
    "core-ai/scripts",
    "core-ai/v3",
]
CORE_AI_FILES = [
    "core-ai/.gitignore",
    "core-ai/.npmrc",
    "core-ai/AGENTS.md",
    "core-ai/CLAUDE.md",
    "core-ai/CLAWD.md",
    "core-ai/CONTRIBUTING.md",
    "core-ai/glama.json",
    "core-ai/LICENSE",
    "core-ai/package.json",
    "core-ai/README.md",
    "core-ai/versions.json",
]
AI_TRAINING_DIRS = [
    "ai-training",
    "ai-training/configs",
    "ai-training/dao",
    "ai-training/data",
    "ai-training/memory",
    "ai-training/ollama",
    "ai-training/outputs",
    "ai-training/perps",
    "ai-training/scripts",
]
AI_TRAINING_FILES = [
    "ai-training/.gitignore",
    "ai-training/dataset_card.md",
    "ai-training/model_card.md",
    "ai-training/onchainai.md",
    "ai-training/README.md",
    "ai-training/requirements.txt",
    "ai-training/solana1_yourgpt.jsonl",
    "ai-training/trainingday.jsonl",
]

DATASET_REPOS = [
    "solanaclawd/solana-clawd-core-ai-instruct",
    "solanaclawd/solana-clawd-realtime-research-instruct",
    "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
]
MODEL_REPO = "solanaclawd/solana-clawd-core-ai-1.5b-lora"
REQUIRED_MODEL_FILES = {
    "README.md",
    "adapter_config.json",
    "adapter_model.safetensors",
}
MANIFESTS = [
    AI_TRAINING_DIR / "data/core_ai_dataset_manifest.json",
    AI_TRAINING_DIR / "data/realtime_research_dataset_manifest.json",
    AI_TRAINING_DIR / "data/nvidia_trading_factory_manifest.json",
]
SECRET_PATTERNS = {
    "google_oauth_secret_file": re.compile("client" + r"_secret_\d+[-\w]+\.apps\.googleusercontent\.com\.json"),
    "google_adc_path": re.compile(r"\.config/gcloud/application_default_credentials\.json"),
    "google_oauth_token": re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----"),
    "wandb_key": re.compile(r"\bwandb(?:_v1)?_[A-Za-z0-9_-]{32,}\b"),
}
SECRET_SCAN_TARGETS = [
    AI_TRAINING_DIR / "README.md",
    AI_TRAINING_DIR / "dataset_card.md",
    AI_TRAINING_DIR / "model_card.md",
    AI_TRAINING_DIR / "onchain.md",
    AI_TRAINING_DIR / "onchainai.md",
    AI_TRAINING_DIR / "model-kit/README.md",
    AI_TRAINING_DIR / "data/core_ai_dataset_card.md",
    AI_TRAINING_DIR / "data/core_ai_dataset_manifest.json",
    AI_TRAINING_DIR / "data/realtime_research_dataset_card.md",
    AI_TRAINING_DIR / "data/realtime_research_dataset_manifest.json",
    AI_TRAINING_DIR / "data/nvidia_trading_factory_dataset_card.md",
    AI_TRAINING_DIR / "data/nvidia_trading_factory_manifest.json",
    AI_TRAINING_DIR / "configs/realtime_dataset_config.yaml",
    AI_TRAINING_DIR / "configs/nvidia_trading_factory_config.yaml",
    AI_TRAINING_DIR / "configs/nvidia_trading_factory_lora_config.yaml",
    AI_TRAINING_DIR / "configs/core_ai_lora_config.yaml",
]


@dataclass
class CheckResult:
    ok: bool = True

    def fail(self) -> None:
        self.ok = False


def repo_files(api: HfApi, repo_id: str, repo_type: str) -> set[str]:
    return set(api.list_repo_files(repo_id=repo_id, repo_type=repo_type))


def print_path_status(root: Path, rel_path: str, expected: str, result: CheckResult) -> None:
    path = root / rel_path
    if expected == "dir":
        ok = path.is_dir()
    elif expected == "file":
        ok = path.is_file()
    else:
        ok = path.exists()
    if ok:
        print(f"OK   {expected:<4} {rel_path}")
    else:
        result.fail()
        print(f"FAIL {expected:<4} {rel_path}")


def verify_paths(result: CheckResult) -> None:
    print("[local-paths]")
    for rel_path in CORE_AI_DIRS + AI_TRAINING_DIRS:
        print_path_status(REPO_ROOT, rel_path, "dir", result)
    for rel_path in CORE_AI_FILES + AI_TRAINING_FILES:
        print_path_status(REPO_ROOT, rel_path, "file", result)


def manifest_example_count(data: dict) -> int | None:
    counts = data.get("counts")
    if isinstance(counts, dict) and isinstance(counts.get("examples"), int):
        return counts["examples"]
    stats = data.get("stats")
    if isinstance(stats, dict):
        for key in ("total_examples", "examples"):
            if isinstance(stats.get(key), int):
                return stats[key]
    return None


def verify_manifests(result: CheckResult) -> None:
    print("[manifests]")
    for path in MANIFESTS:
        rel_path = path.relative_to(REPO_ROOT)
        if not path.is_file():
            result.fail()
            print(f"FAIL {rel_path}: missing")
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            result.fail()
            print(f"FAIL {rel_path}: invalid json: {exc}")
            continue
        examples = manifest_example_count(data)
        if not examples or examples <= 0:
            result.fail()
            print(f"FAIL {rel_path}: examples={examples}")
        else:
            print(f"OK   {rel_path}: examples={examples}")


def verify_hub(result: CheckResult, local_only: bool) -> None:
    if local_only:
        print("[hub]")
        print("SKIP local-only mode")
        return
    api = HfApi()
    print("[hub-datasets]")
    for dataset_id in DATASET_REPOS:
        try:
            files = repo_files(api, dataset_id, "dataset")
        except Exception as exc:
            result.fail()
            print(f"FAIL {dataset_id}: {exc}")
            continue
        parquet_count = sum(1 for name in files if name.endswith(".parquet"))
        if "README.md" not in files or parquet_count < 3:
            result.fail()
            print(f"FAIL {dataset_id}: README_present={'README.md' in files} parquet_count={parquet_count}")
        else:
            print(f"OK   {dataset_id}: files={len(files)} parquet_count={parquet_count}")

    print("[hub-model]")
    try:
        files = repo_files(api, MODEL_REPO, "model")
    except Exception as exc:
        result.fail()
        print(f"FAIL {MODEL_REPO}: {exc}")
        return
    missing = sorted(REQUIRED_MODEL_FILES - files)
    if missing:
        result.fail()
        print(f"PENDING {MODEL_REPO}: missing={missing}")
    else:
        print(f"OK      {MODEL_REPO}: adapter files present")


def scan_files(paths: Iterable[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in paths:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append((str(path.relative_to(REPO_ROOT)), name))
    return findings


def verify_secret_scan(result: CheckResult) -> None:
    print("[secret-scan]")
    findings = scan_files(SECRET_SCAN_TARGETS)
    if findings:
        result.fail()
        for path, name in findings:
            print(f"FAIL {path}: matched {name}")
    else:
        print("OK   no private credential patterns found in release docs/manifests")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-only", action="store_true", help="Skip Hugging Face Hub checks")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when any check fails")
    args = parser.parse_args()

    result = CheckResult()
    verify_paths(result)
    verify_manifests(result)
    verify_hub(result, local_only=args.local_only)
    verify_secret_scan(result)

    if args.strict and not result.ok:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
