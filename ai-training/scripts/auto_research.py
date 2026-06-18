#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "requests>=2.32.0",
#   "beautifulsoup4>=4.12.0",
#   "huggingface_hub>=1.19.0",
#   "pyyaml>=6.0",
#   "openai>=1.30.0",
# ]
# ///
"""
Clawd AutoResearch — Percolator-style recursive wiki generation.

Inspired by https://github.com/aeyakovenko/percolator-meta:
  Seed URLs → fetch → extract claims + links → summarize with Clawd →
  eval gate → append to training dataset → recurse into child URLs.

Uses a SQLite manifest to track visited URLs and avoid duplicates.

Usage:
  # Single cycle
  python scripts/auto_research.py --seed-urls https://docs.solanalabs.com/llms.txt --depth 2

  # Continuous loop (push to HF Hub each cycle)
  python scripts/auto_research.py \\
    --seed-urls https://docs.solanalabs.com/llms.txt \\
    --depth 3 --loop --interval-hours 6 \\
    --push-to-hub solanaclawd/solana-clawd-instruct

  # Use local Clawd model for summarization
  python scripts/auto_research.py \\
    --seed-urls https://docs.phoenix.trade/llms.txt \\
    --model local:solanaclawd/solana-clawd-1.5b \\
    --depth 2

  # Multiple seed files
  python scripts/auto_research.py \\
    --seed-urls \\
      https://docs.solanalabs.com/llms.txt \\
      https://docs.phoenix.trade/llms.txt \\
      https://www.zkcompression.com/llms.txt \\
    --depth 2 --output data/autoResearch.jsonl
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterator
import os

# ─── Config ───────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "research_manifest.db"
DEFAULT_OUTPUT = ROOT / "data" / "autoResearch.jsonl"

CLAWD_SYSTEM_PROMPT = (
    "You are Clawd, a Solana-native AI agent. "
    "Given a document about Solana, DeFi, ZK compression, or agent protocols, "
    "extract 3–5 concise Q&A pairs that would be valuable training examples. "
    "Format each as JSON: {\"question\": \"...\", \"answer\": \"...\"}. "
    "Only emit JSON lines, no other text. "
    "Focus on factual, technical content. Never invent facts."
)

SOLANA_KEYWORDS = [
    "solana", "anchor", "pda", "lamports", "spl", "jupiter", "phoenix",
    "drift", "light protocol", "zk compression", "defi", "clawd", "agent",
    "x402", "caap", "sas", "attestation", "groth16", "nullifier",
]


# ─── SQLite manifest ──────────────────────────────────────────────────────────

def init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS visited (
            url TEXT PRIMARY KEY,
            content_hash TEXT,
            fetched_at TEXT,
            examples_count INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS queue (
            url TEXT PRIMARY KEY,
            depth INTEGER,
            parent_url TEXT,
            added_at TEXT
        )
    """)
    conn.commit()
    return conn


def already_visited(conn: sqlite3.Connection, url: str) -> bool:
    row = conn.execute("SELECT 1 FROM visited WHERE url = ?", (url,)).fetchone()
    return row is not None


def mark_visited(conn: sqlite3.Connection, url: str, content_hash: str, examples_count: int) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO visited (url, content_hash, fetched_at, examples_count) VALUES (?, ?, ?, ?)",
        (url, content_hash, datetime.utcnow().isoformat(), examples_count),
    )
    conn.commit()


def enqueue(conn: sqlite3.Connection, url: str, depth: int, parent: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO queue (url, depth, parent_url, added_at) VALUES (?, ?, ?, ?)",
        (url, depth, parent, datetime.utcnow().isoformat()),
    )
    conn.commit()


def dequeue(conn: sqlite3.Connection) -> tuple[str, int] | None:
    row = conn.execute(
        "SELECT url, depth FROM queue ORDER BY depth ASC, added_at ASC LIMIT 1"
    ).fetchone()
    if row:
        conn.execute("DELETE FROM queue WHERE url = ?", (row[0],))
        conn.commit()
    return row


# ─── Fetch ───────────────────────────────────────────────────────────────────

