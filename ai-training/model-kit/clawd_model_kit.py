#!/usr/bin/env python3
"""Terminal orchestration for the Solana AI Model Kit.

The CLI is intentionally a thin wrapper around the existing ai-training scripts.
It makes the safe local path easy, and it keeps publishing, remote training,
Ollama push, and live registry writes behind explicit flags.
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable


MODEL_KIT_DIR = Path(__file__).resolve().parent
AI_TRAINING_DIR = MODEL_KIT_DIR.parent
REPO_ROOT = AI_TRAINING_DIR.parent
PYTHON = os.environ.get("PYTHON", sys.executable or "python3")

DEFAULT_DATASET_REPO = "solanaclawd/solana-clawd-realtime-research-instruct"
DEFAULT_DATASET_NAME = "Solana Clawd Model Kit Instruct"
DEFAULT_OUTPUT_PREFIX = "data/model_kit/model_kit"
DEFAULT_ENDPOINT = "https://clawd-box-router.fly.dev/v1"
DEFAULT_REGISTRY = "https://onchain.x402.wtf"
DEFAULT_PERPS_MANIFEST = "data/model_kit/perps_tool_manifest.json"

LANES = {
    "custom": {
        "config": "configs/core_ai_lora_config.yaml",
        "dataset_repo": DEFAULT_DATASET_REPO,
        "hub_model_id": "solanaclawd/solana-clawd-custom-lora",
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "dataset_size": "0",
    },
    "core-ai": {
        "config": "configs/core_ai_lora_config.yaml",
        "dataset_repo": "solanaclawd/solana-clawd-core-ai-instruct",
        "hub_model_id": "solanaclawd/solana-clawd-core-ai-1.5b-lora",
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "dataset_size": "35173",
    },
    "trading-factory": {
        "config": "configs/nvidia_trading_factory_lora_config.yaml",
        "dataset_repo": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
        "hub_model_id": "solanaclawd/solana-nvidia-trading-factory-8b-lora",
        "base_model": "NousResearch/Hermes-3-Llama-3.1-8B",
        "dataset_size": "142",
    },
    "perps": {
        "config": "configs/nvidia_trading_factory_lora_config.yaml",
        "dataset_repo": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
        "hub_model_id": "solanaclawd/solana-clawd-perps-tools-lora",
        "base_model": "NousResearch/Hermes-3-Llama-3.1-8B",
        "dataset_size": "195",
    },
    "tx-foundation": {
        "config": "nvidia/configs/solana_tx_foundation.yaml",
        "dataset_repo": "solanaclawd/solana-tx-foundation-cpt",
        "hub_model_id": "solanaclawd/solana-tx-foundation-1.5b",
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "dataset_size": "19542",
    },
}

SECRET_PATTERNS = {
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----"),
    "openai_key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b"),
    "nvidia_key": re.compile(r"\bnvapi-[A-Za-z0-9_-]{20,}\b"),
    "hf_token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    "github_token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    "wandb_key": re.compile(r"\bwandb_[A-Za-z0-9_-]{30,}\b"),
    "aws_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "generic_secret": re.compile(
        r"\b(?:api[_-]?key|private[_-]?key|secret|token)\b[\"'\s:=]{1,8}"
        r"[A-Za-z0-9_./+=-]{28,}",
        re.IGNORECASE,
    ),
}

TEXT_SUFFIXES = {
    ".csv",
    ".json",
    ".jsonl",
    ".md",
    ".py",
    ".sh",
    ".toml",
    ".txt",
    ".yaml",
    ".yml",
}


class KitError(RuntimeError):
    pass


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path)


def quote_cmd(cmd: Iterable[str | Path]) -> str:
    return " ".join(shlex.quote(str(part)) for part in cmd)


def info(message: str) -> None:
    print(f"[model-kit] {message}")


def require_yes(args: argparse.Namespace, action: str) -> None:
    if getattr(args, "dry_run", False):
        return
    if not getattr(args, "yes", False):
        raise KitError(f"{action} requires --yes. Re-run with --yes after reviewing the command.")


def run(
    cmd: list[str | Path],
    *,
    cwd: Path = AI_TRAINING_DIR,
    dry_run: bool = False,
    check: bool = True,
) -> int:
    printable = quote_cmd(cmd)
    print(f"$ {printable}")
    if dry_run:
        return 0
    proc = subprocess.run([str(part) for part in cmd], cwd=str(cwd), check=False)
    if check and proc.returncode != 0:
        raise KitError(f"command failed ({proc.returncode}): {printable}")
    return proc.returncode


def command_available(command: str) -> bool:
    return shutil.which(command) is not None


def env_present(name: str) -> bool:
    return bool(os.environ.get(name))


def hf_auth_available() -> bool:
    if env_present("HF_TOKEN"):
        return True
    if not command_available("hf"):
        return False
    return subprocess.run(
        ["hf", "auth", "whoami"],
        cwd=str(AI_TRAINING_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def output_paths(prefix: str) -> dict[str, str]:
    prefix_path = Path(prefix)
    return {
        "jsonl": f"{prefix_path}_sft.jsonl",
        "processed": f"{prefix_path}_processed",
        "manifest": f"{prefix_path}_manifest.json",
        "card": f"{prefix_path}_dataset_card.md",
    }


def resolve_existing_or_intended_path(raw: str) -> str:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return str(path)
    repo_candidate = REPO_ROOT / path
    ai_candidate = AI_TRAINING_DIR / path
    if str(path).startswith("ai-training/"):
        return str(repo_candidate)
    if ai_candidate.exists():
        return str(ai_candidate)
    if repo_candidate.exists():
        return str(repo_candidate)
    return raw


def resolve_manifest_path(raw: str) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    ai_candidate = AI_TRAINING_DIR / path
    repo_candidate = REPO_ROOT / path
    if ai_candidate.exists() or raw.startswith(("data/", "outputs/", "configs/")):
        return ai_candidate
    return repo_candidate


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dataset_size_from_manifest(path: Path, fallback: str = "0") -> str:
    manifest = load_manifest(path)
    counts = manifest.get("counts") or {}
    if counts.get("examples") is not None:
        return str(counts["examples"])
    stats = manifest.get("stats") or {}
    if stats.get("total_examples") is not None:
        return str(stats["total_examples"])
    return fallback


def iter_scan_files(paths: Iterable[Path]) -> Iterable[Path]:
    skip_dirs = {".git", ".venv", "__pycache__", "node_modules", ".next", "target", "build"}
    for path in paths:
        if not path.exists():
            continue
        if path.is_file():
            if path.suffix.lower() in TEXT_SUFFIXES:
                yield path
            continue
        for item in path.rglob("*"):
            if any(part in skip_dirs for part in item.parts):
                continue
            if item.is_file() and item.suffix.lower() in TEXT_SUFFIXES:
                yield item


def scan_for_secrets(paths: Iterable[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in iter_scan_files(paths):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for name, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                findings.append((rel(path), name))
    return findings


def fail_on_secret_findings(paths: Iterable[Path]) -> None:
    findings = scan_for_secrets(paths)
    if findings:
        details = "\n".join(f"  - {path}: {kind}" for path, kind in findings[:20])
        raise KitError(f"secret-like patterns found:\n{details}\nRotate any real credential before publishing.")


def load_perps_functions_module():
    module_path = AI_TRAINING_DIR / "perps" / "functions.py"
    spec = importlib.util.spec_from_file_location("clawd_perps_functions", module_path)
    if spec is None or spec.loader is None:
        raise KitError(f"could not load perps functions module: {rel(module_path)}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def perps_tool_catalog() -> list[dict[str, Any]]:
    module = load_perps_functions_module()
    return list(module.get_openai_tools())


def perps_source_files() -> list[Path]:
    return [
        AI_TRAINING_DIR / "perps" / "README.md",
        AI_TRAINING_DIR / "perps" / "functions.py",
        AI_TRAINING_DIR / "perps" / "functioncall.py",
        AI_TRAINING_DIR / "perps" / "nvidia_perps.py",
        AI_TRAINING_DIR / "perps" / "prompter.py",
        AI_TRAINING_DIR / "perps" / "schema.py",
    ]


def build_perps_manifest(market: str, mode: str, threshold: float) -> dict[str, Any]:
    tools = perps_tool_catalog()
    return {
        "name": "Solana Clawd Model Kit Perps Tools",
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "tool_count": len(tools),
        "tools": [
            {
                "name": tool["function"]["name"],
                "description": tool["function"].get("description", ""),
                "parameters": tool["function"].get("parameters", {}),
            }
            for tool in tools
        ],
        "source_files": {
            path.name: rel(path)
            for path in perps_source_files()
        },
        "handoff": {
            "script": "perps/nvidia_perps.py",
            "default_market": market,
            "default_mode": mode,
            "threshold": threshold,
            "output": "data/perps/nvidia_perps_handoff.json",
        },
        "agent": {
            "script": "perps/functioncall.py",
            "default_model": "NousResearch/Hermes-3-Llama-3.1-8B",
            "local_adapter_env": "HERMES_ADAPTER",
            "router_token_env": "HF_TOKEN",
        },
        "safety": {
            "default_modes": ["observer", "paper"],
            "live_trading_env": "LIVE_TRADING",
            "live_trading_default": False,
            "wallet_keypair_env": "AGENT_WALLET_KEYPAIR",
            "private_key_policy": "never write or read private keys through model-kit manifests",
            "side_effect_gate": "--allow-live-env --yes is required if LIVE_TRADING=true is present",
        },
    }


def resolve_ai_path(raw: str | Path) -> Path:
    path = Path(raw).expanduser()
    if path.is_absolute():
        return path
    return AI_TRAINING_DIR / path


def guard_perps_live_env(args: argparse.Namespace) -> None:
    live_env = os.environ.get("LIVE_TRADING", "false").lower() == "true"
    if not live_env:
        return
    if not getattr(args, "allow_live_env", False):
        raise KitError("Refusing perps command while LIVE_TRADING=true. Unset LIVE_TRADING or pass --allow-live-env --yes after review.")
    require_yes(args, "perps command with LIVE_TRADING=true")


def lane_defaults(lane: str) -> dict[str, str]:
    return dict(LANES[lane])


def build_ingest_command(args: argparse.Namespace) -> tuple[list[str | Path], dict[str, str]]:
    paths = output_paths(args.output_prefix)
    inputs = [resolve_existing_or_intended_path(item) for item in list(args.inputs or [])]
    if not inputs and not args.watch_dir:
        inputs = ["data/incoming"]

    cmd: list[str | Path] = [
        PYTHON,
        "scripts/realtime_dataset_ingest.py",
        "--output-jsonl",
        paths["jsonl"],
        "--output-dir",
        paths["processed"],
        "--manifest",
        paths["manifest"],
        "--dataset-card",
        paths["card"],
        "--repo-id",
        args.repo_id,
        "--dataset-name",
        args.dataset_name,
        "--pdf-extractor",
        args.pdf_extractor,
        "--chunk-chars",
        str(args.chunk_chars),
        "--chunk-overlap",
        str(args.chunk_overlap),
    ]
    if inputs:
        cmd.append("--input")
        cmd.extend(inputs)
    for watch_dir in args.watch_dir or []:
        cmd.extend(["--watch-dir", resolve_existing_or_intended_path(watch_dir)])
    if args.private:
        cmd.append("--private")
    if args.push:
        cmd.append("--push")
    if args.save_arrow_dataset:
        cmd.append("--save-arrow-dataset")
    return cmd, paths


def cmd_doctor(args: argparse.Namespace) -> int:
    perps_tools_count = 0
    try:
        perps_tools_count = len(perps_tool_catalog())
    except Exception:
        perps_tools_count = 0
    checks = {
        "repo_root": REPO_ROOT.exists(),
        "ai_training": (AI_TRAINING_DIR / "scripts" / "realtime_dataset_ingest.py").exists(),
        "python": command_available("python3") or bool(sys.executable),
        "git": command_available("git"),
        "hf_cli": command_available("hf"),
        "hf_auth": hf_auth_available(),
        "ollama": command_available("ollama"),
        "nvidia_key_present": env_present("NVIDIA_API_KEY"),
        "wandb_key_present": env_present("WANDB_API_KEY"),
        "hf_token_present": env_present("HF_TOKEN"),
        "model_kit_frontend": (MODEL_KIT_DIR / "frontend" / "index.html").exists(),
        "onchain_docs": (AI_TRAINING_DIR / "onchain.md").exists(),
        "perps_functions": (AI_TRAINING_DIR / "perps" / "functions.py").exists(),
        "perps_agent": (AI_TRAINING_DIR / "perps" / "functioncall.py").exists(),
        "perps_tool_count": perps_tools_count >= 13,
        "perps_handoff": (AI_TRAINING_DIR / "data" / "perps" / "nvidia_perps_handoff.json").exists(),
    }
    if args.json:
        print(json.dumps(checks, indent=2))
    else:
        for name, ok in checks.items():
            print(f"{name:24} {'OK' if ok else 'missing'}")
    if args.strict and not all(checks[k] for k in ["repo_root", "ai_training", "python", "git"]):
        return 1
    return 0


def cmd_init(args: argparse.Namespace) -> int:
    dirs = [
        AI_TRAINING_DIR / "data" / "incoming",
        AI_TRAINING_DIR / "data" / "model_kit",
        AI_TRAINING_DIR / "data" / "perps",
        AI_TRAINING_DIR / "outputs" / "model_kit",
    ]
    for path in dirs:
        info(f"ensure {rel(path)}")
        if not args.dry_run:
            path.mkdir(parents=True, exist_ok=True)
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    if args.push:
        require_yes(args, "Hugging Face dataset upload")
    cmd, paths = build_ingest_command(args)
    run(cmd, dry_run=args.dry_run)
    if not args.dry_run:
        info(f"dataset jsonl: {paths['jsonl']}")
        info(f"manifest: {paths['manifest']}")
        info(f"dataset card: {paths['card']}")
    return 0


def cmd_prepare(args: argparse.Namespace) -> int:
    cmd: list[str | Path] = [
        PYTHON,
        "scripts/prepare_dataset.py",
        "--input",
        resolve_existing_or_intended_path(args.input),
        "--output",
        resolve_existing_or_intended_path(args.output),
        "--train-ratio",
        str(args.train_ratio),
        "--eval-ratio",
        str(args.eval_ratio),
        "--seed",
        str(args.seed),
    ]
    if args.push:
        require_yes(args, "Hugging Face dataset upload")
        cmd.extend(["--push", "--repo-id", args.repo_id])
        if args.private:
            cmd.append("--private")
    run(cmd, dry_run=args.dry_run)
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    if args.full_release:
        cmd = [PYTHON, "scripts/run_release_pipeline.py", "--report", args.report]
        if args.skip_dry_run:
            cmd.append("--skip-dry-run")
        return run(cmd, dry_run=args.dry_run, check=False)

    paths = [AI_TRAINING_DIR / "model-kit"]
    if args.path:
        paths.extend(Path(p) for p in args.path)
    findings = scan_for_secrets(paths)
    if findings:
        for path, kind in findings:
            print(f"secret-scan FAIL {path} {kind}")
        return 1
    print("secret-scan OK")
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    lane = lane_defaults(args.lane)
    if args.lane == "tx-foundation":
        if args.remote:
            require_yes(args, "remote transaction foundation HF Jobs training")
            return run(["bash", "scripts/launch_transaction_foundation_hf_job.sh", args.flavor, args.timeout], dry_run=args.dry_run)
        if args.push:
            require_yes(args, "transaction foundation model push")
        cmd: list[str | Path] = [
            PYTHON,
            "nvidia/blueprints/transaction-foundation-model/pipeline.py",
            "--config",
            args.config or lane["config"],
            "--stages",
            "cpt",
            "sft",
        ]
        if args.train_dry_run:
            cmd.append("--dry-run")
        rc = run(cmd, dry_run=args.dry_run)
        if args.push:
            return run(
                [
                    PYTHON,
                    "nvidia/blueprints/transaction-foundation-model/pipeline.py",
                    "--config",
                    args.config or lane["config"],
                    "--stages",
                    "push",
                ],
                dry_run=args.dry_run,
            )
        return rc

    if args.remote:
        require_yes(args, "remote Hugging Face Jobs training")
        script = "scripts/launch_trading_factory_hf_job.sh" if args.lane == "trading-factory" else "scripts/launch_core_ai_hf_job.sh"
        return run(["bash", script, args.flavor, args.timeout], dry_run=args.dry_run)

    if args.push:
        require_yes(args, "adapter push to Hugging Face")

    config = resolve_existing_or_intended_path(args.config or lane["config"])
    cmd: list[str | Path] = [PYTHON, "scripts/train_lora.py", "--config", config]
    if args.dataset_repo:
        cmd.extend(["--dataset-repo", args.dataset_repo])
    if args.dataset_path:
        cmd.extend(["--dataset-path", resolve_existing_or_intended_path(args.dataset_path)])
    if args.base_model:
        cmd.extend(["--base-model", args.base_model])
    if args.output_dir:
        cmd.extend(["--output-dir", resolve_existing_or_intended_path(args.output_dir)])
    if args.hub_model_id:
        cmd.extend(["--hub-model-id", args.hub_model_id])
    if args.num_epochs is not None:
        cmd.extend(["--num-epochs", str(args.num_epochs)])
    if args.lr is not None:
        cmd.extend(["--lr", str(args.lr)])
    if args.wandb:
        cmd.append("--wandb")
    if args.no_eval:
        cmd.append("--no-eval")
    if args.no_checkpoints:
        cmd.append("--no-checkpoints")
    if args.no_quant:
        cmd.append("--no-quant")
    if args.push:
        cmd.append("--push")
    else:
        cmd.append("--no-push")
    if args.train_dry_run:
        cmd.append("--dry-run")
    return run(cmd, dry_run=args.dry_run)


def cmd_upload(args: argparse.Namespace) -> int:
    if args.bundle:
        cmd: list[str | Path] = [PYTHON, "scripts/build_hf_release_bundle.py", "--output", args.output]
        for dataset in args.dataset or []:
            cmd.extend(["--dataset", dataset])
        if args.include_published:
            cmd.append("--include-published")
        run(cmd, dry_run=args.dry_run)
        return 0

    require_yes(args, "Hugging Face upload")
    upload_path = resolve_existing_or_intended_path(args.path)
    fail_on_secret_findings([Path(upload_path)])
    cmd = [
        "hf",
        "upload",
        args.repo_id,
        upload_path,
        args.path_in_repo,
        "--type",
        args.repo_type,
        "--commit-message",
        args.commit_message,
    ]
    if args.private:
        cmd.append("--private")
    return run(cmd, dry_run=args.dry_run)


def cmd_register(args: argparse.Namespace) -> int:
    lane = lane_defaults(args.lane)
    if args.live:
        require_yes(args, "live registry POST")
    manifest = resolve_manifest_path(args.manifest) if args.manifest else AI_TRAINING_DIR / output_paths(args.output_prefix)["manifest"]
    dataset_size = args.dataset_size or dataset_size_from_manifest(manifest, lane["dataset_size"])
    cmd: list[str | Path] = [
        "bash",
        "dao/register_model.sh",
        "--hf-model",
        args.hf_model or lane["hub_model_id"],
        "--endpoint",
        args.endpoint,
        "--eval-accuracy",
        args.eval_accuracy,
        "--dataset-size",
        dataset_size,
        "--cluster",
        args.cluster,
    ]
    if args.model_hash:
        cmd.extend(["--model-hash", args.model_hash])
    if not args.live:
        cmd.append("--dry-run")
    if args.onchain:
        require_yes(args, "onchain Solana transaction")
        cmd.append("--onchain")
    return run(cmd, dry_run=args.dry_run)


def cmd_ollama(args: argparse.Namespace) -> int:
    require_yes(args, "Ollama build/push")
    cmd = ["bash", "ollama/build_and_push.sh", args.mode, args.target]
    return run(cmd, dry_run=args.dry_run)


def cmd_nvidia(args: argparse.Namespace) -> int:
    if args.action == "verify":
        cmd = [PYTHON, "nvidia/scripts/verify_nvidia.py"]
        if args.strict:
            cmd.append("--strict")
        return run(cmd, dry_run=args.dry_run)
    if args.action == "aiq":
        cmd = [PYTHON, "nvidia/blueprints/aiq/agent.py"]
        if args.strict:
            cmd.append("--strict")
        return run(cmd, dry_run=args.dry_run)
    if args.action == "strategies":
        run([PYTHON, "scripts/build_solana_trading_factory_strategies.py"], dry_run=args.dry_run)
        return run([PYTHON, "nvidia/integration/nemo_clawd_agent.py", "--mode", "paper"], dry_run=args.dry_run)
    if args.action == "tx-foundation":
        cmd = [PYTHON, "nvidia/blueprints/transaction-foundation-model/post_train.py"]
        if args.strict:
            cmd.extend(["--bundle", "--register"])
        return run(cmd, dry_run=args.dry_run)
    if args.action == "tx-preflight":
        cmd = [PYTHON, "nvidia/blueprints/transaction-foundation-model/preflight.py"]
        if args.strict:
            cmd.append("--run-smoke-dry-run")
        return run(cmd, dry_run=args.dry_run)
    raise KitError(f"unknown NVIDIA action: {args.action}")


def cmd_perps(args: argparse.Namespace) -> int:
    if args.action in {"agent", "handoff"}:
        guard_perps_live_env(args)

    if args.action in {"tools", "manifest"}:
        manifest = build_perps_manifest(args.market, args.mode, args.threshold)
        if args.write or args.action == "manifest":
            output = resolve_ai_path(args.output)
            if not args.dry_run:
                write_json(output, manifest)
            info(f"perps manifest: {rel(output)}")
        if args.json or args.action == "manifest":
            print(json.dumps(manifest, indent=2, sort_keys=True))
        else:
            print(f"Perps tools: {manifest['tool_count']}")
            for tool in manifest["tools"]:
                print(f"- {tool['name']}: {tool['description'][:96]}")
        return 0

    if args.action == "handoff":
        cmd: list[str | Path] = [
            PYTHON,
            "perps/nvidia_perps.py",
            "--market",
            args.market,
            "--mode",
            args.mode,
            "--threshold",
            str(args.threshold),
            "--output",
            args.handoff_output,
        ]
        if args.tick:
            cmd.append("--tick")
        return run(cmd, dry_run=args.dry_run)

    if args.action == "agent":
        cmd = [
            PYTHON,
            "perps/functioncall.py",
            "--query",
            args.query,
            "--max-depth",
            str(args.max_depth),
        ]
        if args.wallet:
            cmd.extend(["--wallet", args.wallet])
        if args.local:
            cmd.append("--local")
        if args.adapter:
            cmd.extend(["--adapter", args.adapter])
        if args.goap:
            cmd.append("--goap")
        if args.verbose:
            cmd.append("--verbose")
        return run(cmd, dry_run=args.dry_run)

    raise KitError(f"unknown perps action: {args.action}")


def cmd_one_shot(args: argparse.Namespace) -> int:
    ingest_args = argparse.Namespace(
        inputs=args.inputs,
        watch_dir=[],
        output_prefix=args.output_prefix,
        repo_id=args.dataset_repo,
        dataset_name=args.dataset_name,
        pdf_extractor=args.pdf_extractor,
        chunk_chars=args.chunk_chars,
        chunk_overlap=args.chunk_overlap,
        private=args.private_dataset,
        push=args.push_dataset,
        save_arrow_dataset=args.save_arrow_dataset,
        dry_run=args.dry_run,
        yes=args.yes,
    )
    if args.push_dataset:
        require_yes(args, "Hugging Face dataset upload")
    cmd, paths = build_ingest_command(ingest_args)
    run(cmd, dry_run=args.dry_run)

    if not args.dry_run:
        fail_on_secret_findings([AI_TRAINING_DIR / paths["jsonl"], AI_TRAINING_DIR / paths["manifest"], AI_TRAINING_DIR / paths["card"]])

    if args.train:
        lane = lane_defaults(args.lane)
        train_args = argparse.Namespace(
            lane=args.lane,
            remote=args.remote_train,
            flavor=args.flavor,
            timeout=args.timeout,
            config=args.config or lane["config"],
            dataset_repo=args.dataset_repo if args.remote_train else None,
            dataset_path=paths["processed"],
            base_model=args.base_model or lane["base_model"],
            output_dir=args.output_dir,
            hub_model_id=args.hub_model_id,
            num_epochs=args.num_epochs,
            lr=None,
            wandb=args.wandb,
            no_eval=args.no_eval,
            no_checkpoints=args.no_checkpoints,
            no_quant=args.no_quant,
            push=args.push_model,
            train_dry_run=args.train_dry_run,
            dry_run=args.dry_run,
            yes=args.yes,
        )
        cmd_train(train_args)

    if args.register or args.live_register:
        reg_args = argparse.Namespace(
            lane=args.lane,
            live=args.live_register,
            manifest=paths["manifest"],
            output_prefix=args.output_prefix,
            dataset_size=None,
            hf_model=args.hub_model_id,
            endpoint=args.endpoint,
            eval_accuracy=args.eval_accuracy,
            cluster=args.cluster,
            model_hash=args.model_hash,
            onchain=False,
            dry_run=args.dry_run,
            yes=args.yes,
        )
        cmd_register(reg_args)

    return 0


def cmd_ui(args: argparse.Namespace) -> int:
    ui_dir = MODEL_KIT_DIR / "frontend"
    if args.print_path:
        print(ui_dir / "index.html")
        return 0
    cmd = [PYTHON, "-m", "http.server", str(args.port), "--bind", args.host, "--directory", ui_dir]
    print(f"Serving {rel(ui_dir)} at http://{args.host}:{args.port}")
    return run(cmd, cwd=MODEL_KIT_DIR, dry_run=args.dry_run)


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing them")
    parser.add_argument("--yes", action="store_true", help="Allow side effects such as uploads, remote jobs, pushes, or live registry writes")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Solana AI Model Kit CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor = sub.add_parser("doctor", help="Check local toolchain and auth state")
    doctor.add_argument("--json", action="store_true")
    doctor.add_argument("--strict", action="store_true")
    doctor.set_defaults(func=cmd_doctor)

    init = sub.add_parser("init", help="Create local model-kit working directories")
    add_common(init)
    init.set_defaults(func=cmd_init)

    ingest = sub.add_parser("ingest", help="Parse files into an SFT dataset")
    add_common(ingest)
    ingest.add_argument("inputs", nargs="*", help="Files or directories to ingest")
    ingest.add_argument("--watch-dir", action="append", default=[])
    ingest.add_argument("--output-prefix", default=DEFAULT_OUTPUT_PREFIX)
    ingest.add_argument("--repo-id", default=DEFAULT_DATASET_REPO)
    ingest.add_argument("--dataset-name", default=DEFAULT_DATASET_NAME)
    ingest.add_argument("--pdf-extractor", default="auto", choices=["auto", "pypdf", "documentai", "gemini", "nvidia"])
    ingest.add_argument("--chunk-chars", type=int, default=4800)
    ingest.add_argument("--chunk-overlap", type=int, default=350)
    ingest.add_argument("--private", action="store_true")
    ingest.add_argument("--push", action="store_true")
    ingest.add_argument("--save-arrow-dataset", action="store_true")
    ingest.set_defaults(func=cmd_ingest)

    prepare = sub.add_parser("prepare", help="Prepare an existing JSONL dataset")
    add_common(prepare)
    prepare.add_argument("--input", default=f"{DEFAULT_OUTPUT_PREFIX}_sft.jsonl")
    prepare.add_argument("--output", default=f"{DEFAULT_OUTPUT_PREFIX}_processed")
    prepare.add_argument("--repo-id", default=DEFAULT_DATASET_REPO)
    prepare.add_argument("--train-ratio", type=float, default=0.9)
    prepare.add_argument("--eval-ratio", type=float, default=0.05)
    prepare.add_argument("--seed", type=int, default=42)
    prepare.add_argument("--push", action="store_true")
    prepare.add_argument("--private", action="store_true")
    prepare.set_defaults(func=cmd_prepare)

    verify = sub.add_parser("verify", help="Run secret scan or full release verifier")
    add_common(verify)
    verify.add_argument("--path", action="append", default=[])
    verify.add_argument("--full-release", action="store_true")
    verify.add_argument("--skip-dry-run", action="store_true")
    verify.add_argument("--report", default="outputs/model_kit/release_audit.json")
    verify.set_defaults(func=cmd_verify)

    train = sub.add_parser("train", help="Run local LoRA dry run/training or remote HF Jobs")
    add_common(train)
    train.add_argument("--lane", choices=sorted(LANES), default="core-ai")
    train.add_argument("--remote", action="store_true", help="Launch Hugging Face Jobs")
    train.add_argument("--flavor", default="a100-large")
    train.add_argument("--timeout", default="4h")
    train.add_argument("--config")
    train.add_argument("--dataset-repo")
    train.add_argument("--dataset-path")
    train.add_argument("--base-model")
    train.add_argument("--output-dir")
    train.add_argument("--hub-model-id")
    train.add_argument("--num-epochs", type=float)
    train.add_argument("--lr", type=float)
    train.add_argument("--wandb", action="store_true")
    train.add_argument("--no-eval", action="store_true")
    train.add_argument("--no-checkpoints", action="store_true")
    train.add_argument("--no-quant", action="store_true")
    train.add_argument("--push", action="store_true")
    train.add_argument("--train-dry-run", action="store_true")
    train.set_defaults(func=cmd_train)

    one = sub.add_parser("one-shot", help="Ingest, validate, optionally train/register in one command")
    add_common(one)
    one.add_argument("inputs", nargs="*", help="Files or directories to ingest. Defaults to data/incoming")
    one.add_argument("--lane", choices=sorted(LANES), default="custom")
    one.add_argument("--output-prefix", default=DEFAULT_OUTPUT_PREFIX)
    one.add_argument("--dataset-repo", default=DEFAULT_DATASET_REPO)
    one.add_argument("--dataset-name", default=DEFAULT_DATASET_NAME)
    one.add_argument("--pdf-extractor", default="auto", choices=["auto", "pypdf", "documentai", "gemini", "nvidia"])
    one.add_argument("--chunk-chars", type=int, default=4800)
    one.add_argument("--chunk-overlap", type=int, default=350)
    one.add_argument("--save-arrow-dataset", action="store_true")
    one.add_argument("--private-dataset", action="store_true")
    one.add_argument("--push-dataset", action="store_true")
    one.add_argument("--train", action="store_true")
    one.add_argument("--remote-train", action="store_true")
    one.add_argument("--config")
    one.add_argument("--base-model")
    one.add_argument("--output-dir", default="outputs/model-kit-custom-lora")
    one.add_argument("--hub-model-id", default="solanaclawd/solana-clawd-custom-lora")
    one.add_argument("--num-epochs", type=float, default=1)
    one.add_argument("--wandb", action="store_true")
    one.add_argument("--no-eval", action="store_true")
    one.add_argument("--no-checkpoints", action="store_true")
    one.add_argument("--no-quant", action="store_true")
    one.add_argument("--push-model", action="store_true")
    one.add_argument("--train-dry-run", action="store_true")
    one.add_argument("--flavor", default="a100-large")
    one.add_argument("--timeout", default="4h")
    one.add_argument("--register", action="store_true")
    one.add_argument("--live-register", action="store_true")
    one.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    one.add_argument("--eval-accuracy", default="0.60")
    one.add_argument("--cluster", default="devnet")
    one.add_argument("--model-hash")
    one.set_defaults(func=cmd_one_shot)

    upload = sub.add_parser("upload", help="Build HF bundles or upload a folder/file")
    add_common(upload)
    upload.add_argument("--bundle", action="store_true", help="Build a local release bundle")
    upload.add_argument("--output", default="outputs/hf_release_bundle")
    upload.add_argument("--dataset", action="append", choices=["core_ai", "realtime_research", "trading_factory", "tx_foundation_cpt"])
    upload.add_argument("--include-published", action="store_true")
    upload.add_argument("--repo-id", default=DEFAULT_DATASET_REPO)
    upload.add_argument("--path", default="outputs/hf_release_bundle")
    upload.add_argument("--path-in-repo", default=".")
    upload.add_argument("--repo-type", choices=["dataset", "model", "space"], default="dataset")
    upload.add_argument("--private", action="store_true")
    upload.add_argument("--commit-message", default=f"model-kit upload {dt.datetime.now(dt.UTC).date().isoformat()}")
    upload.set_defaults(func=cmd_upload)

    register = sub.add_parser("register", help="Dry-run or live-register a model with onchain.x402.wtf")
    add_common(register)
    register.add_argument("--lane", choices=sorted(LANES), default="core-ai")
    register.add_argument("--live", action="store_true")
    register.add_argument("--onchain", action="store_true")
    register.add_argument("--manifest")
    register.add_argument("--output-prefix", default=DEFAULT_OUTPUT_PREFIX)
    register.add_argument("--dataset-size")
    register.add_argument("--hf-model")
    register.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    register.add_argument("--eval-accuracy", default="0.60")
    register.add_argument("--cluster", default="devnet")
    register.add_argument("--model-hash")
    register.set_defaults(func=cmd_register)

    ollama = sub.add_parser("ollama", help="Build and push Ollama preview or fine-tuned models")
    add_common(ollama)
    ollama.add_argument("--mode", choices=["preview", "finetuned", "all"], default="preview")
    ollama.add_argument("--target", choices=["all", "core-ai", "trading-factory"], default="core-ai")
    ollama.set_defaults(func=cmd_ollama)

    nvidia = sub.add_parser("nvidia", help="Run NVIDIA blueprint helpers")
    add_common(nvidia)
    nvidia.add_argument("action", choices=["verify", "aiq", "strategies", "tx-foundation", "tx-preflight"])
    nvidia.add_argument("--strict", action="store_true")
    nvidia.set_defaults(func=cmd_nvidia)

    perps = sub.add_parser("perps", help="Inspect or run the baked-in Solana perps tool lane")
    add_common(perps)
    perps.add_argument("action", choices=["tools", "manifest", "handoff", "agent"])
    perps.add_argument("--market", default="SOL")
    perps.add_argument("--mode", choices=["observer", "paper"], default="observer")
    perps.add_argument("--threshold", type=float, default=0.35)
    perps.add_argument("--output", default=DEFAULT_PERPS_MANIFEST, help="Model-kit perps manifest output")
    perps.add_argument("--handoff-output", default="data/perps/nvidia_perps_handoff.json")
    perps.add_argument("--query", default="What is the SOL price and Phoenix perp funding rate?")
    perps.add_argument("--wallet", default="")
    perps.add_argument("--max-depth", type=int, default=5)
    perps.add_argument("--local", action="store_true")
    perps.add_argument("--adapter")
    perps.add_argument("--goap", action="store_true")
    perps.add_argument("--verbose", "-v", action="store_true")
    perps.add_argument("--tick", action="store_true", help="Run one observer/paper signal tick for handoff")
    perps.add_argument("--write", action="store_true", help="Write manifest when action=tools")
    perps.add_argument("--json", action="store_true")
    perps.add_argument("--allow-live-env", action="store_true", help="Permit running when LIVE_TRADING=true is set; also requires --yes")
    perps.set_defaults(func=cmd_perps)

    ui = sub.add_parser("ui", help="Serve or print the static model-kit console")
    add_common(ui)
    ui.add_argument("--host", default="127.0.0.1")
    ui.add_argument("--port", type=int, default=8765)
    ui.add_argument("--print-path", action="store_true")
    ui.set_defaults(func=cmd_ui)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args) or 0)
    except KitError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
