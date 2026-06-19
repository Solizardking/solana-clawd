#!/usr/bin/env python3
"""
Convert PDFs, JSON/JSONL, notebooks, parquet files, and text documents into a
messages-schema SFT dataset.

The script is intentionally useful in two modes:

1. Batch build from a curated source list:
   python3 scripts/realtime_dataset_ingest.py --config configs/realtime_dataset_config.yaml

2. Submit arbitrary files and optionally push the refreshed dataset to HF:
   python3 scripts/realtime_dataset_ingest.py --input new.pdf data.json --push

Rows are public-dataset friendly: local absolute paths are not written into
examples, high-confidence secret patterns are filtered, and each row keeps only
source basename, type, sha256, and local record/page/cell ids.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import random
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import yaml
from datasets import Dataset, DatasetDict

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - import error is handled at runtime
    PdfReader = None  # type: ignore[assignment]


SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. You help developers "
    "and researchers reason about Solana, ZK systems, crypto datasets, trading "
    "analytics, and agent infrastructure. Ground answers in the supplied source "
    "context and refuse requests for wallet draining, private-key handling, "
    "sanctions evasion, or offensive exploitation."
)

SUPPORTED_SUFFIXES = {
    ".pdf",
    ".json",
    ".jsonl",
    ".ipynb",
    ".parquet",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
}

SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bwandb_[A-Za-z0-9_-]{30,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(
        r"\b(?:api[_-]?key|private[_-]?key|secret|token)\b[\"'\s:=]{1,8}"
        r"[A-Za-z0-9_./+=-]{28,}",
        re.IGNORECASE,
    ),
]


@dataclass
class SourceStats:
    source_id: str
    source_type: str
    sha256: str
    size_bytes: int
    records: int = 0
    skipped: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class BuildResult:
    examples: list[dict[str, Any]]
    manifest: dict[str, Any]
    dataset: DatasetDict


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", help="YAML config with inputs and output settings")
    p.add_argument("--input", nargs="*", default=[], help="Files or directories to ingest")
    p.add_argument("--watch-dir", action="append", default=[], help="Directory to poll for new supported files")
    p.add_argument("--watch", action="store_true", help="Keep polling watch dirs and rebuilding on changes")
    p.add_argument("--poll-seconds", type=int, default=30)
    p.add_argument("--output-jsonl", help="Output messages JSONL path")
    p.add_argument("--output-dir", help="Output HF Dataset directory")
    p.add_argument("--manifest", help="Output manifest JSON path")
    p.add_argument("--dataset-card", help="Output dataset README/card path")
    p.add_argument("--dataset-name", help="Human-readable dataset name")
    p.add_argument("--repo-id", help="Hugging Face dataset repo id for --push")
    p.add_argument("--private", action="store_true", help="Create/push private HF dataset")
    p.add_argument("--push", action="store_true", help="Push generated dataset to Hugging Face")
    p.add_argument("--train-ratio", type=float, default=None)
    p.add_argument("--eval-ratio", type=float, default=None)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--chunk-chars", type=int, default=None, help="Chunk size for long source text")
    p.add_argument("--chunk-overlap", type=int, default=None, help="Character overlap between text chunks")
    p.add_argument("--max-context-chars", type=int, default=None, help="Max context chars for parquet QA rows")
    p.add_argument("--min-text-chars", type=int, default=None, help="Skip extracted chunks shorter than this")
    p.add_argument("--keep-duplicate-files", action="store_true", help="Do not skip files with duplicate SHA256")
    p.add_argument("--save-arrow-dataset", action="store_true", help="Also write datasets.save_to_disk Arrow shards")
    return p.parse_args()


def load_config(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with config_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Config must be a YAML mapping: {config_path}")
    return data


def merged_settings(args: argparse.Namespace) -> dict[str, Any]:
    cfg = load_config(args.config)
    cfg_inputs = list(cfg.get("inputs") or [])
    cli_inputs = list(args.input or [])
    watch_dirs = list(cfg.get("watch_dirs") or []) + list(args.watch_dir or [])
    return {
        "inputs": dedupe_preserve_order([str(x) for x in cfg_inputs + cli_inputs]),
        "watch_dirs": dedupe_preserve_order([str(x) for x in watch_dirs]),
        "output_jsonl": args.output_jsonl or cfg.get("output_jsonl") or "data/realtime_research_sft.jsonl",
        "output_dir": args.output_dir or cfg.get("output_dir") or "data/realtime_research_processed",
        "manifest": args.manifest or cfg.get("manifest") or "data/realtime_research_dataset_manifest.json",
        "dataset_card": args.dataset_card or cfg.get("dataset_card") or "data/realtime_research_dataset_card.md",
        "dataset_name": args.dataset_name or cfg.get("dataset_name") or "Solana Clawd Realtime Research Instruct",
        "repo_id": args.repo_id or cfg.get("repo_id") or "solanaclawd/solana-clawd-realtime-research-instruct",
        "private": bool(args.private or cfg.get("private", False)),
        "push": bool(args.push or cfg.get("push", False)),
        "train_ratio": float(args.train_ratio if args.train_ratio is not None else cfg.get("train_ratio", 0.9)),
        "eval_ratio": float(args.eval_ratio if args.eval_ratio is not None else cfg.get("eval_ratio", 0.05)),
        "seed": int(args.seed if args.seed is not None else cfg.get("seed", 42)),
        "chunk_chars": int(args.chunk_chars if args.chunk_chars is not None else cfg.get("chunk_chars", 4800)),
        "chunk_overlap": int(args.chunk_overlap if args.chunk_overlap is not None else cfg.get("chunk_overlap", 350)),
        "max_context_chars": int(
            args.max_context_chars if args.max_context_chars is not None else cfg.get("max_context_chars", 5000)
        ),
        "min_text_chars": int(args.min_text_chars if args.min_text_chars is not None else cfg.get("min_text_chars", 120)),
        "keep_duplicate_files": bool(args.keep_duplicate_files or cfg.get("keep_duplicate_files", False)),
        "save_arrow_dataset": bool(args.save_arrow_dataset or cfg.get("save_arrow_dataset", False)),
    }


def dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def compact_text(text: str) -> str:
    text = normalize_text(text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text


def trim_text(text: str, max_chars: int) -> str:
    text = normalize_text(text)
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 24].rstrip() + "\n\n[truncated]"


def secret_like(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def example_sha(messages: list[dict[str, str]]) -> str:
    payload = json.dumps(messages, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def source_type_for(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".ipynb":
        return "notebook"
    if suffix == ".parquet":
        return "parquet"
    if suffix in {".json", ".jsonl"}:
        return "json"
    if suffix in {".md", ".txt", ".yaml", ".yml"}:
        return "text"
    return suffix.lstrip(".") or "unknown"


def source_id(path: Path) -> str:
    return path.name


def discover_files(inputs: list[str], watch_dirs: list[str]) -> tuple[list[Path], list[str]]:
    requested = list(inputs)
    for watch_dir in watch_dirs:
        requested.append(watch_dir)

    files: list[Path] = []
    missing: list[str] = []
    for raw in requested:
        path = Path(raw).expanduser()
        if not path.exists():
            missing.append(str(path))
            continue
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and child.suffix.lower() in SUPPORTED_SUFFIXES:
                    files.append(child)
        elif path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES:
            files.append(path)
    return dedupe_paths(files), missing


def dedupe_paths(paths: Iterable[Path]) -> list[Path]:
    seen: set[str] = set()
    out: list[Path] = []
    for path in paths:
        key = str(path.resolve())
        if key not in seen:
            seen.add(key)
            out.append(path)
    return out


def input_signature(paths: list[Path]) -> str:
    rows: list[str] = []
    for path in paths:
        try:
            st = path.stat()
        except FileNotFoundError:
            continue
        rows.append(f"{path.resolve()}::{st.st_size}::{int(st.st_mtime)}")
    return hashlib.sha256("\n".join(sorted(rows)).encode("utf-8")).hexdigest()


def chunk_text(text: str, max_chars: int, overlap: int) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) > max_chars:
            if current:
                chunks.append(current.strip())
                current = ""
            start = 0
            while start < len(paragraph):
                end = min(start + max_chars, len(paragraph))
                chunks.append(paragraph[start:end].strip())
                if end == len(paragraph):
                    break
                start = max(0, end - overlap)
            continue
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > max_chars:
            chunks.append(current.strip())
            tail = current[-overlap:].strip() if overlap and current else ""
            current = f"{tail}\n\n{paragraph}".strip() if tail else paragraph
        else:
            current = candidate
    if current.strip():
        chunks.append(current.strip())
    return chunks


def normalize_messages(messages: list[Any]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    role_map = {"human": "user", "gpt": "assistant", "bot": "assistant", "ai": "assistant"}
    for message in messages:
        if not isinstance(message, dict):
            continue
        role = str(message.get("role") or message.get("from") or "").strip().lower()
        role = role_map.get(role, role)
        content = message.get("content", message.get("value", ""))
        if role not in {"system", "user", "assistant"}:
            continue
        if not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False)
        content = normalize_text(content)
        if content:
            normalized.append({"role": role, "content": content})
    return normalized


def make_example(
    user: str,
    assistant: str,
    source: SourceStats,
    record_id: str,
    tags: list[str],
    metadata: dict[str, Any] | None = None,
    system_prompt: str = SYSTEM_PROMPT,
) -> dict[str, Any] | None:
    user = normalize_text(user)
    assistant = normalize_text(assistant)
    if not user or not assistant:
        return None
    combined = f"{user}\n{assistant}"
    if secret_like(combined):
        source.skipped += 1
        return None
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user},
        {"role": "assistant", "content": assistant},
    ]
    sha = example_sha(messages)
    return {
        "messages": messages,
        "source": source.source_id,
        "source_type": source.source_type,
        "source_sha256": source.sha256,
        "record_id": record_id,
        "example_sha256": sha,
        "tags": tags,
        "metadata": metadata or {},
    }


def make_messages_example(
    messages: list[dict[str, str]],
    source: SourceStats,
    record_id: str,
    tags: list[str],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if not messages:
        return None
    roles = {m["role"] for m in messages}
    if "user" not in roles or "assistant" not in roles:
        return None
    if messages[0]["role"] != "system":
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages
    combined = "\n".join(m["content"] for m in messages)
    if secret_like(combined):
        source.skipped += 1
        return None
    sha = example_sha(messages)
    return {
        "messages": messages,
        "source": source.source_id,
        "source_type": source.source_type,
        "source_sha256": source.sha256,
        "record_id": record_id,
        "example_sha256": sha,
        "tags": tags,
        "metadata": metadata or {},
    }


def process_pdf(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    if PdfReader is None:
        raise RuntimeError("pypdf is required for PDF ingestion. Install it with: python3 -m pip install pypdf")
    reader = PdfReader(str(path))
    raw_meta = reader.metadata or {}
    pdf_meta: dict[str, Any] = {}
    for key, value in raw_meta.items():
        clean_key = str(key).lstrip("/")
        try:
            pdf_meta[clean_key] = str(value)
        except Exception:
            pdf_meta[clean_key] = repr(value)
    source.metadata = {
        "title": pdf_meta.get("Title") or path.stem,
        "author": pdf_meta.get("Author"),
        "subject": pdf_meta.get("Subject"),
        "keywords": pdf_meta.get("Keywords"),
        "arxiv_id": pdf_meta.get("arXivID"),
        "page_count": len(reader.pages),
    }

    examples: list[dict[str, Any]] = []
    title = source.metadata["title"]
    metadata_answer = json.dumps({k: v for k, v in source.metadata.items() if v}, ensure_ascii=False, indent=2)
    meta_example = make_example(
        user=f"What metadata is available for the research source `{source.source_id}`?",
        assistant=metadata_answer,
        source=source,
        record_id="metadata",
        tags=["pdf", "metadata", "research"],
        metadata={"title": title},
    )
    if meta_example:
        examples.append(meta_example)

    for page_index, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text() or ""
        except Exception as exc:
            source.skipped += 1
            continue
        text = compact_text(text)
        if len(text) < settings["min_text_chars"]:
            source.skipped += 1
            continue
        for chunk_index, chunk in enumerate(
            chunk_text(text, settings["chunk_chars"], settings["chunk_overlap"]),
            1,
        ):
            if len(chunk) < settings["min_text_chars"]:
                source.skipped += 1
                continue
            user = (
                f"Extract the reusable research knowledge from `{source.source_id}` "
                f"page {page_index}, chunk {chunk_index}. Preserve concrete claims, "
                "definitions, methods, caveats, and implementation details."
            )
            assistant = f"Source: {source.source_id}\nTitle: {title}\nPage: {page_index}\n\n{chunk}"
            ex = make_example(
                user=user,
                assistant=assistant,
                source=source,
                record_id=f"page-{page_index:04d}-chunk-{chunk_index:03d}",
                tags=["pdf", "research", "document-parsing"],
                metadata={"title": title, "page": page_index, "chunk": chunk_index},
            )
            if ex:
                examples.append(ex)
    source.records += len(examples)
    return examples


def process_notebook(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        nb = json.load(f)
    cells = nb.get("cells") or []
    source.metadata = {
        "cell_count": len(cells),
        "kernel": ((nb.get("metadata") or {}).get("kernelspec") or {}).get("display_name"),
    }
    examples: list[dict[str, Any]] = []
    for index, cell in enumerate(cells, 1):
        if not isinstance(cell, dict):
            source.skipped += 1
            continue
        cell_type = str(cell.get("cell_type") or "unknown")
        source_text = cell.get("source") or ""
        if isinstance(source_text, list):
            source_text = "".join(source_text)
        if not isinstance(source_text, str):
            source.skipped += 1
            continue
        source_text = normalize_text(source_text)
        if len(source_text) < 20:
            source.skipped += 1
            continue
        language = "python" if cell_type == "code" else "markdown"
        for chunk_index, chunk in enumerate(
            chunk_text(source_text, settings["chunk_chars"], settings["chunk_overlap"]),
            1,
        ):
            fenced = f"```{language}\n{chunk}\n```" if cell_type == "code" else chunk
            user = (
                f"Convert notebook `{source.source_id}` cell {index} ({cell_type}) "
                "into reusable Solana/crypto training context."
            )
            assistant = (
                f"Source: {source.source_id}\nCell: {index}\nCell type: {cell_type}\n\n{fenced}"
            )
            ex = make_example(
                user=user,
                assistant=assistant,
                source=source,
                record_id=f"cell-{index:04d}-chunk-{chunk_index:03d}",
                tags=["notebook", cell_type, "crypto-analytics"],
                metadata={"cell": index, "cell_type": cell_type, "chunk": chunk_index},
            )
            if ex:
                examples.append(ex)
    source.records += len(examples)
    return examples


def record_to_example(row: dict[str, Any], source: SourceStats, record_id: str, settings: dict[str, Any]) -> dict[str, Any] | None:
    if "messages" in row and isinstance(row["messages"], list):
        return make_messages_example(
            normalize_messages(row["messages"]),
            source=source,
            record_id=record_id,
            tags=[source.source_type, "messages"],
        )

    question = first_string(row, ["question", "prompt", "instruction", "input", "query", "title"])
    answer = first_string(row, ["answer", "response", "output", "completion", "assistant", "content"])
    context = first_string(row, ["chunk", "context", "source", "passage", "text"])
    if question and answer:
        if context and context != question and context != answer:
            user = (
                "Use the source context to answer the Solana/crypto question.\n\n"
                f"Context:\n{trim_text(context, settings['max_context_chars'])}\n\n"
                f"Question:\n{question}"
            )
        else:
            user = question
        return make_example(
            user=user,
            assistant=answer,
            source=source,
            record_id=record_id,
            tags=[source.source_type, "qa", "solana"],
        )

    text = context or answer or question
    if text:
        return make_example(
            user=f"Convert record `{record_id}` from `{source.source_id}` into reusable training context.",
            assistant=trim_text(text, settings["chunk_chars"]),
            source=source,
            record_id=record_id,
            tags=[source.source_type, "record"],
        )

    compact = json.dumps(row, ensure_ascii=False, sort_keys=True)
    if len(compact) < 20:
        source.skipped += 1
        return None
    return make_example(
        user=f"Represent structured record `{record_id}` from `{source.source_id}` as training data.",
        assistant=trim_text(compact, settings["chunk_chars"]),
        source=source,
        record_id=record_id,
        tags=[source.source_type, "structured"],
    )


def first_string(row: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            value = normalize_text(value)
            if value:
                return value
        elif isinstance(value, (dict, list)):
            dumped = json.dumps(value, ensure_ascii=False)
            if dumped and dumped != "null":
                return dumped
        else:
            value = str(value).strip()
            if value:
                return value
    return ""


def process_parquet(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    df = pd.read_parquet(path)
    source.metadata = {"rows": int(len(df)), "columns": [str(c) for c in df.columns]}
    examples: list[dict[str, Any]] = []
    for index, row in df.iterrows():
        clean_row = {str(k): none_to_empty(v) for k, v in row.to_dict().items()}
        ex = record_to_example(clean_row, source, record_id=f"row-{index}", settings=settings)
        if ex:
            examples.append(ex)
    source.records += len(examples)
    return examples


def none_to_empty(value: Any) -> Any:
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return value


def process_json(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if path.suffix.lower() == ".jsonl":
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    source.skipped += 1
                    continue
                if isinstance(obj, dict):
                    rows.append(obj)
                else:
                    rows.append({"content": obj})
    else:
        with path.open("r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, list):
            rows = [x if isinstance(x, dict) else {"content": x} for x in obj]
        elif isinstance(obj, dict):
            for key in ["data", "rows", "examples", "records"]:
                if isinstance(obj.get(key), list):
                    rows = [x if isinstance(x, dict) else {"content": x} for x in obj[key]]
                    break
            if not rows:
                rows = [obj]
        else:
            rows = [{"content": obj}]

    source.metadata = {"rows": len(rows)}
    examples: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        ex = record_to_example(row, source, record_id=f"row-{index}", settings=settings)
        if ex:
            examples.append(ex)
    source.records += len(examples)
    return examples


def process_text(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    source.metadata = {"chars": len(text)}
    examples: list[dict[str, Any]] = []
    for chunk_index, chunk in enumerate(chunk_text(text, settings["chunk_chars"], settings["chunk_overlap"]), 1):
        if len(chunk) < settings["min_text_chars"]:
            source.skipped += 1
            continue
        user = (
            f"Extract reusable training knowledge from `{source.source_id}` chunk {chunk_index}. "
            "Preserve concrete implementation details and safety constraints."
        )
        ex = make_example(
            user=user,
            assistant=f"Source: {source.source_id}\nChunk: {chunk_index}\n\n{chunk}",
            source=source,
            record_id=f"chunk-{chunk_index:03d}",
            tags=[source.source_type, "reference"],
            metadata={"chunk": chunk_index},
        )
        if ex:
            examples.append(ex)
    source.records += len(examples)
    return examples


def process_file(path: Path, settings: dict[str, Any]) -> tuple[SourceStats, list[dict[str, Any]]]:
    sha = file_sha256(path)
    st = path.stat()
    source = SourceStats(
        source_id=source_id(path),
        source_type=source_type_for(path),
        sha256=sha,
        size_bytes=st.st_size,
    )
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        examples = process_pdf(path, source, settings)
    elif suffix == ".ipynb":
        examples = process_notebook(path, source, settings)
    elif suffix == ".parquet":
        examples = process_parquet(path, source, settings)
    elif suffix in {".json", ".jsonl"}:
        examples = process_json(path, source, settings)
    elif suffix in {".md", ".txt", ".yaml", ".yml"}:
        examples = process_text(path, source, settings)
    else:
        source.skipped += 1
        examples = []
    return source, examples


def split_dataset(examples: list[dict[str, Any]], settings: dict[str, Any]) -> DatasetDict:
    rng = random.Random(settings["seed"])
    shuffled = list(examples)
    rng.shuffle(shuffled)
    n = len(shuffled)
    n_train = int(n * settings["train_ratio"])
    n_eval = int(n * settings["eval_ratio"])
    train = shuffled[:n_train]
    eval_ = shuffled[n_train : n_train + n_eval]
    test = shuffled[n_train + n_eval :]
    if n and not test:
        test = eval_ or train[-1:]
    return DatasetDict(
        {
            "train": Dataset.from_list(train),
            "eval": Dataset.from_list(eval_),
            "test": Dataset.from_list(test),
        }
    )


def write_outputs(examples: list[dict[str, Any]], dataset: DatasetDict, manifest: dict[str, Any], settings: dict[str, Any]) -> None:
    output_jsonl = Path(settings["output_jsonl"])
    output_dir = Path(settings["output_dir"])
    manifest_path = Path(settings["manifest"])
    card_path = Path(settings["dataset_card"])
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    card_path.parent.mkdir(parents=True, exist_ok=True)

    with output_jsonl.open("w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    if settings["save_arrow_dataset"]:
        dataset.save_to_disk(str(output_dir))
    for split in ["train", "eval", "test"]:
        if len(dataset[split]):
            dataset[split].to_parquet(str(output_dir / f"{split}.parquet"))

    manifest["output"] = {
        "jsonl": str(output_jsonl),
        "dataset_dir": str(output_dir),
        "dataset_card": str(card_path),
    }
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    card_path.write_text(build_dataset_card(manifest, settings), encoding="utf-8")


def build_dataset_card(manifest: dict[str, Any], settings: dict[str, Any]) -> str:
    splits = manifest["splits"]
    counts = manifest["counts"]
    source_rows = "\n".join(
        f"- `{s['source_id']}` ({s['source_type']}, {s['records']} examples)"
        for s in manifest["sources"]
    )
    return f"""---