def fetch_text(url: str, timeout: int = 20) -> str | None:
    """Fetch URL and return plain text content."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ClaWD-AutoResearch/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        # Strip HTML if needed
        if "<html" in raw[:200].lower():
            raw = re.sub(r"<[^>]+>", " ", raw)
            raw = re.sub(r"\s+", " ", raw)
        return raw[:40_000]  # cap at 40K chars per document
    except Exception as exc:
        print(f"  [fetch error] {url}: {exc}")
        return None


def extract_links(text: str, base_url: str) -> list[str]:
    """Extract HTTP(S) links from text content."""
    links = re.findall(r'https?://[^\s\'"<>)\]]+', text)
    # Filter to Solana-relevant domains
    relevant_domains = [
        "docs.solana.com", "docs.solanalabs.com", "docs.phoenix.trade",
        "docs.zkcompression.com", "www.zkcompression.com", "light.so",
        "docs.drift.trade", "jup.ag", "docs.helius.dev",
        "solana.com/developers", "anchor-lang.com",
        "huggingface.co/solanaclawd", "github.com/Solizardking",
    ]
    filtered = []
    for link in links:
        if any(d in link for d in relevant_domains):
            # Clean trailing punctuation
            link = link.rstrip(".,;:!?)")
            filtered.append(link)
    return list(set(filtered))[:20]  # cap at 20 new links per page


def is_solana_relevant(text: str) -> bool:
    text_lower = text.lower()
    return sum(1 for kw in SOLANA_KEYWORDS if kw in text_lower) >= 2


# ─── Summarize ───────────────────────────────────────────────────────────────

def summarize_with_api(text: str, model: str, api_base: str, api_key: str) -> list[dict]:
    """Call OpenAI-compatible API to extract QA pairs from text."""
    from openai import OpenAI
    client = OpenAI(base_url=api_base, api_key=api_key)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": CLAWD_SYSTEM_PROMPT},
                {"role": "user", "content": f"Document:\n\n{text[:8000]}"},
            ],
            max_tokens=1024,
            temperature=0.3,
        )
        raw = resp.choices[0].message.content or ""
        pairs = []
        for line in raw.splitlines():
            line = line.strip()
            if line.startswith("{"):
                try:
                    obj = json.loads(line)
                    if "question" in obj and "answer" in obj:
                        pairs.append(obj)
                except json.JSONDecodeError:
                    continue
        return pairs
    except Exception as exc:
        print(f"  [summarize error] {exc}")
        return []


def summarize_with_clawd_router(text: str) -> list[dict]:
    """Use ClawdRouter (free tier) for summarization."""
    return summarize_with_api(
        text,
        model="solanaclawd/solana-clawd-1.5b",
        api_base="https://clawd-box-router.fly.dev/v1",
        api_key=os.environ.get("CLAWD_FREE_KEY", "clawd_free_public"),
    )


def summarize_rule_based(text: str, url: str) -> list[dict]:
    """Fallback: extract facts as QA pairs using heuristics when no API available."""
    pairs = []
    # Extract sentences containing keywords
    sentences = re.split(r'[.!?]', text)
    for sent in sentences:
        sent = sent.strip()
        if len(sent) < 40:
            continue
        kw_count = sum(1 for kw in SOLANA_KEYWORDS if kw.lower() in sent.lower())
        if kw_count >= 2:
            q = f"What does this Solana documentation explain about: {sent[:60]}...?"
            pairs.append({"question": q, "answer": sent})
        if len(pairs) >= 5:
            break
    return pairs


def to_training_example(qa: dict, source_url: str) -> dict:
    """Convert QA pair to training JSONL format."""
    return {
        "messages": [
            {
                "role": "system",
                "content": "You are Clawd, a sovereign Solana-native AI agent with deep knowledge of the Solana ecosystem."
            },
            {"role": "user", "content": qa["question"]},
            {"role": "assistant", "content": qa["answer"]},
        ],
        "metadata": {
            "source": "autoResearch",
            "url": source_url,
            "generated_at": datetime.utcnow().isoformat(),
        },
    }


# ─── Core loop ───────────────────────────────────────────────────────────────

def research_cycle(
    seed_urls: list[str],
    max_depth: int,
    output_path: Path,
    model: str,
    api_base: str,
    api_key: str,
    db: sqlite3.Connection,
) -> int:
    """Run one research cycle. Returns total examples appended."""
    # Seed the queue
    for url in seed_urls:
        if not already_visited(db, url):
            enqueue(db, url, 0, "seed")

    total_examples = 0
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "a") as fout:
        while True:
            item = dequeue(db)
            if item is None:
                break
            url, depth = item

            if already_visited(db, url):
                continue

            print(f"\n[depth={depth}] Fetching: {url}")
            text = fetch_text(url)
            if not text:
                mark_visited(db, url, "", 0)
                continue

            content_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

            if not is_solana_relevant(text):
                print(f"  [skip] Not Solana-relevant")
                mark_visited(db, url, content_hash, 0)
                continue

            # Summarize
            if api_key and api_base:
                pairs = summarize_with_api(text, model, api_base, api_key)
            else:
                pairs = summarize_with_clawd_router(text)

            if not pairs:
                pairs = summarize_rule_based(text, url)

            # Write to JSONL
            count = 0
            for qa in pairs:
                example = to_training_example(qa, url)
                fout.write(json.dumps(example) + "\n")
                count += 1
            fout.flush()

            total_examples += count
            print(f"  → {count} examples extracted")
            mark_visited(db, url, content_hash, count)

            # Recurse
            if depth < max_depth:
                child_links = extract_links(text, url)
                for link in child_links:
                    if not already_visited(db, link):
                        enqueue(db, link, depth + 1, url)
                print(f"  → queued {len(child_links)} child links")

            time.sleep(1)  # polite crawl delay

    return total_examples


# ─── CLI ─────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--seed-urls", nargs="+", required=True, help="Seed URLs to start research from")
    p.add_argument("--depth", type=int, default=2, help="Max recursion depth (default: 2)")
    p.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output JSONL path")
    p.add_argument("--model", default="solanaclawd/solana-clawd-1.5b", help="Model ID for summarization")
    p.add_argument("--api-base", default="https://clawd-box-router.fly.dev/v1", help="OpenAI-compatible API base")
    p.add_argument("--api-key", default=None, help="API key (defaults to CLAWD_FREE_KEY env var)")
    p.add_argument("--db", default=str(DB_PATH), help="SQLite manifest path")
    p.add_argument("--loop", action="store_true", help="Run continuously")
    p.add_argument("--interval-hours", type=float, default=6.0, help="Hours between loop cycles (default: 6)")
    p.add_argument("--push-to-hub", default=None, help="HF Hub dataset repo to push to after each cycle")
    return p.parse_args()


def push_to_hub(output_path: Path, repo_id: str) -> None:
    try:
        from huggingface_hub import HfApi
        api = HfApi()
        api.upload_file(
            path_or_fileobj=str(output_path),
            path_in_repo="data/autoResearch.jsonl",
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"AutoResearch update {datetime.utcnow().date()}",
        )
        print(f"[hub] Pushed to {repo_id}")
    except Exception as exc:
        print(f"[hub error] {exc}")


def main() -> None:
    args = parse_args()
    db = init_db(Path(args.db))
    api_key = args.api_key or os.environ.get("CLAWD_FREE_KEY") or os.environ.get("HF_TOKEN", "")
    output_path = Path(args.output)

    print(f"Clawd AutoResearch")
    print(f"  seeds={len(args.seed_urls)}  depth={args.depth}  output={output_path}")
    print(f"  model={args.model}  loop={args.loop}")

    while True:
        count = research_cycle(
            seed_urls=args.seed_urls,
            max_depth=args.depth,
            output_path=output_path,
            model=args.model,
            api_base=args.api_base,
            api_key=api_key,
            db=db,
        )
        print(f"\nCycle complete: {count} new examples → {output_path}")

        if args.push_to_hub and count > 0:
            push_to_hub(output_path, args.push_to_hub)

        if not args.loop:
            break

        wake_at = datetime.utcnow() + timedelta(hours=args.interval_hours)
        print(f"Next cycle at {wake_at.isoformat()} UTC. Sleeping...")
        time.sleep(args.interval_hours * 3600)


if __name__ == "__main__":
    main()
