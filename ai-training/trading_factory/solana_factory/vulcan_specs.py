"""Current Vulcan strategy JSON builders for Phoenix perpetuals.

The cloned autoresearch wiki contains useful strategy sketches, but this module
emits configs that match the current Vulcan TA runner shape documented in the
local Vulcan skill pack and Phoenix docs.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any


def _indicator(kind: str, timeframe: str, period: int | None = None, key: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"kind": kind, "timeframe": timeframe}
    if period is not None:
        payload["period"] = period
    if key is not None:
        payload["key"] = key
    return {"indicator": payload}


def _constant(value: float) -> dict[str, Any]:
    return {"constant": value}


def _compare(left: dict[str, Any], op: str, right: dict[str, Any]) -> dict[str, Any]:
    return {"compare": {"left": left, "op": op, "right": right}}


def _crosses(left: dict[str, Any], right: dict[str, Any], direction: str) -> dict[str, Any]:
    return {"crosses": {"left": left, "right": right, "direction": direction}}


def _base_config(symbol: str, max_tokens: float, margin_mode: str = "cross") -> dict[str, Any]:
    normalized = symbol.upper().replace("-PERP", "")
    return {
        "symbol": normalized,
        "cadence": {"kind": "candle_close", "timeframe": "15m", "grace_seconds": 5},
        "margin_mode": margin_mode,
        "max_concurrent_position_tokens": max_tokens,
        "max_firings": 24,
        "rules": [],
    }


def build_rsi_mean_reversion_strategy(
    symbol: str = "SOL",
    notional_usdc: float = 150.0,
    max_tokens: float = 2.0,
    timeframe: str = "15m",
) -> dict[str, Any]:
    """RSI oversold long entry with neutral exit, intended for paper mode."""
    cfg = _base_config(symbol, max_tokens)
    cfg["cadence"]["timeframe"] = timeframe
    rsi = _indicator("rsi", timeframe, 14)
    cfg["rules"] = [
        {
            "name": "entry-long-rsi-oversold",
            "when": _compare(rsi, "lt", _constant(30.0)),
            "do": {"kind": "open", "side": "buy", "size": {"notional": notional_usdc}},
            "cooldown": "until_condition_resets",
            "only_if_position": "flat",
        },
        {
            "name": "exit-long-rsi-neutral",
            "when": _compare(rsi, "gt", _constant(55.0)),
            "do": {"kind": "close"},
            "cooldown": "until_condition_resets",
            "only_if_position": "long",
        },
    ]
    return cfg


def build_ema_adx_trend_strategy(
    symbol: str = "SOL",
    tokens: float = 0.5,
    max_tokens: float = 2.0,
    timeframe: str = "1h",
) -> dict[str, Any]:
    """EMA cross trend-following strategy gated by ADX."""
    cfg = _base_config(symbol, max_tokens)
    cfg["cadence"]["timeframe"] = timeframe
    ema_fast = _indicator("ema", timeframe, 9)
    ema_slow = _indicator("ema", timeframe, 21)
    adx = _indicator("adx", timeframe, 14)
    cfg["rules"] = [
        {
            "name": "entry-long-ema-cross-adx",
            "when": {
                "all": [
                    _crosses(ema_fast, ema_slow, "above"),
                    _compare(adx, "gt", _constant(20.0)),
                ]
            },
            "do": {"kind": "open", "side": "buy", "size": {"tokens": tokens}},
            "cooldown": "until_condition_resets",
            "only_if_position": "flat",
        },
        {
            "name": "exit-long-ema-cross-down",
            "when": _crosses(ema_fast, ema_slow, "below"),
            "do": {"kind": "close"},
            "cooldown": "until_condition_resets",
            "only_if_position": "long",
        },
    ]
    return cfg


def build_macd_adx_trim_strategy(
    symbol: str = "SOL",
    tokens: float = 0.5,
    max_tokens: float = 2.0,
    timeframe: str = "1h",
) -> dict[str, Any]:
    """MACD/ADX long entry with partial trim when momentum flips."""
    cfg = _base_config(symbol, max_tokens)
    cfg["cadence"]["timeframe"] = timeframe
    macd_hist = _indicator("macd", timeframe, key="hist")
    adx = _indicator("adx", timeframe, 14)
    cfg["rules"] = [
        {
            "name": "entry-long-macd-adx",
            "when": {
                "all": [
                    _compare(macd_hist, "gt", _constant(0.0)),
                    _compare(adx, "gt", _constant(25.0)),
                ]
            },
            "do": {"kind": "open", "side": "buy", "size": {"tokens": tokens}},
            "cooldown": "until_condition_resets",
            "only_if_position": "flat",
        },
        {
            "name": "trim-long-macd-flip",
            "when": _crosses(macd_hist, _constant(0.0), "below"),
            "do": {"kind": "reduce", "fraction": 0.5},
            "cooldown": "until_condition_resets",
            "only_if_position": "long",
        },
        {
            "name": "close-long-adx-fades",
            "when": _compare(adx, "lt", _constant(15.0)),
            "do": {"kind": "close"},
            "cooldown": {"min_ticks": {"ticks": 4}},
            "only_if_position": "long",
        },
    ]
    return cfg


def validate_ta_strategy_config(config: dict[str, Any]) -> list[str]:
    """Return validation errors for a generated Vulcan TA config."""
    errors: list[str] = []
    symbol = config.get("symbol")
    if not isinstance(symbol, str) or not symbol or symbol != symbol.upper() or "-PERP" in symbol:
        errors.append("symbol must be an uppercase base ticker such as SOL, not SOL-PERP")
    if config.get("margin_mode") not in {"cross", "isolated"}:
        errors.append("margin_mode must be cross or isolated")
    if not isinstance(config.get("rules"), list) or not config["rules"]:
        errors.append("at least one rule is required")
    for idx, rule in enumerate(config.get("rules", []), 1):
        if not rule.get("name"):
            errors.append(f"rule {idx} is missing name")
        if "when" not in rule:
            errors.append(f"rule {idx} is missing when")
        action = rule.get("do", {})
        if action.get("kind") == "open":
            size = action.get("size", {})
            size_keys = {"tokens", "lots", "notional"}.intersection(size)
            if len(size_keys) != 1:
                errors.append(f"rule {idx} open action must use exactly one size key")
            if "lots" in size:
                errors.append(f"rule {idx} uses lots; prefer tokens or notional until market_info is checked")
    return errors


def paper_ta_command(config_path: str, max_ticks: int = 60, run_label: str | None = None) -> list[str]:
    """Build a safe paper-mode Vulcan command for a generated TA config."""
    cmd = [
        "vulcan",
        "strategy",
        "ta",
        "start",
        "--config-file",
        config_path,
        "--mode",
        "paper",
        "--max-ticks",
        str(max_ticks),
    ]
    if run_label:
        cmd.extend(["--run-label", run_label])
    cmd.extend(["-o", "json"])
    return cmd


def guarded_grid_command(
    symbol: str = "SOL",
    width_pct: float = 1.5,
    levels_per_side: int = 4,
    tokens_per_level: float = 0.1,
    ticks: int = 60,
) -> list[str]:
    """Build a current Vulcan grid paper command centered on mark price."""
    return [
        "vulcan",
        "strategy",
        "grid",
        "start",
        "--symbol",
        symbol.upper().replace("-PERP", ""),
        "--center-on-mark",
        "--width-pct",
        str(width_pct),
        "--levels-per-side",
        str(levels_per_side),
        "--tokens-per-level",
        str(tokens_per_level),
        "--ticks",
        str(ticks),
        "--mode",
        "paper",
        "--max-total-notional-usdc",
        "1000",
        "-o",
        "json",
    ]


def guarded_twap_command(
    symbol: str = "SOL",
    side: str = "buy",
    notional_usdc: float = 500.0,
    slices: int = 5,
    interval_seconds: int = 300,
) -> list[str]:
    """Build a current Vulcan TWAP paper command."""
    return [
        "vulcan",
        "strategy",
        "twap",
        "start",
        "--symbol",
        symbol.upper().replace("-PERP", ""),
        "--side",
        side,
        "--notional-usdc",
        str(notional_usdc),
        "--slices",
        str(slices),
        "--interval-seconds",
        str(interval_seconds),
        "--mode",
        "paper",
        "--max-step-notional-usdc",
        str(max(1.0, notional_usdc / slices * 1.2)),
        "--max-price-drift-bps",
        "75",
        "-o",
        "json",
    ]


def clone_strategy(config: dict[str, Any]) -> dict[str, Any]:
    """Return a deep copy so callers can safely mutate generated configs."""
    return deepcopy(config)
