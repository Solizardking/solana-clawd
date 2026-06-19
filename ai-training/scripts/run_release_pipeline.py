#!/usr/bin/env python3
"""Audit and optionally run the Core AI / trading-factory release pipeline.

This script intentionally never prints secret values. It can read simple
KEY=VALUE lines from .env files and passes those values only through child
process environments.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Iterable


AI_TRAINING_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = AI_TRAINING_DIR.parent

REQUIRED_CORE_AI_PATHS = [
    "core-ai/.agents",
    "core-ai/.clawd-plugin",
    "core-ai/.github",
    "core-ai/clawd-agents",
    "core-ai/clawd-code",
    "core-ai/clawd-grok",
    "core-ai/docs",
    "core-ai/helius-cli",
    "core-ai/helius-cursor",
    "core-ai/helius-mcp",
    "core-ai/helius-plugin",
    "core-ai/helius-skills",
    "core-ai/knowledge",
    "core-ai/mcp-server",
    "core-ai/scripts",
    "core-ai/v3",
    "core-ai/.gitignore",
    "core-ai/.npmrc",
    "core-ai/AGENTS.md",
    "core-ai/CLAUDE.md",
    "core-ai/CLAWD.md",
    "core-ai/CONTRIBUTING.md",
    "core-ai/glama.json",
    "core-ai/LICENSE",
    "core-ai/package.json",
    "core-ai/README.md",
    "core-ai/versions.json",
]

REQUIRED_AI_TRAINING_PATHS = [
    "configs",
    "dao",
    "data",
    "memory",
    "ollama",
    "outputs",
    "perps",
    "scripts",
    ".gitignore",
    "dataset_card.md",
    "model_card.md",
    "onchainai.md",
    "README.md",
    "requirements.txt",
    "solana1_yourgpt.jsonl",
    "trainingday.jsonl",
]

SECRET_KEYS = {
    "HF_TOKEN",
    "WANDB_API_KEY",
    "NVIDIA_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
}


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists() or not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        values[key] = value
    return values


def merged_env(env_files: Iterable[Path]) -> dict[str, str]:
    env = dict(os.environ)
    for path in env_files:
        for key, value in parse_env_file(path).items():
            env.setdefault(key, value)
    return env


def credential_presence(env: dict[str, str]) -> dict[str, bool]:
    return {key: bool(env.get(key)) for key in sorted(SECRET_KEYS)}


def print_credential_presence(env: dict[str, str]) -> None:
    print("[credentials]")
    for key, present in credential_presence(env).items():
        print(f"{key}_PRESENT={present}")


def run(cmd: list[str], *, cwd: Path = AI_TRAINING_DIR, env: dict[str, str], check: bool = True) -> int:
    printable = " ".join(shlex.quote(part) for part in cmd)
    print(f"\n$ {printable}")
    result = subprocess.run(cmd, cwd=str(cwd), env=env)
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, cmd)
    return result.returncode


def run_quiet(cmd: list[str], *, cwd: Path = AI_TRAINING_DIR, env: dict[str, str]) -> int:
    result = subprocess.run(cmd, cwd=str(cwd), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return result.returncode


def has_hf_auth(env: dict[str, str]) -> bool:
    if env.get("HF_TOKEN"):
        return True
    token_result = subprocess.run(
        ["hf", "auth", "token"],
        cwd=str(AI_TRAINING_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if token_result.returncode == 0:
        return True
    result = subprocess.run(
        ["hf", "auth", "whoami"],
        cwd=str(AI_TRAINING_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


def missing_required_paths() -> list[str]:
    missing: list[str] = []
    for rel in REQUIRED_CORE_AI_PATHS:
        path = REPO_ROOT / rel
        if not path.exists():
            missing.append(rel)
    for rel in REQUIRED_AI_TRAINING_PATHS:
        path = AI_TRAINING_DIR / rel
        if not path.exists():
            missing.append(f"ai-training/{rel}")
    return missing


def check_required_paths() -> bool:
    missing = missing_required_paths()
    print("[paths]")
    if missing:
        for rel in missing:
            print(f"FAIL {rel}")
    else:
        print("OK   required core-ai and ai-training paths exist")
    return not missing


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def file_info(path: Path) -> dict[str, object]:
    return {
        "path": str(path.relative_to(AI_TRAINING_DIR) if path.is_relative_to(AI_TRAINING_DIR) else path),
        "exists": path.exists(),
        "size_bytes": path.stat().st_size if path.exists() and path.is_file() else None,
    }


def collect_manifest_summary() -> dict[str, object]:
    core = load_json(AI_TRAINING_DIR / "data" / "core_ai_dataset_manifest.json")
    realtime = load_json(AI_TRAINING_DIR / "data" / "realtime_research_dataset_manifest.json")
    trading = load_json(AI_TRAINING_DIR / "data" / "nvidia_trading_factory_manifest.json")
    return {
        "core_ai": {
            "examples": (core.get("stats") or {}).get("total_examples"),
            "sources": ((core.get("stats") or {}).get("core_ai") or {}).get("files_used"),
            "repo_id": core.get("repo_id"),
        },
        "realtime_research": {
            "examples": (realtime.get("counts") or {}).get("examples"),
            "sources": (realtime.get("counts") or {}).get("sources"),
            "splits": realtime.get("splits"),
            "repo_id": realtime.get("repo_id"),
        },
        "trading_factory": {
            "examples": (trading.get("counts") or {}).get("examples"),
            "sources": (trading.get("counts") or {}).get("sources"),
            "splits": trading.get("splits"),
            "repo_id": trading.get("repo_id"),
        },
    }


def collect_bundle_summary() -> dict[str, object]:
    bundles = {}
    for rel in ["outputs/hf_release_bundle", "outputs/hf_release_bundle_all"]:
        path = AI_TRAINING_DIR / rel
        manifest = load_json(path / "bundle_manifest.json")
        bundles[rel] = {
            "exists": path.exists(),
            "manifest_exists": bool(manifest),
            "datasets": [item.get("name") for item in manifest.get("datasets", [])] if manifest else [],
            "file_count": sum(1 for item in path.rglob("*") if item.is_file()) if path.exists() else 0,
        }
    return bundles


def write_report(path: Path, env: dict[str, str], gates: dict[str, int | None]) -> None:
    report = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "repo_root": str(REPO_ROOT),
        "ai_training_dir": str(AI_TRAINING_DIR),
        "required_path_missing": missing_required_paths(),
        "credentials_present": credential_presence(env),
        "hf_auth_available": has_hf_auth(env),
        "manifests": collect_manifest_summary(),
        "release_files": {
            "trading_factory_jsonl": file_info(AI_TRAINING_DIR / "data" / "nvidia_trading_factory_sft.jsonl"),
            "trading_factory_train_parquet": file_info(AI_TRAINING_DIR / "data" / "nvidia_trading_factory_processed" / "train.parquet"),
            "trading_factory_eval_parquet": file_info(AI_TRAINING_DIR / "data" / "nvidia_trading_factory_processed" / "eval.parquet"),
            "trading_factory_test_parquet": file_info(AI_TRAINING_DIR / "data" / "nvidia_trading_factory_processed" / "test.parquet"),
        },
        "bundles": collect_bundle_summary(),
        "gates": gates,
        "remaining_blockers": [
            "Authenticate Hugging Face locally with HF_TOKEN or hf auth login before publishing staged datasets.",
            "Provide WANDB_API_KEY locally before launching W&B-tracked training jobs.",
            "Core AI LoRA release is not complete until adapter_config.json and adapter_model.safetensors are visible on Hugging Face.",
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\n[report]\nWrote {path}")


def main() -> int:
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        action="append",
        default=[],
        help="Optional simple KEY=VALUE env file. Values are never printed.",
    )
    parser.add_argument("--publish-trading-dataset", action="store_true")
    parser.add_argument("--launch-trading-training", action="store_true")
    parser.add_argument("--launch-core-recovery", action="store_true")
    parser.add_argument("--flavor", default="a100-large")
    parser.add_argument("--timeout", default="4h")
    parser.add_argument("--skip-dry-run", action="store_true")
    parser.add_argument("--report", default="outputs/release_audit.json")
    args = parser.parse_args()

    env_files = [REPO_ROOT / ".env", AI_TRAINING_DIR / ".env", *(Path(p).resolve() for p in args.env_file)]
    env = merged_env(env_files)

    ok = check_required_paths()
    print_credential_presence(env)

    gates: dict[str, int | None] = {
        "strategy_bundle_generated": None,
        "trading_factory_dataset_rebuilt": None,
        "trading_factory_release_bundle_built": None,
        "core_release_strict": run_quiet(["python3", "scripts/verify_core_ai_release.py", "--strict"], env=env),
        "trading_factory_hub_strict": None,
        "trading_factory_local_strict": None,
        "trading_factory_train_dry_run": None,
    }

    gates["strategy_bundle_generated"] = run(
        ["python3", "scripts/build_solana_trading_factory_strategies.py"],
        env=env,
    )
    gates["trading_factory_dataset_rebuilt"] = run(
        ["python3", "scripts/build_nvidia_trading_factory_dataset.py"],
        env=env,
    )
    run(
        [
            "python3",
            "scripts/prepare_dataset.py",
            "--input",
            "data/nvidia_trading_factory_sft.jsonl",
            "--output",
            "data/nvidia_trading_factory_processed",
            "--train-ratio",
            "0.9",
            "--eval-ratio",
            "0.05",
            "--seed",
            "42",
        ],
        env=env,
    )

    run(["python3", "scripts/verify_core_ai_release.py"], env=env, check=False)
    gates["trading_factory_local_strict"] = run(
        ["python3", "scripts/verify_trading_factory_release.py", "--local-only", "--strict"],
        env=env,
    )
    gates["trading_factory_release_bundle_built"] = run(
        ["python3", "scripts/build_hf_release_bundle.py"],
        env=env,
    )
    if not args.skip_dry_run:
        gates["trading_factory_train_dry_run"] = run(
            ["python3", "scripts/train_lora.py", "--config", "configs/nvidia_trading_factory_lora_config.yaml", "--dry-run"],
            env=env,
        )

    if args.publish_trading_dataset:
        if not has_hf_auth(env):
            write_report(AI_TRAINING_DIR / args.report, env, gates)
            print("ERROR: --publish-trading-dataset requires HF_TOKEN or a working hf auth login session.", file=sys.stderr)
            return 1
        run(["./scripts/publish_trading_factory_dataset.sh"], env=env)
        gates["trading_factory_hub_strict"] = run_quiet(
            ["python3", "scripts/verify_trading_factory_release.py", "--strict"],
            env=env,
        )

    if args.launch_trading_training:
        if not has_hf_auth(env):
            write_report(AI_TRAINING_DIR / args.report, env, gates)
            print("ERROR: --launch-trading-training requires HF_TOKEN or hf auth login.", file=sys.stderr)
            return 1
        if not env.get("WANDB_API_KEY"):
            print("WARNING: WANDB_API_KEY is not set; trading training will launch without W&B tracking.")
        run(["./scripts/publish_trading_factory_dataset.sh"], env=env)
        run(["python3", "scripts/verify_trading_factory_release.py", "--strict"], env=env)
        run(["./scripts/launch_trading_factory_hf_job.sh", args.flavor, args.timeout], env=env)

    if args.launch_core_recovery:
        if not has_hf_auth(env) or not env.get("WANDB_API_KEY"):
            write_report(AI_TRAINING_DIR / args.report, env, gates)
            print("ERROR: --launch-core-recovery requires HF_TOKEN or hf auth login, plus WANDB_API_KEY.", file=sys.stderr)
            return 1
        run(["./scripts/recover_core_ai_release.sh", args.flavor, args.timeout], env=env)

    write_report(AI_TRAINING_DIR / args.report, env, gates)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
