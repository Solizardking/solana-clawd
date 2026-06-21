"""Render-ready API for the Solana AI Model Kit site.

The service is intentionally small. It exposes public kit metadata, builds
CAAP/1.0 registration payloads, and can proxy an explicit live registration to
onchain.x402.wtf without persisting user credentials.
"""
import datetime as dt
import asyncio
import hashlib
import json
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
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
ARENA_RUN_LIMIT = int(os.environ.get("MODEL_ARENA_RUN_LIMIT", "100"))
ARENA_EVENT_SLEEP = float(os.environ.get("MODEL_ARENA_EVENT_SLEEP", "0.75"))
ARENA_LOG_PATH = os.environ.get("MODEL_ARENA_LOG_PATH", "/tmp/model-arena-runs.jsonl")
ARENA_CODE_EXECUTION = os.environ.get("MODEL_ARENA_ENABLE_CODE_EXECUTION", "1").lower() not in {"0", "false", "no"}
ARENA_CODE_TIMEOUT = float(os.environ.get("MODEL_ARENA_CODE_TIMEOUT", "5"))
BACKEND_DIR = Path(__file__).resolve().parent
CONSTITUTION_MANIFEST_PATH = BACKEND_DIR / "constitution_manifest.json"

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


def normalize_sha256(raw: str) -> str:
    value = raw.strip()
    if not value:
        return ""
    return value if value.startswith("sha256:") else f"sha256:{value}"


def load_constitution_manifest() -> dict[str, Any]:
    try:
        return json.loads(CONSTITUTION_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "id": "clawd-six-law-harness",
            "authority": [],
            "six_law_harness": {"off_chain": [], "on_chain": []},
            "files": [],
            "public_sources": {},
        }


def constitution_status() -> dict[str, Any]:
    manifest = load_constitution_manifest()
    expected_three_laws = normalize_sha256(os.environ.get("CLAWD_THREE_LAWS_SHA256", ""))
    files: list[dict[str, Any]] = []
    missing_required: list[str] = []
    mismatches: list[str] = []

    for raw in manifest.get("files", []):
        item = dict(raw)
        item["present"] = bool(item.get("sha256"))
        if item.get("required") and not item["present"]:
            missing_required.append(str(item.get("id") or item.get("path") or "unknown"))
        if item.get("id") == "three_laws" and expected_three_laws:
            item["expected_sha256"] = expected_three_laws
            item["hash_matches_expected"] = item.get("sha256") == expected_three_laws
            if not item["hash_matches_expected"]:
                mismatches.append("three_laws")
        files.append(item)

    hashes = {
        item["id"]: item.get("sha256")
        for item in files
        if item.get("id") and item.get("sha256")
    }
    return {
        "ok": bool(files) and not missing_required and not mismatches,
        "id": manifest.get("id", "clawd-six-law-harness"),
        "version": manifest.get("version"),
        "authority": manifest.get("authority", []),
        "six_law_harness": manifest.get("six_law_harness", {}),
        "files": files,
        "hashes": hashes,
        "three_laws_hash": hashes.get("three_laws"),
        "missing_required": missing_required,
        "mismatches": mismatches,
        "public_sources": manifest.get("public_sources", {}),
        "manifest_path": "constitution_manifest.json",
    }


def constitution_commitment() -> dict[str, Any]:
    status = constitution_status()
    return {
        "gate": "ok" if status["ok"] else "unavailable",
        "harness": status["id"],
        "three_laws_hash": status["three_laws_hash"],
        "hashes": status["hashes"],
        "sources": status["public_sources"],
    }


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

