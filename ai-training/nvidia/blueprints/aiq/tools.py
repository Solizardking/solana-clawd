"""Local AIQ-style tool contracts for the Solana Clawd factory.

The real NVIDIA AIQ stack can bind these as tools through NeMo Agent Toolkit.
For local verification, these helpers only read JSON artifacts and report
release gates.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"ok": False, "error": f"missing {path.as_posix()}"}
    try:
        return {"ok": True, "data": json.loads(path.read_text(encoding="utf-8"))}
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid json: {exc}"}


def score_safety(plan: dict[str, Any]) -> dict[str, Any]:
    policy = plan.get("safety_policy", {})
    allowed_modes = set(policy.get("allowed_default_modes", []))
    live_status = str(policy.get("live_mode_status", "")).lower()
    blocked = any("live" in item for item in policy.get("secret_handling", []))
    ok = "paper" in allowed_modes and "observer" in allowed_modes and "not generated" in live_status and not blocked
    return {
        "ok": ok,
        "allowed_default_modes": sorted(allowed_modes),
        "live_mode_status": policy.get("live_mode_status"),
    }


def score_artifact_completeness(plan: dict[str, Any]) -> dict[str, Any]:
    artifacts = plan.get("factory_artifacts", {})
    missing = [name for name, artifact in artifacts.items() if not artifact.get("exists")]
    return {
        "ok": not missing,
        "missing": missing,
        "artifact_count": len(artifacts),
    }


def score_role_coverage(plan: dict[str, Any]) -> dict[str, Any]:
    expected = {
        "rag_grounder",
        "transaction_embedding_builder",
        "signal_agent",
        "code_agent",
        "evaluation_agent",
        "optimizer_agent",
        "distillation_agent",
        "aiq_evaluator",
        "execution_guard",
    }
    present = {role.get("name") for role in plan.get("roles", [])}
    missing = sorted(expected - present)
    return {
        "ok": not missing,
        "missing": missing,
        "role_count": len(present),
    }
