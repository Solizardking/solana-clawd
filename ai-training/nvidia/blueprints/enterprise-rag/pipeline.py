"""
Blueprint 5 — Enterprise RAG: FastAPI pipeline endpoint.

Serves the full RAG pipeline as an HTTP API, compatible with the
Clawd agent skill system and ClawdRouter.

Usage:
  python3 pipeline.py --store ../../data/nvidia_rag_store --port 8765

  curl http://localhost:8765/query \
    -H "Content-Type: application/json" \
    -d '{"question": "What is the SOL-PERP funding rate?"}'
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from query import rag_query


def make_app(store_path: Path):
    try:
        from fastapi import FastAPI
        from pydantic import BaseModel
    except ImportError:
        raise ImportError("Run: pip install fastapi uvicorn")

    app = FastAPI(title="Clawd NVIDIA RAG Pipeline", version="1.0")

    class QueryRequest(BaseModel):
        question: str
        top_k: int = 5

    class QueryResponse(BaseModel):
        answer: str
        question: str

    @app.get("/health")
    def health():
        return {"ok": True, "store": str(store_path)}

    @app.post("/query", response_model=QueryResponse)
    def query(req: QueryRequest):
        answer = rag_query(req.question, store_path, req.top_k)
        return QueryResponse(answer=answer, question=req.question)

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve NVIDIA RAG pipeline as API")
    parser.add_argument("--store", default="data/nvidia_rag_store")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    store_path = Path(args.store)
    app = make_app(store_path)

    import uvicorn  # type: ignore
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
