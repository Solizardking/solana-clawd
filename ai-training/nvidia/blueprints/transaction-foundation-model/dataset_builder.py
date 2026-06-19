"""
Blueprint 1 — Transaction Foundation Model dataset builder.

Reads Solana SFT JSONL (messages format) and emits NeMo CPT-format JSONL:
  {"text": "<tx_context> ... </tx_context>"}

Each record contains the assistant turn content — these are the "documents"
the foundation model pre-trains on to learn Solana transaction semantics.
"""

import argparse
import json
import re
import sys
from pathlib import Path


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


def build(input_path: Path, output_path: Path, limit: int | None) -> int:
    written = 0
    skipped = 0
    with input_path.open() as fin, output_path.open("w") as fout:
        for line in fin:
            if limit and written >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue
            # Accept pre-built CPT records (from jupiter_tx_collector or raw CPT)
            if "text" in obj:
                if TX_KEYWORDS.search(obj["text"]):
                    fout.write(json.dumps({"text": obj["text"]}) + "\n")
                    written += 1
                else:
                    skipped += 1
                continue
            # Convert messages format
            messages = obj.get("messages", [])
            text = extract_text(messages)
            if text:
                fout.write(json.dumps({"text": text}) + "\n")
                written += 1
            else:
                skipped += 1
    return written


def build_multi(input_paths: list[Path], output_path: Path, limit: int | None) -> int:
    """Merge multiple input JSONL files (SFT + Jupiter CPT) into one CPT output."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with output_path.open("w") as fout:
        for src in input_paths:
            if not src.exists():
                print(f"  skip missing: {src}")
                continue
            tmp = output_path.parent / f"_tmp_{src.stem}.jsonl"
            n = build(src, tmp, limit=(limit - total) if limit else None)
            with tmp.open() as tf:
                fout.write(tf.read())
            tmp.unlink(missing_ok=True)
            total += n
            print(f"  [{n}] from {src.name}")
    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NeMo CPT dataset from Solana JSONL")
    parser.add_argument("--input", required=True, nargs="+", help="Source JSONL(s) (messages or CPT format)")
    parser.add_argument("--output", required=True, help="Output NeMo CPT JSONL")
    parser.add_argument("--limit", type=int, default=None, help="Max examples to emit")
    parser.add_argument("--dry-run", action="store_true", help="Print stats, don't write")
    args = parser.parse_args()

    input_paths = [Path(p) for p in args.input]
    output_path = Path(args.output)
    missing = [p for p in input_paths if not p.exists()]
    if missing:
        print(f"ERROR: inputs not found: {missing}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        output_path = Path("/dev/null")

    if len(input_paths) == 1:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        written = build(input_paths[0], output_path, args.limit)
    else:
        written = build_multi(input_paths, output_path, args.limit)
    print(f"[tx-foundation] written={written} to {output_path}")


if __name__ == "__main__":
    main()
