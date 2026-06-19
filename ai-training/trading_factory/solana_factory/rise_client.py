"""Read-only Phoenix/Rise market-data client.

This is a minimal Python companion to the TypeScript/Rust Rise SDK. It only
fetches public market/trader data and never builds or signs transactions.
Use the official Rise SDK for production instruction construction.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PHOENIX_API_BASE = "https://perp-api.phoenix.trade"


@dataclass
class RiseReadOnlyConfig:
    api_url: str = PHOENIX_API_BASE
    timeout_seconds: int = 15
    api_key: str = ""


class RiseReadOnlyClient:
    """Small HTTP client for Phoenix public data used by research jobs."""

    def __init__(self, config: RiseReadOnlyConfig | None = None):
        self.config = config or RiseReadOnlyConfig()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        query = f"?{urlencode(params)}" if params else ""
        url = f"{self.config.api_url}{path}{query}"
        headers = {"accept": "application/json"}
        if self.config.api_key:
            headers["authorization"] = f"Bearer {self.config.api_key}"
        request = Request(url, headers=headers)
        with urlopen(request, timeout=self.config.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))

    def exchange_snapshot(self) -> dict[str, Any]:
        return self._get("/v1/exchange/snapshot")

    def list_markets(self) -> dict[str, Any]:
        return self._get("/exchange/markets")

    def market(self, symbol: str) -> dict[str, Any]:
        return self._get(f"/exchange/market/{symbol.upper().replace('-PERP', '')}")

    def candles(self, symbol: str, interval: str = "1h", limit: int = 100) -> dict[str, Any]:
        return self._get("/candles", {"symbol": symbol.upper().replace("-PERP", ""), "interval": interval, "limit": limit})

    def trader_state(self, authority: str) -> dict[str, Any]:
        return self._get(f"/trader/{authority}/state")


def build_rise_data_plan(symbol: str = "SOL") -> dict[str, Any]:
    """Return the read plan used before optimization or paper execution."""
    normalized = symbol.upper().replace("-PERP", "")
    return {
        "provider": "Phoenix Rise SDK / public API",
        "official_sdk": "https://docs.phoenix.trade/sdk/rise",
        "mode": "read_only",
        "symbol": normalized,
        "required_reads": [
            {"name": "exchange_snapshot", "path": "/v1/exchange/snapshot"},
            {"name": "market", "path": f"/exchange/market/{normalized}"},
            {"name": "candles", "path": "/candles", "params": {"symbol": normalized, "interval": "1h", "limit": 500}},
            {"name": "orderbook", "via": "Vulcan market orderbook or official Rise SDK orderbook client"},
            {"name": "funding_history", "via": "Vulcan market funding-rates or official Rise SDK funding client"},
        ],
        "blocked_in_this_client": [
            "order placement",
            "withdrawals",
            "wallet signing",
            "private-key or wallet-password handling",
        ],
    }
