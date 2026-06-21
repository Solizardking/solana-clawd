"""Render-ready API for the Solana AI Model Kit site.

The service is intentionally small. It exposes public kit metadata, builds
CAAP/1.0 registration payloads, and can proxy an explicit live registration to
onchain.x402.wtf without persisting user credentials.
"""
import datetime as dt
import hashlib
import json
import os
import urllib.error
import urllib.request
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


PROTOCOL = "CAAP/1.0"
CLAWD_TOKEN = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
PROGRAM_ID = "3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj"
SAS_PROGRAM_ID = "ATSPssFHEjvJgAXKkfAWNRqTQW9Wm6JDDVW7Ec1G3zM"

DEFAULT_REGISTRY_HOME = os.environ.get("ONCHAIN_REGISTRY_HOME", "https://onchain.x402.wtf")
DEFAULT_REGISTRY_API = os.environ.get("ONCHAIN_REGISTRY_URL", f"{DEFAULT_REGISTRY_HOME}/api/register")
DEFAULT_REGISTRY_MANIFEST = f"{DEFAULT_REGISTRY_HOME}/.well-known/clawd-registry.json"
DEFAULT_ENDPOINT = os.environ.get("MODEL_KIT_DEFAULT_ENDPOINT", "https://clawd-box-router.fly.dev/v1")
GITHUB_REPO = os.environ.get("MODEL_KIT_GITHUB_REPO", "https://github.com/solizardking/solana-clawd-ai-training")
X402_HOME = os.environ.get("X402_HOME", "https://x402.wtf")
MODELS_HOME = os.environ.get("MODELS_HOME", "https://models.x402.wtf")
REGISTER_HOME = os.environ.get("REGISTER_HOME", "https://register.x402.wtf")

MODEL_TYPES = [
    "TextGeneration",
    "SentimentAnalysis",
    "ImageClassification",
    "PricePrediction",
    "DocumentUnderstanding",
]
CLUSTERS = ["devnet", "mainnet-beta", "testnet", "localnet"]


def split_env_list(name: str, fallback: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, fallback).split(",") if item.strip()]


