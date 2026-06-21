#!/usr/bin/env python3
"""Nemo Clawd integration for the Core AI tree.

This adapts the local `core-ai/` Clawd runtime into a NemoClaw-style sandbox
blueprint for NVIDIA integration. It does not vendor NVIDIA/NemoClaw or copy
Core AI files. It creates reviewable manifests that bind Core AI assets,
Clawd/NIM inference routing, network policy, lifecycle commands, and training
dataset hooks.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable


AI_TRAINING_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = AI_TRAINING_DIR.parent
CORE_AI_DIR = REPO_ROOT / "core-ai"
DEFAULT_OUTPUT_DIR = AI_TRAINING_DIR / "data" / "strategies"

NEMOCLAW_UPSTREAM = {
    "repo": "https://github.com/NVIDIA/NemoClaw",
    "docs": "https://docs.nvidia.com/nemoclaw/latest/",
    "license": "Apache-2.0",
    "adapted_concepts": [
        "guided onboarding",
        "hardened blueprint",
        "routed inference",
        "network policy",
        "sandbox lifecycle management",
        "OpenShell-style agent containment",
    ],
}

CORE_AI_REQUIRED_PATHS = [
    "core-ai",
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

TEXT_SUFFIXES = {
    ".json",
    ".jsonl",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

SKIP_DIRS = {
    ".git",
    ".next",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
    "target",
}

SECRET_FILENAMES = {
    ".env",
    ".env.local",
    "id.json",
    "application_default_credentials.json",
}


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def sha256_file(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_files(path: Path) -> Iterable[Path]:
    if path.is_file():
        yield path
        return
    if not path.exists() or not path.is_dir():
        return
    for child in path.rglob("*"):
        if any(part in SKIP_DIRS for part in child.parts):
            continue
        if child.is_file() and child.name not in SECRET_FILENAMES:
            yield child


def count_files(path: Path) -> dict[str, int]:
    files = list(iter_files(path))
    return {
        "files": len(files),
        "text_files": sum(1 for item in files if item.suffix.lower() in TEXT_SUFFIXES),
        "skill_files": sum(1 for item in files if item.name == "SKILL.md"),
        "package_json": sum(1 for item in files if item.name == "package.json"),
    }


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def path_entry(raw: str) -> dict[str, Any]:
    path = REPO_ROOT / raw
    entry: dict[str, Any] = {
        "path": raw,
        "exists": path.exists(),
        "kind": "directory" if path.is_dir() else "file" if path.is_file() else "missing",
    }
    if path.exists():
        entry["size_bytes"] = path.stat().st_size if path.is_file() else None
        entry["sha256"] = sha256_file(path)
        if path.is_dir():
            entry["counts"] = count_files(path)
    return entry


def package_summary(package_json: Path) -> dict[str, Any]:
    data = read_json(package_json)
    if not data:
        return {"path": rel(package_json), "exists": package_json.exists()}
    return {
        "path": rel(package_json),
        "name": data.get("name"),
        "version": data.get("version"),
        "private": data.get("private"),
        "scripts": sorted((data.get("scripts") or {}).keys()),
        "dependencies": sorted((data.get("dependencies") or {}).keys()),
        "dev_dependencies": sorted((data.get("devDependencies") or {}).keys()),
    }


def discover_packages(core_ai_dir: Path) -> list[dict[str, Any]]:
    packages = []
    for package_json in sorted(core_ai_dir.rglob("package.json")):
        if any(part in SKIP_DIRS for part in package_json.parts):
            continue
        packages.append(package_summary(package_json))
    return packages


def discover_skills(core_ai_dir: Path) -> list[dict[str, Any]]:
    skills = []
    for skill_path in sorted(core_ai_dir.rglob("SKILL.md")):
        if any(part in SKIP_DIRS for part in skill_path.parts):
            continue
        text = skill_path.read_text(encoding="utf-8", errors="ignore")
        title = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("#")), skill_path.parent.name)
        skills.append(
            {
                "path": rel(skill_path),
                "name": title,
                "sha256": sha256_file(skill_path),
                "bytes": skill_path.stat().st_size,
            }
        )
    return skills


def discover_mcp_tools(core_ai_dir: Path) -> list[dict[str, Any]]:
    tools_dir = core_ai_dir / "mcp-server" / "src" / "tools"
    if not tools_dir.exists():
        return []
    tools = []
    for path in sorted(tools_dir.rglob("*.ts")):
        if path.name in {"index.ts"}:
            continue
        tools.append({"path": rel(path), "domain": path.stem, "sha256": sha256_file(path)})
    return tools


def top_level_docs(core_ai_dir: Path) -> list[dict[str, Any]]:
    docs = []
    for name in ["README.md", "CLAWD.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "LICENSE", "versions.json", "glama.json"]:
        path = core_ai_dir / name
        docs.append(
            {
                "path": rel(path),
                "exists": path.exists(),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size if path.exists() and path.is_file() else None,
            }
        )
    return docs


def build_core_ai_inventory(core_ai_dir: Path = CORE_AI_DIR) -> dict[str, Any]:
    required = [path_entry(item) for item in CORE_AI_REQUIRED_PATHS]
    missing = [item["path"] for item in required if not item["exists"]]
    return {
        "generated_at": utc_now(),
        "schema_version": "2026-06-21",
        "name": "Clawd Core AI Inventory",
        "core_ai_root": rel(core_ai_dir),
        "required_paths": required,
        "missing_required_paths": missing,
        "packages": discover_packages(core_ai_dir),
        "skills": discover_skills(core_ai_dir),
        "mcp_tools": discover_mcp_tools(core_ai_dir),
        "top_level_docs": top_level_docs(core_ai_dir),
        "source_policy": {
            "mode": "reference-mount",
            "copy_source_files": False,
            "skip_dirs": sorted(SKIP_DIRS),
            "secret_filenames_excluded": sorted(SECRET_FILENAMES),
        },
    }


def build_nemo_clawd_blueprint(
    core_inventory: dict[str, Any],
    output_dir: Path = DEFAULT_OUTPUT_DIR,
) -> dict[str, Any]:
    return {
        "generated_at": utc_now(),
        "schema_version": "2026-06-21",
        "name": "Nemo Clawd",
        "slug": "nemo-clawd",
        "description": (
            "A Solana-native adaptation of NVIDIA NemoClaw concepts for the "
            "local Clawd Core AI tree: sandboxed agent runtime, managed NIM/Clawd "
            "inference routing, network policy, lifecycle commands, and training hooks."
        ),
        "upstream": NEMOCLAW_UPSTREAM,
        "core_ai_inventory": {
            "path": (output_dir / "nemo_clawd_core_inventory.json").as_posix(),
            "missing_required_paths": core_inventory.get("missing_required_paths", []),
            "packages": len(core_inventory.get("packages", [])),
            "skills": len(core_inventory.get("skills", [])),
            "mcp_tools": len(core_inventory.get("mcp_tools", [])),
        },
        "agent_profile": {
            "primary_agent": "clawd-code",
            "companion_agents": ["clawd-grok", "helius-mcp", "helius-plugin", "clawd-agents", "v3"],
            "domains": ["solana", "helius", "mcp", "zk-compression", "perps-paper-trading", "agentic-coding"],
            "default_modes": ["observer", "paper", "research", "code"],
            "blocked_default_modes": ["live-trading", "wallet-signing", "secret-inspection"],
        },
        "sandbox_profile": {
            "style": "NemoClaw/OpenShell-compatible reference policy",
            "source_mount": {"path": "core-ai", "mode": "read-only"},
            "writable_mounts": ["ai-training/data/strategies", "ai-training/outputs/model_kit"],
            "capabilities": {
                "drop": ["NET_ADMIN", "SYS_ADMIN", "SYS_PTRACE"],
                "allow": ["read_project_files", "write_strategy_artifacts", "call_configured_inference"],
            },
            "process_limits": {
                "max_child_processes": 32,
                "default_timeout_seconds": 120,
                "long_running_requires_operator_label": True,
            },
            "secret_policy": {
                "source": "environment_or_secret_manager",
                "persist_to_files": False,
                "allow_host_secret_discovery": False,
                "redact_env_names": ["*_API_KEY", "*_TOKEN", "*_SECRET", "SOLANA_PRIVATE_KEY"],
            },
        },
        "network_policy": {
            "default": "deny",
            "allowed_egress": [
                "https://integrate.api.nvidia.com",
                "https://api-inference.huggingface.co",
                "https://huggingface.co",
                "https://onchain.x402.wtf",
                "https://api.mainnet-beta.solana.com",
                "https://*.helius.dev",
                "http://localhost:11434",
            ],
            "operator_approval_required_for": [
                "new_external_domains",
                "wallet_rpc_endpoints",
                "webhook_registration",
                "live_order_endpoints",
            ],
        },
        "inference_routing": {
            "bridge": "ai-training/nvidia/integration/clawd_nim_bridge.py",
            "order": [
                "NVIDIA_API_KEY -> NVIDIA NIM",
                "HF_TOKEN -> Hugging Face Inference",
                "CLAWD_INFERENCE_URL -> self-hosted Clawd endpoint",
                "CLAWD_ROUTER_KEY -> clawd-box-router.fly.dev",
                "fallback -> Ollama localhost:11434",
            ],
            "system_prompt_id": "nemo_clawd",
        },
        "lifecycle": {
            "doctor": "python3 ai-training/nvidia/integration/nemo_clawd.py --check",
            "generate": "python3 ai-training/nvidia/integration/nemo_clawd.py --write",
            "plan": "python3 ai-training/nvidia/integration/nemo_clawd_agent.py --mode paper",
            "verify": "cd ai-training && python3 nvidia/scripts/verify_nvidia.py --strict",
            "dataset": "cd ai-training && python3 nvidia/integration/dataset_nvidia_sft.py",
            "aiq": "cd ai-training && python3 nvidia/blueprints/aiq/agent.py --strict",
        },
        "training_hooks": {
            "sft_sources": [
                "core-ai/knowledge/*.jsonl",
                "core-ai/knowledge/*.md",
                "core-ai/helius-skills/**/SKILL.md",
                "core-ai/helius-plugin/skills/**/SKILL.md",
                "core-ai/mcp-server/src/tools/**/*.ts",
                "ai-training/data/strategies/nemo_clawd_blueprint.json",
            ],
            "dataset_builder": "ai-training/nvidia/integration/dataset_nvidia_sft.py",
            "model_kit": "ai-training/model-kit/bin/clawd-model-kit",
            "hub_target": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
        },
        "safety_gates": {
            "default_trust": "observer",
            "paper_mode_only": True,
            "live_promotion": [
                "separate execution client",
                "explicit operator approval",
                "Vulcan preflight",
                "wallet isolation",
                "position and margin review",
            ],
            "model_output_rule": "model outputs are plans, never transactions",
        },
        "artifacts": {
            "inventory": (output_dir / "nemo_clawd_core_inventory.json").as_posix(),
            "blueprint": (output_dir / "nemo_clawd_blueprint.json").as_posix(),
        },
    }


def write_nemo_clawd_assets(
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    core_ai_dir: Path = CORE_AI_DIR,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    inventory = build_core_ai_inventory(core_ai_dir)
    blueprint = build_nemo_clawd_blueprint(inventory, output_dir)
    inventory_path = output_dir / "nemo_clawd_core_inventory.json"
    blueprint_path = output_dir / "nemo_clawd_blueprint.json"
    inventory_path.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    blueprint_path.write_text(json.dumps(blueprint, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {
        "inventory": inventory,
        "blueprint": blueprint,
        "inventory_path": inventory_path,
        "blueprint_path": blueprint_path,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core-ai-root", default=str(CORE_AI_DIR))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--write", action="store_true", help="Write inventory and blueprint JSON")
    parser.add_argument("--check", action="store_true", help="Exit nonzero when required Core AI paths are missing")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_dir = Path(args.output_dir).resolve()
    core_ai_dir = Path(args.core_ai_root).resolve()
    result = write_nemo_clawd_assets(output_dir=output_dir, core_ai_dir=core_ai_dir) if args.write else {
        "inventory": build_core_ai_inventory(core_ai_dir),
    }
    inventory = result["inventory"]
    summary = {
        "name": "Nemo Clawd",
        "core_ai_root": rel(core_ai_dir),
        "missing_required_paths": inventory.get("missing_required_paths", []),
        "packages": len(inventory.get("packages", [])),
        "skills": len(inventory.get("skills", [])),
        "mcp_tools": len(inventory.get("mcp_tools", [])),
        "wrote": {
            "inventory": result.get("inventory_path").as_posix() if result.get("inventory_path") else None,
            "blueprint": result.get("blueprint_path").as_posix() if result.get("blueprint_path") else None,
        },
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 1 if args.check and summary["missing_required_paths"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
