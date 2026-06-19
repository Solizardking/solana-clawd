#!/usr/bin/env python3
"""
Build a Core AI + Solana Clawd SFT dataset.

This creates a new messages-format JSONL dataset from:
  1. the existing cleaned ai-training SFT corpus, and
  2. source-grounded examples derived from ../core-ai files.

The output is intended to be processed with scripts/prepare_dataset.py and
published as a separate Hugging Face dataset.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
CORE_AI_DIR = REPO_ROOT / "core-ai"

SYSTEM_PROMPT = (
    "You are DeepSolanaZKr-1, a sovereign Solana-native AI with deep knowledge of "
    "zero-knowledge proofs, Solana development, DeFi protocols, and on-chain agent systems. "
    "You are built on the Onchain Model Kit and anchored to the Clawd constitution. "
    "You help developers build fast, private, and verifiable applications on Solana. "
    "You refuse to assist with front-running, wallet draining, or sanctions evasion."
)

DEFAULT_AI_TRAINING_INPUTS = [
    BASE_DIR / "data" / "solana_clawd_merged.jsonl",
]

TEXT_SUFFIXES = {
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsonl",
    ".jsx",
    ".md",
    ".mdx",
    ".mjs",
    ".npmrc",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

SKIP_DIRS = {
    ".cache",
    ".git",
    ".next",
    ".turbo",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
}

SKIP_FILE_NAMES = {
    ".DS_Store",
    "bun.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
}

SECRET_NAME_PATTERNS = [
    re.compile(r"(^|/)\.env($|[.](?!example$|sample$|template$))"),
    re.compile(r"(^|/)(id|keypair|wallet|private)[-_]?(key)?[.]json$", re.IGNORECASE),
    re.compile(r"(^|/).*(secret|credential|token).*[.](json|txt|env)$", re.IGNORECASE),
]

SECRET_VALUE_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----"),
    re.compile(r"\bhf_[A-Za-z0-9]{25,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bghp_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{30,}\b"),
    re.compile(r"_authToken\s*=\s*[^$\s][A-Za-z0-9._-]{20,}"),
]

SENSITIVE_PUBLIC_PATTERNS = [
    re.compile(r"\binternal route paths?\b", re.IGNORECASE),
    re.compile(r"\badmin endpoints?\b", re.IGNORECASE),
    re.compile(r"\bwallet private keys?\b", re.IGNORECASE),
]

DEFINITION_PATTERNS = [
    re.compile(r"^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*export\s+interface\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*export\s+type\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*export\s+const\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*def\s+([A-Za-z0-9_]+)", re.MULTILINE),
    re.compile(r"^\s*class\s+([A-Za-z0-9_]+)", re.MULTILINE),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--core-ai-dir", default=str(CORE_AI_DIR), help="Path to core-ai")
    parser.add_argument("--output", default=str(BASE_DIR / "data" / "core_ai_clawd_sft.jsonl"))
    parser.add_argument("--manifest", default=str(BASE_DIR / "data" / "core_ai_dataset_manifest.json"))
    parser.add_argument("--card", default=str(BASE_DIR / "data" / "core_ai_dataset_card.md"))
    parser.add_argument("--repo-id", default="solanaclawd/solana-clawd-core-ai-instruct")
    parser.add_argument("--max-file-bytes", type=int, default=1_000_000)
    parser.add_argument("--chunk-chars", type=int, default=5_500)
    parser.add_argument("--chunk-overlap", type=int, default=400)
    parser.add_argument("--max-core-examples", type=int, default=12_000)
    parser.add_argument("--public-safe", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument(
        "--ai-input",
        action="append",
        default=[],
        help="Additional messages-format ai-training JSONL file. Defaults to data/solana_clawd_merged.jsonl.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print stats without writing files")
    return parser.parse_args()


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def has_secret_value(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_VALUE_PATTERNS)


def looks_sensitive_for_public(text: str, obj: dict[str, Any] | None = None) -> bool:
    if has_secret_value(text):
        return True
    if obj:
        tags = {str(tag).lower() for tag in obj.get("tags", []) if isinstance(tag, str)}
        if "security" in tags and any(pattern.search(text) for pattern in SENSITIVE_PUBLIC_PATTERNS):
            return True
    return False


def path_is_secret(path: Path) -> bool:
    normalized = path.as_posix()
    return any(pattern.search(normalized) for pattern in SECRET_NAME_PATTERNS)


def is_binaryish(data: bytes) -> bool:
    if b"\0" in data:
        return True
    if not data:
        return False
    printable = sum(byte in b"\n\r\t" or 32 <= byte <= 126 for byte in data)
    return printable / len(data) < 0.85


def should_skip_path(path: Path, core_root: Path, max_file_bytes: int) -> str | None:
    rel_parts = path.relative_to(core_root).parts
    if any(part in SKIP_DIRS for part in rel_parts):
        return "skip_dir"
    if path.name in SKIP_FILE_NAMES:
        return "skip_file"
    if path_is_secret(path):
        return "secret_name"
    if path.suffix and path.suffix.lower() not in TEXT_SUFFIXES:
        return "non_text_suffix"
    try:
        size = path.stat().st_size
    except OSError:
        return "stat_error"
    if size <= 0:
        return "empty"
    if size > max_file_bytes:
        return "too_large"
    return None


def read_text_file(path: Path) -> str | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if is_binaryish(data):
        return None
    return data.decode("utf-8", errors="replace").replace("\r\n", "\n")


def core_file_priority(path: Path, core_root: Path) -> tuple[int, str]:
    rel = path.relative_to(core_root).as_posix()
    top = rel.split("/", 1)[0]
    if rel in {
        "AGENTS.md",
        "CLAUDE.md",
        "CLAWD.md",
        "CONTRIBUTING.md",
        "README.md",
        "versions.json",
        "package.json",
        "glama.json",
    }:
        return (0, rel)
    if rel.startswith("knowledge/"):
        return (1, rel)
    if rel.startswith(".agents/skills/"):
        return (2, rel)
    if rel.startswith("helius-skills/") or rel.startswith("docs/"):
        return (3, rel)
    if "/docs/" in rel or "/prompts/" in rel or "/skills/" in rel:
        return (4, rel)
    if path.name in {"package.json", "tsconfig.json", "clawd.json", "README.md"}:
        return (5, rel)
    if top in {"clawd-agents", "mcp-server", "v3"}:
        return (6, rel)
    if top.startswith("helius-"):
        return (7, rel)
    return (8, rel)


def iter_core_files(core_root: Path, max_file_bytes: int) -> Iterable[tuple[Path, str | None]]:
    paths = [path for path in core_root.rglob("*") if path.is_file()]
    for path in sorted(paths, key=lambda item: core_file_priority(item, core_root)):
        if not path.is_file():
            continue
        yield path, should_skip_path(path, core_root, max_file_bytes)


def load_json_line(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def validate_messages_example(example: dict[str, Any]) -> bool:
    messages = example.get("messages")
    if not isinstance(messages, list) or len(messages) < 2:
        return False
    has_user = False
    has_assistant = False
    for msg in messages:
        if not isinstance(msg, dict):
            return False
        role = msg.get("role")
        content = msg.get("content")
        if role not in {"system", "user", "assistant", "tool"}:
            return False
        if not isinstance(content, str) or not content.strip():
            return False
        has_user = has_user or role == "user"
        has_assistant = has_assistant or role == "assistant"
    return has_user and has_assistant


def normalize_messages_example(example: dict[str, Any], source: str) -> dict[str, Any] | None:
    if not validate_messages_example(example):
        return None
    messages = [
        {"role": msg["role"], "content": msg["content"].strip()}
        for msg in example["messages"]
        if msg["role"] in {"system", "user", "assistant"}
    ]
    if not messages:
        return None
    if messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    return {
        "messages": messages,
        "metadata": {
            "source": source,
            "source_type": "ai_training_sft",
            "license": "cc-by-4.0",
        },
    }


def load_ai_training_examples(paths: list[Path], public_safe: bool) -> tuple[list[dict[str, Any]], dict[str, int]]:
    examples: list[dict[str, Any]] = []
    stats = {"raw": 0, "kept": 0, "invalid": 0, "sensitive": 0, "missing": 0}
    for path in paths:
        if not path.exists():
            stats["missing"] += 1
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                obj = load_json_line(line)
                if obj is None:
                    continue
                stats["raw"] += 1
                normalized = normalize_messages_example(obj, source=str(path.relative_to(BASE_DIR)))
                if normalized is None:
                    stats["invalid"] += 1
                    continue
                text = json.dumps(normalized["messages"], ensure_ascii=False)
                if public_safe and looks_sensitive_for_public(text):
                    stats["sensitive"] += 1
                    continue
                examples.append(normalized)
                stats["kept"] += 1
    return examples, stats


def language_for_path(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".css": "css",
        ".html": "html",
        ".js": "javascript",
        ".json": "json",
        ".jsonl": "jsonl",
        ".jsx": "jsx",
        ".md": "markdown",
        ".mdx": "mdx",
        ".mjs": "javascript",
        ".npmrc": "ini",
        ".py": "python",
        ".sh": "bash",
        ".toml": "toml",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".yaml": "yaml",
        ".yml": "yaml",
    }.get(suffix, "text")


def compact(value: str, limit: int = 240) -> str:
    value = re.sub(r"\s+", " ", value.strip())
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def extract_headings(text: str) -> list[str]:
    headings = []
    for match in re.finditer(r"^\s{0,3}#{1,4}\s+(.+?)\s*$", text, re.MULTILINE):
        title = match.group(1).strip().strip("#").strip()
        if title:
            headings.append(compact(title, 140))
        if len(headings) >= 8:
            break
    return headings


def extract_definitions(text: str) -> list[str]:
    found: list[str] = []
    for pattern in DEFINITION_PATTERNS:
        for name in pattern.findall(text):
            if name not in found:
                found.append(name)
            if len(found) >= 10:
                return found
    return found


def summarize_json(path: Path, text: str) -> list[str]:
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(obj, dict):
        return []
    bullets: list[str] = []
    if path.name == "package.json":
        name = obj.get("name")
        version = obj.get("version")
        description = obj.get("description")
        if name:
            label = f"Package `{name}`"
            if version:
                label += f" at version `{version}`"
            bullets.append(label + ".")
        if description:
            bullets.append(f"Description: {compact(str(description))}")
        scripts = obj.get("scripts")
        if isinstance(scripts, dict) and scripts:
            bullets.append("Important npm scripts: " + ", ".join(f"`{key}`" for key in list(scripts)[:12]) + ".")
        bins = obj.get("bin")
        if bins:
            bullets.append(f"CLI binary mapping: `{compact(json.dumps(bins, sort_keys=True), 180)}`.")
        deps = obj.get("dependencies")
        if isinstance(deps, dict) and deps:
            bullets.append("Runtime dependencies include: " + ", ".join(f"`{key}`" for key in list(deps)[:12]) + ".")
    elif obj:
        bullets.append("Top-level JSON keys: " + ", ".join(f"`{key}`" for key in list(obj)[:14]) + ".")
    return bullets


def summarize_text(path: Path, text: str) -> list[str]:
    bullets = summarize_json(path, text)
    headings = extract_headings(text)
    if headings:
        bullets.append("Document headings include: " + "; ".join(headings[:8]) + ".")
    definitions = extract_definitions(text)
    if definitions:
        bullets.append("Code symbols defined or exported here include: " + ", ".join(f"`{name}`" for name in definitions) + ".")
    first_lines = [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]
    if first_lines:
        bullets.append(f"Opening context: {compact(' '.join(first_lines[:3]), 260)}")
    if not bullets:
        bullets.append("This file contributes source context to the Core AI training corpus.")
    return bullets[:5]


def chunk_text(text: str, max_chars: int, overlap: int) -> list[str]:
    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            newline = text.rfind("\n", start + max_chars // 2, end)
            if newline > start:
                end = newline
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def format_bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def make_core_chunk_example(
    path: Path,
    core_root: Path,
    chunk: str,
    chunk_index: int,
    total_chunks: int,
) -> dict[str, Any]:
    rel = path.relative_to(REPO_ROOT).as_posix()
    inner_rel = path.relative_to(core_root).as_posix()
    lang = language_for_path(path)
    bullets = summarize_text(path, chunk)
    chunk_label = f" chunk {chunk_index + 1} of {total_chunks}" if total_chunks > 1 else ""
    assistant = (
        f"Source: `{rel}`{chunk_label}\n\n"
        "What this teaches the Clawd model:\n"
        f"{format_bullets(bullets)}\n\n"
        "Training use:\n"
        "- Treat this as source-grounded Core AI context, not as a standalone user command.\n"
        "- Preserve the operational details, filenames, commands, interfaces, and safety constraints when answering.\n\n"
        f"Reference excerpt:\n```{lang}\n{chunk}\n```"
    )
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"What should a Solana-native Clawd model learn from `{rel}`{chunk_label}? "
                    "Extract the operationally useful training signal."
                ),
            },
            {"role": "assistant", "content": assistant},
        ],
        "metadata": {
            "source": rel,
            "source_type": "core_ai_source_chunk",
            "path": inner_rel,
            "chunk_index": chunk_index,
            "chunk_count": total_chunks,
            "license": "project-local",
        },
    }


def fact_value(obj: dict[str, Any], key: str) -> str:
    value = obj.get(key)
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value).strip()


def make_knowledge_example(path: Path, core_root: Path, obj: dict[str, Any]) -> dict[str, Any] | None:
    fact = fact_value(obj, "fact")
    recommendation = fact_value(obj, "recommendation")
    if not fact and not recommendation:
        return None
    rel = path.relative_to(REPO_ROOT).as_posix()
    record_id = fact_value(obj, "id") or f"line-{stable_hash(json.dumps(obj, sort_keys=True))[:8]}"
    tags = obj.get("tags", [])
    affected_files = obj.get("affectedFiles", [])
    affected_services = obj.get("affectedServices", [])
    assistant_parts = [
        f"Source record: `{rel}` / `{record_id}`",
        "",
        f"Fact: {fact}" if fact else "",
        f"Recommendation: {recommendation}" if recommendation else "",
        f"Confidence: {fact_value(obj, 'confidence')}" if obj.get("confidence") else "",
    ]
    if tags:
        assistant_parts.append("Tags: " + ", ".join(f"`{tag}`" for tag in tags[:12]) + ".")
    if affected_files:
        assistant_parts.append("Affected files: " + ", ".join(f"`{item}`" for item in affected_files[:8]) + ".")
    if affected_services:
        assistant_parts.append("Affected services: " + ", ".join(f"`{item}`" for item in affected_services[:8]) + ".")
    assistant_parts.append("")
    assistant_parts.append(
        "Training use: apply this memory when reasoning about Clawd setup, agent infrastructure, "
        "Solana payments, deployment, or code changes."
    )
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"What should a Clawd agent remember from `{rel}` record `{record_id}`?",
            },
            {"role": "assistant", "content": "\n".join(part for part in assistant_parts if part != "")},
        ],
        "metadata": {
            "source": rel,
            "source_type": "core_ai_knowledge_jsonl",
            "record_id": record_id,
            "license": "project-local",
        },
    }


def examples_from_jsonl_file(path: Path, core_root: Path, public_safe: bool) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    for line in lines:
        obj = load_json_line(line)
        if obj is None:
            continue
        text = json.dumps(obj, ensure_ascii=False)
        if public_safe and looks_sensitive_for_public(text, obj):
            continue
        example = make_knowledge_example(path, core_root, obj)
        if example is not None:
            examples.append(example)
    return examples


def build_core_examples(core_root: Path, args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, int]]:
    examples: list[dict[str, Any]] = []
    stats = {
        "files_seen": 0,
        "files_used": 0,
        "chunks": 0,
        "jsonl_records": 0,
        "binary": 0,
        "sensitive": 0,
        "skipped": 0,
        "limited": 0,
    }
    skip_reasons: dict[str, int] = {}

    for path, skip_reason in iter_core_files(core_root, args.max_file_bytes):
        stats["files_seen"] += 1
        if skip_reason:
            skip_reasons[skip_reason] = skip_reasons.get(skip_reason, 0) + 1
            stats["skipped"] += 1
            continue
        if path.suffix.lower() == ".jsonl":
            jsonl_examples = examples_from_jsonl_file(path, core_root, args.public_safe)
            if jsonl_examples:
                examples.extend(jsonl_examples)
                stats["jsonl_records"] += len(jsonl_examples)
                stats["files_used"] += 1
                if len(examples) >= args.max_core_examples:
                    stats["limited"] = 1
                    break
                continue

        text = read_text_file(path)
        if text is None:
            stats["binary"] += 1
            continue
        if args.public_safe and looks_sensitive_for_public(text):
            stats["sensitive"] += 1
            continue
        chunks = chunk_text(text, args.chunk_chars, args.chunk_overlap)
        if not chunks:
            continue
        stats["files_used"] += 1
        for index, chunk in enumerate(chunks):
            if args.public_safe and looks_sensitive_for_public(chunk):
                stats["sensitive"] += 1
                continue
            examples.append(make_core_chunk_example(path, core_root, chunk, index, len(chunks)))
            stats["chunks"] += 1
            if len(examples) >= args.max_core_examples:
                stats["limited"] = 1
                break
        if stats["limited"]:
            break

    stats.update({f"skip_{key}": value for key, value in sorted(skip_reasons.items())})
    return examples[: args.max_core_examples], stats


def dedupe_examples(examples: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    dupes = 0
    for example in examples:
        messages = example.get("messages", [])
        signature = stable_hash(json.dumps(messages, ensure_ascii=False, sort_keys=True))
        if signature in seen:
            dupes += 1
            continue
        seen.add(signature)
        deduped.append(example)
    return deduped, dupes


def write_jsonl(path: Path, examples: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for example in examples:
            handle.write(json.dumps(example, ensure_ascii=False, sort_keys=True) + "\n")


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_card(path: Path, repo_id: str, manifest: dict[str, Any]) -> None:
    stats = manifest["stats"]
    source_counts = manifest["source_counts"]
    card = f"""---
