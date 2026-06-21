"""
Blueprint 1 — Transaction Foundation Model dataset builder.

Reads Solana SFT JSONL (messages format) and emits NeMo CPT-format JSONL:
  {"text": "<tx_context> ... </tx_context>"}

Each record contains the assistant turn content — these are the "documents"
the foundation model pre-trains on to learn Solana transaction semantics.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Iterable


TX_KEYWORDS = re.compile(
    r"(signature|lamport|blockhash|pubkey|instruction|account|PDA|SPL|"
    r"transfer|swap|mint|burn|stake|vote|CPI|program|slot|epoch|"
    r"perp|funding|liquidat|orderbook|phoenix|jupiter|margin)",
    re.IGNORECASE,
)

WRAP = "<tx_context>\n{}\n</tx_context>"


def extract_text(messages: list[dict]) -> str | None:
    parts = []
    for m in messages:
        role = m.get("role", "")
        content = m.get("content", "")
        if role in ("user", "assistant") and content.strip():
            parts.append(content.strip())
    joined = "\n\n".join(parts)
    if TX_KEYWORDS.search(joined):
        return WRAP.format(joined)
    return None


def _iter_records(input_path: Path) -> Iterable[tuple[str | None, str]]:
    with input_path.open(encoding="utf-8") as fin:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                yield None, "invalid_json"
                continue
            if "text" in obj:
                text = str(obj.get("text") or "").strip()
                if TX_KEYWORDS.search(text):
                    yield text, "text"
                else:
                    yield None, "non_tx_text"
                continue
            messages = obj.get("messages", [])
            text = extract_text(messages) if isinstance(messages, list) else None
            if text:
                yield text, "messages"
            else:
                yield None, "non_tx_messages"


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def build_multi(
    input_paths: list[Path],
    output_path: Path,
    limit: int | None,
    *,
    dedupe: bool = True,
) -> dict:
    """Merge multiple input JSONL files into one NeMo CPT JSONL output."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    seen: set[str] = set()
    stats = {
        "output": str(output_path),
        "limit": limit,
        "dedupe": dedupe,
        "written": 0,
        "skipped": 0,
        "duplicates": 0,
        "sources": {},
    }
    with output_path.open("w", encoding="utf-8") as fout:
        for src in input_paths:
            src_stats = {"written": 0, "skipped": 0, "duplicates": 0, "by_type": {}}
            stats["sources"][str(src)] = src_stats
            if not src.exists():
                src_stats["skipped"] += 1
                src_stats["by_type"]["missing"] = 1
                print(f"  skip missing: {src}")
                continue
            for text, row_type in _iter_records(src):
                src_stats["by_type"][row_type] = src_stats["by_type"].get(row_type, 0) + 1
                if limit and total >= limit:
                    break
                if not text:
                    stats["skipped"] += 1
                    src_stats["skipped"] += 1
                    continue
                fp = _fingerprint(text)
                if dedupe and fp in seen:
                    stats["duplicates"] += 1
                    src_stats["duplicates"] += 1
                    continue
                seen.add(fp)
                fout.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
                total += 1
                stats["written"] = total
                src_stats["written"] += 1
            print(f"  [{src_stats['written']}] from {src.name}")
            if limit and total >= limit:
                break
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NeMo CPT dataset from Solana JSONL")
    parser.add_argument("--input", required=True, nargs="+", help="Source JSONL(s) (messages or CPT format)")
    parser.add_argument("--output", required=True, help="Output NeMo CPT JSONL")
    parser.add_argument("--limit", type=int, default=None, help="Max examples to emit")
    parser.add_argument("--manifest", default=None, help="Optional JSON manifest path")
    parser.add_argument("--no-dedupe", action="store_true", help="Keep duplicate CPT texts")
    parser.add_argument("--dry-run", action="store_true", help="Print stats, don't write")
    args = parser.parse_args()

    input_paths = [Path(p) for p in args.input]
    output_path = Path(args.output)
    missing = [p for p in input_paths if not p.exists()]
    if missing:
        print(f"ERROR: inputs not found: {missing}", file=sys.stderr)
        sys.exit(1)

    stats = build_multi(
        input_paths,
        Path("/dev/null") if args.dry_run else output_path,
        args.limit,
        dedupe=not args.no_dedupe,
    )
    if args.manifest and not args.dry_run:
        manifest_path = Path(args.manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(f"[tx-foundation] written={stats['written']} to {output_path}")


if __name__ == "__main__":
    main()
