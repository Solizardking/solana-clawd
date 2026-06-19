#!/usr/bin/env python3
"""Audit and optionally run the Core AI / trading-factory release pipeline.

This script intentionally never prints secret values. It can read simple
KEY=VALUE lines from .env files and passes those values only through child
process environments.
"""
from __future__ import annotations

import argparse
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


def print_credential_presence(env: dict[str, str]) -> None:
    print("[credentials]")
    for key in sorted(SECRET_KEYS):
        print(f"{key}_PRESENT={bool(env.get(key))}")


def run(cmd: list[str], *, cwd: Path = AI_TRAINING_DIR, env: dict[str, str], check: bool = True) -> int:
    printable = " ".join(shlex.quote(part) for part in cmd)
    print(f"\n$ {printable}")
    result = subprocess.run(cmd, cwd=str(cwd), env=env)
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, cmd)
    return result.returncode


def check_required_paths() -> bool:
    ok = True
    print("[paths]")
    for rel in REQUIRED_CORE_AI_PATHS:
        path = REPO_ROOT / rel
        if not path.exists():
            ok = False
            print(f"FAIL {rel}")
    for rel in REQUIRED_AI_TRAINING_PATHS:
        path = AI_TRAINING_DIR / rel
        if not path.exists():
            ok = False
            print(f"FAIL ai-training/{rel}")
    if ok:
        print("OK   required core-ai and ai-training paths exist")
    return ok


def main() -> int:
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
    args = parser.parse_args()

    env_files = [REPO_ROOT / ".env", AI_TRAINING_DIR / ".env", *(Path(p).resolve() for p in args.env_file)]
    env = merged_env(env_files)

    ok = check_required_paths()
    print_credential_presence(env)

    run(["python3", "scripts/verify_core_ai_release.py"], env=env, check=False)
    run(["python3", "scripts/verify_trading_factory_release.py", "--local-only", "--strict"], env=env)
    if not args.skip_dry_run:
        run(["python3", "scripts/train_lora.py", "--config", "configs/nvidia_trading_factory_lora_config.yaml", "--dry-run"], env=env)

    if args.publish_trading_dataset:
        if not env.get("HF_TOKEN"):
            print("ERROR: --publish-trading-dataset requires HF_TOKEN or a working hf auth login session.", file=sys.stderr)
            return 1
        run(["./scripts/publish_trading_factory_dataset.sh"], env=env)

    if args.launch_trading_training:
        if not env.get("HF_TOKEN") or not env.get("WANDB_API_KEY"):
            print("ERROR: --launch-trading-training requires HF_TOKEN and WANDB_API_KEY.", file=sys.stderr)
            return 1
        run(["python3", "scripts/verify_trading_factory_release.py", "--strict"], env=env)
        run(["./scripts/launch_trading_factory_hf_job.sh", args.flavor, args.timeout], env=env)

    if args.launch_core_recovery:
        if not env.get("HF_TOKEN") or not env.get("WANDB_API_KEY"):
            print("ERROR: --launch-core-recovery requires HF_TOKEN and WANDB_API_KEY.", file=sys.stderr)
            return 1
        run(["./scripts/recover_core_ai_release.sh", args.flavor, args.timeout], env=env)

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
