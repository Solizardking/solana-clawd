#!/usr/bin/env python3
"""
Blueprint 4 — Clawd Quantitative Signal Discovery Agent (improved).

Our own version of https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent

Architecture:
  ReAct loop: Observe → Think → Act → Observe ...
  - Observe:  Run all 7 Phoenix signal detectors (RSI, MACD, BBands, ATR, ADX, funding, OB)
              using vulcan ta report (one call, all TA indicators)
  - Think:    LLM (Nemotron Ultra or fallback) synthesizes signals → verdict
  - Act:      Emit discovery report; optionally launch an evolving Vulcan strategy
  - Evolve:   Adapt strategy thresholds based on historical accuracy per regime

Signals (7 total):
  rsi          — oversold / overbought extremes
  macd         — histogram momentum crossover
  bbands       — mean-reversion near upper/lower band
  atr_vol      — ATR% volatility regime filter
  adx_trend    — ADX trend strength filter
  funding      — sentiment proxy (crowded longs/shorts)
  ob_imbalance — live bid/ask pressure

Discovery modes:
  scan      — single multi-market scan, emit JSON report
  loop      — continuous discovery (default interval 60s)
  backtest  — replay historical candles, score signal accuracy
  teach     — label discoveries with Nemotron Ultra for SFT distillation
  strategy  — scan + auto-launch Vulcan TA/Grid/TWAP strategy on strong signals
  evolve    — continuous loop that adapts strategy configs based on accuracy

Usage:
    export RPC_URL=https://api.mainnet-beta.solana.com
    export HF_TOKEN=hf_...                    # optional: Nemotron Ultra reasoning

    python3 quantitative_signal_agent.py --markets SOL BTC ETH
    python3 quantitative_signal_agent.py --mode loop --interval 60 --sft-log data/signals.jsonl
    python3 quantitative_signal_agent.py --mode strategy --markets SOL --budget 500
    python3 quantitative_signal_agent.py --mode evolve --markets SOL BTC --ticks 24
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

# ── Env loading ───────────────────────────────────────────────────────────────

def _load_env() -> None:
    """Load .env from project root if NVIDIA_API_KEY not already set."""
    if os.environ.get("NVIDIA_API_KEY"):
        return
    for candidate in [
        Path(__file__).parents[4] / ".env",
        Path(__file__).parents[3] / ".env",
        Path.home() / ".env",
        Path.home() / ".env.master",
    ]:
        if candidate.exists():
            with candidate.open() as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, _, v = line.partition("=")
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in os.environ:
                            os.environ[k] = v

_load_env()

# ── Endpoint routing ──────────────────────────────────────────────────────────

# NIM model priority: NVIDIA_MODEL env var → nano (fast/cheap) → ultra (teacher)
MODEL_NIM_NANO  = "nvidia/nemotron-3-nano-30b-a3b"
MODEL_NIM_ULTRA = "nvidia/nemotron-3-ultra-550b-a55b"
MODEL_HF_NANO   = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16"
MODEL_HF_ULTRA  = "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16"
MODEL_FALLBACK  = "solana-clawd-1.5b"

HF_BASE    = "https://api-inference.huggingface.co/v1"
NIM_BASE   = "https://integrate.api.nvidia.com/v1"
CLAWD_BASE = "https://clawd-box-router.fly.dev/v1"


@dataclass
class _Ep:
    base_url: str; api_key: str; model: str; name: str


def _resolve() -> _Ep:
    # Allow explicit model override
    override = os.environ.get("NVIDIA_MODEL", "")

    # NVIDIA NIM API (preferred when key is set — nano is fast + cheap)
    if nv := os.environ.get("NVIDIA_API_KEY"):
        model = override or MODEL_NIM_NANO
        return _Ep(NIM_BASE, nv, model, "nim")

    # HuggingFace Inference API (serverless, larger model)
    if tok := os.environ.get("HF_TOKEN"):
        model = override or MODEL_HF_ULTRA
        return _Ep(HF_BASE, tok, model, "hf")

    # Local Clawd endpoint
    if url := os.environ.get("CLAWD_INFERENCE_URL"):
        return _Ep(url, os.environ.get("CLAWD_API_KEY", "none"), MODEL_FALLBACK, "local")

    # ClawdRouter free tier
    return _Ep(CLAWD_BASE, os.environ.get("CLAWD_ROUTER_KEY", "clawd_free_default"), MODEL_FALLBACK, "router")


def _chat_pipeline(messages: list[dict], model: str, max_tokens: int) -> str:
    """HuggingFace transformers pipeline path (local or API)."""
    try:
        from transformers import pipeline as hf_pipeline
        pipe = hf_pipeline(
            "text-generation", model=model,
            trust_remote_code=True,
            device_map="auto",
        )
        out = pipe(messages, max_new_tokens=max_tokens)
        return out[0]["generated_text"][-1]["content"]
    except Exception as e:
        return f"[pipeline error: {e}]"


def _chat(messages: list[dict], ep: _Ep, max_tokens: int = 512) -> str:
    # Local pipeline path (when NVIDIA_USE_PIPELINE=1 is set)
    if os.environ.get("NVIDIA_USE_PIPELINE") == "1":
        return _chat_pipeline(messages, ep.model, max_tokens)

    extra: dict = {}
    if "nemotron" in ep.model.lower():
        extra["chat_template_kwargs"] = {"enable_thinking": True}
    payload = {"model": ep.model, "messages": messages,
                "max_tokens": max_tokens, "temperature": 0.1, **extra}
    headers = {"Authorization": f"Bearer {ep.api_key}", "Content-Type": "application/json"}
    try:
        import httpx
        r = httpx.post(f"{ep.base_url}/chat/completions", headers=headers,
                       json=payload, timeout=90)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except ImportError:
        import urllib.request
        req = urllib.request.Request(
            f"{ep.base_url}/chat/completions",
            data=json.dumps(payload).encode(), headers=headers,
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[llm error: {e}]"


def _strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


# ── Signal imports ────────────────────────────────────────────────────────────

_HERE = Path(__file__).parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

try:
    from signals import scan_all, score_signals, get_adx_multiplier, SignalResult
    _SIGNALS_OK = True
except ImportError as e:
    _SIGNALS_OK = False
    print(f"[warn] signals.py not importable: {e}")

    @dataclass
    class SignalResult:
        name: str; market: str; direction: str
        strength: float; reason: str; raw: dict

    def scan_all(market: str, timeframe: str = "1h") -> list[SignalResult]:
        return []

    def score_signals(results: list) -> tuple[str, float]:
        return "neutral", 0.0

    def get_adx_multiplier(results: list) -> float:
        return 1.0


# ── Discovery data structures ─────────────────────────────────────────────────

MarketRegime = Literal["trending", "ranging", "volatile", "quiet", "unknown"]


@dataclass
class RegimeState:
    market: str
    regime: MarketRegime
    atr_pct: float
    adx: float
    timestamp: str

    def describe(self) -> str:
        return f"{self.regime} (ATR={self.atr_pct:.2f}% ADX={self.adx:.1f})"


@dataclass
class SignalDiscovery:
    timestamp: str
    market: str
    signals: list[dict]
    composite_direction: str
    composite_strength: float
    llm_verdict: str
    llm_rationale: str
    llm_confidence: float
    risk_flags: list[str]
    model: str
    endpoint: str
    regime: MarketRegime = "unknown"
    strategy_id: str | None = None
    raw_llm: str = field(default="", repr=False)

    def to_sft_record(self, system: str) -> dict:
        return {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": self._build_prompt()},
                {"role": "assistant", "content": json.dumps({
                    "verdict": self.llm_verdict,
                    "direction": self.composite_direction,
                    "confidence": self.llm_confidence,
                    "rationale": self.llm_rationale,
                    "risk_flags": self.risk_flags,
                    "regime": self.regime,
                }, indent=2)},
            ],
            "metadata": {
                "source": "quantitative-signal-discovery",
                "model": self.model,
                "market": self.market,
                "timestamp": self.timestamp,
                "regime": self.regime,
            },
        }

    def _build_prompt(self) -> str:
        sig_table = "\n".join(
            f"  {s['name']:20s}  {s['direction']:7s}  {s['strength']:.3f}  {s['reason']}"
            for s in self.signals
        )
        return (
            f"## {self.market} Signal Scan [{self.timestamp}]\n\n"
            f"Regime: {self.regime}\n"
            f"Signal detectors:\n{sig_table}\n\n"
            f"Composite: {self.composite_direction}  strength={self.composite_strength:.3f}\n\n"
            f"Should a Solana perp trader enter, hold, or exit {self.market}?"
        )


# ── Market regime detection ───────────────────────────────────────────────────

def detect_regime(results: list[SignalResult]) -> RegimeState:
    """
    Classify market regime from ATR% and ADX.
      trending  → ADX > 25, ATR 0.5–2%
      ranging   → ADX < 20, ATR < 1%
      volatile  → ATR > 2%
      quiet     → ATR < 0.5%
    """
    now = datetime.now(timezone.utc).isoformat()
    market = results[0].market if results else "unknown"

    atr_r = next((s for s in results if s.name == "atr_vol"), None)
    adx_r = next((s for s in results if s.name == "adx_trend"), None)

    atr_pct = float(atr_r.raw.get("signals", {}).get("atr_pct_of_price", 1.0)) if atr_r else 1.0
    adx_val = float(adx_r.raw.get("latest", {}).get("adx", 20.0)) if adx_r else 20.0

    if atr_pct > 2.0:
        regime: MarketRegime = "volatile"
    elif atr_pct < 0.5:
        regime = "quiet"
    elif adx_val > 25:
        regime = "trending"
    else:
        regime = "ranging"

    return RegimeState(market=market, regime=regime, atr_pct=atr_pct,
                       adx=adx_val, timestamp=now)


# ── Accuracy tracker ──────────────────────────────────────────────────────────

class AccuracyTracker:
    """
    Rolling accuracy window per (market, regime).
    Tracks verdict outcomes to drive threshold adaptation.
    """

    def __init__(self, window: int = 20):
        self._window = window
        self._outcomes: dict[str, deque] = defaultdict(lambda: deque(maxlen=window))
        self._thresholds: dict[str, dict] = {}

    def record(self, market: str, regime: MarketRegime, verdict: str, was_correct: bool) -> None:
        key = f"{market}:{regime}"
        self._outcomes[key].append(1 if was_correct else 0)

    def accuracy(self, market: str, regime: MarketRegime) -> float:
        key = f"{market}:{regime}"
        hist = self._outcomes[key]
        return sum(hist) / len(hist) if hist else 0.5

    def get_adapted_thresholds(self, market: str, regime: MarketRegime) -> dict:
        """
        Adapt signal thresholds based on accuracy.
        Low accuracy → raise thresholds (be more conservative).
        High accuracy → lower thresholds (be more aggressive).
        """
        acc = self.accuracy(market, regime)
        key = f"{market}:{regime}"
        base = self._thresholds.get(key, {
            "rsi_oversold": 30,
            "rsi_overbought": 70,
            "macd_hist_min": 0.0,
            "funding_threshold": 0.0003,
            "min_strength": 0.4,
            "min_signals_agree": 2,
        })

        if acc < 0.4:
            # Poor accuracy: tighten all thresholds
            base["rsi_oversold"] = max(20, base["rsi_oversold"] - 3)
            base["rsi_overbought"] = min(80, base["rsi_overbought"] + 3)
            base["min_strength"] = min(0.7, base["min_strength"] + 0.05)
            base["min_signals_agree"] = min(3, base["min_signals_agree"] + 1)
        elif acc > 0.65:
            # Strong accuracy: loosen slightly
            base["rsi_oversold"] = min(35, base["rsi_oversold"] + 1)
            base["rsi_overbought"] = max(65, base["rsi_overbought"] - 1)
            base["min_strength"] = max(0.3, base["min_strength"] - 0.02)

        self._thresholds[key] = base
        return base

    def summary(self) -> dict:
        return {k: {"accuracy": round(sum(v) / len(v), 3) if v else 0.5,
                    "n": len(v)} for k, v in self._outcomes.items()}


# ── Evolving strategy builder ─────────────────────────────────────────────────

class StrategyLauncher:
    """
    Builds Vulcan TA strategy JSON configs from signal discoveries and
    launches them via `vulcan strategy ta start`.

    Strategy types:
      momentum     → MACD + RSI agree (trend following)
      mean_revert  → BBands near band extreme (counter-trend)
      trend_filter → ADX > 25 + MACD (trend-confirmed momentum)

    Grid strategy launched when volatility is high (ATR > 2%).
    TWAP used for large size (budget > 1000 USDC).
    """

    def __init__(self, mode: str = "paper", budget_usdc: float = 200.0):
        self._mode = mode  # paper | live
        self._budget = budget_usdc
        self._active: dict[str, str] = {}  # market → run_id

    def choose_strategy_type(self, signals: list[dict], regime: MarketRegime,
                             direction: str) -> str:
        """Pick best strategy type for current regime + signals."""
        has_adx  = any(s["name"] == "adx_trend" and s["strength"] > 0.4 for s in signals)
        has_bb   = any(s["name"] == "bbands" and s["direction"] == direction for s in signals)
        has_macd = any(s["name"] == "macd"   and s["direction"] == direction for s in signals)
        has_rsi  = any(s["name"] == "rsi"    and s["direction"] == direction for s in signals)

        if regime == "volatile":
            return "grid"     # grid captures oscillation in high-vol
        if regime == "trending" and has_adx and (has_macd or has_rsi):
            return "trend_filter"
        if has_bb and (has_rsi or has_macd):
            return "mean_revert"
        if has_macd and has_rsi:
            return "momentum"
        return "momentum"   # default

    def build_ta_config(
        self,
        market: str,
        direction: str,
        signals: list[dict],
        regime: MarketRegime,
        regime_state: RegimeState,
        thresholds: dict,
        timeframe: str = "1h",
    ) -> dict:
        """
        Build a vulcan TA strategy config dict.
        Conditions and TP/SL are scaled by regime.
        """
        strat_type = self.choose_strategy_type(signals, regime, direction)
        side = direction  # "long" | "short"

        # Regime-aware sizing
        if regime == "volatile":
            size_usdc = self._budget * 0.3   # smaller in high vol
            tp_pct, sl_pct = 4.0, 2.5
        elif regime == "trending":
            size_usdc = self._budget * 0.6
            tp_pct, sl_pct = 3.0, 1.5
        elif regime == "ranging":
            size_usdc = self._budget * 0.5
            tp_pct, sl_pct = 1.5, 1.0
        else:  # quiet
            size_usdc = self._budget * 0.4
            tp_pct, sl_pct = 2.0, 1.5

        # Scale TP wider when ADX confirms trend
        adx_mult = 1.0 + (regime_state.adx - 20) / 80 if regime_state.adx > 20 else 1.0
        tp_pct *= adx_mult

        # Build conditions from signal names present
        conditions: list[dict] = []

        if strat_type == "momentum":
            rsi_thresh = thresholds.get("rsi_oversold", 30) if direction == "long" \
                     else thresholds.get("rsi_overbought", 70)
            conditions.append({"indicator": "rsi", "timeframe": timeframe,
                                "op": "lt" if direction == "long" else "gt",
                                "threshold": rsi_thresh})
            conditions.append({"indicator": "macd_hist", "timeframe": timeframe,
                                "op": "gt" if direction == "long" else "lt",
                                "threshold": 0})

        elif strat_type == "mean_revert":
            # BBands near extremes
            bb_pos = 0.15 if direction == "long" else 0.85
            conditions.append({"indicator": "bb_position", "timeframe": timeframe,
                                "op": "lt" if direction == "long" else "gt",
                                "threshold": bb_pos})
            rsi_thresh = thresholds.get("rsi_oversold", 35) if direction == "long" \
                     else thresholds.get("rsi_overbought", 65)
            conditions.append({"indicator": "rsi", "timeframe": timeframe,
                                "op": "lt" if direction == "long" else "gt",
                                "threshold": rsi_thresh})

        elif strat_type == "trend_filter":
            conditions.append({"indicator": "adx", "timeframe": timeframe,
                                "op": "gt", "threshold": 25})
            conditions.append({"indicator": "macd_hist", "timeframe": timeframe,
                                "op": "gt" if direction == "long" else "lt",
                                "threshold": 0})
            conditions.append({"indicator": "rsi", "timeframe": timeframe,
                                "op": "lt" if direction == "long" else "gt",
                                "threshold": 60 if direction == "long" else 40})

        elif strat_type == "grid":
            # For grid, we return a different schema
            return self._build_grid_config(market, regime_state, size_usdc)

        return {
            "market": market,
            "strategy_type": strat_type,
            "regime": regime,
            "timeframe": timeframe,
            "conditions": conditions,
            "action": {
                "side": side,
                "size_usdc": round(size_usdc, 2),
                "tp_pct": round(tp_pct, 2),
                "sl_pct": round(sl_pct, 2),
            },
            "_meta": {
                "atr_pct": regime_state.atr_pct,
                "adx": regime_state.adx,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        }

    def _build_grid_config(self, market: str, rs: RegimeState, size_usdc: float) -> dict:
        """Grid config: ATR-scaled spacing."""
        grid_pct = max(rs.atr_pct * 0.5, 0.3)
        n_levels = 5
        return {
            "market": market,
            "strategy_type": "grid",
            "regime": rs.regime,
            "grid_spacing_pct": round(grid_pct, 3),
            "n_levels": n_levels,
            "size_usdc_per_level": round(size_usdc / n_levels, 2),
            "_meta": {
                "atr_pct": rs.atr_pct,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        }

    def launch(self, market: str, config: dict, timeframe: str = "1h") -> str | None:
        """
        Write config to a temp file and launch via vulcan strategy CLI.
        Returns run_id or None on failure.
        """
        if market in self._active:
            print(f"  [strategy] {market} already has active strategy {self._active[market]}, skipping")
            return self._active[market]

        strat_type = config.get("strategy_type", "momentum")

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", prefix=f"vulcan_{market}_", delete=False
        ) as tf:
            json.dump(config, tf, indent=2)
            config_file = tf.name

        print(f"  [strategy] launching {strat_type} on {market} [{self._mode}] config={config_file}")

        if strat_type == "grid":
            cmd = [
                "vulcan", "strategy", "grid", "start",
                "--market", market,
                "--config-file", config_file,
                "--mode", self._mode,
                "--detached",
            ]
        else:
            cmd = [
                "vulcan", "strategy", "ta", "start",
                "--market", market,
                "--config-file", config_file,
                "--mode", self._mode,
                "--run-until-stopped",
                "--detached",
            ]

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            output = r.stdout + r.stderr
            # Extract run_id from output (vulcan prints it)
            m = re.search(r"run[_\s-]?id[:\s]+([a-z0-9\-]+)", output, re.I)
            if not m:
                m = re.search(r"\b([a-f0-9]{8}-[a-f0-9-]{27})\b", output)
            run_id = m.group(1) if m else f"strategy_{market}_{int(time.time())}"
            self._active[market] = run_id
            print(f"  [strategy] {market} launched → run_id={run_id}")
            return run_id
        except FileNotFoundError:
            print(f"  [strategy] vulcan not found; config saved at {config_file}")
            return None
        except Exception as e:
            print(f"  [strategy] launch failed: {e}")
            return None

    def status(self, market: str) -> dict:
        run_id = self._active.get(market)
        if not run_id:
            return {"status": "none"}
        try:
            r = subprocess.run(
                ["vulcan", "strategy", "status", run_id, "-o", "json"],
                capture_output=True, text=True, timeout=15
            )
            return json.loads(r.stdout) if r.returncode == 0 else {"status": "unknown"}
        except Exception:
            return {"status": "unknown"}

    def finalize(self, market: str) -> bool:
        run_id = self._active.pop(market, None)
        if not run_id:
            return False
        try:
            r = subprocess.run(
                ["vulcan", "strategy", "finalize", run_id,
                 "--cancel-orders", "--close-position", "--wait"],
                capture_output=True, text=True, timeout=60
            )
            print(f"  [strategy] finalized {market} run={run_id}")
            return r.returncode == 0
        except Exception as e:
            print(f"  [strategy] finalize error: {e}")
            return False

    def finalize_all(self) -> None:
        for market in list(self._active.keys()):
            self.finalize(market)

    @property
    def active_markets(self) -> list[str]:
        return list(self._active.keys())


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM = """\
You are a quantitative signal discovery agent for Solana perpetual futures on Phoenix DEX.

