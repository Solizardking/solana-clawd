"""
Blueprint 5 — Enterprise RAG: query interface.

Embeds the query, retrieves top-k chunks from FAISS,
optionally re-ranks with NeMo Retriever reranker,
then generates an answer via NVIDIA NIM.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


RERANK_MODEL = "nvidia/nv-rerankqa-mistral-4b-v3"
GEN_MODEL = "meta/llama-3.1-nemotron-nano-8b-v1"


def _embed(text: str) -> list[float]:
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        return _embed_fallback(text)
    try:
        import httpx
        r = httpx.post(
            "https://integrate.api.nvidia.com/v1/embeddings",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "nvidia/nv-embedqa-e5-v5", "input": [text], "encoding_format": "float"},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["data"][0]["embedding"]
    except Exception:
        return _embed_fallback(text)


def _embed_fallback(text: str) -> list[float]:
    import hashlib, math
    dim = 256
    vec = [0.0] * dim
    for word in text.split():
        h = int(hashlib.md5(word.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def retrieve(query: str, store_path: Path, top_k: int = 10) -> list[dict]:
    try:
        import faiss
        import numpy as np
    except ImportError:
        print("FAISS not installed.", file=sys.stderr)
        return []

    index = faiss.read_index(str(store_path / "index.faiss"))
    chunks_raw = (store_path / "chunks.jsonl").read_text().strip().split("\n")
    chunks = [json.loads(c) for c in chunks_raw if c]

    q_vec = np.array([_embed(query)], dtype=np.float32)
    k = min(top_k, index.ntotal)
    distances, indices = index.search(q_vec, k)
    return [
        {"text": chunks[i]["text"], "meta": chunks[i]["meta"], "score": float(distances[0][j])}
        for j, i in enumerate(indices[0])
        if i < len(chunks)
    ]


def rerank(query: str, passages: list[dict]) -> list[dict]:
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key or not passages:
        return passages
    try:
        import httpx
        r = httpx.post(
            "https://integrate.api.nvidia.com/v1/ranking",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": RERANK_MODEL,
                "query": {"text": query},
                "passages": [{"text": p["text"]} for p in passages],
            },
            timeout=30,
        )
        r.raise_for_status()
        rankings = r.json().get("rankings", [])
        ranked = sorted(
            zip(rankings, passages),
            key=lambda x: x[0].get("logit", 0),
            reverse=True,
        )
        return [p for _, p in ranked]
    except Exception:
        return passages


def generate(query: str, context: str) -> str:
    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        return f"[no NVIDIA_API_KEY — context retrieved:\n{context[:500]}]"
    try:
        import httpx
        system = (
            "You are Clawd, a Solana-native AI agent. Answer using only the provided context. "
            "If the context does not contain enough information, say so."
        )
        r = httpx.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": GEN_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"},
                ],
                "max_tokens": 512,
                "temperature": 0.1,
            },
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[generation error: {e}]"


def rag_query(query: str, store_path: Path, top_k: int = 5) -> str:
    passages = retrieve(query, store_path, top_k=top_k * 2)
    passages = rerank(query, passages)[:top_k]
    context = "\n\n---\n\n".join(p["text"] for p in passages)
    return generate(query, context)


def main() -> None:
    parser = argparse.ArgumentParser(description="Query the NVIDIA RAG pipeline")
    parser.add_argument("--store", default="data/nvidia_rag_store")
    parser.add_argument("--question", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    store = Path(args.store)
    if not (store / "index.faiss").exists():
        print(f"ERROR: RAG store not found at {store}. Run ingest.py first.", file=sys.stderr)
        sys.exit(1)

    answer = rag_query(args.question, store, args.top_k)
    print(f"\nQ: {args.question}\n\nA: {answer}")


if __name__ == "__main__":
    main()