license: cc-by-4.0
task_categories:
  - text-generation
  - question-answering
language:
  - en
tags:
  - solana
  - clawd
  - crypto
  - research
  - pdf
  - notebooks
  - datasets
  - realtime-ingestion
pretty_name: {settings["dataset_name"]}
---

# {settings["dataset_name"]}

Instruction-tuning dataset generated by `scripts/realtime_dataset_ingest.py`
from submitted PDFs, notebooks, parquet QA rows, JSON/JSONL files, and local
reference text.

## Contents

- Total examples: {counts["examples"]}
- Train/eval/test: {splits["train"]} / {splits["eval"]} / {splits["test"]}
- Sources: {counts["sources"]}
- Duplicate examples removed: {counts["duplicate_examples"]}
- Duplicate files skipped: {counts["duplicate_files_skipped"]}
- Secret-like records skipped: {counts["secret_or_invalid_skipped"]}

## Format

Each row uses OpenAI/Hugging Face chat messages:

```json
{{"messages": [{{"role": "system", "content": "..."}}, {{"role": "user", "content": "..."}}, {{"role": "assistant", "content": "..."}}]}}
```

Rows also include non-training metadata columns: `source`, `source_type`,
`source_sha256`, `record_id`, `example_sha256`, `tags`, and `metadata`.

