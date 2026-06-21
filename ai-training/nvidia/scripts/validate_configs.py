#!/usr/bin/env python3
"""Validate NVIDIA YAML configs for structure and secret-safe release use."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore[assignment]


BASE_DIR = Path(__file__).resolve().parents[2]
CONFIG_DIR = BASE_DIR / "nvidia" / "configs"

CONFIG_FILES = [
    "aiq_config.yaml",
    "nemo_clawd_factory.yaml",
    "nim_config.yaml",
    "pretrain_financial_decoder.yaml",
    "pretrain_solana_decoder.yaml",
    "solana_tx_foundation.yaml",
]

SECRET_PATTERNS = {
    "google_oauth_secret_file": re.compile("client" + r"_secret_\d+[-\w]+\.apps\.googleusercontent\.com\.json"),
    "google_adc_path": re.compile(r"\.config/gcloud/application_default_credentials\.json"),
    "google_oauth_token": re.compile(r"\bya29\.[A-Za-z0-9_-]{20,}"),
    "nvidia_api_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "private_key": re.compile("-----" + "BEGIN " + r"(?:RSA |EC |OPENSSH |)?" + "PRIVATE " + "KEY-----"),
    "wandb_key": re.compile(r"\bwandb_v1_[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
}


def load_yaml(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("pyyaml is required to validate NVIDIA configs")
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} must be a YAML mapping")
    return data


def scan_secrets(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return [name for name, pattern in SECRET_PATTERNS.items() if pattern.search(text)]


def require(condition: bool, findings: list[str], message: str) -> None:
    if not condition:
        findings.append(message)


def validate_aiq(cfg: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    aiq = cfg.get("aiq", {})
    require(isinstance(aiq, dict), findings, "aiq_config.yaml: missing aiq mapping")
    tools = aiq.get("tools", {}) if isinstance(aiq, dict) else {}
    require({"vulcan_market", "vulcan_signal", "nim_inference", "portfolio_risk"}.issubset(tools), findings, "aiq_config.yaml: required tools missing")
    thresholds = aiq.get("model_eval", {}).get("thresholds", {})
    require(float(thresholds.get("accuracy", 0)) >= 0.5, findings, "aiq_config.yaml: accuracy threshold too low")
    require(float(thresholds.get("refusal_rate", 0)) >= 1.0, findings, "aiq_config.yaml: refusal_rate must be 1.0")
    security = aiq.get("security", {})
    require(security.get("persist_secrets") is False, findings, "aiq_config.yaml: persist_secrets must be false")
    return findings


def validate_factory(cfg: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    require(cfg.get("default_mode") in {"observer", "paper"}, findings, "nemo_clawd_factory.yaml: default_mode must be observer or paper")
    trust = cfg.get("trust", {})
    require(trust.get("live_mode_generated") is False, findings, "nemo_clawd_factory.yaml: live_mode_generated must be false")
    policy = cfg.get("nemo_clawd", {}).get("network_policy", {})
    require(policy.get("default") == "deny", findings, "nemo_clawd_factory.yaml: network policy must default deny")
    require(bool(policy.get("allowed_egress")), findings, "nemo_clawd_factory.yaml: allowed_egress required")
    safety = cfg.get("safety", {})
    require(safety.get("secrets", {}).get("persist_to_files") is False, findings, "nemo_clawd_factory.yaml: secrets.persist_to_files must be false")
    return findings


def validate_nim(cfg: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    nim = cfg.get("nim", {})
    require(nim.get("api_key_var") == "NVIDIA_API_KEY", findings, "nim_config.yaml: NVIDIA_API_KEY env var required")
    models = cfg.get("models", {})
    for key in ("foundation", "ultra", "reasoning_teacher", "embedding", "reranker", "student", "tx_foundation"):
        require(bool(models.get(key)), findings, f"nim_config.yaml: models.{key} missing")
    priority = cfg.get("routing", {}).get("priority", [])
    require(priority[:2] == ["nim_api", "hf_inference"], findings, "nim_config.yaml: routing should start with nim_api then hf_inference")
    security = cfg.get("security", {})
    require(security.get("secrets_source") == "environment", findings, "nim_config.yaml: secrets_source must be environment")
    return findings


def validate_decoder(name: str, cfg: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    model_cfg = cfg.get("model", {}).get("config", {})
    dataset = cfg.get("dataset", {})
    checkpoint = cfg.get("checkpoint", {})
    seq_length = int(dataset.get("seq_length", 0) or 0)
    max_pos = int(model_cfg.get("max_position_embeddings", 0) or 0)
    require(seq_length > 0, findings, f"{name}: dataset.seq_length must be positive")
    require(max_pos >= seq_length, findings, f"{name}: max_position_embeddings must cover dataset.seq_length")
    require(checkpoint.get("model_save_format") == "safetensors", findings, f"{name}: checkpoint format must be safetensors")
    require(str(checkpoint.get("checkpoint_dir", "")).startswith("outputs/"), findings, f"{name}: checkpoint_dir must stay under outputs/")
    return findings


def validate_tx_foundation(cfg: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    for key in ("base_model", "output_name", "output_dir", "cpt_data", "sft_data", "hub_model_id", "hub_dataset_id"):
        require(bool(cfg.get(key)), findings, f"solana_tx_foundation.yaml: {key} missing")
    require(cfg.get("push_to_hub") is False, findings, "solana_tx_foundation.yaml: push_to_hub must default false")
    require(int(cfg.get("batch_size", 0)) > 0, findings, "solana_tx_foundation.yaml: batch_size must be positive")
    require(int(cfg.get("grad_accum", 0)) > 0, findings, "solana_tx_foundation.yaml: grad_accum must be positive")
    require(float(cfg.get("lora_dropout", 1.0)) <= 0.1, findings, "solana_tx_foundation.yaml: lora_dropout should be <= 0.1")
    require(bool(cfg.get("target_modules")), findings, "solana_tx_foundation.yaml: target_modules required")
    security = cfg.get("security", {})
    require(security.get("persist_secrets") is False, findings, "solana_tx_foundation.yaml: persist_secrets must be false")
    release_gate = cfg.get("release_gate", {})
    require(release_gate.get("block_live_execution") is True, findings, "solana_tx_foundation.yaml: block_live_execution must be true")
    return findings


def validate_all_configs(base_dir: Path = BASE_DIR) -> list[str]:
    findings: list[str] = []
    config_dir = base_dir / "nvidia" / "configs"
    for name in CONFIG_FILES:
        path = config_dir / name
        if not path.exists():
            findings.append(f"{name}: missing")
            continue
        secret_hits = scan_secrets(path)
        for hit in secret_hits:
            findings.append(f"{name}: secret-like pattern {hit}")
        try:
            cfg = load_yaml(path)
        except Exception as exc:
            findings.append(f"{name}: {exc}")
            continue
        if name == "aiq_config.yaml":
            findings.extend(validate_aiq(cfg))
        elif name == "nemo_clawd_factory.yaml":
            findings.extend(validate_factory(cfg))
        elif name == "nim_config.yaml":
            findings.extend(validate_nim(cfg))
        elif name in {"pretrain_financial_decoder.yaml", "pretrain_solana_decoder.yaml"}:
            findings.extend(validate_decoder(name, cfg))
        elif name == "solana_tx_foundation.yaml":
            findings.extend(validate_tx_foundation(cfg))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()
    findings = validate_all_configs()
    if findings:
        print("[configs] FAIL")
        for finding in findings:
            print(f"FAIL {finding}")
        return 1 if args.strict else 0
    print(f"[configs] OK {len(CONFIG_FILES)} NVIDIA configs validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
