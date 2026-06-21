"""Shared paths and release helpers for the Solana transaction foundation model."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - checked by callers that load config.
    yaml = None  # type: ignore[assignment]


BLUEPRINT_DIR = Path(__file__).resolve().parent
AI_TRAINING_DIR = BLUEPRINT_DIR.parents[2]
REPO_ROOT = AI_TRAINING_DIR.parent
DATA_DIR = AI_TRAINING_DIR / "data"
OUTPUTS_DIR = AI_TRAINING_DIR / "outputs"
DEFAULT_CONFIG_PATH = AI_TRAINING_DIR / "nvidia" / "configs" / "solana_tx_foundation.yaml"

DEFAULT_OUTPUT_NAME = "solana-tx-foundation-1.5b"
DEFAULT_HUB_MODEL_ID = "solanaclawd/solana-tx-foundation-1.5b"
DEFAULT_HUB_DATASET_ID = "solanaclawd/solana-tx-foundation-cpt"
DEFAULT_CPT_DATA = DATA_DIR / "tx_foundation_cpt.jsonl"
DEFAULT_SFT_DATA = DATA_DIR / "solana_clawd_merged.jsonl"
DEFAULT_PROCESSED_DIR = DATA_DIR / "tx_foundation_cpt_processed"
DEFAULT_DATASET_CARD = DATA_DIR / "tx_foundation_cpt_dataset_card.md"
DEFAULT_DATASET_MANIFEST = DATA_DIR / "tx_foundation_cpt_manifest.json"
DEFAULT_EVAL_OUTPUT = DATA_DIR / "tx_foundation_eval.json"
DEFAULT_MODEL_OUTPUT = OUTPUTS_DIR / DEFAULT_OUTPUT_NAME
DEFAULT_MODEL_CARD = OUTPUTS_DIR / f"{DEFAULT_OUTPUT_NAME}-model-card.md"


DEFAULT_CONFIG: dict[str, Any] = {
    "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
    "output_name": DEFAULT_OUTPUT_NAME,
    "output_dir": f"outputs/{DEFAULT_OUTPUT_NAME}",
    "processed_dir": "data/tx_foundation_cpt_processed",
    "cpt_data": "data/tx_foundation_cpt.jsonl",
    "sft_data": "data/solana_clawd_merged.jsonl",
    "eval_output": "data/tx_foundation_eval.json",
    "max_seq_length": 2048,
    "cpt_epochs": 1,
    "sft_epochs": 1,
    "learning_rate_cpt": 2e-4,
    "learning_rate_sft": 1e-4,
    "warmup_steps_cpt": 10,
    "warmup_steps_sft": 50,
    "logging_steps_cpt": 10,
    "logging_steps_sft": 25,
    "save_steps_cpt": 200,
    "save_steps_sft": 500,
    "save_total_limit": 2,
    "batch_size": 2,
    "grad_accum": 8,
    "lora_r": 16,
    "lora_alpha": 32,
    "lora_dropout": 0.05,
    "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "gradient_checkpointing": True,
    "push_to_hub": False,
    "hub_model_id": DEFAULT_HUB_MODEL_ID,
    "hub_dataset_id": DEFAULT_HUB_DATASET_ID,
    "max_cpt_examples": None,
    "max_sft_examples": None,
    "cpt_max_steps": None,
    "sft_max_steps": None,
    "bf16": None,
}


def resolve_ai_training_path(value: str | Path, config_path: Path | None = None) -> Path:
    """Resolve config paths consistently from ai-training/ first."""
    path = Path(value).expanduser()
    if path.is_absolute():
        return path

    if path.parts and path.parts[0] in {"data", "outputs", "configs", "nvidia", "scripts", "model-kit"}:
        return AI_TRAINING_DIR / path

    if config_path is not None:
        candidate = config_path.parent / path
        if candidate.exists():
            return candidate

    return AI_TRAINING_DIR / path


def _flatten_nested_config(raw: dict[str, Any]) -> dict[str, Any]:
    """Accept both the local nested NeMo config and the unified flat pipeline config."""
    flat = dict(raw)
    model = raw.get("model")
    if isinstance(model, dict):
        if model.get("base"):
            flat["base_model"] = model["base"]
        if model.get("output_name"):
            flat["output_name"] = model["output_name"]

    training = raw.get("training")
    if isinstance(training, dict):
        mapping = {
            "num_epochs": "cpt_epochs",
            "learning_rate": "learning_rate_cpt",
            "batch_size": "batch_size",
            "gradient_accumulation_steps": "grad_accum",
            "max_seq_length": "max_seq_length",
        }
        for src, dst in mapping.items():
            if src in training:
                flat[dst] = training[src]

    data = raw.get("data")
    if isinstance(data, dict) and data.get("train"):
        flat["cpt_data"] = data["train"]

    inference = raw.get("inference")
    if isinstance(inference, dict) and inference.get("model_name"):
        flat.setdefault("hub_model_id", f"solanaclawd/{inference['model_name']}")

    return flat


def load_tx_config(path: str | Path | None = None) -> dict[str, Any]:
    """Load the transaction foundation config and normalize path values."""
    cfg = dict(DEFAULT_CONFIG)
    config_path = Path(path).expanduser() if path else DEFAULT_CONFIG_PATH
    if not config_path.is_absolute():
        config_path = resolve_ai_training_path(config_path)

    if config_path.exists():
        if yaml is None:
            raise RuntimeError("pyyaml is required to load transaction foundation configs")
        with config_path.open("r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"config must be a YAML mapping: {config_path}")
        cfg.update(_flatten_nested_config(loaded))

    cfg["config_path"] = str(config_path)
    cfg["cpt_data"] = str(resolve_ai_training_path(cfg["cpt_data"], config_path))
    cfg["sft_data"] = str(resolve_ai_training_path(cfg["sft_data"], config_path))
    cfg["output_dir"] = str(resolve_ai_training_path(cfg.get("output_dir") or f"outputs/{cfg['output_name']}", config_path))
    cfg["eval_output"] = str(resolve_ai_training_path(cfg.get("eval_output") or DEFAULT_EVAL_OUTPUT, config_path))
    for key in ("processed_dir", "dataset_manifest", "dataset_card", "nemo_data_path", "deep_solana_data"):
        if cfg.get(key):
            cfg[key] = str(resolve_ai_training_path(cfg[key], config_path))
    return cfg


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8") as f:
        return sum(1 for line in f if line.strip())


def sha256_file(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def expected_splits(total: int, train_ratio: float = 0.9, eval_ratio: float = 0.05) -> dict[str, int]:
    train = int(total * train_ratio)
    eval_count = int(total * eval_ratio)
    test = max(0, total - train - eval_count)
    return {"train": train, "eval": eval_count, "test": test}


def processed_files(processed_dir: Path = DEFAULT_PROCESSED_DIR) -> dict[str, str]:
    files: dict[str, str] = {}
    for split in ("train", "eval", "test"):
        parquet = processed_dir / f"{split}.parquet"
        if parquet.exists():
            files[split] = str(parquet)
    return files


def build_dataset_manifest(
    *,
    dataset_path: Path = DEFAULT_CPT_DATA,
    processed_dir: Path = DEFAULT_PROCESSED_DIR,
    config_path: Path = DEFAULT_CONFIG_PATH,
    eval_path: Path = DEFAULT_EVAL_OUTPUT,
    model_path: Path = DEFAULT_MODEL_OUTPUT / "sft",
    repo_id: str = DEFAULT_HUB_DATASET_ID,
    training_model: str = DEFAULT_HUB_MODEL_ID,
) -> dict[str, Any]:
    total = count_jsonl(dataset_path)
    manifest = {
        "name": "Solana Transaction Foundation CPT",
        "repo_id": repo_id,
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "source_jsonl": str(dataset_path),
        "source_sha256": sha256_file(dataset_path),
        "num_examples": total,
        "splits": expected_splits(total),
        "processed_dir": str(processed_dir),
        "processed_files": processed_files(processed_dir),
        "schema": {"text": "NeMo CPT record, one Solana transaction context per row"},
        "config": str(config_path),
        "training_model": training_model,
        "local_model_path": str(model_path),
        "local_model_present": model_path.exists(),
        "eval_output": str(eval_path),
        "eval_present": eval_path.exists(),
        "safety": {
            "secrets_required": ["HF_TOKEN only for Hub upload", "NVIDIA_API_KEY only for NIM/NVCF calls"],
            "private_key_policy": "Never store wallet keys, API tokens, or Google ADC files in dataset artifacts.",
        },
    }
    return manifest


def write_dataset_manifest(path: Path = DEFAULT_DATASET_MANIFEST, **kwargs: Any) -> dict[str, Any]:
    manifest = build_dataset_manifest(**kwargs)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest
