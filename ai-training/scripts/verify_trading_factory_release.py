#!/usr/bin/env python3
"""Verify the NVIDIA Trading Factory dataset release without printing secrets."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

from huggingface_hub import HfApi


DEFAULT_DATASET = "solanaclawd/solana-clawd-nvidia-trading-factory-instruct"
DEFAULT_MANIFEST = Path("data/nvidia_trading_factory_manifest.json")
DEFAULT_CARD = Path("data/nvidia_trading_factory_dataset_card.md")
DEFAULT_PROCESSED = Path("data/nvidia_trading_factory_processed")
REQUIRED_PARQUETS = {
    "train.parquet",
    "eval.parquet",
    "test.parquet",
}
SECRET_PATTERNS = {
    "google_oauth_secret_file": re.compile("client" + r"_secret_\d+[-\w]+\.apps\.googleusercontent\.com\.json"),
    "google_adc_path": re.compile(r"\.config/gcloud/application_default_credentials\.json"),
    "google_oauth_token": re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----"),
    "wandb_key": re.compile(r"\bwandb_v1_[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
}


def scan_files(paths: Iterable[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in paths:
        if not path.exists() or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append((str(path), name))
    return findings


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def verify_local(manifest_path: Path, card_path: Path, processed_dir: Path) -> bool:
    ok = True
    print("[local]")
    manifest = load_manifest(manifest_path)
    if not manifest:
        print(f"FAIL {manifest_path}: missing or unreadable")
        ok = False
    else:
        counts = manifest.get("counts", {})
        splits = manifest.get("splits", {})
        examples = counts.get("examples")
        split_total = sum(value for value in splits.values() if isinstance(value, int))
        if not examples or split_total != examples:
            print(f"FAIL {manifest_path}: examples={examples} splits={splits}")
            ok = False
        else:
            print(f"OK   {manifest_path}: examples={examples} splits={splits}")

    if not card_path.exists():
        print(f"FAIL {card_path}: missing")
        ok = False
    else:
        print(f"OK   {card_path}")

    missing_parquets = sorted(name for name in REQUIRED_PARQUETS if not (processed_dir / name).exists())
    if missing_parquets:
        print(f"FAIL {processed_dir}: missing={missing_parquets}")
        ok = False
    else:
        print(f"OK   {processed_dir}: parquet_count={len(REQUIRED_PARQUETS)}")

    findings = scan_files(
        [
            manifest_path,
            card_path,
            Path("configs/nvidia_trading_factory_config.yaml"),
            Path("configs/nvidia_trading_factory_lora_config.yaml"),
            Path("README.md"),
            Path("dataset_card.md"),
        ]
    )
    if findings:
        ok = False
        for path, name in findings:
            print(f"FAIL {path}: matched {name}")
    else:
        print("OK   no private credential patterns found in trading-factory release files")
    return ok


def verify_hub(dataset_id: str) -> bool:
    ok = True
    print("[hub]")
    api = HfApi()
    try:
        files = set(api.list_repo_files(repo_id=dataset_id, repo_type="dataset"))
    except Exception as exc:
        print(f"FAIL {dataset_id}: {exc}")
        return False
    parquet_files = {name for name in files if name.endswith(".parquet")}
    if "README.md" not in files or len(parquet_files) < 3:
        print(f"FAIL {dataset_id}: README_present={'README.md' in files} parquet_count={len(parquet_files)}")
        ok = False
    else:
        print(f"OK   {dataset_id}: files={len(files)} parquet_count={len(parquet_files)}")
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--card", default=str(DEFAULT_CARD))
    parser.add_argument("--processed-dir", default=str(DEFAULT_PROCESSED))
    parser.add_argument("--local-only", action="store_true")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    ok = verify_local(Path(args.manifest), Path(args.card), Path(args.processed_dir))
    if not args.local_only:
        ok = verify_hub(args.dataset) and ok

    if args.strict and not ok:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
