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
        for i, line in enumerate(fin):
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
            messages = obj.get("messages", [])
            text = extract_text(messages)
            if text:
                fout.write(json.dumps({"text": text}) + "\n")
                written += 1
            else:
                skipped += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NeMo CPT dataset from Solana JSONL")
    parser.add_argument("--input", required=True, help="Source JSONL (messages format)")
    parser.add_argument("--output", required=True, help="Output NeMo CPT JSONL")
    parser.add_argument("--limit", type=int, default=None, help="Max examples to emit")
    parser.add_argument("--dry-run", action="store_true", help="Print stats, don't write")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"ERROR: input not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        output_path = Path("/dev/null")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    written = build(input_path, output_path, args.limit)
    print(f"[tx-foundation] written={written} to {output_path}")


if __name__ == "__main__":
    main()