app = FastAPI(
    title="Solana AI Model Kit API",
    version="1.0.0",
    description="Public metadata and CAAP/1.0 registration helpers for models.x402.wtf.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=split_env_list(
        "MODEL_KIT_CORS_ORIGINS",
        "https://models.x402.wtf,https://register.x402.wtf,http://localhost:8765,http://127.0.0.1:8765,http://localhost:5173,http://127.0.0.1:5173",
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


OFFICIAL_DATASETS = [
    {
        "repo_id": "solanaclawd/solana-clawd-core-ai-instruct",
        "kind": "dataset",
        "rows": 35173,
        "status": "published",
        "lane": "core-ai",
        "url": "https://huggingface.co/datasets/solanaclawd/solana-clawd-core-ai-instruct",
    },
    {
        "repo_id": "solanaclawd/solana-clawd-realtime-research-instruct",
        "kind": "dataset",
        "rows": 29058,
        "status": "published",
        "lane": "custom",
        "url": "https://huggingface.co/datasets/solanaclawd/solana-clawd-realtime-research-instruct",
    },
    {
        "repo_id": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
        "kind": "dataset",
        "rows": 142,
        "status": "published",
        "lane": "trading-factory",
        "url": "https://huggingface.co/datasets/solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
    },
    {
        "repo_id": "solanaclawd/solana-tx-foundation-cpt",
        "kind": "dataset",
        "rows": 19542,
        "status": "published",
        "lane": "tx-foundation",
        "url": "https://huggingface.co/datasets/solanaclawd/solana-tx-foundation-cpt",
    },
]

OFFICIAL_MODELS = [
    {
        "repo_id": "solanaclawd/solana-nvidia-trading-factory-8b-lora",
        "kind": "model",
        "base_model": "NousResearch/Hermes-3-Llama-3.1-8B",
        "status": "complete",
        "lane": "trading-factory",
        "url": "https://huggingface.co/solanaclawd/solana-nvidia-trading-factory-8b-lora",
    },
    {
        "repo_id": "solanaclawd/solana-clawd-core-ai-1.5b-lora",
        "kind": "model",
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "status": "recovery-running",
        "lane": "core-ai",
        "url": "https://huggingface.co/solanaclawd/solana-clawd-core-ai-1.5b-lora",
    },
    {
        "repo_id": "solanaclawd/solana-tx-foundation-1.5b",
        "kind": "model",
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "status": "ready-to-register",
        "lane": "tx-foundation",
        "url": "https://huggingface.co/solanaclawd/solana-tx-foundation-1.5b",
    },
]

OFFICIAL_JOBS = [
    {
        "id": "ordlibrary/6a35a2ce953ed90bfb945009",
        "name": "Trading factory 8B LoRA",
        "status": "complete",
        "lane": "trading-factory",
    },
    {
        "id": "ordlibrary/6a35a6833093dba73ce2a86b",
        "name": "Core AI 1.5B LoRA recovery",
        "status": "running",
        "lane": "core-ai",
    },
]


class RegistrationRequest(BaseModel):
    hf_model_id: str = Field(..., min_length=3, description="Hugging Face model id such as org/name")
    model_hash: Optional[str] = Field(default=None, description="sha256:<artifact hash>")
    model_type: str = "TextGeneration"
    api_endpoint: str = DEFAULT_ENDPOINT
    dataset_size: int = Field(default=0, ge=0)
    eval_accuracy: float = Field(default=0.60, ge=0, le=1)
    wandb_run: Optional[str] = None
    cluster: str = "devnet"
    protocol: str = PROTOCOL
    clawd_token: str = CLAWD_TOKEN
    live: bool = False
    allow_generated_hash: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def generated_model_hash(req: RegistrationRequest) -> str:
    seed = {
        "hf_model_id": req.hf_model_id,
        "api_endpoint": req.api_endpoint,
        "dataset_size": req.dataset_size,
        "eval_accuracy": req.eval_accuracy,
        "protocol": PROTOCOL,
    }
    digest = hashlib.sha256(json.dumps(seed, sort_keys=True).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def normalize_model_hash(raw: str) -> str:
    value = raw.strip()
    return value if value.startswith("sha256:") else f"sha256:{value}"


def build_payload(req: RegistrationRequest, *, require_real_hash: bool) -> tuple[dict[str, Any], bool]:
    if req.model_type not in MODEL_TYPES:
        raise HTTPException(status_code=422, detail=f"model_type must be one of: {', '.join(MODEL_TYPES)}")
    if req.cluster not in CLUSTERS:
        raise HTTPException(status_code=422, detail=f"cluster must be one of: {', '.join(CLUSTERS)}")
    if req.protocol != PROTOCOL:
        raise HTTPException(status_code=422, detail=f"protocol must be {PROTOCOL}")
    if req.clawd_token != CLAWD_TOKEN:
        raise HTTPException(status_code=422, detail="clawd_token does not match the Clawd mint")

    hash_was_generated = not bool(req.model_hash)
    if require_real_hash and hash_was_generated and not req.allow_generated_hash:
        raise HTTPException(
            status_code=422,
            detail="model_hash is required for live registration. Paste the sha256 from your model-kit manifest or enable allow_generated_hash for a provisional entry.",
        )

    model_hash = normalize_model_hash(req.model_hash) if req.model_hash else generated_model_hash(req)
    payload: dict[str, Any] = {
        "model_hash": model_hash,
        "model_type": req.model_type,
        "api_endpoint": req.api_endpoint,
        "hf_model_id": req.hf_model_id,
        "dataset_size": req.dataset_size,
        "eval_accuracy": req.eval_accuracy,
        "cluster": req.cluster,
        "protocol": PROTOCOL,
        "clawd_token": CLAWD_TOKEN,
        "registered_at": utc_now(),
    }
    if req.wandb_run:
        payload["wandb_run"] = req.wandb_run
    if req.metadata:
        payload["metadata"] = {
            **req.metadata,
            "models_home": MODELS_HOME,
            "register_home": REGISTER_HOME,
            "source": "solana-ai-model-kit",
        }
    elif hash_was_generated:
        payload["metadata"] = {
            "hash_source": "generated_from_registration_fields",
            "source": "solana-ai-model-kit",
        }
    return payload, hash_was_generated


def parse_json_or_text(raw: str) -> Any:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str]) -> tuple[int, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=float(os.environ.get("MODEL_KIT_REGISTRY_TIMEOUT", "20"))) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return resp.status, parse_json_or_text(text)
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return exc.code, parse_json_or_text(text)
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"registry request failed: {exc.reason}") from exc


