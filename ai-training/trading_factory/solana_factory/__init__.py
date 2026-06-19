"""Solana Clawd NVIDIA trading-factory adapters.

This package is intentionally paper-first. It builds reviewable strategy specs,
Phoenix/Rise read plans, and cuFOLIO optimization handoffs; it does not submit
live orders.
"""

from .factory import build_strategy_bundle
from .vulcan_specs import (
    build_ema_adx_trend_strategy,
    build_macd_adx_trim_strategy,
    build_rsi_mean_reversion_strategy,
)

__all__ = [
    "build_strategy_bundle",
    "build_ema_adx_trend_strategy",
    "build_macd_adx_trim_strategy",
    "build_rsi_mean_reversion_strategy",
]