## Sources

{source_rows}

## Reproduce

```bash
cd /path/to/solana-clawd/ai-training
python3 scripts/realtime_dataset_ingest.py --config configs/realtime_dataset_config.yaml
python3 scripts/realtime_dataset_ingest.py --input my.pdf my.json --push
```

Use watch mode for drop-folder style updates:

```bash
python3 scripts/realtime_dataset_ingest.py --watch-dir data/incoming --watch --push
```

## Safety Notes

The builder filters high-confidence API keys, private keys, and token patterns
before writing rows. It does not publish local absolute paths in dataset rows.
Review `data/realtime_research_dataset_manifest.json` before public release.
"""


def push_to_hub(dataset: DatasetDict, settings: dict[str, Any]) -> None:
    from huggingface_hub import HfApi, create_repo

    repo_id = settings["repo_id"]
    create_repo(repo_id, repo_type="dataset", private=settings["private"], exist_ok=True)
    api = HfApi()
    uploads = [
        (settings["dataset_card"], "README.md"),
        (Path(settings["output_dir"]) / "train.parquet", "data/train-00000-of-00001.parquet"),
        (Path(settings["output_dir"]) / "eval.parquet", "data/eval-00000-of-00001.parquet"),
        (Path(settings["output_dir"]) / "test.parquet", "data/test-00000-of-00001.parquet"),
        (settings["output_jsonl"], "raw/realtime_research_sft.jsonl"),
        (settings["manifest"], "metadata/realtime_research_dataset_manifest.json"),
    ]
    for local, remote in uploads:
        path = Path(local)
        if path.exists():
            api.upload_file(
                path_or_fileobj=str(path),
                path_in_repo=remote,
                repo_id=repo_id,
                repo_type="dataset",
            )
    print(f"Pushed dataset: https://huggingface.co/datasets/{repo_id}")


def build_once(settings: dict[str, Any]) -> BuildResult:
    files, missing = discover_files(settings["inputs"], settings["watch_dirs"])
    all_examples: list[dict[str, Any]] = []
    sources: list[SourceStats] = []
    seen_examples: set[str] = set()
    seen_file_hashes: set[str] = set()
    duplicate_examples = 0
    duplicate_files = 0

    for path in files:
        sha = file_sha256(path)
        if sha in seen_file_hashes and not settings["keep_duplicate_files"]:
            duplicate_files += 1
            sources.append(
                SourceStats(
                    source_id=source_id(path),
                    source_type=source_type_for(path),
                    sha256=sha,
                    size_bytes=path.stat().st_size,
                    skipped=1,
                    metadata={"duplicate_file": True},
                )
            )
            continue
        seen_file_hashes.add(sha)

        print(f"Ingesting {path.name} ({source_type_for(path)})")
        source, examples = process_file(path, settings)
        sources.append(source)
        for ex in examples:
            key = ex["example_sha256"]
            if key in seen_examples:
                duplicate_examples += 1
                continue
            seen_examples.add(key)
            all_examples.append(ex)

    dataset = split_dataset(all_examples, settings)
    by_type = Counter(ex["source_type"] for ex in all_examples)
    manifest = {
        "generated_at": utc_now(),
        "dataset_name": settings["dataset_name"],
        "repo_id": settings["repo_id"],
        "builder": "scripts/realtime_dataset_ingest.py",
        "counts": {
            "examples": len(all_examples),
            "sources": len(sources),
            "missing_inputs": len(missing),
            "duplicate_examples": duplicate_examples,
            "duplicate_files_skipped": duplicate_files,
            "secret_or_invalid_skipped": sum(s.skipped for s in sources),
            "by_source_type": dict(sorted(by_type.items())),
        },
        "splits": {split: len(dataset[split]) for split in ["train", "eval", "test"]},
        "settings": {
            "train_ratio": settings["train_ratio"],
            "eval_ratio": settings["eval_ratio"],
            "seed": settings["seed"],
            "chunk_chars": settings["chunk_chars"],
            "chunk_overlap": settings["chunk_overlap"],
            "max_context_chars": settings["max_context_chars"],
            "min_text_chars": settings["min_text_chars"],
            "keep_duplicate_files": settings["keep_duplicate_files"],
            "save_arrow_dataset": settings["save_arrow_dataset"],
        },
        "missing_inputs": missing,
        "sources": [
            {
                "source_id": s.source_id,
                "source_type": s.source_type,
                "sha256": s.sha256,
                "size_bytes": s.size_bytes,
                "records": s.records,
                "skipped": s.skipped,
                "metadata": s.metadata,
            }
            for s in sources
        ],
    }
    run_hash_payload = json.dumps(
        {
            "examples": [ex["example_sha256"] for ex in all_examples],
            "sources": [(s.source_id, s.sha256, s.records) for s in sources],
        },
        sort_keys=True,
    )
    manifest["dataset_sha256"] = hashlib.sha256(run_hash_payload.encode("utf-8")).hexdigest()
    return BuildResult(examples=all_examples, manifest=manifest, dataset=dataset)


def run_once(settings: dict[str, Any]) -> BuildResult:
    result = build_once(settings)
    write_outputs(result.examples, result.dataset, result.manifest, settings)
    if settings["push"]:
        push_to_hub(result.dataset, settings)
    print(json.dumps(result.manifest["counts"], indent=2, ensure_ascii=False))
    print(json.dumps({"splits": result.manifest["splits"], "repo_id": settings["repo_id"]}, indent=2))
    return result


def watch(settings: dict[str, Any], poll_seconds: int) -> None:
    last_signature = ""
    print(f"Watching for dataset inputs every {poll_seconds}s")
    while True:
        files, _missing = discover_files(settings["inputs"], settings["watch_dirs"])
        signature = input_signature(files)
        if signature != last_signature:
            last_signature = signature
            run_once(settings)
        time.sleep(poll_seconds)


def main() -> None:
    args = parse_args()
    settings = merged_settings(args)
    if not settings["inputs"] and not settings["watch_dirs"]:
        print("No inputs provided. Use --input, --watch-dir, or --config.", file=sys.stderr)
        sys.exit(2)
    if args.watch:
        watch(settings, args.poll_seconds)
    else:
        run_once(settings)


if __name__ == "__main__":
    main()
