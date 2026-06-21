#!/usr/bin/env python3
"""Build the Clawd conversational masterpiece SFT dataset.

The output is intentionally messages-only so TRL can train it as conversational
SFT. CPT/on-chain transaction rows are wrapped into instruction examples instead
of being mixed as raw text rows.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


BASE_DIR = Path(__file__).resolve().parent.parent

SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. Be conversational, "
    "useful, memorable, and technically exact. Reason about Solana, DeFi, "
    "agent tools, on-chain data, viral distribution, and research loops with "
    "auditable summaries. Keep private chain-of-thought private. Never handle "
    "private keys, wallet draining, deception, sanctions evasion, front-running, "
    "or live execution without explicit trust gates. Default to observer or "
    "paper mode for trading workflows."
)

DEFAULT_MESSAGE_INPUTS = [
    "data/model_kit/solana_clawd_reasoning_tooling_sft.jsonl",
    "data/model_kit/clawd_autoresearch_wiki_sft.jsonl",
    "data/core_ai_clawd_sft.jsonl",
    "data/realtime_research_sft.jsonl",
    "data/nvidia_trading_factory_sft.jsonl",
    "data/solana_clawd_merged.jsonl",
    "data/solana_clawd_seed.jsonl",
    "trading_factory/clawd-autoresearch-wiki/solana-chat/data/solana_chat_seed.jsonl",
    "trading_factory/clawd-autoresearch-wiki/solana-chat/data/solana_chat_eval.jsonl",
]

DEFAULT_TEXT_INPUTS = [
    "data/model_kit/bigquery_solana_mainnet_cpt.jsonl",
    "data/model_kit/tx_foundation_cpt_clean.jsonl",
]

SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bwandb(?:_v1)?_[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{30,}\b"),
    re.compile(
        r"\b(?:api[_-]?key|private[_-]?key|secret|token)\b[\"'\s:=]{1,8}"
        r"[A-Za-z0-9_./+=-]{28,}",
        re.IGNORECASE,
    ),
]

ROLE_MAP = {
    "human": "user",
    "gpt": "assistant",
    "bot": "assistant",
    "ai": "assistant",
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--message-input", action="append", default=[], help="Messages JSONL input. Defaults to all local Solana SFT corpora.")
    p.add_argument("--text-input", action="append", default=[], help="Text/CPT JSONL input converted into conversations.")
    p.add_argument("--output", default="data/model_kit/clawd_masterpiece_sft.jsonl")
    p.add_argument("--manifest", default="data/model_kit/clawd_masterpiece_manifest.json")
    p.add_argument("--min-assistant-chars", type=int, default=24)
    p.add_argument("--min-text-chars", type=int, default=64)
    p.add_argument("--max-examples", type=int, default=None)
    p.add_argument("--keep-duplicates", action="store_true")
    return p.parse_args()


def resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else BASE_DIR / p


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def scrub_text(text: str) -> str:
    text = text.replace("\r\n", "\n").strip()
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[REDACTED_SECRET]", text)
    return re.sub(r"\n{4,}", "\n\n\n", text)


def has_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_jsonl(path: Path) -> Iterable[tuple[int, dict[str, Any] | None, str | None]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for lineno, line in enumerate(f, 1):
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as exc:
                yield lineno, None, f"invalid_json:{exc.msg}"
                continue
            if not isinstance(obj, dict):
                yield lineno, None, "not_object"
                continue
            yield lineno, obj, None


def normalize_messages(obj: dict[str, Any]) -> list[dict[str, str]] | None:
    raw_messages = obj.get("messages")
    if not isinstance(raw_messages, list):
        return None
    messages: list[dict[str, str]] = []
    for raw in raw_messages:
        if not isinstance(raw, dict):
            return None
        role = ROLE_MAP.get(str(raw.get("role", "")).strip().lower(), str(raw.get("role", "")).strip().lower())
        if role not in {"system", "user", "assistant", "tool"}:
            continue
        content = raw.get("content")
        if not isinstance(content, str):
            return None
        content = scrub_text(content)
        if not content:
            continue
        if role == "tool":
            role = "assistant"
            content = f"Tool result summary:\n{content}"
        messages.append({"role": role, "content": content})
    roles = {msg["role"] for msg in messages}
    if "user" not in roles or "assistant" not in roles:
        return None
    if not messages or messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
    elif "sovereign Solana-native AI agent" not in messages[0]["content"]:
        messages[0]["content"] = f"{messages[0]['content']}\n\n{SYSTEM_PROMPT}"
    return messages


def assistant_text(messages: list[dict[str, str]]) -> str:
    return "\n".join(msg["content"] for msg in messages if msg["role"] == "assistant")


def fingerprint(messages: list[dict[str, str]]) -> str:
    material = [
        {"role": msg["role"], "content": re.sub(r"\s+", " ", msg["content"]).strip()}
        for msg in messages
        if msg["role"] != "system"
    ]
    return stable_hash(json.dumps(material, sort_keys=True, ensure_ascii=False))


def text_to_messages(text: str, source_label: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Study this Solana on-chain or transaction-foundation record. "
                "Turn it into reusable conversational knowledge for tool use, "
                "risk-aware reasoning, and agent memory."
            ),
        },
        {
            "role": "assistant",
            "content": (
                f"Source: {source_label}\n\n"
                "Reusable Solana context:\n"
                f"{text}\n\n"
                "Reasoning summary: this record should be treated as observed "
                "chain context, not a signing instruction. Use it to explain "
                "programs, mints, fees, slots, routing, and risk in observer or "
                "paper mode unless a separate trust gate authorizes execution."
            ),
        },
    ]


def add_record(
    examples: list[dict[str, Any]],
    seen: set[str],
    messages: list[dict[str, str]],
    metadata: dict[str, Any],
    stats: dict[str, Any],
    keep_duplicates: bool,
) -> None:
    fp = fingerprint(messages)
    if not keep_duplicates and fp in seen:
        stats["duplicates"] += 1
        return
    seen.add(fp)
    metadata = {key: "" if value is None else str(value) for key, value in metadata.items()}
    metadata["record_hash"] = fp
    examples.append({"messages": messages, "metadata": metadata})
    stats["kept"] += 1
    stats["by_source"][metadata.get("source_file", "unknown")] += 1


def source_manifest(paths: list[Path]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for path in paths:
        out.append(
            {
                "path": path.relative_to(BASE_DIR).as_posix() if path.exists() and path.is_relative_to(BASE_DIR) else path.as_posix(),
                "exists": path.exists(),
                "size_bytes": path.stat().st_size if path.exists() and path.is_file() else None,
                "sha256": file_sha256(path),
            }
        )
    return out


def main() -> int:
    args = parse_args()
    message_inputs = [resolve(p) for p in (args.message_input or DEFAULT_MESSAGE_INPUTS)]
    text_inputs = [resolve(p) for p in (args.text_input or DEFAULT_TEXT_INPUTS)]
    output = resolve(args.output)
    manifest_path = resolve(args.manifest)

    examples: list[dict[str, Any]] = []
    seen: set[str] = set()
    stats: dict[str, Any] = {
        "raw": 0,
        "kept": 0,
        "invalid": 0,
        "duplicates": 0,
        "secret_skipped": 0,
        "too_short": 0,
        "by_source": defaultdict(int),
        "by_kind": Counter(),
    }

    for path in message_inputs:
        for lineno, obj, error in iter_jsonl(path):
            stats["raw"] += 1
            if error or obj is None:
                stats["invalid"] += 1
                continue
            raw_text = json.dumps(obj, ensure_ascii=False)
            if has_secret(raw_text):
                stats["secret_skipped"] += 1
                continue
            messages = normalize_messages(obj)
            if not messages:
                stats["invalid"] += 1
                continue
            if len(assistant_text(messages)) < args.min_assistant_chars:
                stats["too_short"] += 1
                continue
            metadata = dict(obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {})
            metadata.update(
                {
                    "source_file": path.relative_to(BASE_DIR).as_posix() if path.is_relative_to(BASE_DIR) else path.as_posix(),
                    "source_line": lineno,
                    "dataset_kind": "messages",
                    "built_by": "scripts/build_masterpiece_dataset.py",
                }
            )
            add_record(examples, seen, messages, metadata, stats, args.keep_duplicates)
            stats["by_kind"]["messages"] += 1
            if args.max_examples is not None and len(examples) >= args.max_examples:
                break
        if args.max_examples is not None and len(examples) >= args.max_examples:
            break

    if args.max_examples is None or len(examples) < args.max_examples:
        for path in text_inputs:
            for lineno, obj, error in iter_jsonl(path):
                stats["raw"] += 1
                if error or obj is None:
                    stats["invalid"] += 1
                    continue
                text = obj.get("text")
                if not isinstance(text, str):
                    stats["invalid"] += 1
                    continue
                if has_secret(text):
                    stats["secret_skipped"] += 1
                    continue
                text = scrub_text(text)
                if len(text) < args.min_text_chars:
                    stats["too_short"] += 1
                    continue
                source_file = path.relative_to(BASE_DIR).as_posix() if path.is_relative_to(BASE_DIR) else path.as_posix()
                messages = text_to_messages(text, source_file)
                metadata = {
                    "source_file": source_file,
                    "source_line": lineno,
                    "dataset_kind": "text_wrapped_as_messages",
                    "built_by": "scripts/build_masterpiece_dataset.py",
                }
                add_record(examples, seen, messages, metadata, stats, args.keep_duplicates)
                stats["by_kind"]["text_wrapped_as_messages"] += 1
                if args.max_examples is not None and len(examples) >= args.max_examples:
                    break
            if args.max_examples is not None and len(examples) >= args.max_examples:
                break

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as f:
        for ex in examples:
            f.write(json.dumps(ex, ensure_ascii=False, sort_keys=True) + "\n")

    manifest = {
        "generated_at": utc_now(),
        "dataset_name": "Clawd Solana Conversational Masterpiece",
        "output": output.relative_to(BASE_DIR).as_posix(),
        "message_inputs": source_manifest(message_inputs),
        "text_inputs": source_manifest(text_inputs),
        "stats": {
            **{k: v for k, v in stats.items() if k not in {"by_source", "by_kind"}},
            "by_source": dict(sorted(stats["by_source"].items())),
            "by_kind": dict(sorted(stats["by_kind"].items())),
        },
        "policy": {
            "messages_only": True,
            "secret_scan": True,
            "bigquery_dataset": "bigquery-public-data.crypto_solana_mainnet_us",
            "execution_default": "observer_or_paper",
            "hub_target": "solanaclawd/clawd-solana-masterpiece-qwen15-lora",
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest["stats"], indent=2, sort_keys=True))
    print(f"wrote {len(examples)} examples -> {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
