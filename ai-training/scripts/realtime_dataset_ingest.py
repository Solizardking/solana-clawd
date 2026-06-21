#!/usr/bin/env python3
"""
Convert PDFs, JSON/JSONL, CSV, notebooks, parquet files, images, and text
documents into a messages-schema SFT dataset.

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
import base64
import datetime as dt
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

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

IMAGE_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
}

CODE_SUFFIXES = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".sql",
    ".toml",
}

SUPPORTED_SUFFIXES = {
    ".pdf",
    ".json",
    ".jsonl",
    ".csv",
    ".ipynb",
    ".parquet",
    ".md",
    ".txt",
    ".yaml",
    ".yml",
} | IMAGE_SUFFIXES | CODE_SUFFIXES

SKIP_DIR_NAMES = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "__pycache__",
    "node_modules",
    ".next",
    "dist",
    "build",
    "target",
    ".clawvault",
}

IMAGE_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}

SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
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
    p.add_argument("--card-only", action="store_true", help="Regenerate only the dataset card from the manifest")
    p.add_argument("--train-ratio", type=float, default=None)
    p.add_argument("--eval-ratio", type=float, default=None)
    p.add_argument("--seed", type=int, default=None)
    p.add_argument("--chunk-chars", type=int, default=None, help="Chunk size for long source text")
    p.add_argument("--chunk-overlap", type=int, default=None, help="Character overlap between text chunks")
    p.add_argument("--max-context-chars", type=int, default=None, help="Max context chars for parquet QA rows")
    p.add_argument("--min-text-chars", type=int, default=None, help="Skip extracted chunks shorter than this")
    p.add_argument("--keep-duplicate-files", action="store_true", help="Do not skip files with duplicate SHA256")
    p.add_argument("--save-arrow-dataset", action="store_true", help="Also write datasets.save_to_disk Arrow shards")
    p.add_argument(
        "--pdf-extractor",
        choices=["auto", "pypdf", "documentai", "gemini", "nvidia"],
        help="PDF extraction backend. auto: NVIDIA env key, then Document AI OAuth, then Gemini API key, then pypdf.",
    )
    p.add_argument("--nvidia-cache-dir", help="Cache directory for NVIDIA extraction responses")
    p.add_argument("--no-nvidia-cache", action="store_true", help="Disable NVIDIA extraction response caching")
    p.add_argument("--nvidia-ingest-port", type=int, default=None, help="nv-ingest SimpleClient port")
    p.add_argument("--nvidia-extract-method", help="nv-ingest extraction method")
    p.add_argument("--nvidia-table-output-format", help="nv-ingest table output format")
    p.add_argument("--no-nvidia-start-pipeline", action="store_true", help="Assume nv-ingest is already running")
    p.add_argument("--documentai-endpoint", help="Full Document AI :process endpoint URL")
    p.add_argument("--documentai-field-mask", help="Document AI field mask")
    p.add_argument("--documentai-label", action="append", default=[], help="Document AI billing label, KEY=VALUE")
    p.add_argument("--documentai-page-batch-size", type=int, default=None, help="Pages per sync Document AI request")
    p.add_argument("--google-cache-dir", help="Cache directory for Google extraction responses")
    p.add_argument("--google-quota-project", help="Optional x-goog-user-project quota/billing project for Google APIs")
    p.add_argument("--no-google-cache", action="store_true", help="Disable Google extraction response caching")
    p.add_argument("--gemini-model", help="Gemini model for API-key PDF extraction")
    p.add_argument("--google-timeout-seconds", type=int, default=None, help="HTTP timeout for Google extraction calls")
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
        "card_only": bool(args.card_only),
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
        "pdf_extractor": args.pdf_extractor or cfg.get("pdf_extractor", "auto"),
        "nvidia_cache_dir": args.nvidia_cache_dir or cfg.get("nvidia_cache_dir") or "data/nvidia_cache",
        "nvidia_cache": not bool(args.no_nvidia_cache or cfg.get("no_nvidia_cache", False)),
        "nvidia_ingest_port": int(
            args.nvidia_ingest_port if args.nvidia_ingest_port is not None else cfg.get("nvidia_ingest_port", 7671)
        ),
        "nvidia_extract_method": args.nvidia_extract_method or cfg.get("nvidia_extract_method") or "pdfium",
        "nvidia_table_output_format": args.nvidia_table_output_format
        or cfg.get("nvidia_table_output_format")
        or "markdown",
        "nvidia_start_pipeline": not bool(args.no_nvidia_start_pipeline or cfg.get("no_nvidia_start_pipeline", False)),
        "documentai_endpoint": args.documentai_endpoint
        or cfg.get("documentai_endpoint")
        or "https://us-documentai.googleapis.com/v1/projects/1013652097839/locations/us/processors/29a612e70aee73e1:process",
        "documentai_field_mask": args.documentai_field_mask
        or cfg.get("documentai_field_mask")
        or "text,pages.pageNumber,pages.detectedLanguages,pages.imageQualityScores",
        "documentai_labels": merge_labels(cfg.get("documentai_labels") or {}, args.documentai_label),
        "documentai_page_batch_size": int(
            args.documentai_page_batch_size
            if args.documentai_page_batch_size is not None
            else cfg.get("documentai_page_batch_size", 1)
        ),
        "google_cache_dir": args.google_cache_dir or cfg.get("google_cache_dir") or "data/docai_cache",
        "google_quota_project": args.google_quota_project or cfg.get("google_quota_project"),
        "google_cache": not bool(args.no_google_cache or cfg.get("no_google_cache", False)),
        "gemini_model": args.gemini_model or cfg.get("gemini_model") or os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash",
        "google_timeout_seconds": int(
            args.google_timeout_seconds if args.google_timeout_seconds is not None else cfg.get("google_timeout_seconds", 120)
        ),
    }


def merge_labels(config_labels: dict[str, Any], cli_labels: list[str]) -> dict[str, str]:
    labels = {str(k): str(v) for k, v in config_labels.items()}
    for item in cli_labels:
        if "=" not in item:
            raise ValueError(f"Document AI label must be KEY=VALUE: {item}")
        key, value = item.split("=", 1)
        labels[key] = value
    validate_documentai_labels(labels)
    return labels


def validate_documentai_labels(labels: dict[str, str]) -> None:
    if len(labels) > 64:
        raise ValueError("Document AI labels support at most 64 key-value pairs")
    key_re = re.compile(r"^[a-z][a-z0-9_-]{0,62}$")
    value_re = re.compile(r"^[a-z0-9_-]{0,63}$")
    for key, value in labels.items():
        if not key_re.match(key):
            raise ValueError(
                f"Invalid Document AI label key {key!r}. Use lowercase letters, numbers, underscores, "
                "or dashes; start with a lowercase letter; max 63 characters."
            )
        if not value_re.match(value):
            raise ValueError(
                f"Invalid Document AI label value for {key!r}. Use lowercase letters, numbers, "
                "underscores, or dashes; max 63 characters."
            )


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


def redact_secret_like(text: str) -> str:
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[REDACTED_SECRET]", text)
    return text


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
    if suffix in CODE_SUFFIXES:
        return "code"
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".ipynb":
        return "notebook"
    if suffix == ".parquet":
        return "parquet"
    if suffix == ".csv":
        return "csv"
    if suffix in IMAGE_SUFFIXES:
        return "image"
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
                if any(part in SKIP_DIR_NAMES for part in child.parts):
                    continue
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


def get_pdf_reader(path: Path) -> Any:
    if PdfReader is None:
        raise RuntimeError("pypdf is required for PDF ingestion. Install it with: python3 -m pip install pypdf")
    return PdfReader(str(path))


def read_pdf_metadata(path: Path) -> tuple[dict[str, Any], Any | None]:
    try:
        reader = get_pdf_reader(path)
    except Exception:
        return {
            "title": path.stem,
            "author": None,
            "subject": None,
            "keywords": None,
            "arxiv_id": None,
            "page_count": None,
        }, None
    raw_meta = reader.metadata or {}
    pdf_meta: dict[str, Any] = {}
    for key, value in raw_meta.items():
        clean_key = str(key).lstrip("/")
        try:
            pdf_meta[clean_key] = str(value)
        except Exception:
            pdf_meta[clean_key] = repr(value)
    return {
        "title": pdf_meta.get("Title") or path.stem,
        "author": pdf_meta.get("Author"),
        "subject": pdf_meta.get("Subject"),
        "keywords": pdf_meta.get("Keywords"),
        "arxiv_id": pdf_meta.get("arXivID"),
        "page_count": len(reader.pages),
    }, reader


def choose_pdf_extractor(settings: dict[str, Any]) -> str:
    requested = settings["pdf_extractor"]
    if requested != "auto":
        return requested
    if not settings.get("_nvidia_unavailable") and nvidia_api_key_available():
        return "nvidia"
    if not settings.get("_documentai_unavailable") and settings.get("documentai_endpoint") and documentai_token_available():
        return "documentai"
    if not settings.get("_gemini_unavailable") and gemini_api_key():
        return "gemini"
    return "pypdf"


def nvidia_api_key_available() -> bool:
    return bool(os.environ.get("NVIDIA_API_KEY"))


def documentai_token_available() -> bool:
    if os.environ.get("GOOGLE_DOCUMENTAI_ACCESS_TOKEN") or os.environ.get("GOOGLE_OAUTH_ACCESS_TOKEN") or os.environ.get("GOOGLE_ACCESS_TOKEN"):
        return True
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        return True
    adc_path = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
    if adc_path.exists():
        return True
    return bool(shutil.which("gcloud"))


def gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""


def get_documentai_token(timeout: int) -> str:
    for name in ["GOOGLE_DOCUMENTAI_ACCESS_TOKEN", "GOOGLE_OAUTH_ACCESS_TOKEN", "GOOGLE_ACCESS_TOKEN"]:
        token = os.environ.get(name)
        if token:
            return token

    credentials_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path:
        try:
            from google.auth.transport.requests import Request  # type: ignore
            from google.oauth2 import service_account  # type: ignore

            credentials = service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )
            credentials.refresh(Request())
            if credentials.token:
                return credentials.token
        except Exception as exc:
            print(f"WARNING: GOOGLE_APPLICATION_CREDENTIALS token refresh failed: {exc}", file=sys.stderr)

    try:
        import google.auth  # type: ignore
        from google.auth.transport.requests import Request  # type: ignore

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(Request())
        if credentials.token:
            return credentials.token
    except Exception as exc:
        print(f"WARNING: Google ADC token refresh failed: {exc}", file=sys.stderr)

    gcloud = shutil.which("gcloud")
    if gcloud:
        for command in (
            [gcloud, "auth", "application-default", "print-access-token"],
            [gcloud, "auth", "print-access-token"],
        ):
            proc = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            token = proc.stdout.strip()
            if proc.returncode == 0 and token:
                return token
    raise RuntimeError(
        "Document AI requires Google Cloud OAuth credentials. Set GOOGLE_DOCUMENTAI_ACCESS_TOKEN, "
        "GOOGLE_OAUTH_ACCESS_TOKEN, GOOGLE_ACCESS_TOKEN, GOOGLE_APPLICATION_CREDENTIALS, ADC, or log in with gcloud. "
        "GOOGLE_API_KEY/GEMINI_API_KEY are used for the Gemini extractor, not Document AI IAM."
    )


def google_cache_path(settings: dict[str, Any], key_parts: list[Any]) -> Path | None:
    if not settings.get("google_cache"):
        return None
    payload = json.dumps(key_parts, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return Path(settings["google_cache_dir"]) / f"{digest}.json"


def read_google_cache(settings: dict[str, Any], key_parts: list[Any]) -> Any | None:
    path = google_cache_path(settings, key_parts)
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_google_cache(settings: dict[str, Any], key_parts: list[Any], value: Any) -> None:
    path = google_cache_path(settings, key_parts)
    if not path:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        print(f"WARNING: could not write Google extraction cache: {exc}", file=sys.stderr)


def provider_cache_path(cache_dir: str, enabled: bool, key_parts: list[Any]) -> Path | None:
    if not enabled:
        return None
    payload = json.dumps(key_parts, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return Path(cache_dir) / f"{digest}.json"


def read_provider_cache(cache_dir: str, enabled: bool, key_parts: list[Any]) -> Any | None:
    path = provider_cache_path(cache_dir, enabled, key_parts)
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_provider_cache(cache_dir: str, enabled: bool, key_parts: list[Any], value: Any) -> None:
    path = provider_cache_path(cache_dir, enabled, key_parts)
    if not path:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    except OSError as exc:
        print(f"WARNING: could not write provider extraction cache: {exc}", file=sys.stderr)


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: int) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urlrequest.Request(url, data=data, headers=headers, method="POST")
    try:
        with urlrequest.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Google API request failed with HTTP {exc.code}: {body[:1000]}") from exc


def page_batches(page_count: int | None, batch_size: int) -> list[list[int] | None]:
    if not page_count or batch_size <= 0:
        return [None]
    batches: list[list[int] | None] = []
    start = 1
    while start <= page_count:
        end = min(start + batch_size - 1, page_count)
        batches.append(list(range(start, end + 1)))
        start = end + 1
    return batches


def extract_documentai_pdf_texts(
    path: Path,
    source: SourceStats,
    settings: dict[str, Any],
    page_count: int | None,
) -> list[dict[str, Any]]:
    token = get_documentai_token(settings["google_timeout_seconds"])
    content_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    texts: list[dict[str, Any]] = []
    batches = page_batches(page_count, settings["documentai_page_batch_size"])
    for pages in batches:
        cache_key = [
            "documentai",
            settings["documentai_endpoint"],
            source.sha256,
            pages,
            settings["documentai_field_mask"],
            settings["documentai_labels"],
            settings.get("google_quota_project"),
        ]
        cached = read_google_cache(settings, cache_key)
        if cached is None:
            payload: dict[str, Any] = {
                "skipHumanReview": True,
                "rawDocument": {"mimeType": "application/pdf", "content": content_b64},
                "fieldMask": settings["documentai_field_mask"],
                "labels": settings["documentai_labels"],
            }
            if pages:
                payload["processOptions"] = {"individualPageSelector": {"pages": pages}}
            cached = post_json(
                settings["documentai_endpoint"],
                payload,
                {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json; charset=utf-8",
                    **(
                        {"x-goog-user-project": settings["google_quota_project"]}
                        if settings.get("google_quota_project")
                        else {}
                    ),
                },
                settings["google_timeout_seconds"],
            )
            write_google_cache(settings, cache_key, cached)
        document = cached.get("document") or {}
        text = compact_text(document.get("text") or "")
        returned_pages = document.get("pages") or []
        page_numbers = [p.get("pageNumber") for p in returned_pages if isinstance(p, dict) and p.get("pageNumber")]
        if text:
            texts.append(
                {
                    "text": text,
                    "pages": page_numbers or pages,
                    "extractor": "documentai",
                    "metadata": {
                        "documentai_endpoint": settings["documentai_endpoint"],
                        "field_mask": settings["documentai_field_mask"],
                        "labels": settings["documentai_labels"],
                    },
                }
            )
        else:
            source.skipped += 1
    return texts


def extract_gemini_pdf_texts(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    api_key = gemini_api_key()
    if not api_key:
        raise RuntimeError("Gemini extraction requires GEMINI_API_KEY or GOOGLE_API_KEY.")
    model = settings["gemini_model"]
    query = urlparse.urlencode({"key": api_key})
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urlparse.quote(model)}:generateContent?{query}"
    cache_key = ["gemini", model, source.sha256]
    cached = read_google_cache(settings, cache_key)
    if cached is None:
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": (
                                "Extract all useful text from this PDF for a model-training dataset. "
                                "Return JSON only with shape {\"title\": string, "
                                "\"pages\": [{\"page\": number|null, \"text\": string}]}. "
                                "Preserve section headings, tables as readable text, equations when possible, "
                                "and any implementation details. Do not invent text that is not present."
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": "application/pdf",
                                "data": base64.b64encode(path.read_bytes()).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "response_mime_type": "application/json",
            },
        }
        cached = post_json(
            url,
            payload,
            {"Content-Type": "application/json; charset=utf-8"},
            settings["google_timeout_seconds"],
        )
        write_google_cache(settings, cache_key, cached)

    text = ""
    try:
        parts = cached["candidates"][0]["content"]["parts"]
        text = "\n".join(part.get("text", "") for part in parts if isinstance(part, dict))
    except Exception:
        text = json.dumps(cached, ensure_ascii=False)
    text = normalize_text(text)
    if not text:
        source.skipped += 1
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = {"pages": [{"page": None, "text": text}]}
    pages = parsed.get("pages") if isinstance(parsed, dict) else None
    if not isinstance(pages, list):
        pages = [{"page": None, "text": text}]
    out: list[dict[str, Any]] = []
    for item in pages:
        if not isinstance(item, dict):
            continue
        page_text = compact_text(str(item.get("text") or ""))
        if len(page_text) < settings["min_text_chars"]:
            source.skipped += 1
            continue
        out.append(
            {
                "text": page_text,
                "pages": [item.get("page")] if item.get("page") else None,
                "extractor": "gemini",
                "metadata": {"gemini_model": model},
            }
        )
    return out


def _nvidia_item_page(item: Any) -> int | None:
    if not isinstance(item, dict):
        return None
    candidates = [
        item.get("page"),
        item.get("page_number"),
        item.get("page_idx"),
        item.get("page_index"),
    ]
    metadata = item.get("metadata")
    if isinstance(metadata, dict):
        candidates.extend(
            [
                metadata.get("page"),
                metadata.get("page_number"),
                metadata.get("page_idx"),
                metadata.get("page_index"),
            ]
        )
        source_meta = metadata.get("source_metadata")
        if isinstance(source_meta, dict):
            candidates.extend(
                [
                    source_meta.get("page"),
                    source_meta.get("page_number"),
                    source_meta.get("page_idx"),
                    source_meta.get("page_index"),
                ]
            )
    for value in candidates:
        try:
            page = int(value)
        except (TypeError, ValueError):
            continue
        return page + 1 if page == 0 else page
    return None


def _nvidia_item_type(item: Any) -> str | None:
    if not isinstance(item, dict):
        return None
    for key in ("type", "content_type", "element_type", "category"):
        value = item.get(key)
        if isinstance(value, str) and value:
            return value
    metadata = item.get("metadata")
    if isinstance(metadata, dict):
        for key in ("type", "content_type", "element_type", "category"):
            value = metadata.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def _nvidia_text_records(value: Any, page: int | None = None, kind: str | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, str):
        text = compact_text(value)
        if text:
            records.append({"text": text, "page": page, "kind": kind})
        return records
    if isinstance(value, list):
        for item in value:
            records.extend(_nvidia_text_records(item, page, kind))
        return records
    if not isinstance(value, dict):
        return records

    item_page = _nvidia_item_page(value) or page
    item_kind = _nvidia_item_type(value) or kind
    for key in (
        "text",
        "markdown",
        "table_markdown",
        "content",
        "caption",
        "description",
        "document_text",
        "extracted_text",
    ):
        field_value = value.get(key)
        if isinstance(field_value, str):
            text = compact_text(field_value)
            if text:
                records.append({"text": text, "page": item_page, "kind": item_kind or key})
    for key in ("children", "elements", "items", "rows", "data"):
        child_value = value.get(key)
        if isinstance(child_value, (list, dict)):
            records.extend(_nvidia_text_records(child_value, item_page, item_kind))
    return records


def extract_nvidia_pdf_texts(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    if not nvidia_api_key_available():
        raise RuntimeError("NVIDIA extraction requires NVIDIA_API_KEY in the environment.")

    cache_key = [
        "nvidia",
        "nv-ingest",
        source.sha256,
        settings["nvidia_extract_method"],
        settings["nvidia_table_output_format"],
    ]
    cached = read_provider_cache(settings["nvidia_cache_dir"], settings["nvidia_cache"], cache_key)
    if cached is None:
        try:
            from nv_ingest_client.client import NvIngestClient  # type: ignore
            from nv_ingest_client.message_clients.simple import SimpleClient  # type: ignore
            from nv_ingest_client.primitives import Ingestor  # type: ignore
        except Exception as exc:
            raise RuntimeError(
                "NVIDIA nv-ingest packages are required for --pdf-extractor nvidia. "
                "Install optional packages such as nv-ingest, nv-ingest-api, and nv-ingest-client, "
                "or run the ingestion pipeline in an environment that already provides them."
            ) from exc

        if settings["nvidia_start_pipeline"]:
            try:
                from nv_ingest.framework.orchestration.ray.primitives.ray_pipeline import run_pipeline  # type: ignore

                run_pipeline(block=False, disable_dynamic_scaling=True, run_in_subprocess=True, quiet=True)
            except Exception as exc:
                print(f"WARNING: could not start nv-ingest pipeline automatically: {exc}", file=sys.stderr)

        client = NvIngestClient(
            message_client_allocator=SimpleClient,
            message_client_port=settings["nvidia_ingest_port"],
            message_client_hostname="localhost",
        )
        ingestor = (
            Ingestor(client=client)
            .files([str(path)])
            .extract(
                extract_text=True,
                extract_tables=True,
                extract_charts=True,
                extract_images=False,
                extract_method=settings["nvidia_extract_method"],
                table_output_format=settings["nvidia_table_output_format"],
            )
        )
        job_results = ingestor.ingest()
        cached = job_results[0] if isinstance(job_results, list) and job_results else job_results
        write_provider_cache(settings["nvidia_cache_dir"], settings["nvidia_cache"], cache_key, cached)

    out: list[dict[str, Any]] = []
    for record in _nvidia_text_records(cached):
        text = record["text"]
        if len(text) < settings["min_text_chars"]:
            source.skipped += 1
            continue
        page = record.get("page")
        out.append(
            {
                "text": text,
                "pages": [page] if isinstance(page, int) else None,
                "extractor": "nvidia",
                "metadata": {
                    "nvidia_pipeline": "nv-ingest",
                    "extract_method": settings["nvidia_extract_method"],
                    "table_output_format": settings["nvidia_table_output_format"],
                    "content_type": record.get("kind"),
                },
            }
        )
    if not out:
        source.skipped += 1
    return out


def extract_pypdf_texts(path: Path, source: SourceStats, reader: Any | None) -> list[dict[str, Any]]:
    reader = reader or get_pdf_reader(path)
    texts: list[dict[str, Any]] = []
    for page_index, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text() or ""
        except Exception:
            source.skipped += 1
            continue
        text = compact_text(text)
        texts.append({"text": text, "pages": [page_index], "extractor": "pypdf", "metadata": {}})
    return texts


def extract_pdf_texts(path: Path, source: SourceStats, settings: dict[str, Any], reader: Any | None) -> tuple[str, list[dict[str, Any]]]:
    extractor = choose_pdf_extractor(settings)
    try:
        if extractor == "documentai":
            return extractor, extract_documentai_pdf_texts(
                path,
                source,
                settings,
                source.metadata.get("page_count"),
            )
        if extractor == "gemini":
            return extractor, extract_gemini_pdf_texts(path, source, settings)
        if extractor == "nvidia":
            return extractor, extract_nvidia_pdf_texts(path, source, settings)
        return "pypdf", extract_pypdf_texts(path, source, reader)
    except Exception as exc:
        if settings["pdf_extractor"] != "auto":
            raise
        if extractor == "nvidia":
            settings["_nvidia_unavailable"] = True
            print(f"WARNING: nvidia PDF extraction failed for {path.name}; falling back to pypdf: {exc}", file=sys.stderr)
        elif extractor == "documentai" and gemini_api_key():
            try:
                print(
                    f"WARNING: documentai PDF extraction failed for {path.name}; falling back to gemini: {exc}",
                    file=sys.stderr,
                )
                return "gemini", extract_gemini_pdf_texts(path, source, settings)
            except Exception as gemini_exc:
                settings["_gemini_unavailable"] = True
                print(
                    f"WARNING: gemini PDF extraction failed for {path.name}; falling back to pypdf: {gemini_exc}",
                    file=sys.stderr,
                )
        else:
            if extractor == "documentai":
                settings["_documentai_unavailable"] = True
            elif extractor == "gemini":
                settings["_gemini_unavailable"] = True
            print(f"WARNING: {extractor} PDF extraction failed for {path.name}; falling back to pypdf: {exc}", file=sys.stderr)
        return "pypdf", extract_pypdf_texts(path, source, reader)


def page_label(pages: list[int] | None) -> str:
    if not pages:
        return "document"
    if len(pages) == 1:
        return f"page {pages[0]}"
    return f"pages {pages[0]}-{pages[-1]}"


def record_page_id(pages: list[int] | None, extracted_index: int, chunk_index: int) -> str:
    if not pages:
        return f"document-{extracted_index:04d}-chunk-{chunk_index:03d}"
    if len(pages) == 1:
        return f"page-{pages[0]:04d}-chunk-{chunk_index:03d}"
    return f"pages-{pages[0]:04d}-{pages[-1]:04d}-chunk-{chunk_index:03d}"


def process_pdf(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    source.metadata, reader = read_pdf_metadata(path)
    extractor, extracted = extract_pdf_texts(path, source, settings, reader)
    source.metadata["pdf_extractor"] = extractor
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

    for extracted_index, item in enumerate(extracted, 1):
        text = compact_text(item.get("text") or "")
        pages = item.get("pages")
        item_metadata = item.get("metadata") or {}
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
                f"{page_label(pages)}, chunk {chunk_index}. Preserve concrete claims, "
                "definitions, methods, caveats, and implementation details."
            )
            assistant = (
                f"Source: {source.source_id}\nTitle: {title}\nExtractor: {item.get('extractor', extractor)}\n"
                f"Location: {page_label(pages)}\n\n{chunk}"
            )
            ex = make_example(
                user=user,
                assistant=assistant,
                source=source,
                record_id=record_page_id(pages, extracted_index, chunk_index),
                tags=["pdf", "research", "document-parsing", item.get("extractor", extractor)],
                metadata={
                    "title": title,
                    "pages": pages,
                    "chunk": chunk_index,
                    "pdf_extractor": item.get("extractor", extractor),
                    **item_metadata,
                },
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


def process_csv(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    df = pd.read_csv(path)
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
    original_chars = len(text)
    if source.source_type == "code":
        text = redact_secret_like(text)
    source.metadata = {"chars": original_chars, "redacted": source.source_type == "code"}
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


def read_image_dimensions(path: Path) -> tuple[int | None, int | None]:
    """Read common image dimensions without importing heavyweight image libs."""
    try:
        data = path.read_bytes()[:256]
    except OSError:
        return None, None

    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")

    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 10:
        return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")

    if data.startswith(b"BM") and len(data) >= 26:
        width = int.from_bytes(data[18:22], "little", signed=True)
        height = int.from_bytes(data[22:26], "little", signed=True)
        return abs(width), abs(height)

    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        if data[12:16] == b"VP8X" and len(data) >= 30:
            width = int.from_bytes(data[24:27], "little") + 1
            height = int.from_bytes(data[27:30], "little") + 1
            return width, height
        if data[12:16] == b"VP8 " and len(data) >= 30:
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
        if data[12:16] == b"VP8L" and len(data) >= 25:
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1

    if data.startswith(b"\xff\xd8"):
        try:
            with path.open("rb") as f:
                f.read(2)
                while True:
                    marker_start = f.read(1)
                    if not marker_start:
                        break
                    if marker_start != b"\xff":
                        continue
                    marker = f.read(1)
                    while marker == b"\xff":
                        marker = f.read(1)
                    if marker in {b"\xc0", b"\xc1", b"\xc2", b"\xc3", b"\xc5", b"\xc6", b"\xc7", b"\xc9", b"\xca", b"\xcb", b"\xcd", b"\xce", b"\xcf"}:
                        f.read(3)
                        height = int.from_bytes(f.read(2), "big")
                        width = int.from_bytes(f.read(2), "big")
                        return width, height
                    if marker in {b"\xd8", b"\xd9"}:
                        continue
                    segment_len = int.from_bytes(f.read(2), "big")
                    if segment_len < 2:
                        break
                    f.seek(segment_len - 2, 1)
        except OSError:
            return None, None

    return None, None


def image_caption_sidecar(path: Path) -> tuple[Path | None, str]:
    candidates = [
        path.with_suffix(path.suffix + ".caption.txt"),
        path.with_suffix(path.suffix + ".caption.md"),
        path.with_suffix(path.suffix + ".alt.txt"),
        path.with_suffix(path.suffix + ".alt.md"),
        path.with_suffix(".caption.txt"),
        path.with_suffix(".caption.md"),
        path.with_suffix(".alt.txt"),
        path.with_suffix(".alt.md"),
    ]
    for candidate in candidates:
        if not candidate.exists() or not candidate.is_file():
            continue
        text = normalize_text(candidate.read_text(encoding="utf-8", errors="ignore"))
        if text and not secret_like(text):
            return candidate, text
    return None, ""


def process_image(path: Path, source: SourceStats, settings: dict[str, Any]) -> list[dict[str, Any]]:
    width, height = read_image_dimensions(path)
    caption_path, caption = image_caption_sidecar(path)
    source.metadata = {
        "mime_type": IMAGE_MIME_TYPES.get(path.suffix.lower(), "image/unknown"),
        "width": width,
        "height": height,
        "caption_sidecar": caption_path.name if caption_path else None,
        "semantic_extraction": "sidecar-caption" if caption else "metadata-only",
    }
    manifest = json.dumps({k: v for k, v in source.metadata.items() if v is not None}, ensure_ascii=False, indent=2)
    examples: list[dict[str, Any]] = []
    metadata_example = make_example(
        user=f"Create a public-safe source record for image `{source.source_id}`.",
        assistant=(
            f"Source: {source.source_id}\n"
            f"SHA256: {source.sha256}\n"
            f"Size bytes: {source.size_bytes}\n"
            f"Image metadata:\n{manifest}\n\n"
            "Raw image bytes are intentionally excluded from the SFT row."
        ),
        source=source,
        record_id="metadata",
        tags=["image", "metadata", "multimodal-source"],
        metadata=source.metadata,
    )
    if metadata_example:
        examples.append(metadata_example)

    if caption:
        for chunk_index, chunk in enumerate(chunk_text(caption, settings["chunk_chars"], settings["chunk_overlap"]), 1):
            if len(chunk) < settings["min_text_chars"]:
                source.skipped += 1
                continue
            ex = make_example(
                user=(
                    f"Convert the caption/context sidecar for image `{source.source_id}` "
                    f"chunk {chunk_index} into reusable Solana model-training context."
                ),
                assistant=f"Source: {source.source_id}\nCaption sidecar: {caption_path.name if caption_path else '-'}\n\n{chunk}",
                source=source,
                record_id=f"caption-{chunk_index:03d}",
                tags=["image", "caption", "multimodal-source"],
                metadata={**source.metadata, "chunk": chunk_index},
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
    elif suffix == ".csv":
        examples = process_csv(path, source, settings)
    elif suffix in {".json", ".jsonl"}:
        examples = process_json(path, source, settings)
    elif suffix in IMAGE_SUFFIXES:
        examples = process_image(path, source, settings)
    elif suffix in {".md", ".txt", ".yaml", ".yml"} or suffix in CODE_SUFFIXES:
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


def md_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    text = normalize_text(text).replace("\n", " ")
    return text.replace("|", "\\|") or "-"


def source_tables(manifest: dict[str, Any]) -> str:
    pdf_rows: list[str] = []
    notebook_rows: list[str] = []
    parquet_rows: list[str] = []
    csv_rows: list[str] = []
    image_rows: list[str] = []
    text_rows: list[str] = []

    for source in manifest["sources"]:
        source_type = source.get("source_type")
        metadata = source.get("metadata") or {}
        if source_type == "pdf":
            identifier = metadata.get("arxiv_id") or metadata.get("DOI") or metadata.get("doi") or "-"
            topic = metadata.get("title") or ("duplicate file skipped" if metadata.get("duplicate_file") else "-")
            pdf_rows.append(
                "| {file} | {topic} | {pages} | {examples} | {identifier} |".format(
                    file=md_cell(source.get("source_id")),
                    topic=md_cell(topic),
                    pages=md_cell(metadata.get("page_count")),
                    examples=md_cell(source.get("records")),
                    identifier=md_cell(identifier),
                )
            )
        elif source_type == "notebook":
            notebook_rows.append(
                "| {file} | {cells} | {kernel} | {examples} |".format(
                    file=md_cell(source.get("source_id")),
                    cells=md_cell(metadata.get("cell_count")),
                    kernel=md_cell(metadata.get("kernel")),
                    examples=md_cell(source.get("records")),
                )
            )
        elif source_type == "parquet":
            columns = ", ".join(metadata.get("columns") or [])
            parquet_rows.append(
                "| {file} | {rows} | {columns} | {examples} |".format(
                    file=md_cell(source.get("source_id")),
                    rows=md_cell(metadata.get("rows")),
                    columns=md_cell(columns),
                    examples=md_cell(source.get("records")),
                )
            )
        elif source_type == "csv":
            columns = ", ".join(metadata.get("columns") or [])
            csv_rows.append(
                "| {file} | {rows} | {columns} | {examples} |".format(
                    file=md_cell(source.get("source_id")),
                    rows=md_cell(metadata.get("rows")),
                    columns=md_cell(columns),
                    examples=md_cell(source.get("records")),
                )
            )
        elif source_type == "image":
            dimensions = (
                f"{metadata.get('width')}x{metadata.get('height')}"
                if metadata.get("width") and metadata.get("height")
                else "-"
            )
            image_rows.append(
                "| {file} | {mime} | {dimensions} | {mode} | {examples} |".format(
                    file=md_cell(source.get("source_id")),
                    mime=md_cell(metadata.get("mime_type")),
                    dimensions=md_cell(dimensions),
                    mode=md_cell(metadata.get("semantic_extraction")),
                    examples=md_cell(source.get("records")),
                )
            )
        else:
            text_rows.append(
                "| {file} | {kind} | {details} | {examples} |".format(
                    file=md_cell(source.get("source_id")),
                    kind=md_cell(source_type),
                    details=md_cell(metadata.get("chars") or metadata),
                    examples=md_cell(source.get("records")),
                )
            )

    sections: list[str] = []
    if pdf_rows:
        sections.append(
            "### PDF Research Sources\n\n"
            "| File | What it contains | Pages | Examples | Identifier |\n"
            "| --- | --- | ---: | ---: | --- |\n"
            + "\n".join(pdf_rows)
        )
    if notebook_rows:
        sections.append(
            "### Notebook Sources\n\n"
            "| File | Cells | Kernel | Examples |\n"
            "| --- | ---: | --- | ---: |\n"
            + "\n".join(notebook_rows)
        )
    if parquet_rows:
        sections.append(
            "### Parquet QA Sources\n\n"
            "| File | Rows | Columns | Examples |\n"
            "| --- | ---: | --- | ---: |\n"
            + "\n".join(parquet_rows)
        )
    if csv_rows:
        sections.append(
            "### CSV Sources\n\n"
            "| File | Rows | Columns | Examples |\n"
            "| --- | ---: | --- | ---: |\n"
            + "\n".join(csv_rows)
        )
    if image_rows:
        sections.append(
            "### Image Sources\n\n"
            "| File | MIME | Dimensions | Extraction | Examples |\n"
            "| --- | --- | --- | --- | ---: |\n"
            + "\n".join(image_rows)
        )
    if text_rows:
        sections.append(
            "### Text and Skill Sources\n\n"
            "| File | Type | Details | Examples |\n"
            "| --- | --- | --- | ---: |\n"
            + "\n".join(text_rows)
        )
    return "\n\n".join(sections)


def build_dataset_card(manifest: dict[str, Any], settings: dict[str, Any]) -> str:
    splits = manifest["splits"]
    counts = manifest["counts"]
    source_rows = "\n".join(
        f"- `{s['source_id']}` ({s['source_type']}, {s['records']} examples)"
        for s in manifest["sources"]
    )
    source_inventory = source_tables(manifest)
    labels = settings.get("documentai_labels") or {}
    labels_text = ", ".join(f"`{k}={v}`" for k, v in labels.items()) or "none configured"
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
  - images
  - datasets
  - realtime-ingestion
pretty_name: {settings["dataset_name"]}
---

# {settings["dataset_name"]}

Instruction-tuning dataset generated by `scripts/realtime_dataset_ingest.py`
from submitted PDFs, notebooks, parquet/CSV QA rows, JSON/JSONL files, images,
and local reference text.

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

## Source Inventory

{source_inventory}

## Document Processing Providers

The ingestion script supports NVIDIA and Google-backed PDF extraction:

- `pdf_extractor: auto` tries NVIDIA `nv-ingest` when `NVIDIA_API_KEY` is present,
  then Document AI when OAuth/ADC credentials are present, then Gemini when
  `GEMINI_API_KEY` or `GOOGLE_API_KEY` is present, then local `pypdf`.
- NVIDIA pipeline: `nv-ingest` with `extract_text=True`, `extract_tables=True`,
  `extract_charts=True`, table output `{settings.get("nvidia_table_output_format", "")}`,
  and extract method `{settings.get("nvidia_extract_method", "")}`.
- Document AI endpoint: `{settings.get("documentai_endpoint", "")}`
- Document AI field mask: `{settings.get("documentai_field_mask", "")}`
- Document AI billing labels: {labels_text}
- Google quota project: `{settings.get("google_quota_project") or ""}`
- Gemini model: `{settings.get("gemini_model", "")}`

Image files are represented as public-safe metadata rows. If a sidecar caption
exists next to the image using `.caption.txt`, `.caption.md`, `.alt.txt`, or
`.alt.md`, that text is chunked into normal SFT rows. Raw image bytes are never
written to the dataset JSONL, manifest, card, or Hub upload.

Document AI's `ProcessDocument` endpoint normally requires Google Cloud OAuth
or Application Default Credentials. API keys are used by the Gemini extractor.
Do not publish NVIDIA API keys, Google OAuth client-secret files, ADC JSON,
access tokens, authorization headers, or API keys in dataset files, manifests,
cards, commits, or Hub uploads. If Document AI returns `BILLING_DISABLED`,
enable billing on the processor project or switch to a processor in a
billing-enabled project.

## Reproduce

```bash
cd /path/to/solana-clawd/ai-training
python3 scripts/realtime_dataset_ingest.py --config configs/realtime_dataset_config.yaml
python3 scripts/realtime_dataset_ingest.py --input my.pdf my.json chart.png --push
python3 scripts/realtime_dataset_ingest.py --pdf-extractor gemini --input my.pdf
python3 scripts/realtime_dataset_ingest.py --pdf-extractor documentai --input my.pdf
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


def regenerate_card_only(settings: dict[str, Any]) -> None:
    manifest_path = Path(settings["manifest"])
    card_path = Path(settings["dataset_card"])
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    card_path.write_text(build_dataset_card(manifest, settings), encoding="utf-8")
    print(f"Regenerated dataset card: {card_path}")


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
    if settings["card_only"]:
        regenerate_card_only(settings)
        return
    if not settings["inputs"] and not settings["watch_dirs"]:
        print("No inputs provided. Use --input, --watch-dir, or --config.", file=sys.stderr)
        sys.exit(2)
    if args.watch:
        watch(settings, args.poll_seconds)
    else:
        run_once(settings)


if __name__ == "__main__":
    main()
