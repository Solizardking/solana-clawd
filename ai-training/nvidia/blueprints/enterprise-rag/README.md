# Blueprint 5: Build an Enterprise RAG Pipeline

https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline

NeMo Retriever RAG pipeline over Solana documentation, Clawd skills,
protocol specs, and training data — providing grounded answers to
Clawd agent queries without hallucination.

## Architecture

```
Solana docs + PDFs + skills
  └─► ingest.py   ← nv-ingest PDF extraction + chunking
        └─► NeMo Retriever embedding (nvidia/nv-embedqa-e5-v5)
              └─► Vector store (local FAISS / NVIDIA cuVS)
                    └─► query.py  ← RAG retrieval + NIM rerank + generation
                          └─► pipeline.py  ← end-to-end API
```

## Files

| File | Purpose |
|---|---|
| `ingest.py` | Document ingestion: PDF, JSONL, MD → chunked embeddings |
| `query.py` | RAG query: embed query → retrieve → rerank → generate |
| `pipeline.py` | End-to-end pipeline with FastAPI endpoint |

## Quick start

```bash
export NVIDIA_API_KEY=nvapi-...

# Ingest Solana docs into the vector store
python3 blueprints/enterprise-rag/ingest.py \
  --sources ../../data/ ../../README.md \
  --store ../../data/nvidia_rag_store

# Query
python3 blueprints/enterprise-rag/query.py \
  --store ../../data/nvidia_rag_store \
  --question "What is the funding rate on SOL-PERP?"

# Serve as API
python3 blueprints/enterprise-rag/pipeline.py --port 8765
```