OPENROUTER_MODEL_DEFAULTS = [
    ("OPENROUTER_DEFAULT_FREE_MODEL", "Default free", "nvidia/llama-nemotron-rerank-vl-1b-v2:free"),
    ("OPENROUTER_FREE_MODEL1", "Free model 1", "nvidia/llama-nemotron-rerank-vl-1b-v2:free"),
    ("OPENROUTER_FUSION", "Fusion", "openrouter/fusion"),
    ("OPENROUTER_KIMI_MODEL", "Kimi code", "moonshotai/kimi-k2.7-code"),
    ("OPENROUTER_MOONSHOT", "Moonshot code", "moonshotai/kimi-k2.7-code"),
    ("OPENROUTER_FABLE", "Claude Fable", "anthropic/claude-fable-5"),
    ("OPENROUTER_FABLE_LATEST", "Claude Fable latest", "~anthropic/claude-fable-latest"),
    ("OPENROUTER_FREE_MODEL2", "Free model 2", "nex-agi/nex-n2-pro:free"),
    ("OPENROUTER_SOURCEFUL", "Sourceful pro", "sourceful/riverflow-v2.5-pro"),
    ("OPENROUTER_SOURCEFUL_FAST", "Sourceful fast", "sourceful/riverflow-v2.5-fast"),
    ("OPENROUTER_RIVER_FLOW", "Riverflow pro", "sourceful/riverflow-v2.5-pro"),
    ("OPENROUTER_RIVER_FAST", "Riverflow fast", "sourceful/riverflow-v2.5-fast"),
    ("OPENROUTER_NVIDIA_FREE_MODEL", "NVIDIA content safety free", "nvidia/nemotron-3.5-content-safety:free"),
    ("OPENROUTER_NVIDIA_FREE_SAFE", "NVIDIA safety free", "nvidia/nemotron-3.5-content-safety:free"),
    ("OPENROUTER_NVIDIA_FREE_MODEL2", "NVIDIA ultra free", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    ("OPENROUTER_NEMO_ULTRA", "NVIDIA Nemo ultra free", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    ("OPENROUTER_NVIDIA_MODEL", "NVIDIA ultra", "nvidia/nemotron-3-ultra-550b-a55b"),
    ("OPENROUTER_NVIDIA_FREEMODEL3", "NVIDIA nano omni free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
    ("OPENROUTER_MODEL5", "NVIDIA nano", "nvidia/nemotron-3-nano-30b-a3b"),
    ("OPENROUTER_QWEN_MODEL", "Qwen plus", "qwen/qwen3.7-plus"),
    ("OPENROUTER_QWEN_MAX", "Qwen max", "qwen/qwen3.7-max"),
    ("OPENROUTER_QWEN_FLASH", "Qwen ASR flash", "qwen/qwen3-asr-flash-2026-02-10"),
    ("OPENROUTER_MINIMAX", "MiniMax", "minimax/minimax-m2"),
    ("OPENROUTER_MODEL1", "MiniMax model 1", "minimax/minimax-m2.1"),
    ("OPENROUTER_CLAWD_DEFAULT_MODEL", "Clawd default", "anthropic/claude-opus-4.8-fast"),
    ("OPENROUTER_OPUS", "Claude Opus", "anthropic/claude-opus-4.8-fast"),
    ("OPENROUTER_OPUS47", "Claude Opus 4.7", "anthropic/claude-opus-4.7-fast"),
    ("OPENROUTER_CLAUDE", "Claude Sonnet", "anthropic/claude-sonnet-4.5"),
    ("OPENROUTER_HAIKU_LATEST", "Claude Haiku latest", "~anthropic/claude-haiku-latest"),
    ("OPENROUTER_GPT", "OpenAI GPT", "openai/gpt-5.2"),
    ("OPENROUTER_GPTLATEST", "OpenAI GPT mini latest", "~openai/gpt-mini-latest"),
    ("OPENROUTER_CHATGPT_LATEST", "ChatGPT latest", "openai/gpt-chat-latest"),
    ("OPENROUTER_MODEL6", "OpenAI GPT 5.2 chat", "openai/gpt-5.2-chat"),
    ("OPENROUTER_CODEX", "OpenAI Codex max", "openai/gpt-5.1-codex-max"),
    ("OPENROUTER_GROK_BUILD", "Grok build", "x-ai/grok-build-0.1"),
    ("OPENROUTER_GROK43", "Grok 4.3", "x-ai/grok-4.3"),
    ("OPENROUTER_GROK_CODE", "Grok code", "x-ai/grok-code-fast-1"),
    ("OPENROUTER_GROK", "Grok fast", "x-ai/grok-4.1-fast"),
    ("OPENROUTER_GROK_IMAGINE_IMAGE", "Grok imagine image", "x-ai/grok-imagine-image-quality"),
    ("OPENROUTER_GROKI_MAGINE_IMAGE", "Grok imagine image legacy", "x-ai/grok-imagine-image-quality"),
    ("OPENROUTER_GROK_IMAGINE_VIDEO", "Grok imagine video", "x-ai/grok-imagine-video"),
    ("OPENROUTER_GROK_VOICE", "Grok voice", "x-ai/grok-voice-tts-1.0"),
    ("OPENROUTER_GOOGLE_GEM", "Gemini embedding", "google/gemini-embedding-2"),
    ("OPENROUTER_GEMINI_EMBEDDING", "Gemini embedding", "google/gemini-embedding-2"),
    ("OPENROUTER_GOOGLE_GEM_FLASH", "Gemini flash", "google/gemini-3.5-flash"),
    ("OPENROUTER_GEMINILATEST", "Gemini pro latest", "~google/gemini-pro-latest"),
    ("OPENROUTER_GOOGLEFLASH_LATEST", "Gemini flash latest", "~google/gemini-flash-latest"),
    ("OPENROUTER_MODEL2", "Gemini flash preview", "google/gemini-3-flash-preview"),
    ("OPENROUTER_GOOGLE_CHIRP", "Google Chirp", "google/chirp-3"),
    ("OPENROUTER_MISTRAL", "Mistral medium", "mistralai/mistral-medium-3-5"),
    ("OPENROUTER_DEVSTRAL", "Devstral", "mistralai/devstral-2512"),
    ("OPENROUTER_MODEL3", "Mistral creative", "mistralai/mistral-small-creative"),
    ("OPENROUTER_MISTRAL_VOX", "Mistral Voxtral", "mistralai/voxtral-mini-transcribe"),
    ("OPENROUTER_DEEP", "DeepSeek V3.2", "deepseek/deepseek-v3.2"),
    ("OPENROUTER_DEEPSEEK", "DeepSeek chat", "deepseek/deepseek-chat-v3.1"),
    ("OPENROUTER_GLM", "GLM", "z-ai/glm-5.2"),
    ("OPENROUTER_HERMES", "Hermes free", "nousresearch/hermes-3-llama-3.1-405b:free"),
    ("OPENROUTER_KIMILATEST", "Kimi latest", "~moonshotai/kimi-latest"),
    ("OPENROUTER_MICROSOFT_IMAGE", "Microsoft image", "microsoft/mai-image-2.5"),
    ("OPENROUTER_STEPFUN", "StepFun flash", "stepfun/step-3.7-flash"),
    ("OPENROUTER_PARA", "NVIDIA Parakeet", "nvidia/parakeet-tdt-0.6b-v3"),
    ("OPENROUTER_OPENAI_TRANSCRIBE", "OpenAI transcribe", "openai/gpt-4o-mini-transcribe"),
    ("OPENROUTER_VOICE_TURBO", "Whisper turbo", "openai/whisper-large-v3-turbo"),
    ("OPENROUTER_WHISPER_LARGE", "Whisper large", "openai/whisper-large-v3-turbo"),
    ("OPENROUTER_IBM", "IBM Granite", "ibm-granite/granite-4.1-8b"),
    ("OPENROUTER_MODEL4", "Flux max", "black-forest-labs/flux.2-max"),
    ("OPENROUTER_KLING", "Kling pro", "kwaivgi/kling-v3.0-pro"),
    ("OPENROUTER_KLING_STANDARD", "Kling standard", "kwaivgi/kling-v3.0-std"),
]


def arena_env_value(name: str, fallback: str) -> str:
    return os.environ.get(name, fallback).strip() or fallback


def openrouter_model_presets() -> list[dict[str, str]]:
    return [
        {
            "env": env_name,
            "label": label,
            "model": arena_env_value(env_name, fallback),
        }
        for env_name, label, fallback in OPENROUTER_MODEL_DEFAULTS
    ]


OPENROUTER_MODEL_PRESETS = openrouter_model_presets()
OPENROUTER_EXAMPLES = [preset["model"] for preset in OPENROUTER_MODEL_PRESETS]

ARENA_PROVIDER_TEMPLATES = [
    {
        "id": "openrouter",
        "label": "OpenRouter",
        "adapter": "openai-compatible",
        "base_url": "https://openrouter.ai/api/v1",
        "api_key_env": "OPENROUTER_API_KEY",
        "default_model_env": "OPENROUTER_DEFAULT_FREE_MODEL",
        "examples": OPENROUTER_EXAMPLES,
        "model_presets": OPENROUTER_MODEL_PRESETS,
    },
    {
        "id": "openai",
        "label": "OpenAI",
        "adapter": "openai-compatible",
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "examples": ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
    },
    {
        "id": "xai",
        "label": "xAI",
        "adapter": "openai-compatible",
        "base_url": "https://api.x.ai/v1",
        "api_key_env": "XAI_API_KEY",
        "examples": ["grok-4", "grok-4-fast"],
    },
    {
        "id": "groq",
        "label": "Groq",
        "adapter": "openai-compatible",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "examples": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    },
    {
        "id": "together",
        "label": "Together",
        "adapter": "openai-compatible",
        "base_url": "https://api.together.xyz/v1",
        "api_key_env": "TOGETHER_API_KEY",
        "examples": ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    },
    {
        "id": "fireworks",
        "label": "Fireworks",
        "adapter": "openai-compatible",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "api_key_env": "FIREWORKS_API_KEY",
        "examples": ["accounts/fireworks/models/llama-v3p1-405b-instruct"],
    },
    {
        "id": "anthropic",
        "label": "Anthropic",
        "adapter": "anthropic",
        "base_url": "https://api.anthropic.com/v1",
        "api_key_env": "ANTHROPIC_API_KEY",
        "examples": ["claude-3-5-sonnet-latest", "claude-3-haiku-20240307"],
    },
    {
        "id": "gemini",
        "label": "Google Gemini",
        "adapter": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "api_key_env": "GEMINI_API_KEY",
        "examples": ["gemini-1.5-pro", "gemini-1.5-flash"],
    },
    {
        "id": "custom-openai",
        "label": "Custom OpenAI-compatible",
        "adapter": "openai-compatible",
        "base_url": "",
        "api_key_env": "",
        "examples": ["provider/model-id"],
    },
    {
        "id": "mock",
        "label": "Local mock",
        "adapter": "mock",
        "base_url": "",
        "api_key_env": "",
        "examples": ["mock-fast", "mock-careful"],
    },
]

ARENA_PROVIDER_BY_ID = {provider["id"]: provider for provider in ARENA_PROVIDER_TEMPLATES}
ARENA_RUNS: dict[str, dict[str, Any]] = {}
ARENA_LOCK = threading.Lock()


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


class ArenaModelConfig(BaseModel):
    label: str = Field(default="Model A", min_length=1, max_length=80)
    provider: str = Field(default="openrouter", min_length=2, max_length=80)
    model: str = Field(..., min_length=1, max_length=200)
    base_url: Optional[str] = Field(default=None, max_length=500)
    api_key: Optional[str] = Field(default=None, max_length=500)
    api_key_env: Optional[str] = Field(default=None, max_length=120)
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=32, le=8192)


class ArenaRunRequest(BaseModel):
    mode: str = Field(default="chat")
    prompt: str = Field(..., min_length=1, max_length=12000)
    system_prompt: str = Field(default="You are a concise, accurate assistant.", max_length=4000)
    models: list[ArenaModelConfig] = Field(..., min_length=1, max_length=6)
    stdin: str = Field(default="", max_length=6000)
    expected_stdout: Optional[str] = Field(default=None, max_length=6000)
    share_base_url: Optional[str] = Field(default=None, max_length=500)


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
    metadata = {
        **(req.metadata or {}),
        "models_home": MODELS_HOME,
        "register_home": REGISTER_HOME,
        "source": "solana-ai-model-kit",
        "constitution": constitution_commitment(),
    }
    if hash_was_generated:
        metadata["hash_source"] = "generated_from_registration_fields"
    payload["metadata"] = metadata
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


def pydantic_dump(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def provider_template(provider_id: str) -> dict[str, Any]:
    return ARENA_PROVIDER_BY_ID.get(provider_id, ARENA_PROVIDER_BY_ID["custom-openai"])


def arena_model_public(model: ArenaModelConfig) -> dict[str, Any]:
    raw = pydantic_dump(model)
    raw["api_key"] = "redacted" if raw.get("api_key") else ""
    return raw


def arena_request_public(req: ArenaRunRequest) -> dict[str, Any]:
    return {
        "mode": req.mode,
        "prompt": req.prompt,
        "system_prompt": req.system_prompt,
        "stdin": req.stdin,
        "expected_stdout": req.expected_stdout,
        "share_base_url": req.share_base_url,
        "models": [arena_model_public(model) for model in req.models],
    }


def append_arena_event(run_id: str, event_type: str, message: str, data: Optional[dict[str, Any]] = None) -> None:
    with ARENA_LOCK:
        run = ARENA_RUNS.get(run_id)
        if not run:
            return
        event = {
            "id": len(run["events"]) + 1,
            "time": utc_now(),
            "type": event_type,
            "message": message,
            "data": data or {},
        }
        run["events"].append(event)
        run["updated_at"] = event["time"]


def store_arena_run(run: dict[str, Any]) -> None:
    with ARENA_LOCK:
        ARENA_RUNS[run["id"]] = run
        if len(ARENA_RUNS) > ARENA_RUN_LIMIT:
            stale_ids = sorted(ARENA_RUNS, key=lambda item: ARENA_RUNS[item]["created_at"])
            for stale_id in stale_ids[: len(ARENA_RUNS) - ARENA_RUN_LIMIT]:
                ARENA_RUNS.pop(stale_id, None)


def read_arena_log() -> list[dict[str, Any]]:
    if not ARENA_LOG_PATH or not os.path.exists(ARENA_LOG_PATH):
        return []
    records_by_id: dict[str, dict[str, Any]] = {}
    try:
        with open(ARENA_LOG_PATH, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                run_id = record.get("id")
                if isinstance(run_id, str) and run_id.startswith("arena_"):
                    records_by_id[run_id] = record
    except OSError:
        return []
    return sorted(records_by_id.values(), key=lambda item: item.get("created_at", ""), reverse=True)


def hydrate_arena_runs_from_log() -> None:
    records = read_arena_log()
    if not records:
        return
    with ARENA_LOCK:
        for record in records[:ARENA_RUN_LIMIT]:
            ARENA_RUNS.setdefault(record["id"], record)
        if len(ARENA_RUNS) > ARENA_RUN_LIMIT:
            stale_ids = sorted(ARENA_RUNS, key=lambda item: ARENA_RUNS[item].get("created_at", ""))
            for stale_id in stale_ids[: len(ARENA_RUNS) - ARENA_RUN_LIMIT]:
                ARENA_RUNS.pop(stale_id, None)


def get_arena_run(run_id: str) -> dict[str, Any]:
    with ARENA_LOCK:
        run = ARENA_RUNS.get(run_id)
    if not run:
        hydrate_arena_runs_from_log()
        with ARENA_LOCK:
            run = ARENA_RUNS.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="arena run not found")
    return json.loads(json.dumps(run))


def list_public_arena_runs(limit: int = 50) -> list[dict[str, Any]]:
    hydrate_arena_runs_from_log()
    with ARENA_LOCK:
        runs = sorted(ARENA_RUNS.values(), key=lambda item: item.get("created_at", ""), reverse=True)
        public_runs = [
            {
                "id": run["id"],
                "status": run["status"],
                "created_at": run["created_at"],
                "updated_at": run["updated_at"],
                "completed_at": run.get("completed_at"),
                "request": run["request"],
                "summary": run.get("summary", {}),
                "results": run.get("results", []),
            }
            for run in runs[:limit]
        ]
        return json.loads(json.dumps(public_runs))


def update_arena_run(run_id: str, **fields: Any) -> None:
    with ARENA_LOCK:
        run = ARENA_RUNS.get(run_id)
        if not run:
            return
        run.update(fields)
        run["updated_at"] = utc_now()


def add_arena_result(run_id: str, result: dict[str, Any]) -> None:
    with ARENA_LOCK:
        run = ARENA_RUNS.get(run_id)
        if not run:
            return
        run["results"].append(result)
        run["updated_at"] = utc_now()


def append_arena_log(run: dict[str, Any]) -> None:
    if not ARENA_LOG_PATH:
        return
    try:
        log_dir = os.path.dirname(ARENA_LOG_PATH)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        with open(ARENA_LOG_PATH, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(run, sort_keys=True) + "\n")
    except OSError:
        append_arena_event(run["id"], "log_failed", "Run finished, but the JSONL arena log could not be written.")


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / 4)) if text else 0


def normalize_chat_endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def request_json_url(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float = 90) -> Any:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return parse_json_or_text(text)
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        detail = parse_json_or_text(text)
        raise RuntimeError(f"provider returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"provider request failed: {exc.reason}") from exc


def resolve_arena_api_key(model: ArenaModelConfig, template: dict[str, Any]) -> str:
    if model.api_key:
        return model.api_key.strip()
    env_name = (model.api_key_env or template.get("api_key_env") or "").strip()
    if env_name:
        return os.environ.get(env_name, "").strip()
    return ""


def mock_model_response(model: ArenaModelConfig, req: ArenaRunRequest) -> dict[str, Any]:
    if "careful" in model.model.lower():
        time.sleep(0.12)
    if req.mode == "code":
        content = (
            "```python\n"
            "import sys\n"
            "data = sys.stdin.read().strip()\n"
            "print(data[::-1] if data else 'mock-code-ok')\n"
            "```"
        )
    else:
        style = "careful validation trace" if "careful" in model.model.lower() else "fast baseline"
        content = (
            f"{model.label} mock {style}. "
            f"Prompt characters={len(req.prompt)}. Mode={req.mode}. "
            "Use a real provider key to replace this mock competitor with a live model."
        )
    return {
        "content": content,
        "usage": {
            "prompt_tokens": estimate_tokens(req.prompt),
            "completion_tokens": estimate_tokens(content),
            "total_tokens": estimate_tokens(req.prompt) + estimate_tokens(content),
        },
    }


def call_openai_compatible(model: ArenaModelConfig, req: ArenaRunRequest, template: dict[str, Any]) -> dict[str, Any]:
    base_url = (model.base_url or template.get("base_url") or "").strip()
    if not base_url:
        raise RuntimeError("base_url is required for OpenAI-compatible providers")
    api_key = resolve_arena_api_key(model, template)
    if not api_key:
        raise RuntimeError(f"missing API key; set {template.get('api_key_env') or 'api_key'} or paste a run key")

    prompt = req.prompt
    if req.mode == "code":
        prompt = (
            f"{req.prompt}\n\n"
            "Return one complete Python 3 solution in a fenced ```python block. "
            "Read from stdin when input is needed and print only the final answer."
        )
    payload = {
        "model": model.model,
        "messages": [
            {"role": "system", "content": req.system_prompt},
            {"role": "user", "content": prompt},
        ],
        "temperature": model.temperature,
        "max_tokens": model.max_tokens,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": MODELS_HOME,
        "X-Title": "Solana AI Model Arena",
    }
    raw = request_json_url(normalize_chat_endpoint(base_url), payload, headers)
    choices = raw.get("choices") if isinstance(raw, dict) else None
    if not choices:
        raise RuntimeError(f"provider returned no choices: {raw}")
    message = choices[0].get("message") or {}
    return {
        "content": message.get("content") or choices[0].get("text") or "",
        "usage": raw.get("usage") or {},
        "raw_finish_reason": choices[0].get("finish_reason"),
    }


def call_anthropic(model: ArenaModelConfig, req: ArenaRunRequest, template: dict[str, Any]) -> dict[str, Any]:
    api_key = resolve_arena_api_key(model, template)
    if not api_key:
        raise RuntimeError("missing API key; set ANTHROPIC_API_KEY or paste a run key")
    base_url = (model.base_url or template.get("base_url") or "").rstrip("/")
    prompt = req.prompt
    if req.mode == "code":
        prompt = (
            f"{req.prompt}\n\n"
            "Return one complete Python 3 solution in a fenced ```python block. "
            "Read from stdin when input is needed and print only the final answer."
        )
    payload = {
        "model": model.model,
        "system": req.system_prompt,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": model.temperature,
        "max_tokens": model.max_tokens,
    }
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    raw = request_json_url(f"{base_url}/messages", payload, headers)
    parts = raw.get("content", []) if isinstance(raw, dict) else []
    content = "\n".join(part.get("text", "") for part in parts if part.get("type") == "text")
    return {"content": content, "usage": raw.get("usage") or {}, "raw_finish_reason": raw.get("stop_reason")}


def call_gemini(model: ArenaModelConfig, req: ArenaRunRequest, template: dict[str, Any]) -> dict[str, Any]:
    api_key = resolve_arena_api_key(model, template)
    if not api_key:
        raise RuntimeError("missing API key; set GEMINI_API_KEY or paste a run key")
    base_url = (model.base_url or template.get("base_url") or "").rstrip("/")
    prompt = req.prompt
    if req.mode == "code":
        prompt = (
            f"{req.prompt}\n\n"
            "Return one complete Python 3 solution in a fenced ```python block. "
            "Read from stdin when input is needed and print only the final answer."
        )
    payload = {
        "systemInstruction": {"parts": [{"text": req.system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": model.temperature,
            "maxOutputTokens": model.max_tokens,
        },
    }
    url = f"{base_url}/models/{urllib.parse.quote(model.model, safe='')}:generateContent?key={urllib.parse.quote(api_key, safe='')}"
    raw = request_json_url(url, payload, {"Content-Type": "application/json"})
    candidates = raw.get("candidates", []) if isinstance(raw, dict) else []
    parts = (candidates[0].get("content") or {}).get("parts", []) if candidates else []
    content = "\n".join(part.get("text", "") for part in parts)
    return {"content": content, "usage": raw.get("usageMetadata") or {}, "raw_finish_reason": candidates[0].get("finishReason") if candidates else None}


def call_arena_model(model: ArenaModelConfig, req: ArenaRunRequest) -> dict[str, Any]:
    template = provider_template(model.provider)
    adapter = template.get("adapter", "openai-compatible")
    if adapter == "mock":
        return mock_model_response(model, req)
    if adapter == "anthropic":
        return call_anthropic(model, req, template)
    if adapter == "gemini":
        return call_gemini(model, req, template)
    return call_openai_compatible(model, req, template)


def extract_python_code(text: str) -> str:
    fenced = re.search(r"```(?:python|py)?\s*(.*?)```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        return fenced.group(1).strip()
    return text.strip()


def code_policy_error(code: str) -> Optional[str]:
    blocked_patterns = [
        r"\bimport\s+(os|subprocess|socket|pathlib|shutil|requests|urllib|http|ctypes|multiprocessing|threading)\b",
        r"\bfrom\s+(os|subprocess|socket|pathlib|shutil|requests|urllib|http|ctypes|multiprocessing|threading)\b",
        r"__import__\s*\(",
        r"\beval\s*\(",
        r"\bexec\s*\(",
        r"\bcompile\s*\(",
        r"\bopen\s*\(",
    ]
    for pattern in blocked_patterns:
        if re.search(pattern, code):
            return "code blocked by arena policy before execution"
    return None


def apply_python_limits(timeout: float) -> None:
    try:
        import resource

        cpu = max(1, int(timeout))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
        if hasattr(resource, "RLIMIT_AS"):
            resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    except Exception:
        return


def run_python_code(code: str, stdin: str, expected_stdout: Optional[str]) -> dict[str, Any]:
    if not ARENA_CODE_EXECUTION:
        return {
            "enabled": False,
            "passed": False,
            "return_code": None,
            "stdout": "",
            "stderr": "MODEL_ARENA_ENABLE_CODE_EXECUTION is disabled.",
            "latency_ms": 0,
        }
    policy_error = code_policy_error(code)
    if policy_error:
        return {
            "enabled": True,
            "passed": False,
            "return_code": None,
            "stdout": "",
            "stderr": policy_error,
            "latency_ms": 0,
        }
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="model-arena-") as tmp:
        code_path = os.path.join(tmp, "main.py")
        with open(code_path, "w", encoding="utf-8") as handle:
            handle.write(code)
        try:
            proc = subprocess.run(
                ["python3", "-I", "-S", code_path],
                input=stdin,
                text=True,
                capture_output=True,
                cwd=tmp,
                env={"PYTHONIOENCODING": "utf-8"},
                timeout=ARENA_CODE_TIMEOUT,
                preexec_fn=(lambda: apply_python_limits(ARENA_CODE_TIMEOUT)) if os.name == "posix" else None,
            )
            latency_ms = int((time.perf_counter() - started) * 1000)
            stdout = proc.stdout[:6000]
            stderr = proc.stderr[:6000]
            expected = expected_stdout.strip() if expected_stdout is not None else None
            actual = stdout.strip()
            passed = proc.returncode == 0 and (expected is None or actual == expected)
            return {
                "enabled": True,
                "passed": passed,
                "return_code": proc.returncode,
                "stdout": stdout,
                "stderr": stderr,
                "latency_ms": latency_ms,
                "expected_stdout": expected_stdout,
            }
        except subprocess.TimeoutExpired as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            return {
                "enabled": True,
                "passed": False,
                "return_code": None,
                "stdout": (exc.stdout or "")[:6000],
                "stderr": f"execution timed out after {ARENA_CODE_TIMEOUT}s",
                "latency_ms": latency_ms,
                "expected_stdout": expected_stdout,
            }


def build_arena_result(model: ArenaModelConfig, req: ArenaRunRequest, model_output: dict[str, Any], latency_ms: int) -> dict[str, Any]:
    content = model_output.get("content", "")
    usage = model_output.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens") or estimate_tokens(req.prompt)
    completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens") or estimate_tokens(content)
    result = {
        "label": model.label,
        "provider": model.provider,
        "model": model.model,
        "content": content,
        "latency_ms": latency_ms,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": usage.get("total_tokens") or prompt_tokens + completion_tokens,
        "chars": len(content),
        "chars_per_second": round((len(content) / max(latency_ms / 1000, 0.001)), 2),
        "finish_reason": model_output.get("raw_finish_reason"),
        "ok": True,
    }
    if req.mode == "code":
        code = extract_python_code(content)
        result["code"] = code[:12000]
        result["execution"] = run_python_code(code, req.stdin, req.expected_stdout)
    return result


def failed_arena_result(model: ArenaModelConfig, started: float, error: Exception) -> dict[str, Any]:
    return {
        "label": model.label,
        "provider": model.provider,
        "model": model.model,
        "content": "",
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "chars": 0,
        "chars_per_second": 0,
        "ok": False,
        "error": str(error),
    }


def summarize_arena_run(run: dict[str, Any]) -> dict[str, Any]:
    results = run.get("results", [])
    completed = [item for item in results if item.get("ok")]
    fastest = min(completed, key=lambda item: item.get("latency_ms", 10**9), default=None)
    code_passes = [item for item in completed if (item.get("execution") or {}).get("passed")]
    if run["request"]["mode"] == "code":
        winner = min(code_passes, key=lambda item: item.get("latency_ms", 10**9), default=fastest)
    else:
        winner = fastest
    return {
        "winner": winner["label"] if winner else None,
        "fastest": fastest["label"] if fastest else None,
        "models_completed": len(completed),
        "models_failed": len(results) - len(completed),
        "code_passes": len(code_passes),
        "total_latency_ms": max([item.get("latency_ms", 0) for item in results] or [0]),
        "total_tokens": sum(int(item.get("total_tokens") or 0) for item in results),
    }


def execute_arena_competitor(run_id: str, req: ArenaRunRequest, model: ArenaModelConfig) -> None:
    started = time.perf_counter()
    append_arena_event(run_id, "model_started", f"{model.label} started.", {"label": model.label, "model": model.model})
    try:
        output = call_arena_model(model, req)
        latency_ms = int((time.perf_counter() - started) * 1000)
        result = build_arena_result(model, req, output, latency_ms)
        add_arena_result(run_id, result)
        append_arena_event(run_id, "model_completed", f"{model.label} completed.", {"label": model.label, "latency_ms": latency_ms, "ok": True})
    except Exception as exc:
        result = failed_arena_result(model, started, exc)
        add_arena_result(run_id, result)
        append_arena_event(run_id, "model_failed", f"{model.label} failed.", {"label": model.label, "error": str(exc), "ok": False})


def execute_arena_run(run_id: str, req: ArenaRunRequest) -> None:
    update_arena_run(run_id, status="running", started_at=utc_now())
    append_arena_event(run_id, "run_started", "Arena run started.", {"mode": req.mode, "models": len(req.models)})
    threads = [
        threading.Thread(target=execute_arena_competitor, args=(run_id, req, model), daemon=True)
        for model in req.models
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    run = get_arena_run(run_id)
    summary = summarize_arena_run(run)
    update_arena_run(run_id, status="completed", completed_at=utc_now(), summary=summary)
    append_arena_event(run_id, "run_completed", "Arena run completed.", summary)
    append_arena_log(get_arena_run(run_id))


def arena_share_text(run: dict[str, Any]) -> str:
    req = run.get("request", {})
    summary = run.get("summary", {})
    mode = req.get("mode", "chat")
    winner = summary.get("winner") or "no winner"
    completed = summary.get("models_completed", 0)
    failed = summary.get("models_failed", 0)
    if mode == "code":
        return f"Ran a code model arena on models.x402.wtf: winner={winner}, passes={summary.get('code_passes', 0)}, completed={completed}, failed={failed}."
    return f"Ran a chat model arena on models.x402.wtf: fastest={winner}, completed={completed}, failed={failed}, tokens={summary.get('total_tokens', 0)}."


def x_intent_url(text: str, url: Optional[str]) -> str:
    params = {"text": text}
    if url:
        params["url"] = url
    return "https://twitter.com/intent/tweet?" + urllib.parse.urlencode(params)


def arena_run_url(base: Optional[str], run_id: str) -> Optional[str]:
    if not base:
        return None
    parsed = urllib.parse.urlsplit(base)
    if not parsed.scheme or not parsed.netloc:
        return f"{base.rstrip('/')}?{urllib.parse.urlencode({'arenaRun': run_id})}"
    existing = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
    existing["arenaRun"] = run_id
    path = parsed.path or "/"
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, path, urllib.parse.urlencode(existing), parsed.fragment)
    )


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
        "arena": {
            "providers": ARENA_PROVIDER_TEMPLATES,
            "modes": ["chat", "code"],
            "realtime": "server-sent events at /api/arena/runs/{run_id}/events",
            "code_execution_enabled": ARENA_CODE_EXECUTION,
            "run_log_path": ARENA_LOG_PATH if ARENA_LOG_PATH else None,
            "run_log_rehydration": bool(ARENA_LOG_PATH),
        },
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
            "arena_providers": "/api/arena/providers",
            "arena_runs": "/api/arena/runs",
        },
    }


@app.get("/api/arena/providers")
def arena_providers() -> dict[str, Any]:
    return {
        "ok": True,
        "providers": ARENA_PROVIDER_TEMPLATES,
        "modes": ["chat", "code"],
        "code_execution": {
            "enabled": ARENA_CODE_EXECUTION,
            "timeout_seconds": ARENA_CODE_TIMEOUT,
            "policy": "Python runs use a temporary directory, isolated interpreter flags, resource limits where available, and a small denylist for filesystem/network/process imports.",
        },
        "secrets": "API keys may be supplied in the run request or server env vars; they are not stored in arena run records.",
    }


@app.get("/api/arena/runs")
def list_arena_runs() -> dict[str, Any]:
    return {"ok": True, "runs": list_public_arena_runs()}


@app.post("/api/arena/runs")
def create_arena_run(req: ArenaRunRequest) -> dict[str, Any]:
    if req.mode not in {"chat", "code"}:
        raise HTTPException(status_code=422, detail="mode must be chat or code")
    labels = [model.label.strip() for model in req.models]
    if len(labels) != len(set(labels)):
        raise HTTPException(status_code=422, detail="model labels must be unique")
    for model in req.models:
        if model.provider not in ARENA_PROVIDER_BY_ID:
            raise HTTPException(status_code=422, detail=f"unknown provider: {model.provider}")
        template = provider_template(model.provider)
        if template.get("adapter") == "openai-compatible" and not (model.base_url or template.get("base_url")):
            raise HTTPException(status_code=422, detail=f"base_url is required for {model.label}")

    run_id = f"arena_{uuid.uuid4().hex[:12]}"
    now = utc_now()
    run = {
        "id": run_id,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
        "request": arena_request_public(req),
        "results": [],
        "summary": {},
        "events": [],
    }
    store_arena_run(run)
    append_arena_event(run_id, "queued", "Arena run queued.", {"models": len(req.models), "mode": req.mode})
    thread = threading.Thread(target=execute_arena_run, args=(run_id, req), daemon=True)
    thread.start()
    return {"ok": True, "run": get_arena_run(run_id)}


@app.get("/api/arena/runs/{run_id}")
def arena_run(run_id: str) -> dict[str, Any]:
    return {"ok": True, "run": get_arena_run(run_id)}


@app.get("/api/arena/runs/{run_id}/share")
def arena_run_share(run_id: str) -> dict[str, Any]:
    run = get_arena_run(run_id)
    text = arena_share_text(run)
    share_url = arena_run_url((run.get("request") or {}).get("share_base_url"), run_id)
    return {
        "ok": True,
        "text": text,
        "url": share_url,
        "x_intent_url": x_intent_url(text, share_url),
    }


@app.get("/api/arena/runs/{run_id}/events")
async def arena_run_events(run_id: str) -> StreamingResponse:
    get_arena_run(run_id)

    async def stream():
        cursor = 0
        while True:
            with ARENA_LOCK:
                run = ARENA_RUNS.get(run_id)
                if not run:
                    yield "event: error\ndata: {\"message\":\"arena run not found\"}\n\n"
                    return
                events = [event for event in run["events"] if event["id"] > cursor]
                status = run["status"]
            for event in events:
                cursor = max(cursor, int(event["id"]))
                yield f"id: {event['id']}\nevent: {event['type']}\ndata: {json.dumps(event)}\n\n"
            if status in {"completed", "failed"} and not events:
                return
            await asyncio.sleep(ARENA_EVENT_SLEEP)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
