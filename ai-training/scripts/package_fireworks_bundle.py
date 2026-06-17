#!/usr/bin/env python3
"""
Package the ai-training subtree into a single uploadable bundle.

Fireworks dataset/model uploads are file-oriented, not "folder list" uploads.
This script creates:

  1. a tar.gz bundle containing the requested ai-training assets
  2. a manifest JSON with file sizes and sha256 checksums

Usage:
  python3 ai-training/scripts/package_fireworks_bundle.py
  python3 ai-training/scripts/package_fireworks_bundle.py --output-dir ai-training/outputs/fireworks
"""
from __future__ import annotations

import argparse
import hashlib
import json
import tarfile
from dataclasses import asdict, dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "outputs" / "fireworks"

INCLUDE_PATHS = [
    ROOT / "configs",
    ROOT / "data",
    ROOT / "outputs",
    ROOT / "perps",
    ROOT / "scripts",
    ROOT / ".gitignore",
    ROOT / "dataset_card.md",
    ROOT / "model_card.md",
    ROOT / "README.md",
]

SKIP_DIRS = {
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
}

SKIP_SUFFIXES = {
    ".pyc",
    ".pyo",
    ".DS_Store",
}


@dataclass
class ManifestEntry:
    path: str
    size_bytes: int
    sha256: str


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def should_skip(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.name in SKIP_DIRS:
        return True
    return any(str(path).endswith(suffix) for suffix in SKIP_SUFFIXES)


def iter_files() -> list[Path]:
    files: list[Path] = []
    for include in INCLUDE_PATHS:
        if not include.exists():
            continue
        if include.is_file():
            if not should_skip(include):
                files.append(include)
            continue
        for path in sorted(include.rglob("*")):
            if path.is_file() and not should_skip(path):
                files.append(path)
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--bundle-name", default="ai-training-fireworks-bundle.tar.gz")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    bundle_path = output_dir / args.bundle_name
    manifest_path = output_dir / "ai-training-fireworks-manifest.json"

    files = iter_files()
    manifest: list[ManifestEntry] = []

    with tarfile.open(bundle_path, "w:gz") as archive:
        for path in files:
            relative = path.relative_to(ROOT.parent)
            archive.add(path, arcname=str(relative))
            manifest.append(
                ManifestEntry(
                    path=str(relative),
                    size_bytes=path.stat().st_size,
                    sha256=sha256_file(path),
                )
            )

    payload = {
        "root": str(ROOT),
        "bundle": str(bundle_path),
        "file_count": len(manifest),
        "files": [asdict(entry) for entry in manifest],
    }
    manifest_path.write_text(json.dumps(payload, indent=2))

    print(json.dumps(
        {
            "bundle": str(bundle_path),
            "manifest": str(manifest_path),
            "file_count": len(manifest),
        },
        indent=2,
    ))


if __name__ == "__main__":
    main()