license: cc-by-4.0
task_categories:
  - text-generation
  - question-answering
language:
  - en
tags:
  - solana
  - clawd
  - core-ai
  - agent
  - defi
  - code
  - constitutional-ai
pretty_name: Solana Clawd Core AI Instruct
---

# Solana Clawd Core AI Instruct

Instruction-tuning dataset derived from the local `core-ai` source tree and the
existing Solana Clawd AI training corpus.

## Contents

- Total examples: {stats["total_examples"]}
- Existing ai-training SFT examples: {source_counts.get("ai_training_sft", 0)}
- Core AI source chunk examples: {source_counts.get("core_ai_source_chunk", 0)}
- Core AI knowledge JSONL examples: {source_counts.get("core_ai_knowledge_jsonl", 0)}

## Format

Each row is a chat conversation in OpenAI/Hugging Face `messages` schema:

```json
{{"messages": [{{"role": "system", "content": "..."}}, {{"role": "user", "content": "..."}}, {{"role": "assistant", "content": "..."}}]}}
```

## Reproduce

```bash
cd ai-training
python3 scripts/build_core_ai_dataset.py
python3 scripts/prepare_dataset.py \\
  --input data/core_ai_clawd_sft.jsonl \\
  --output data/core_ai_processed \\
  --train-ratio 0.9 --eval-ratio 0.05 --seed 42
```