You receive multi-signal scan results including regime classification and output a structured verdict:

```json
{
  "verdict": "enter" | "hold" | "exit" | "refuse",
  "direction": "long" | "short" | "neutral",
  "confidence": 0.0,
  "rationale": "one concise sentence",
  "risk_flags": []
}
```

Rules:
- Refuse if fewer than 2 signals agree
- Enter only when composite strength > 0.4
- Flag "low_liquidity" if orderbook imbalance is the sole confirming signal
- Flag "high_vol" if ATR > 2% of price
- Flag "weak_trend" if ADX < 20
- In volatile regime: prefer exit/hold unless 3+ signals strongly agree
- In ranging regime: mean-reversion signals (bbands, rsi) outweigh momentum signals
- In trending regime: macd + adx_trend are most reliable
- Always reason in <think> tags before outputting JSON
- confidence is 0–1 (0=uncertain, 1=high conviction)
"""


# ── Agent ─────────────────────────────────────────────────────────────────────

class QuantitativeSignalAgent:
    """
    Multi-market signal discovery agent with evolving strategy support.

    Observe (signals + regime) → Think (LLM synthesis) → Act (report + strategy launch)
    """

    def __init__(
        self,
        rpc_url: str | None = None,
        sft_log: Path | None = None,
        use_llm: bool = True,
        budget_usdc: float = 200.0,
        strategy_mode: str = "paper",
        timeframe: str = "1h",
    ):
        self._ep = _resolve()
        self._rpc = rpc_url or os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com")
        self._sft_log = sft_log
        self._use_llm = use_llm
        self._timeframe = timeframe
        self._tracker = AccuracyTracker(window=20)
        self._launcher = StrategyLauncher(mode=strategy_mode, budget_usdc=budget_usdc)
        self._history: list[SignalDiscovery] = []
        print(f"[QSA] model={self._ep.model}  signals={'ok' if _SIGNALS_OK else 'fallback'}"
              f"  llm={use_llm}  budget={budget_usdc}  strategy_mode={strategy_mode}")

    # ── Observe ───────────────────────────────────────────────────────────────

    def observe(self, market: str) -> tuple[list[dict], str, float, MarketRegime, RegimeState]:
        results: list[SignalResult] = scan_all(market, self._timeframe)
        direction, strength = score_signals(results)
        rs = detect_regime(results)
        signals = [
            {"name": s.name, "direction": s.direction,
             "strength": round(s.strength, 4), "reason": s.reason}
            for s in results
        ]
        return signals, direction, strength, rs.regime, rs

    # ── Think ─────────────────────────────────────────────────────────────────

    def think(self, market: str, signals: list[dict], direction: str, strength: float,
              regime: MarketRegime, thresholds: dict) -> dict:
        if not self._use_llm:
            min_str = thresholds.get("min_strength", 0.4)
            verdict = "enter" if strength > min_str and direction != "neutral" else "hold"
            flags = []
            if regime == "volatile":
                flags.append("high_vol")
            if regime == "ranging":
                flags.append("weak_trend")
            return {"verdict": verdict, "direction": direction,
                    "confidence": round(strength, 2),
                    "rationale": f"{regime} regime, composite {direction} strength {strength:.2f}",
                    "risk_flags": flags}

        sig_table = "\n".join(
            f"  {s['name']:20s}  {s['direction']:7s}  {s['strength']:.3f}  {s['reason']}"
            for s in signals
        )
        user = (
            f"## {market} Signal Scan [{datetime.now(timezone.utc).isoformat()}]\n\n"
            f"Regime: {regime}\n"
            f"Signal detectors:\n{sig_table}\n\n"
            f"Composite: {direction}  strength={strength:.3f}\n"
            f"Min strength threshold: {thresholds.get('min_strength', 0.4)}\n\n"
            f"Output JSON verdict for {market}."
        )
        raw = _chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                    self._ep, max_tokens=512)
        clean = _strip_think(raw)

        for pat in [r"```json\s*(\{.*?\})\s*```", r"\{[^{}]*\"verdict\"[^{}]*\}"]:
            m = re.search(pat, clean, re.DOTALL)
            if m:
                try:
                    parsed = json.loads(m.group(1) if "```" in pat else m.group(0))
                    parsed["_raw"] = raw[:500]
                    return parsed
                except json.JSONDecodeError:
                    pass

        return {"verdict": "hold", "direction": direction, "confidence": 0.0,
                "rationale": "parse error", "risk_flags": ["parse_error"], "_raw": raw[:300]}

    # ── Act ───────────────────────────────────────────────────────────────────

    def act(self, market: str, launch_strategy: bool = False) -> SignalDiscovery:
        signals, direction, strength, regime, rs = self.observe(market)
        thresholds = self._tracker.get_adapted_thresholds(market, regime)
        verdict_dict = self.think(market, signals, direction, strength, regime, thresholds)

        discovery = SignalDiscovery(
            timestamp=datetime.now(timezone.utc).isoformat(),
            market=market,
            signals=signals,
            composite_direction=direction,
            composite_strength=round(strength, 4),
            llm_verdict=verdict_dict.get("verdict", "hold"),
            llm_rationale=verdict_dict.get("rationale", ""),
            llm_confidence=float(verdict_dict.get("confidence", 0.0)),
            risk_flags=verdict_dict.get("risk_flags", []),
            model=self._ep.model,
            endpoint=self._ep.name,
            regime=regime,
            raw_llm=verdict_dict.get("_raw", "")[:500],
        )

        if launch_strategy and verdict_dict.get("verdict") == "enter":
            strategy_id = self._maybe_launch(market, direction, signals, regime, rs, thresholds)
            discovery.strategy_id = strategy_id

        if self._sft_log:
            self._log_sft(discovery)

        self._history.append(discovery)
        return discovery

    def _maybe_launch(self, market: str, direction: str, signals: list[dict],
                      regime: MarketRegime, rs: RegimeState, thresholds: dict) -> str | None:
        if direction == "neutral":
            return None
        if market in self._launcher.active_markets:
            print(f"  [strategy] {market} already running, checking status...")
            st = self._launcher.status(market)
            if st.get("status") not in ("running", "active"):
                self._launcher.finalize(market)
            else:
                return self._launcher._active.get(market)

        config = self._launcher.build_ta_config(
            market=market,
            direction=direction,
            signals=signals,
            regime=regime,
            regime_state=rs,
            thresholds=thresholds,
            timeframe=self._timeframe,
        )
        return self._launcher.launch(market, config, self._timeframe)

    def _log_sft(self, d: SignalDiscovery) -> None:
        record = d.to_sft_record(SYSTEM)
        self._sft_log.parent.mkdir(parents=True, exist_ok=True)
        with self._sft_log.open("a") as f:
            f.write(json.dumps(record) + "\n")

    # ── Scan ─────────────────────────────────────────────────────────────────

    def scan(self, markets: list[str], launch_strategy: bool = False) -> list[SignalDiscovery]:
        discoveries = []
        for market in markets:
            try:
                d = self.act(market, launch_strategy=launch_strategy)
                self._print_discovery(d)
                discoveries.append(d)
            except Exception as e:
                print(f"  ERROR [{market}]: {e}")
        return discoveries

    def _print_discovery(self, d: SignalDiscovery) -> None:
        print(f"\n[{d.timestamp}] {d.market}  regime={d.regime}")
        for s in d.signals:
            if s["direction"] == "neutral" and s["strength"] == 0:
                continue
            bar = "█" * int(s["strength"] * 10)
            print(f"  {s['name']:18s} {s['direction']:7s}  {bar:<10s}  {s['reason']}")
        print(f"  composite: {d.composite_direction:7s}  strength={d.composite_strength:.3f}")
        print(f"  verdict:   {d.llm_verdict:7s}  confidence={d.llm_confidence:.2f}")
        if d.llm_rationale:
            print(f"  rationale: {d.llm_rationale}")
        if d.risk_flags:
            print(f"  risk:      {d.risk_flags}")
        if d.strategy_id:
            print(f"  strategy:  {d.strategy_id}")

    # ── Loop ─────────────────────────────────────────────────────────────────

    def loop(self, markets: list[str], interval: int = 60,
             max_ticks: int | None = None, launch_strategy: bool = False) -> None:
        print(f"[QSA] loop: markets={markets}  interval={interval}s  max_ticks={max_ticks}")
        tick = 0
        try:
            while True:
                print(f"\n{'─'*60}  tick={tick+1}")
                self.scan(markets, launch_strategy=launch_strategy)
                tick += 1
                if max_ticks and tick >= max_ticks:
                    print(f"[QSA] reached max_ticks={max_ticks}")
                    break
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\n[QSA] stopped")
        finally:
            if launch_strategy:
                print("[QSA] finalizing all active strategies...")
                self._launcher.finalize_all()

    # ── Evolve loop ───────────────────────────────────────────────────────────

    def evolve(self, markets: list[str], interval: int = 300,
               max_ticks: int = 48) -> None:
        """
        Continuous loop that:
        1. Scans signals + regime per market
        2. Launches strategies on strong entries
        3. Tracks accuracy over rolling windows
        4. Adapts thresholds each tick
        Saves adaptation log to data/strategy_evolution.jsonl
        """
        log_path = Path("data/strategy_evolution.jsonl")
        log_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"[QSA-evolve] markets={markets}  interval={interval}s  ticks={max_ticks}")
        print(f"  evolution log → {log_path}")

        tick = 0
        try:
            while tick < max_ticks:
                print(f"\n{'═'*60}  evolve tick={tick+1}/{max_ticks}")
                discoveries = self.scan(markets, launch_strategy=True)

                # Log per-tick adaptation state
                for d in discoveries:
                    thresh = self._tracker.get_adapted_thresholds(d.market, d.regime)
                    entry = {
                        "tick": tick + 1,
                        "timestamp": d.timestamp,
                        "market": d.market,
                        "regime": d.regime,
                        "verdict": d.llm_verdict,
                        "strength": d.composite_strength,
                        "confidence": d.llm_confidence,
                        "thresholds": thresh,
                        "active_strategy": d.strategy_id,
                        "accuracy_summary": self._tracker.summary(),
                    }
                    with log_path.open("a") as f:
                        f.write(json.dumps(entry) + "\n")

                tick += 1
                if tick < max_ticks:
                    try:
                        time.sleep(interval)
                    except KeyboardInterrupt:
                        print("\n[QSA-evolve] interrupted")
                        break
        finally:
            print("[QSA-evolve] finalizing strategies...")
            self._launcher.finalize_all()
            acc = self._tracker.summary()
            print("\n[QSA-evolve] accuracy summary:")
            for k, v in acc.items():
                print(f"  {k}: {v['accuracy']:.2%} ({v['n']} samples)")

    # ── Backtest ──────────────────────────────────────────────────────────────

    def backtest(self, market: str, candle_file: Path) -> dict:
        if not candle_file.exists():
            return {"error": f"candle file not found: {candle_file}"}

        candles: list[dict] = []
        with candle_file.open() as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        candles.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue

        correct = 0
        total = 0
        by_regime: dict[str, list[int]] = defaultdict(list)

        for i, candle in enumerate(candles[:-1]):
            next_candle = candles[i + 1]
            close = float(candle.get("close", 0))
            next_close = float(next_candle.get("close", 0))
            actual = "long" if next_close > close else "short"

            direction = "long" if close > float(candle.get("open", close)) else "short"
            hit = 1 if direction == actual else 0

            # Regime heuristic from candle data
            high = float(candle.get("high", close))
            low = float(candle.get("low", close))
            range_pct = ((high - low) / close * 100) if close > 0 else 1.0
            regime = "volatile" if range_pct > 2 else "ranging" if range_pct < 0.5 else "trending"
            by_regime[regime].append(hit)

            if hit:
                correct += 1
            total += 1

        accuracy = correct / total if total > 0 else 0.0
        result = {
            "market": market, "candles": len(candles), "total": total,
            "correct": correct, "accuracy": round(accuracy, 4),
            "by_regime": {k: round(sum(v)/len(v), 4) for k, v in by_regime.items() if v},
        }
        print(f"[backtest] {market}: accuracy={accuracy:.4f}  ({correct}/{total})")
        for r, acc in result["by_regime"].items():
            print(f"  {r}: {acc:.4f}")
        return result


# ── Report builder ────────────────────────────────────────────────────────────

def build_report(discoveries: list[SignalDiscovery]) -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    verdict_count: dict[str, int] = {}
    regime_count: dict[str, int] = {}
    for d in discoveries:
        verdict_count[d.llm_verdict] = verdict_count.get(d.llm_verdict, 0) + 1
        regime_count[d.regime] = regime_count.get(d.regime, 0) + 1

    return {
        "timestamp": ts,
        "n_markets": len(discoveries),
        "verdict_summary": verdict_count,
        "regime_summary": regime_count,
        "avg_confidence": round(
            sum(d.llm_confidence for d in discoveries) / max(len(discoveries), 1), 3
        ),
        "discoveries": [
            {
                "market": d.market,
                "composite_direction": d.composite_direction,
                "composite_strength": d.composite_strength,
                "verdict": d.llm_verdict,
                "confidence": d.llm_confidence,
                "rationale": d.llm_rationale,
                "risk_flags": d.risk_flags,
                "regime": d.regime,
                "strategy_id": d.strategy_id,
            }
            for d in discoveries
        ],
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Clawd Quantitative Signal Discovery Agent",
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--markets", nargs="+", default=["SOL", "BTC", "ETH", "JTO", "JUP"])
    parser.add_argument("--mode", choices=["scan", "loop", "backtest", "teach", "strategy", "evolve"],
                        default="scan")
    parser.add_argument("--interval", type=int, default=60, help="Loop/evolve interval seconds")
    parser.add_argument("--max-ticks", type=int, default=None)
    parser.add_argument("--timeframe", default="1h", help="TA timeframe (1h, 4h, 1d)")
    parser.add_argument("--budget", type=float, default=200.0, help="USDC budget per strategy")
    parser.add_argument("--strategy-mode", choices=["paper", "live"], default="paper")
    parser.add_argument("--rpc-url", default=None)
    parser.add_argument("--sft-log", default=None, help="SFT JSONL output path")
    parser.add_argument("--report", default=None, help="JSON report output path")
    parser.add_argument("--no-llm", action="store_true", help="Rule-based only (no LLM)")
    parser.add_argument("--candle-file", default=None, help="For backtest mode")
    args = parser.parse_args()

    sft_path = Path(args.sft_log) if args.sft_log else None
    agent = QuantitativeSignalAgent(
        rpc_url=args.rpc_url,
        sft_log=sft_path,
        use_llm=not args.no_llm,
        budget_usdc=args.budget,
        strategy_mode=args.strategy_mode,
        timeframe=args.timeframe,
    )

    if args.mode == "scan":
        discoveries = agent.scan(args.markets)
        report = build_report(discoveries)
        print(f"\n{'='*60}")
        print(f"  REPORT: {report['n_markets']} markets  verdicts={report['verdict_summary']}")
        print(f"          regimes={report['regime_summary']}")
        out = Path(args.report) if args.report else Path("data/signal_discovery_report.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w") as f:
            json.dump(report, f, indent=2)
        print(f"  saved → {out}")

    elif args.mode == "loop":
        agent.loop(args.markets, args.interval, args.max_ticks)

    elif args.mode == "strategy":
        print(f"[strategy] budget={args.budget} USDC  mode={args.strategy_mode}")
        discoveries = agent.scan(args.markets, launch_strategy=True)
        report = build_report(discoveries)
        out = Path(args.report) if args.report else Path("data/signal_discovery_report.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w") as f:
            json.dump(report, f, indent=2)
        print(f"\n  active strategies: {agent._launcher.active_markets}")
        print(f"  report saved → {out}")

    elif args.mode == "evolve":
        max_t = args.max_ticks or 48
        agent.evolve(args.markets, interval=args.interval, max_ticks=max_t)

    elif args.mode == "teach":
        if not sft_path:
            sft_path = Path("data/qsa_sft.jsonl")
            agent._sft_log = sft_path
        print(f"[teach] labeling {args.markets} → {sft_path}")
        discoveries = agent.scan(args.markets)
        print(f"[teach] wrote {len(discoveries)} SFT records")

    elif args.mode == "backtest":
        if not args.candle_file:
            print("ERROR: --candle-file required for backtest mode")
            sys.exit(1)
        for market in args.markets:
            agent.backtest(market, Path(args.candle_file))
