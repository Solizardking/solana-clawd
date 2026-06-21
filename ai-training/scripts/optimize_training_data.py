#!/usr/bin/env python3
"""Create cleaner reasoning/tooling training JSONL without mutating sources."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_MESSAGE_INPUTS = [
    "data/core_ai_clawd_sft.jsonl",
    "data/realtime_research_sft.jsonl",
    "data/nvidia_trading_factory_sft.jsonl",
    "data/solana_clawd_merged.jsonl",
    "data/solana_clawd_seed.jsonl",
]
DEFAULT_CPT_INPUTS = [
    "data/tx_foundation_cpt.jsonl",
]

REASONING_SYSTEM_APPEND = (
    "Use concise, auditable reasoning summaries. State assumptions, cite source "
    "context or tools when relevant, separate analysis from execution, keep "
    "private chain-of-thought private, default to observer or paper mode, and "
    "refuse private-key handling, wallet draining, front-running, sanctions "
    "evasion, and live execution without explicit trust gates."
)

SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bwandb(?:_v1)?_[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{30,}\b"),
    re.compile(r"\b(?:api[_-]?key|private[_-]?key|secret|token)\b[\"'\s:=]{1,8}[A-Za-z0-9_./+=-]{28,}", re.IGNORECASE),
]

ROLE_MAP = {
    "human": "user",
    "gpt": "assistant",
    "bot": "assistant",
    "ai": "assistant",
}

REASONING_MARKERS = {
    "assumption",
    "because",
    "therefore",
    "risk",
    "tradeoff",
    "evidence",
    "step",
    "plan",
    "verify",
    "evaluate",
}

TOOLING_MARKERS = {
    "tool",
    "function",
    "vulcan",
    "helius",
    "jupiter",
    "phoenix",
    "ollama",
    "hugging face",
    "nvidia",
    "nim",
    "x402",
}

SAFETY_MARKERS = {
    "paper",
    "observer",
    "trust gate",
    "private key",
    "refuse",
    "cannot",
    "will not",
    "unauthorized",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", action="append", default=[], help="Messages JSONL input. Defaults to core/realtime/trading/merged/seed.")
    parser.add_argument("--cpt-input", action="append", default=[], help="CPT text JSONL input. Defaults to data/tx_foundation_cpt.jsonl.")
    parser.add_argument("--output", default="data/model_kit/solana_clawd_reasoning_tooling_sft.jsonl")
    parser.add_argument("--cpt-output", default="data/model_kit/tx_foundation_cpt_clean.jsonl")
    parser.add_argument("--manifest", default="data/model_kit/training_data_optimization_manifest.json")
    parser.add_argument("--min-assistant-chars", type=int, default=24)
    parser.add_argument("--min-text-chars", type=int, default=32)
    parser.add_argument("--max-examples", type=int, default=None, help="Optional cap after filtering for quick experiments.")
    parser.add_argument("--keep-duplicates", action="store_true")
    parser.add_argument("--no-system-augment", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def resolve(path: str | Path) -> Path:
    p = Path(path)
    return p if p.is_absolute() else BASE_DIR / p


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


def has_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in SECRET_PATTERNS)


def scrub_text(text: str) -> str:
    text = text.replace("\r\n", "\n").strip()
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("[REDACTED_SECRET]", text)
    return re.sub(r"\n{4,}", "\n\n\n", text)


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
        role = str(raw.get("role", "")).strip().lower()
        role = ROLE_MAP.get(role, role)
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
    return messages


def assistant_text(messages: list[dict[str, str]]) -> str:
    return "\n".join(msg["content"] for msg in messages if msg["role"] == "assistant")


def augment_system(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    augmented = [dict(msg) for msg in messages]
    if augmented and augmented[0]["role"] == "system":
        current = augmented[0]["content"]
        if "auditable reasoning summaries" not in current:
            augmented[0]["content"] = f"{current}\n\n{REASONING_SYSTEM_APPEND}"
    else:
        augmented.insert(0, {"role": "system", "content": REASONING_SYSTEM_APPEND})
    return augmented


def message_fingerprint(messages: list[dict[str, str]]) -> str:
    material = [
        {"role": msg["role"], "content": re.sub(r"\s+", " ", msg["content"]).strip()}
        for msg in messages
        if msg["role"] != "system"
    ]
    return stable_hash(json.dumps(material, sort_keys=True, ensure_ascii=False))


def score_messages(messages: list[dict[str, str]]) -> dict[str, Any]:
    text = "\n".join(msg["content"] for msg in messages).lower()
    assistant = assistant_text(messages)
    flags = {
        "reasoning": any(marker in text for marker in REASONING_MARKERS),
        "tooling": any(marker in text for marker in TOOLING_MARKERS),
        "safety": any(marker in text for marker in SAFETY_MARKERS),
        "structured": any(token in assistant for token in ("```", "{", "- ", "1.")),
    }
    score = 1
    score += int(flags["reasoning"])
    score += int(flags["tooling"])
    score += int(flags["safety"])
    score += int(flags["structured"])
    if len(assistant) >= 240:
        score += 1
    return {
        "score": score,
        "flags": flags,
        "assistant_chars": len(assistant),
        "turns": len(messages),
    }


def optimize_messages(
    inputs: list[Path],
    output: Path,
    *,
    min_assistant_chars: int,
    max_examples: int | None,
    keep_duplicates: bool,
    system_augment: bool,
    dry_run: bool,
) -> dict[str, Any]:
    seen: set[str] = set()
    stats: dict[str, Any] = {
        "raw": 0,
        "kept": 0,
        "invalid": 0,
        "duplicates": 0,
        "secret_skipped": 0,
        "too_short": 0,
        "by_source": defaultdict(int),
        "quality_scores": Counter(),
        "quality_flags": Counter(),
    }
    if not dry_run:
        output.parent.mkdir(parents=True, exist_ok=True)
        out = output.open("w", encoding="utf-8")
    else:
        out = None
    try:
        for path in inputs:
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
                if len(assistant_text(messages)) < min_assistant_chars:
                    stats["too_short"] += 1
                    continue
                if system_augment:
                    messages = augment_system(messages)
                fp = message_fingerprint(messages)
                if not keep_duplicates and fp in seen:
                    stats["duplicates"] += 1
                    continue
                seen.add(fp)
                quality = score_messages(messages)
                metadata = dict(obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {})
                metadata.update(
                    {
                        "optimized_by": "scripts/optimize_training_data.py",
                        "source_file": path.relative_to(BASE_DIR).as_posix() if path.is_relative_to(BASE_DIR) else path.as_posix(),
                        "source_line": lineno,
                        "record_hash": fp,
                        "quality_score": quality["score"],
                        "reasoning": quality["flags"]["reasoning"],
                        "tooling": quality["flags"]["tooling"],
                        "safety": quality["flags"]["safety"],
                        "structured": quality["flags"]["structured"],
                    }
                )
                record = {"messages": messages, "metadata": metadata}
                if out:
                    out.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
                stats["kept"] += 1
                stats["by_source"][metadata["source_file"]] += 1
                stats["quality_scores"][str(quality["score"])] += 1
                for flag, enabled in quality["flags"].items():
                    if enabled:
                        stats["quality_flags"][flag] += 1
                if max_examples is not None and stats["kept"] >= max_examples:
                    break
            if max_examples is not None and stats["kept"] >= max_examples:
                break
    finally:
        if out:
            out.close()

    stats["by_source"] = dict(sorted(stats["by_source"].items()))
    stats["quality_scores"] = dict(sorted(stats["quality_scores"].items()))
    stats["quality_flags"] = dict(sorted(stats["quality_flags"].items()))
    return stats


def optimize_cpt(
    inputs: list[Path],
    output: Path,
    *,
    min_text_chars: int,
    keep_duplicates: bool,
    dry_run: bool,
) -> dict[str, Any]:
    seen: set[str] = set()
    stats: dict[str, Any] = {"raw": 0, "kept": 0, "invalid": 0, "duplicates": 0, "secret_skipped": 0, "too_short": 0}
    if not dry_run:
        output.parent.mkdir(parents=True, exist_ok=True)
        out = output.open("w", encoding="utf-8")
    else:
        out = None
    try:
        for path in inputs:
            for _lineno, obj, error in iter_jsonl(path):
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
                if len(text) < min_text_chars:
                    stats["too_short"] += 1
                    continue
                fp = stable_hash(re.sub(r"\s+", " ", text).strip())
                if not keep_duplicates and fp in seen:
                    stats["duplicates"] += 1
                    continue
                seen.add(fp)
                if out:
                    out.write(json.dumps({"text": text, "metadata": {"record_hash": fp}}, ensure_ascii=False, sort_keys=True) + "\n")
                stats["kept"] += 1
    finally:
        if out:
            out.close()
    return stats


def source_manifest(paths: list[Path]) -> list[dict[str, Any]]:
    out = []
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
    message_inputs = [resolve(path) for path in (args.input or DEFAULT_MESSAGE_INPUTS)]
    cpt_inputs = [resolve(path) for path in (args.cpt_input or DEFAULT_CPT_INPUTS)]
    output = resolve(args.output)
    cpt_output = resolve(args.cpt_output)
    manifest_path = resolve(args.manifest)

    msg_stats = optimize_messages(
        message_inputs,
        output,
        min_assistant_chars=args.min_assistant_chars,
        max_examples=args.max_examples,
        keep_duplicates=args.keep_duplicates,
        system_augment=not args.no_system_augment,
        dry_run=args.dry_run,
    )
    cpt_stats = optimize_cpt(
        cpt_inputs,
        cpt_output,
        min_text_chars=args.min_text_chars,
        keep_duplicates=args.keep_duplicates,
        dry_run=args.dry_run,
    )
    manifest = {
        "generated_at": utc_now(),
        "dry_run": args.dry_run,
        "outputs": {
            "messages_jsonl": output.relative_to(BASE_DIR).as_posix(),
            "cpt_jsonl": cpt_output.relative_to(BASE_DIR).as_posix(),
            "manifest": manifest_path.relative_to(BASE_DIR).as_posix(),
        },
        "message_inputs": source_manifest(message_inputs),
        "cpt_inputs": source_manifest(cpt_inputs),
        "message_stats": msg_stats,
        "cpt_stats": cpt_stats,
        "policy": {
            "source_files_mutated": False,
            "system_augment": not args.no_system_augment,
            "dedupe": not args.keep_duplicates,
            "secret_scan": True,
            "reasoning_style": "concise auditable summaries, private chain-of-thought hidden",
        },
    }
    if not args.dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
