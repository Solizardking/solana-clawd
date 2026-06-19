"""Build the Solana trading-factory strategy bundle."""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

from .cufolio_adapter import build_mean_cvar_handoff, discover_cufolio
from .nvidia_agent import write_nvidia_clawd_agent_plan
from .rise_client import build_rise_data_plan
from .vulcan_specs import (
    build_ema_adx_trend_strategy,
    build_macd_adx_trim_strategy,
    build_rsi_mean_reversion_strategy,
    guarded_grid_command,
    guarded_twap_command,
    paper_ta_command,
    validate_ta_strategy_config,
)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _strategy_entry(name: str, path: Path, config: dict[str, Any], max_ticks: int) -> dict[str, Any]:
    rel_path = path.as_posix()
    errors = validate_ta_strategy_config(config)
    return {
        "name": name,
        "kind": "vulcan_ta",
        "config_file": rel_path,
        "symbol": config["symbol"],
        "default_mode": "paper",
        "validation_errors": errors,
        "paper_command": paper_ta_command(rel_path, max_ticks=max_ticks, run_label=name),
    }


def build_strategy_bundle(
    repo_root: Path,
    output_dir: Path,
    paper_notional_usdc: float = 150.0,
    max_ticks: int = 60,
) -> dict[str, Any]:
    """Write strategy configs and return the full manifest."""
    output_dir.mkdir(parents=True, exist_ok=True)

    strategies = {
        "sol_rsi_mean_reversion_paper": build_rsi_mean_reversion_strategy(
            notional_usdc=paper_notional_usdc,
            max_tokens=2.0,
            timeframe="15m",
        ),
        "sol_ema_adx_trend_paper": build_ema_adx_trend_strategy(
            tokens=0.5,
            max_tokens=2.0,
            timeframe="1h",
        ),
        "sol_macd_adx_trim_paper": build_macd_adx_trim_strategy(
            tokens=0.5,
            max_tokens=2.0,
            timeframe="1h",
        ),
    }

    manifest_entries: list[dict[str, Any]] = []
    for name, config in strategies.items():
        path = output_dir / f"{name}.json"
        _write_json(path, config)
        manifest_entries.append(_strategy_entry(name, path, config, max_ticks))

    cvar_handoff = build_mean_cvar_handoff()
    cvar_path = output_dir / "cufolio_mean_cvar_handoff.json"
    _write_json(cvar_path, cvar_handoff)

    rise_plan = build_rise_data_plan("SOL")
    rise_path = output_dir / "rise_market_data_plan.json"
    _write_json(rise_path, rise_plan)

    command_plans = {
        "paper_grid_centered_on_mark": guarded_grid_command(symbol="SOL"),
        "paper_twap_rebalance_slice": guarded_twap_command(symbol="SOL", notional_usdc=500.0),
        "live_readiness_check_only": ["vulcan", "strategy", "preflight", "-o", "json"],
    }
    commands_path = output_dir / "vulcan_command_plans.json"
    _write_json(commands_path, command_plans)

    nvidia_agent_path = write_nvidia_clawd_agent_plan(repo_root=repo_root, output_dir=output_dir)

    manifest = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "purpose": "Solana Clawd NVIDIA trading factory: cuFOLIO optimization handoff plus Vulcan paper strategy specs",
        "sources": {
            "cufolio": discover_cufolio(repo_root),
            "autoresearch_perps": {
                "path": str(repo_root / "trading_factory" / "clawd-autoresearch-wiki" / "perps"),
                "upstream": "https://github.com/Solizardking/clawd-autoresearch-wiki/tree/main/perps",
                "usage": "reference only; generated Vulcan configs use current Phoenix/Vulcan docs",
            },
            "phoenix_docs": {
                "llms_index": "https://docs.phoenix.trade/llms.txt",
                "vulcan_strategies": "https://docs.phoenix.trade/cli/strategies",
                "rise_sdk": "https://docs.phoenix.trade/sdk/rise",
            },
            "nvidia_blueprints": {
                "path": str(repo_root / "nvidia"),
                "usage": "local NVIDIA blueprint adapters and NemoClawd agent-plan generation",
            },
        },
        "safety_policy": {
            "default_execution_mode": "paper",
            "never_in_generator": [
                "wallet signing",
                "private-key export",
                "MCP config secret inspection",
                "live order submission",
            ],
            "before_any_live_launch": [
                "ask execution-mode question",
                "run vulcan strategy preflight",
                "review margin status",
                "review position list",
                "review market info/ticker/orderbook/funding",
                "require explicit approval and Vulcan live gate",
            ],
        },
        "strategies": manifest_entries,
        "optimizer_handoff": cvar_path.as_posix(),
        "rise_data_plan": rise_path.as_posix(),
        "vulcan_command_plans": commands_path.as_posix(),
        "nvidia_clawd_agent_plan": nvidia_agent_path.as_posix(),
    }

    _write_json(output_dir / "strategy_manifest.json", manifest)
    return manifest
