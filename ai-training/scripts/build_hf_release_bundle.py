#!/usr/bin/env python3
"""Build local Hugging Face upload bundles for staged datasets.

The bundle is useful when the shell is not authenticated yet: it gives a clean,
secret-scanned directory that can be uploaded with `hf upload` after login.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import shutil
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "outputs" / "hf_release_bundle"

SECRET_PATTERNS = {
    "google_client_secret_path": re.compile(r"client_secret_\d+[-\w]+\.apps\.googleusercontent\.com\.json"),
    "google_adc_path": re.compile(r"\.config/gcloud/application_default_credentials\.json"),
    "google_oauth_token": re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----"),
    "wandb_key": re.compile(r"\bwandb_v1_[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
}


DATASET_SPECS = {
    "trading_factory": {
        "repo_id": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
        "card": ROOT / "data" / "nvidia_trading_factory_dataset_card.md",
        "manifest": ROOT / "data" / "nvidia_trading_factory_manifest.json",
        "jsonl": ROOT / "data" / "nvidia_trading_factory_sft.jsonl",
        "processed": ROOT / "data" / "nvidia_trading_factory_processed",
    },
    "core_ai": {
        "repo_id": "solanaclawd/solana-clawd-core-ai-instruct",
        "card": ROOT / "data" / "core_ai_dataset_card.md",
        "manifest": ROOT / "data" / "core_ai_dataset_manifest.json",
        "jsonl": ROOT / "data" / "core_ai_clawd_sft.jsonl",
        "processed": ROOT / "data" / "core_ai_processed",
    },
    "realtime_research": {
        "repo_id": "solanaclawd/solana-clawd-realtime-research-instruct",
        "card": ROOT / "data" / "realtime_research_dataset_card.md",
        "manifest": ROOT / "data" / "realtime_research_dataset_manifest.json",
        "jsonl": ROOT / "data" / "realtime_research_sft.jsonl",
        "processed": ROOT / "data" / "realtime_research_processed",
    },
}


def scan_text(path: Path) -> list[str]:
    if not path.exists() or not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8", errors="ignore")
    return [name for name, pattern in SECRET_PATTERNS.items() if pattern.search(text)]


def scan_paths(paths: Iterable[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in paths:
        for name in scan_text(path):
            findings.append((str(path), name))
    return findings


def copy_file(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def build_dataset_bundle(name: str, spec: dict[str, object], out_dir: Path) -> dict[str, object]:
    dataset_dir = out_dir / "datasets" / name
    data_dir = dataset_dir / "data"
    if dataset_dir.exists():
        shutil.rmtree(dataset_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    card = spec["card"]
    manifest = spec["manifest"]
    jsonl = spec["jsonl"]
    processed = spec["processed"]
    assert isinstance(card, Path)
    assert isinstance(manifest, Path)
    assert isinstance(jsonl, Path)
    assert isinstance(processed, Path)

    findings = scan_paths([card, manifest, jsonl])
    if findings:
        details = ", ".join(f"{path}:{name}" for path, name in findings)
        raise RuntimeError(f"secret-like pattern found before bundling {name}: {details}")

    copy_file(card, dataset_dir / "README.md")
    copy_file(manifest, dataset_dir / "release_manifest.json")
    copy_file(jsonl, dataset_dir / "source.jsonl")

    parquet_files = []
    for split in ["train", "eval", "test"]:
        src = processed / f"{split}.parquet"
        dst = data_dir / f"{split}-00000-of-00001.parquet"
        copy_file(src, dst)
        parquet_files.append(dst.relative_to(out_dir).as_posix())

    return {
        "name": name,
        "repo_id": spec["repo_id"],
        "directory": dataset_dir.relative_to(out_dir).as_posix(),
        "files": [
            (dataset_dir / "README.md").relative_to(out_dir).as_posix(),
            (dataset_dir / "release_manifest.json").relative_to(out_dir).as_posix(),
            (dataset_dir / "source.jsonl").relative_to(out_dir).as_posix(),
            *parquet_files,
        ],
    }


def write_upload_readme(out_dir: Path, bundles: list[dict[str, object]]) -> None:
    lines = [
        "# Hugging Face Release Bundle",
        "",
        "Generated bundle directories are secret-scanned before copy. Authenticate first:",
        "",
        "```bash",
        "hf auth login",
        "```",
        "",
        "Run upload commands from this bundle directory:",
        "",
        "```bash",
        f"cd {out_dir}",
        "```",
        "",
        "Upload commands:",
        "",
    ]
    for bundle in bundles:
        lines.extend(
            [
                f"## {bundle['name']}",
                "",
                "```bash",
                f"hf upload {bundle['repo_id']} {bundle['directory']} . --type dataset "
                f"--commit-message \"Upload {bundle['name']} release bundle\"",
                "```",
                "",
            ]
        )
    (out_dir / "UPLOAD.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(DEFAULT_OUT))
    parser.add_argument(
        "--dataset",
        action="append",
        choices=sorted(DATASET_SPECS),
        help="Dataset bundle to include. Defaults to trading_factory only.",
    )
    parser.add_argument("--include-published", action="store_true", help="Also bundle core_ai and realtime_research")
    args = parser.parse_args()

    selected = args.dataset or ["trading_factory"]
    if args.include_published:
        selected = ["trading_factory", "core_ai", "realtime_research"]

    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    bundles = [build_dataset_bundle(name, DATASET_SPECS[name], out_dir) for name in selected]
    manifest = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "bundle_dir": str(out_dir),
        "datasets": bundles,
    }
    (out_dir / "bundle_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    write_upload_readme(out_dir, bundles)

    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