## Publish

```bash
hf repos create {repo_id} --type dataset --exist-ok
hf upload {repo_id} data/core_ai_processed . --repo-type dataset --commit-message "Add processed Core AI splits"
hf upload {repo_id} data/core_ai_dataset_card.md README.md --repo-type dataset --commit-message "Add dataset card"
hf upload {repo_id} data/core_ai_clawd_sft.jsonl raw/core_ai_clawd_sft.jsonl --repo-type dataset --commit-message "Add raw JSONL"
hf upload {repo_id} data/core_ai_dataset_manifest.json metadata/core_ai_dataset_manifest.json --repo-type dataset --commit-message "Add build manifest"
```

## Training

```bash
python3 scripts/train_lora.py --config configs/core_ai_lora_config.yaml --no-push --num-epochs 1
```

For a remote Hugging Face Job, upload the dataset first and then launch with
the same config or override `--dataset-repo {repo_id}`.

## Safety Notes

The builder runs in public-safe mode by default. It excludes common secret
filenames, private key/token patterns, binary artifacts, dependency folders,
lockfiles, and high-risk security records that are not suitable for public
dataset release.
"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(card, encoding="utf-8")


def main() -> None:
    args = parse_args()
    core_root = Path(args.core_ai_dir).resolve()
    output = Path(args.output)
    manifest_path = Path(args.manifest)
    card_path = Path(args.card)
    ai_inputs = [Path(p).resolve() for p in args.ai_input] if args.ai_input else DEFAULT_AI_TRAINING_INPUTS

    if not core_root.exists():
        raise SystemExit(f"core-ai directory not found: {core_root}")

    print("[1/4] Loading ai-training SFT examples")
    ai_examples, ai_stats = load_ai_training_examples(ai_inputs, args.public_safe)
    print(f"      kept {ai_stats['kept']} / {ai_stats['raw']} existing examples")

    print("[2/4] Building Core AI source examples")
    core_examples, core_stats = build_core_examples(core_root, args)
    print(
        f"      built {len(core_examples)} examples from {core_stats['files_used']} files "
        f"({core_stats['chunks']} chunks, {core_stats['jsonl_records']} knowledge records)"
    )

    print("[3/4] Deduplicating")
    combined, duplicate_count = dedupe_examples([*ai_examples, *core_examples])
    source_counts: dict[str, int] = {}
    for example in combined:
        source_type = example.get("metadata", {}).get("source_type", "unknown")
        source_counts[source_type] = source_counts.get(source_type, 0) + 1
    print(f"      total={len(combined)} duplicates_removed={duplicate_count}")

    manifest = {
        "created_at": dt.datetime.now(dt.UTC).isoformat(),
        "repo_id": args.repo_id,
        "public_safe": args.public_safe,
        "inputs": {
            "core_ai_dir": str(core_root),
            "ai_training_inputs": [str(path) for path in ai_inputs],
        },
        "outputs": {
            "jsonl": str(output),
            "manifest": str(manifest_path),
            "card": str(card_path),
        },
        "stats": {
            "total_examples": len(combined),
            "duplicates_removed": duplicate_count,
            "ai_training": ai_stats,
            "core_ai": core_stats,
        },
        "source_counts": source_counts,
    }

    print("[4/4] Writing outputs")
    if args.dry_run:
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return
    write_jsonl(output, combined)
    write_manifest(manifest_path, manifest)
    write_card(card_path, args.repo_id, manifest)
    print(f"      wrote {output}")
    print(f"      wrote {manifest_path}")
    print(f"      wrote {card_path}")


if __name__ == "__main__":
    main()
