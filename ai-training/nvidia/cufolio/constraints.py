"""
cuFOLIO constraint definitions for Solana portfolio optimization.

Used by portfolio.py and blueprints/portfolio-optimization/mean_cvar.py.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CVaRConstraint:
    max_cvar: float
    alpha: float = 0.95

    def describe(self) -> str:
        return f"CVaR({self.alpha:.0%}) ≤ {self.max_cvar:.2%}"


@dataclass
class LeverageConstraint:
    max_leverage: float = 1.0

    def describe(self) -> str:
        return f"sum(weights) ≤ {self.max_leverage:.1f}x"


@dataclass
class BudgetConstraint:
    total_usdc: float
    min_position_usdc: float = 10.0

    def describe(self) -> str:
        return f"budget=${self.total_usdc:.0f}  min_pos=${self.min_position_usdc:.0f}"


@dataclass
class CardinalityConstraint:
    max_positions: int

    def describe(self) -> str:
        return f"max_positions={self.max_positions}"


@dataclass
class TurnoverConstraint:
    max_turnover: float
    current_weights: list[float] | None = None

    def describe(self) -> str:
        return f"turnover ≤ {self.max_turnover:.2%}"


@dataclass
class ConcentrationConstraint:
    max_single_weight: float = 0.5

    def describe(self) -> str:
        return f"max_weight_per_asset ≤ {self.max_single_weight:.0%}"


# Clawd safe defaults for Solana perps portfolio
CLAWD_DEFAULT_CONSTRAINTS = [
    CVaRConstraint(max_cvar=0.12, alpha=0.95),
    LeverageConstraint(max_leverage=1.0),
    ConcentrationConstraint(max_single_weight=0.50),
    TurnoverConstraint(max_turnover=0.30),
]
