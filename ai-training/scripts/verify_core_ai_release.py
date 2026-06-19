#!/usr/bin/env python3
"""Verify the Core AI dataset/model release without printing secrets."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

from huggingface_hub import HfApi


DEFAULT_DATASETS = [
    "solanaclawd/solana-clawd-core-ai-instruct",
    "solanaclawd/solana-clawd-realtime-research-instruct",
]
DEFAULT_MODEL = "solanaclawd/solana-clawd-core-ai-1.5b-lora"
REQUIRED_MODEL_FILES = {
    "adapter_config.json",
    "adapter_model.safetensors",
    "README.md",
}
SECRET_PATTERNS = {
    "google_oauth_secret_file": re.compile("client" + r"_secret_\d+[-\w]+\.apps\.googleusercontent\.com\.json"),
    "google_adc_path": re.compile(r"\.config/gcloud/application_default_credentials\.json"),
    "google_oauth_token": re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----"),
    "wandb_key": re.compile(r"\bwandb_[A-Za-z0-9_-]{32,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
}


def repo_files(api: HfApi, repo_id: str, repo_type: str) -> set[str]:
    return set(api.list_repo_files(repo_id=repo_id, repo_type=repo_type))


def scan_files(paths: Iterable[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="utf-8", errors="ignore")
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append((str(path), name))
    return findings


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def manifest_counts(data: dict) -> tuple[int | str, int | str]:
    counts = data.get("counts")
    if isinstance(counts, dict):
        return counts.get("examples", "unknown"), counts.get("sources", "unknown")
    stats = data.get("stats")
    if isinstance(stats, dict):
        examples = stats.get("total_examples") or stats.get("examples") or "unknown"
        core_ai = stats.get("core_ai") if isinstance(stats.get("core_ai"), dict) else {}
        sources = stats.get("source_files") or stats.get("sources") or core_ai.get("files_used") or "unknown"
        return examples, sources
    sources = data.get("sources")
    source_count = len(sources) if isinstance(sources, list) else "unknown"
    return "unknown", source_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--dataset", action="append", default=[])
    parser.add_argument("--manifest", default="data/core_ai_dataset_manifest.json")
    parser.add_argument("--realtime-manifest", default="data/realtime_research_dataset_manifest.json")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero if the model adapter is not released yet")
    args = parser.parse_args()

    api = HfApi()
    ok = True
    datasets = args.dataset or DEFAULT_DATASETS

    print("[datasets]")
    for dataset_id in datasets:
        try:
            files = repo_files(api, dataset_id, "dataset")
        except Exception as exc:
            ok = False
            print(f"FAIL {dataset_id}: {exc}")
            continue
        required = {"README.md"}
        parquet_files = {name for name in files if name.endswith(".parquet")}
        missing = sorted(required - files)
        if missing or not parquet_files:
            ok = False
            print(f"FAIL {dataset_id}: missing={missing} parquet_count={len(parquet_files)}")
        else:
            print(f"OK   {dataset_id}: files={len(files)} parquet_count={len(parquet_files)}")

    print("[model]")
    try:
        files = repo_files(api, args.model, "model")
    except Exception as exc:
        ok = False
        files = set()
        print(f"FAIL {args.model}: {exc}")
    missing_model = sorted(REQUIRED_MODEL_FILES - files)
    if missing_model:
        ok = False
        print(f"PENDING {args.model}: missing={missing_model}")
    else:
        print(f"OK      {args.model}: adapter files present")

    print("[manifests]")
    for path in [Path(args.manifest), Path(args.realtime_manifest)]:
        data = load_manifest(path)
        if not data:
            ok = False
            print(f"FAIL {path}: missing or unreadable")
            continue
        examples, sources = manifest_counts(data)
        print(f"OK   {path}: examples={examples} sources={sources}")

    print("[secret-scan]")
    scan_targets = [
        Path("README.md"),
        Path("dataset_card.md"),
        Path("model_card.md"),
        Path("configs/realtime_dataset_config.yaml"),
        Path("data/realtime_research_dataset_card.md"),
        Path("data/realtime_research_dataset_manifest.json"),
        Path("data/core_ai_dataset_card.md"),
        Path("data/core_ai_dataset_manifest.json"),
    ]
    findings = scan_files(scan_targets)
    if findings:
        ok = False
        for path, name in findings:
            print(f"FAIL {path}: matched {name}")
    else:
        print("OK   no private credential patterns found in release docs/manifests")

    if args.strict and not ok:
        return 1
    return 0 if ok or not args.strict else 1


if __name__ == "__main__":
    sys.exit(main())
