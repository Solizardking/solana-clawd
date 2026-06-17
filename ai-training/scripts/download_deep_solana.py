#!/usr/bin/env python3
"""
DeepSolana-GPT2-bucket dataset downloader and tokenizer converter.

Source: ordlibrary/DeepSolana-GPT2-bucket on Hugging Face
  https://huggingface.co/datasets/ordlibrary/DeepSolana-GPT2-bucket

This bucket contains GPT-2–tokenized Solana-domain text (ordinals, programs,
transactions, documentation). Since our training pipeline uses Qwen2.5 or
Hermes-3 (both ChatML), we need to:
  1. Download the pre-tokenized binary shards from HF
  2. Decode back to raw text using GPT-2's tokenizer
  3. Convert to instruction pairs via a simple heuristic chunker
  4. Append to solana_clawd_seed.jsonl (or write a separate corpus file)

Usage:
  # Install deps first:
  pip install huggingface_hub transformers numpy

  # Stream-decode and append to training data:
  python3 scripts/download_deep_solana.py --output data/deep_solana_corpus.jsonl

  # Dry run (decode only, no write):
  python3 scripts/download_deep_solana.py --dry-run --limit 100

  # Prepend chunks as SFT pairs into existing seed file:
  python3 scripts/download_deep_solana.py --sft-mode --output data/solana_clawd_seed.jsonl --limit 500

Environment:
  HF_TOKEN   Hugging Face read token (required for gated or private buckets)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Iterator

REPO_ID = "ordlibrary/DeepSolana-GPT2-bucket"
REPO_TYPE = "dataset"

CLAWD_SYSTEM = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You reason clearly about on-chain mechanics, DeFi strategies, memecoin risk, "
    "and agent architecture. You are helpful, honest, and concise."
)


def _check_deps() -> None:
    missing = []
    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        missing.append("huggingface_hub")
    try:
        import transformers  # noqa: F401
    except ImportError:
        missing.append("transformers")
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    if missing:
        print(f"[ERROR] Missing dependencies: {', '.join(missing)}")
        print(f"  pip install {' '.join(missing)}")
        sys.exit(1)


def _list_shards() -> list[str]:
    """List all binary shard files in the bucket."""
    from huggingface_hub import list_repo_files
    token = os.environ.get("HF_TOKEN")
    files = list(list_repo_files(REPO_ID, repo_type=REPO_TYPE, token=token))
    shards = [f for f in files if f.endswith((".bin", ".npy", ".pt"))]
    if not shards:
        # Some buckets store in parquet or arrow
        shards = [f for f in files if f.endswith((".parquet", ".arrow", ".jsonl"))]
    print(f"[INFO] Found {len(shards)} shards in {REPO_ID}")
    for s in shards[:5]:
        print(f"  {s}")
    if len(shards) > 5:
        print(f"  ... and {len(shards)-5} more")
    return shards


def _decode_shard(path: Path) -> list[str]:
    """Decode a GPT-2–tokenized binary shard back to raw text."""
    import numpy as np
    from transformers import GPT2TokenizerFast

    tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

    suffix = path.suffix.lower()
    if suffix == ".npy":
        tokens = np.load(str(path), allow_pickle=False).tolist()
    elif suffix in (".bin", ".pt"):
        try:
            import torch
            tokens = torch.load(str(path), map_location="cpu")
            if hasattr(tokens, "tolist"):
                tokens = tokens.tolist()
        except Exception:
            # Fallback: treat as raw numpy
            import numpy as np
            tokens = np.fromfile(str(path), dtype=np.uint16).tolist()
    elif suffix == ".jsonl":
        with open(path) as f:
            return [json.loads(line).get("text", "") for line in f if line.strip()]
    elif suffix == ".parquet":
        try:
            import pandas as pd
            df = pd.read_parquet(str(path))
            col = "text" if "text" in df.columns else df.columns[0]
            return df[col].dropna().tolist()
        except ImportError:
            print("[WARN] Install pandas to decode .parquet shards")
            return []
    else:
        print(f"[WARN] Unknown shard format: {suffix}")
        return []

    # Chunk long token sequences into ~512-token windows with 64-token stride
    chunks = []
    chunk_size = 512
    stride = 64
    if isinstance(tokens[0], list):
        # Already chunked
        for chunk in tokens:
            chunks.append(tokenizer.decode(chunk, skip_special_tokens=True))
    else:
        for start in range(0, len(tokens), chunk_size - stride):
            chunk = tokens[start: start + chunk_size]
            text = tokenizer.decode(chunk, skip_special_tokens=True).strip()
            if len(text) >= 50:
                chunks.append(text)
    return chunks


def _text_to_sft_pair(text: str) -> dict:
    """Convert a raw Solana text chunk to a Clawd SFT instruction pair."""
    text = text.strip()
    # Simple heuristic: treat the chunk as reference material and wrap in a QA format
    prompt = (
        "Summarize or explain the following Solana on-chain data or documentation "
        "in a way that's useful for a Solana developer or agent:\n\n" + text[:1200]
    )
    response = (
        "Here's a concise breakdown:\n\n" + text[:800]
        if len(text) > 200
        else text
    )
    return {
        "messages": [
            {"role": "system", "content": CLAWD_SYSTEM},
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": response},
        ]
    }


def stream_chunks(shards: list[str], limit: int = 0) -> Iterator[str]:
    """Download each shard and yield decoded text chunks."""
    from huggingface_hub import hf_hub_download
    token = os.environ.get("HF_TOKEN")
    count = 0
    for shard_name in shards:
        try:
            local = hf_hub_download(
                repo_id=REPO_ID,
                filename=shard_name,
                repo_type=REPO_TYPE,
                token=token,
            )
            for chunk in _decode_shard(Path(local)):
                yield chunk
                count += 1
                if limit and count >= limit:
                    return
        except Exception as e:
            print(f"[WARN] Skipping {shard_name}: {e}")
            continue


def main() -> None:
    _check_deps()

    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--output", "-o", default="data/deep_solana_corpus.jsonl",
                   help="Output JSONL path (default: data/deep_solana_corpus.jsonl)")
    p.add_argument("--limit", type=int, default=1000,
                   help="Max chunks to decode (0 = all, default: 1000)")
    p.add_argument("--sft-mode", action="store_true",
                   help="Wrap chunks as ChatML SFT pairs instead of raw corpus lines")
    p.add_argument("--dry-run", action="store_true",
                   help="Decode and print first 5 chunks without writing")
    p.add_argument("--append", action="store_true", default=True,
                   help="Append to existing output file (default: True)")
    args = p.parse_args()

    shards = _list_shards()
    if not shards:
        print("[ERROR] No shards found. Check HF_TOKEN or repo access.")
        sys.exit(1)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    mode = "a" if args.append and not args.dry_run else "w"
    written = 0

    with (open(output, mode) if not args.dry_run else open(os.devnull, "w")) as fout:
        for i, chunk in enumerate(stream_chunks(shards, limit=args.limit)):
            if args.dry_run and i < 5:
                print(f"\n── Chunk {i+1} ──────────────────────────────")
                print(chunk[:300])
            if not args.dry_run:
                if args.sft_mode:
                    fout.write(json.dumps(_text_to_sft_pair(chunk)) + "\n")
                else:
                    fout.write(json.dumps({"text": chunk}) + "\n")
                written += 1
                if written % 100 == 0:
                    print(f"  [{written} chunks written]", flush=True)

    if args.dry_run:
        print(f"\n[dry-run] Streamed first {min(5, args.limit or 5)} chunks.")
    else:
        print(f"\n[DONE] Wrote {written} chunks to {output}")
        if args.sft_mode:
            print(f"  Format: ChatML SFT pairs (append to solana_clawd_seed.jsonl)")
        else:
            print(f"  Format: raw corpus  (use as pre-training data or CPT stage)")


if __name__ == "__main__":
    main()
