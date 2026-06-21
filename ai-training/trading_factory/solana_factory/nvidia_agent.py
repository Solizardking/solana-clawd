"""NVIDIA/NemoClawd agent plan builder for the Solana trading factory.

This module is intentionally declarative. It binds the local strategy bundle to
NVIDIA blueprint workflows and NemoClawd-style agent permissions without
touching wallets, secrets, or live execution paths.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any


NVIDIA_BLUEPRINTS: dict[str, dict[str, str]] = {
    "transaction_foundation_model": {
        "url": "https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model",
        "local_path": "nvidia/blueprints/transaction-foundation-model",
        "purpose": "Build Solana transaction/tabular embeddings for downstream signal models.",
    },
    "portfolio_optimization": {
        "url": "https://build.nvidia.com/nvidia/quantitative-portfolio-optimization",
        "local_path": "nvidia/blueprints/portfolio-optimization",
        "purpose": "Run Mean-CVaR portfolio optimization with cuFOLIO/cuOpt-style constraints.",
    },
    "model_distillation": {
        "url": "https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data",
        "local_path": "nvidia/blueprints/model-distillation",
        "purpose": "Distill Nemotron/NIM teacher decisions into the compact Clawd student.",
    },
    "signal_discovery": {
        "url": "https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent",
        "local_path": "nvidia/blueprints/signal-discovery",
        "purpose": "Discover, code, backtest, and refine Solana spot/perps signals.",
    },
    "enterprise_rag": {
        "url": "https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline",
        "local_path": "nvidia/blueprints/enterprise-rag",
        "purpose": "Ground agent decisions in Solana docs, protocol specs, and dataset cards.",
    },
    "aiq": {
        "url": "https://build.nvidia.com/nvidia/aiq",
        "local_path": "nvidia/blueprints/aiq",
        "purpose": "Evaluate end-to-end agent quality, safety, latency, and groundedness.",
    },
}


UPSTREAM_ADAPTATIONS: dict[str, dict[str, str]] = {
    "nvidia_nemoclaw": {
        "repo": "https://github.com/NVIDIA/NemoClaw",
        "license": "Apache-2.0; verify upstream notices before vendoring.",
        "adapted_contract": (
            "Guided onboarding, hardened sandbox blueprint, routed inference, "
            "network policy, and lifecycle management mapped onto Core AI as Nemo Clawd."
        ),
    },
    "quantitative_signal_discovery_agent": {
        "repo": "https://github.com/Solizardking/quantitative-signal-discovery-agent.git",
        "license": "Apache-2.0 style upstream license files; verify before redistribution.",
        "adapted_contract": "NAT-style signal, code, and evaluation loop mapped to Phoenix/Vulcan paper signals.",
    },
    "nemoclawd": {
        "repo": "https://github.com/x402agent/NemoClawd.git",
        "license": "Apache-2.0 root license; subprojects may differ and must be checked before vendoring.",
        "adapted_contract": "Blueprint lifecycle, sandbox posture, MCP tool catalog, and permission gates.",
    },
}


DEFAULT_MARKETS = ["SOL", "BTC", "ETH", "JUP", "PYTH", "JTO"]
DEFAULT_NEMOTRON_MODELS = {
    "reasoning": "nvidia/nemotron-3-nano-30b-a3b",
    "research": "nvidia/nemotron-3-super-120b-a12b",
    "student": "Qwen/Qwen2.5-1.5B-Instruct",
    "adapter": "solanaclawd/solana-clawd-core-ai-1.5b-lora",
}


def _rel(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def _artifact(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": _rel(path, root),
        "exists": path.exists(),
    }


def _strategy_artifacts(repo_root: Path, output_dir: Path) -> dict[str, Any]:
    return {
        "strategy_manifest": _artifact(output_dir / "strategy_manifest.json", repo_root),
        "cufolio_handoff": _artifact(output_dir / "cufolio_mean_cvar_handoff.json", repo_root),
        "rise_data_plan": _artifact(output_dir / "rise_market_data_plan.json", repo_root),
        "vulcan_command_plans": _artifact(output_dir / "vulcan_command_plans.json", repo_root),
    }


def build_nvidia_clawd_agent_plan(
    repo_root: Path,
    output_dir: Path,
    markets: list[str] | None = None,
    default_mode: str = "paper",
) -> dict[str, Any]:
    """Return a reviewable NVIDIA/NemoClawd agent plan for the factory.

    Args:
        repo_root: The `ai-training` directory.
        output_dir: Strategy artifact directory, normally `data/strategies`.
        markets: Solana spot/perps symbols to include in signal workflows.
        default_mode: Observer or paper. Live modes are intentionally excluded.
    """
    if default_mode not in {"observer", "paper"}:
        raise ValueError("default_mode must be observer or paper")

    markets = markets or DEFAULT_MARKETS
    generated_at = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()
    artifacts = _strategy_artifacts(repo_root, output_dir)

    return {
        "generated_at": generated_at,
        "schema_version": "2026-06-19",
        "name": "Solana NemoClawd NVIDIA Trading Factory",
        "slug": "solana-nemoclawd-nvidia-trading-factory",
        "default_mode": default_mode,
        "description": (
            "Paper-first Clawd agent plan that combines NVIDIA blueprints, "
            "Nemotron models, cuFOLIO optimization, Rise/Phoenix read plans, "
            "and Vulcan strategy artifacts."
        ),
        "blueprints": NVIDIA_BLUEPRINTS,
        "upstream_adaptations": UPSTREAM_ADAPTATIONS,
        "models": DEFAULT_NEMOTRON_MODELS,
        "markets": markets,
        "factory_artifacts": artifacts,
        "roles": [
            {
                "name": "nemo_clawd_runtime",
                "source": "nvidia_nemoclaw",
                "job": "wrap Core AI assets in a NemoClaw-style sandbox, network policy, and lifecycle plan",
                "inputs": ["core-ai inventory", "Clawd MCP tools", "NIM bridge routes", "sandbox policy"],
                "outputs": ["nemo_clawd_blueprint", "core_ai_inventory", "network_policy"],
            },
            {
                "name": "rag_grounder",
                "source": "enterprise_rag",
                "job": "retrieve Solana/Phoenix/cuFOLIO context before strategy changes",
                "inputs": ["docs", "dataset cards", "Phoenix/Vulcan docs", "Clawd skills"],
                "outputs": ["grounded_context", "citations", "risk_notes"],
            },
            {
                "name": "transaction_embedding_builder",
                "source": "transaction_foundation_model",
                "job": "convert Solana transaction and strategy logs into embedding/CPT records",
                "inputs": ["JSONL SFT records", "transaction metadata", "Vulcan logs"],
                "outputs": ["tx_context_jsonl", "embedding_features"],
            },
            {
                "name": "signal_agent",
                "source": "signal_discovery",
                "job": "propose alpha signals for spot and Phoenix perps",
                "inputs": ["Rise market data plan", "Vulcan candles", "funding", "orderbook snapshots"],
                "outputs": ["signal_formula", "signal_hypothesis"],
            },
            {
                "name": "code_agent",
                "source": "signal_discovery",
                "job": "turn signal hypotheses into deterministic Python feature functions",
                "inputs": ["signal_formula", "allowed_operator_catalog"],
                "outputs": ["feature_code", "unit_test_plan"],
            },
            {
                "name": "evaluation_agent",
                "source": "signal_discovery",
                "job": "backtest feature functions and score IC, drawdown, turnover, and p-value",
                "inputs": ["feature_code", "historical candles", "paper execution fills"],
                "outputs": ["accepted_signal", "best_effort_signal", "retry_feedback"],
            },
            {
                "name": "optimizer_agent",
                "source": "portfolio_optimization",
                "job": "convert accepted signals into Mean-CVaR allocation and hedge handoffs",
                "inputs": ["accepted_signal", "current paper portfolio", "scenario matrix"],
                "outputs": ["allocation_plan", "cufolio_handoff"],
            },
            {
                "name": "distillation_agent",
                "source": "model_distillation",
                "job": "label high-quality factory traces with a Nemotron teacher for student LoRA training",
                "inputs": ["accepted signals", "RAG context", "risk review"],
                "outputs": ["distilled_sft_jsonl", "evaluation_report"],
            },
            {
                "name": "aiq_evaluator",
                "source": "aiq",
                "job": "score agent quality, safety, latency, and groundedness before publishing",
                "inputs": ["agent traces", "eval dataset", "refusal cases"],
                "outputs": ["aiq_eval_json", "release_gate"],
            },
            {
                "name": "execution_guard",
                "source": "vulcan",
                "job": "keep generated commands observer or paper-only unless the operator explicitly promotes mode",
                "inputs": ["allocation_plan", "strategy_manifest", "preflight_status"],
                "outputs": ["paper_commands", "blocked_live_actions"],
            },
        ],
        "workflow": [
            "ingest_docs_with_enterprise_rag",
            "build_transaction_foundation_records",
            "discover_signals_with_nemotron",
            "compile_and_backtest_signal_code",
            "optimize_portfolio_with_mean_cvar",
            "emit_vulcan_paper_strategy_plan",
            "distill_teacher_outputs_to_clawd_student",
            "evaluate_with_aiq_before_release",
        ],
        "tool_contract": {
            "vulcan": {
                "allowed": ["market data", "technical indicators", "paper strategies", "preflight"],
                "blocked_by_default": ["live order submission", "wallet password reads", "private-key export"],
                "output_mode": "json",
            },
            "rise": {
                "allowed": ["HTTP read-only market data", "candles", "funding", "orderbook"],
                "blocked_by_default": ["transaction construction", "wallet signing"],
            },
            "cufolio": {
                "allowed": ["scenario generation", "Mean-CVaR optimization", "CPU fallback review"],
                "blocked_by_default": ["automatic rebalance execution"],
            },
            "nemo_clawd": {
                "allowed": [
                    "Core AI read-only source inventory",
                    "sandboxed plan/apply/status concepts",
                    "MCP tool manifest generation",
                    "NIM/Clawd routed inference",
                    "network policy review",
                ],
                "blocked_by_default": ["host secret inspection", "live wallet policy mutation", "unapproved egress"],
            },
        },
        "training_outputs": {
            "signal_sft_log": "data/nvidia_signal_log.jsonl",
            "distilled_dataset": "data/distilled_trading_factory.jsonl",
            "published_dataset": "solanaclawd/solana-clawd-nvidia-trading-factory-instruct",
            "student_adapter": DEFAULT_NEMOTRON_MODELS["adapter"],
        },
        "commands": {
            "generate_factory_bundle": "python3 scripts/build_solana_trading_factory_strategies.py",
            "generate_agent_plan": "python3 nvidia/integration/nemo_clawd_agent.py",
            "generate_nemo_clawd_blueprint": "python3 nvidia/integration/nemo_clawd.py --write",
            "run_signal_agent_paper": (
                "python3 nvidia/blueprints/signal-discovery/agent.py "
                "--markets SOL BTC ETH --mode paper"
            ),
            "run_aiq_eval": (
                "python3 nvidia/blueprints/aiq/agent.py "
                "--plan data/strategies/nvidia_clawd_agent_plan.json"
            ),
            "verify": "python3 nvidia/scripts/verify_nvidia.py",
        },
        "safety_policy": {
            "default_trust_gate": "dry-run",
            "allowed_default_modes": ["observer", "paper"],
            "live_mode_status": "not generated by this plan",
            "secret_handling": [
                "read keys only from the process environment",
                "never write API keys or OAuth client secret files into generated artifacts",
                "never include wallet private keys or wallet passwords in plans",
            ],
            "promotion_requirements": [
                "operator explicitly chooses live mode outside this generator",
                "Vulcan preflight reports ready",
                "margin, open positions, orderbook, and funding are reviewed",
                "per-order approval is captured by the execution client",
            ],
        },
    }


def write_nvidia_clawd_agent_plan(
    repo_root: Path,
    output_dir: Path,
    markets: list[str] | None = None,
    default_mode: str = "paper",
) -> Path:
    """Write the agent plan to `nvidia_clawd_agent_plan.json`."""
    plan = build_nvidia_clawd_agent_plan(
        repo_root=repo_root,
        output_dir=output_dir,
        markets=markets,
        default_mode=default_mode,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "nvidia_clawd_agent_plan.json"
    path.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path
