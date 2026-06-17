"""
Pydantic schemas for Hermes-3 function calling and JSON mode.

Mirrors the schema.py pattern from NousResearch/Hermes-Function-Calling but
adapted for Solana perps and Clawd domain types.
"""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class FunctionCall(BaseModel):
    """Schema for a single tool/function call returned by the model."""
    name: str = Field(..., description="Name of the function to call")
    arguments: dict[str, Any] = Field(..., description="Arguments to pass to the function")

    class Config:
        schema_extra = {"additionalProperties": False}


class FunctionCallList(BaseModel):
    """One or more function calls in a single response."""
    calls: list[FunctionCall]


class TradeOrder(BaseModel):
    """Structured output for a trade order decision."""
    market: str = Field(..., description="Perp market symbol, e.g. SOL-PERP")
    side: str = Field(..., description="'long' or 'short'")
    size_usd: float = Field(..., description="Notional size in USD")
    leverage: float = Field(default=1.0, description="Leverage multiplier (1–10)")
    paper: bool = Field(default=True, description="If true, paper trade only — no real funds")
    rationale: str = Field(..., description="One-sentence reason for the trade")

    class Config:
        schema_extra = {"additionalProperties": False}


class RiskAssessment(BaseModel):
    """Structured risk scoring for a trade or position."""
    market: str
    score: int = Field(..., ge=1, le=10, description="Risk score 1–10 (10 = highest risk)")
    liquidation_price: float = Field(..., description="Estimated liquidation price in USD")
    max_loss_usd: float = Field(..., description="Maximum loss in USD at given size and leverage")
    recommendation: str = Field(..., description="'enter' | 'wait' | 'close'")
    notes: str = Field(default="", description="Additional risk notes")

    class Config:
        schema_extra = {"additionalProperties": False}


class PortfolioSummary(BaseModel):
    """Agent-generated portfolio summary."""
    total_value_usd: float
    sol_balance: float
    open_positions: int
    unrealized_pnl_usd: float
    top_exposure: str = Field(..., description="Market with highest notional exposure")
    health_score: int = Field(..., ge=1, le=10, description="Portfolio health 1–10")


class MarketSignal(BaseModel):
    """Trading signal for a single market."""
    market: str
    signal: str = Field(..., description="'bullish' | 'bearish' | 'neutral'")
    confidence: float = Field(..., ge=0.0, le=1.0)
    entry_price: float
    target_price: float
    stop_price: float
    timeframe: str = Field(..., description="e.g. '4h', '1d'")
    reasoning: str