def auth_header(request_authorization: Optional[str]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = (request_authorization or "").strip()
    if not token:
        token = os.environ.get("ONCHAIN_REGISTRY_TOKEN", "").strip()
    if token:
        headers["Authorization"] = token if token.lower().startswith("bearer ") else f"Bearer {token}"
    return headers


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "solana-ai-model-kit-api",
        "models_home": MODELS_HOME,
        "register_home": REGISTER_HOME,
        "registry": DEFAULT_REGISTRY_HOME,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "time": utc_now(),
        "registry_api": DEFAULT_REGISTRY_API,
        "protocol": PROTOCOL,
    }


@app.get("/api/model-kit/status")
def model_kit_status() -> dict[str, Any]:
    return {
        "ok": True,
        "time": utc_now(),
        "domains": {
            "x402": X402_HOME,
            "models": MODELS_HOME,
            "register": REGISTER_HOME,
            "onchain": DEFAULT_REGISTRY_HOME,
        },
        "registry_url": DEFAULT_REGISTRY_MANIFEST,
        "register_api": DEFAULT_REGISTRY_API,
        "github_repo": GITHUB_REPO,
        "programs": {
            "solana_ai_inference": PROGRAM_ID,
            "sas": SAS_PROGRAM_ID,
            "clawd_token": CLAWD_TOKEN,
        },
        "datasets": OFFICIAL_DATASETS,
        "models": OFFICIAL_MODELS,
        "jobs": OFFICIAL_JOBS,
        "one_shot": {
            "cli": "ai-training/model-kit/bin/clawd-model-kit one-shot",
            "safe_default": "dry-run registration unless --live-register --yes is supplied",
            "artifacts": ["SFT JSONL", "parquet splits", "dataset card", "manifest", "LoRA adapter", "CAAP/1.0 payload"],
        },
    }


@app.get("/.well-known/clawd-model-kit.json")
def well_known() -> dict[str, Any]:
    return {
        "protocol": PROTOCOL,
        "models_home": MODELS_HOME,
        "register_home": REGISTER_HOME,
        "registry_manifest": DEFAULT_REGISTRY_MANIFEST,
        "api": {
            "health": "/api/health",
            "status": "/api/model-kit/status",
            "schema": "/api/register/schema",
            "preview": "/api/register/preview",
            "register": "/api/register",
        },
    }


@app.get("/api/register/schema")
def register_schema() -> dict[str, Any]:
    return {
        "ok": True,
        "protocol": PROTOCOL,
        "model_types": MODEL_TYPES,
        "clusters": CLUSTERS,
        "defaults": {
            "api_endpoint": DEFAULT_ENDPOINT,
            "registry_api": DEFAULT_REGISTRY_API,
            "clawd_token": CLAWD_TOKEN,
            "cluster": "devnet",
            "model_type": "TextGeneration",
            "eval_accuracy": 0.60,
        },
        "required_for_live": ["hf_model_id", "model_hash", "api_endpoint", "dataset_size", "eval_accuracy"],
    }


@app.post("/api/register/preview")
def preview_registration(req: RegistrationRequest) -> dict[str, Any]:
    payload, hash_was_generated = build_payload(req, require_real_hash=False)
    return {
        "ok": True,
        "dry_run": True,
        "posted": False,
        "registry_api": DEFAULT_REGISTRY_API,
        "hash_was_generated": hash_was_generated,
        "payload": payload,
    }


@app.post("/api/register")
def register(req: RegistrationRequest, authorization: Optional[str] = Header(default=None)) -> JSONResponse:
    payload, hash_was_generated = build_payload(req, require_real_hash=req.live)
    if not req.live:
        return JSONResponse(
            {
                "ok": True,
                "dry_run": True,
                "posted": False,
                "registry_api": DEFAULT_REGISTRY_API,
                "hash_was_generated": hash_was_generated,
                "payload": payload,
            }
        )

    status_code, upstream = post_json(DEFAULT_REGISTRY_API, payload, auth_header(authorization))
    ok = 200 <= status_code < 300
    return JSONResponse(
        status_code=200 if ok else 502,
        content={
            "ok": ok,
            "dry_run": False,
            "posted": ok,
            "registry_api": DEFAULT_REGISTRY_API,
            "upstream_status": status_code,
            "hash_was_generated": hash_was_generated,
            "payload": payload,
            "response": upstream,
        },
    )
