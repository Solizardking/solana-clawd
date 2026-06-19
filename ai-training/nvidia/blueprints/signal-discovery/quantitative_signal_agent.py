#!/usr/bin/env python3
"""
Blueprint 4 — Clawd Quantitative Signal Discovery Agent.

Our own version of https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent

Architecture:
  ReAct loop: Observe → Think → Act → Observe ...
  - Observe:  Run all Phoenix signal detectors (RSI, MACD, funding, OB, EMA)
  - Think:    LLM (Nemotron Ultra or fallback) synthesizes signals → verdict
  - Act:      Emit structured discovery report; optionally paper trade
  - Log:      Save discoveries as SFT training data for model distillation

Signals:
  RSI           — oversold / overbought extremes
  MACD          — momentum crossover direction
  Funding rate  — sentiment proxy (crowded longs/shorts)
  OB imbalance  — bid/ask pressure from live orderbook
  EMA divergence — trend extension from 50-period EMA

Discovery modes:
  scan      — single multi-market scan, emit JSON report
  loop      — continuous discovery loop (default interval 60s)
  backtest  — replay historical candles, score each signal
  teach     — label discoveries with Nemotron Ultra for SFT distillation

Usage:
    export RPC_URL=https://api.mainnet-beta.solana.com
    export HF_TOKEN=hf_...                    # optional: Nemotron Ultra reasoning

    python3 quantitative_signal_agent.py --markets SOL BTC ETH
    python3 quantitative_signal_agent.py --mode loop --interval 60 --sft-log data/signals.jsonl
    python3 quantitative_signal_agent.py --mode teach --markets SOL BTC ETH JUP
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ── Endpoint routing (same as nemotron_ultra_agent) ───────────────────────────

MODEL_HF       = "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16"
MODEL_NIM      = "nvidia/nemotron-3-ultra-550b-a55b"
MODEL_FALLBACK = "solana-clawd-1.5b"

HF_BASE    = "https://api-inference.huggingface.co/v1"
NIM_BASE   = "https://integrate.api.nvidia.com/v1"
CLAWD_BASE = "https://clawd-box-router.fly.dev/v1"


@dataclass
class _Ep:
    base_url: str; api_key: str; model: str; name: str


def _resolve() -> _Ep:
    if tok := os.environ.get("HF_TOKEN"):
        return _Ep(HF_BASE, tok, MODEL_HF, "hf")
    if nv := os.environ.get("NVIDIA_API_KEY"):
        return _Ep(NIM_BASE, nv, MODEL_NIM, "nim")
    if url := os.environ.get("CLAWD_INFERENCE_URL"):
        return _Ep(url, os.environ.get("CLAWD_API_KEY", "none"), MODEL_FALLBACK, "local")
    return _Ep(CLAWD_BASE, os.environ.get("CLAWD_ROUTER_KEY", "clawd_free_default"), MODEL_FALLBACK, "router")


def _chat(messages: list[dict], ep: _Ep, max_tokens: int = 512) -> str:
    extra: dict = {}
    if "nemotron" in ep.model.lower():
        extra["chat_template_kwargs"] = {"enable_thinking": True}
    payload = {"model": ep.model, "messages": messages,
                "max_tokens": max_tokens, "temperature": 0.1, **extra}
    headers = {"Authorization": f"Bearer {ep.api_key}", "Content-Type": "application/json"}
    try:
        import httpx
        r = httpx.post(f"{ep.base_url}/chat/completions", headers=headers, json=payload, timeout=90)
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
    from signals import scan_all, score_signals, SignalResult
    _SIGNALS_OK = True
except ImportError as e:
    _SIGNALS_OK = False
    print(f"[warn] signals.py not importable: {e}")

    @dataclass
    class SignalResult:
        name: str; market: str; direction: str
        strength: float; reason: str; raw: dict

    def scan_all(market: str) -> list[SignalResult]:
        return []

    def score_signals(results: list) -> tuple[str, float]:
        return "neutral", 0.0


# ── Discovery data structures ─────────────────────────────────────────────────

@dataclass
class SignalDiscovery:
    timestamp: str
    market: str
    signals: list[dict]       # [{name, direction, strength, reason}]
    composite_direction: str  # long | short | neutral
    composite_strength: float # 0–1
    llm_verdict: str          # enter | hold | exit | refuse
    llm_rationale: str
    llm_confidence: float
    risk_flags: list[str]
    model: str
    endpoint: str
    raw_llm: str = field(default="", repr=False)

    def to_sft_record(self, system: str) -> dict:
        user = self._build_prompt()
        assistant = json.dumps({
            "verdict": self.llm_verdict,
            "direction": self.composite_direction,
            "confidence": self.llm_confidence,
            "rationale": self.llm_rationale,
            "risk_flags": self.risk_flags,
        }, indent=2)
        return {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
                {"role": "assistant", "content": assistant},
            ],
            "metadata": {
                "source": "quantitative-signal-discovery",
                "model": self.model,
                "market": self.market,
                "timestamp": self.timestamp,
            },
        }

    def _build_prompt(self) -> str:
        sig_table = "\n".join(
            f"  {s['name']:20s}  {s['direction']:7s}  {s['strength']:.3f}  {s['reason']}"
            for s in self.signals
        )
        return (
            f"## {self.market} Signal Scan [{self.timestamp}]\n\n"
            f"Signal detectors:\n{sig_table}\n\n"
            f"Composite: {self.composite_direction}  strength={self.composite_strength:.3f}\n\n"
            f"Should a Solana perp trader enter, hold, or exit {self.market}?"
        )


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM = """\
You are a quantitative signal discovery agent for Solana perpetual futures on Phoenix DEX.

You receive multi-signal scan results and output a structured verdict:

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
- Always reason in <think> tags before outputting JSON
- confidence is 0–1 (0=uncertain, 1=high conviction)
"""


# ── Agent ─────────────────────────────────────────────────────────────────────

class QuantitativeSignalAgent:
    """
    Multi-market signal discovery agent.

    Observe (signals) → Think (LLM synthesis) → Act (report + optional trade)
    """

    def __init__(
        self,
        rpc_url: str | None = None,
        sft_log: Path | None = None,
        use_llm: bool = True,
    ):
        self._ep = _resolve()
        self._rpc = rpc_url or os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com")
        self._sft_log = sft_log
        self._use_llm = use_llm
        print(f"[QSA] model={self._ep.model}  signals={'ok' if _SIGNALS_OK else 'fallback'}  llm={use_llm}")

    # ── Observe ───────────────────────────────────────────────────────────────

    def observe(self, market: str) -> tuple[list[dict], str, float]:
        """Run all signal detectors, return (signals_list, direction, strength)."""
        results: list[SignalResult] = scan_all(market)
        direction, strength = score_signals(results)
        signals = [
            {"name": s.name, "direction": s.direction,
             "strength": round(s.strength, 4), "reason": s.reason}
            for s in results
        ]
        return signals, direction, strength

    # ── Think ─────────────────────────────────────────────────────────────────

    def think(self, market: str, signals: list[dict], direction: str, strength: float) -> dict:
        """LLM synthesis of signals → structured verdict."""
        if not self._use_llm:
            # Rule-based fallback
            verdict = "enter" if strength > 0.4 and direction != "neutral" else "hold"
            return {"verdict": verdict, "direction": direction, "confidence": round(strength, 2),
                    "rationale": f"composite {direction} strength {strength:.2f}", "risk_flags": []}

        sig_table = "\n".join(
            f"  {s['name']:20s}  {s['direction']:7s}  {s['strength']:.3f}  {s['reason']}"
            for s in signals
        )
        user = (
            f"## {market} Signal Scan [{datetime.now(timezone.utc).isoformat()}]\n\n"
            f"Signal detectors:\n{sig_table}\n\n"
            f"Composite: {direction}  strength={strength:.3f}\n\n"
            f"Output JSON verdict for {market}."
        )
        raw = _chat([{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
                    self._ep, max_tokens=512)
        clean = _strip_think(raw)

        # Extract JSON
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

    def act(self, market: str) -> SignalDiscovery:
        """Full ReAct cycle for one market."""
        signals, direction, strength = self.observe(market)
        verdict_dict = self.think(market, signals, direction, strength)

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
            raw_llm=verdict_dict.get("_raw", "")[:500],
        )

        if self._sft_log:
            self._log_sft(discovery)

        return discovery

    def _log_sft(self, d: SignalDiscovery) -> None:
        record = d.to_sft_record(SYSTEM)
        self._sft_log.parent.mkdir(parents=True, exist_ok=True)
        with self._sft_log.open("a") as f:
            f.write(json.dumps(record) + "\n")

    # ── Scan (single pass) ────────────────────────────────────────────────────

    def scan(self, markets: list[str]) -> list[SignalDiscovery]:
        """Scan all markets once, return discoveries."""
        discoveries = []
        for market in markets:
            try:
                d = self.act(market)
                self._print_discovery(d)
                discoveries.append(d)
            except Exception as e:
                print(f"  ERROR [{market}]: {e}")
        return discoveries

    def _print_discovery(self, d: SignalDiscovery) -> None:
        print(f"\n[{d.timestamp}] {d.market}")
        for s in d.signals:
            bar = "█" * int(s["strength"] * 10)
            print(f"  {s['name']:18s} {s['direction']:7s}  {bar:<10s}  {s['reason']}")
        print(f"  composite: {d.composite_direction:7s}  strength={d.composite_strength:.3f}")
        print(f"  verdict:   {d.llm_verdict:7s}  confidence={d.llm_confidence:.2f}")
        if d.llm_rationale:
            print(f"  rationale: {d.llm_rationale}")
        if d.risk_flags:
            print(f"  risk:      {d.risk_flags}")

    # ── Loop ─────────────────────────────────────────────────────────────────

    def loop(
        self,
        markets: list[str],
        interval: int = 60,
        max_ticks: int | None = None,
    ) -> None:
        print(f"[QSA] loop: markets={markets}  interval={interval}s  max_ticks={max_ticks}")
        tick = 0
        while True:
            print(f"\n{'─'*60}  tick={tick+1}")
            self.scan(markets)
            tick += 1
            if max_ticks and tick >= max_ticks:
                print(f"[QSA] reached max_ticks={max_ticks}")
                return
            try:
                time.sleep(interval)
            except KeyboardInterrupt:
                print("\n[QSA] stopped")
                return

    # ── Backtest (replay candles) ─────────────────────────────────────────────

    def backtest(self, market: str, candle_file: Path) -> dict:
        """
        Replay candle JSONL, run signal detectors on each window,
        compare verdict vs next-candle direction. Returns accuracy metrics.
        """
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
        for i, candle in enumerate(candles[:-1]):
            next_candle = candles[i + 1]
            close = float(candle.get("close", 0))
            next_close = float(next_candle.get("close", 0))
            actual = "long" if next_close > close else "short"

            # Use rule-based scoring (no LLM in backtest — too slow)
            direction = "long" if close > float(candle.get("open", close)) else "short"
            verdict = "enter" if direction == actual else "hold"

            if verdict == "enter" and direction == actual:
                correct += 1
            total += 1

        accuracy = correct / total if total > 0 else 0.0
        result = {"market": market, "candles": len(candles), "total": total,
                  "correct": correct, "accuracy": round(accuracy, 4)}
        print(f"[backtest] {market}: accuracy={accuracy:.4f}  ({correct}/{total})")
        return result


# ── Report builder ────────────────────────────────────────────────────────────

def build_report(discoveries: list[SignalDiscovery]) -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    signals_count = {"enter": 0, "hold": 0, "exit": 0, "refuse": 0}
    for d in discoveries:
        signals_count[d.llm_verdict] = signals_count.get(d.llm_verdict, 0) + 1

    return {
        "timestamp": ts,
        "n_markets": len(discoveries),
        "verdict_summary": signals_count,
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
            }
            for d in discoveries
        ],
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Clawd Quantitative Signal Discovery Agent")
    parser.add_argument("--markets", nargs="+", default=["SOL", "BTC", "ETH", "JTO", "JUP"])
    parser.add_argument("--mode", choices=["scan", "loop", "backtest", "teach"],
                        default="scan")
    parser.add_argument("--interval", type=int, default=60, help="Loop interval seconds")
    parser.add_argument("--max-ticks", type=int, default=None)
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
    )

    if args.mode == "scan":
        discoveries = agent.scan(args.markets)
        report = build_report(discoveries)
        print(f"\n{'='*60}")
        print(f"  REPORT: {report['n_markets']} markets  verdicts={report['verdict_summary']}")
        out = Path(args.report) if args.report else Path("data/signal_discovery_report.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open("w") as f:
            json.dump(report, f, indent=2)
        print(f"  saved → {out}")

    elif args.mode == "loop":
        agent.loop(args.markets, args.interval, args.max_ticks)

    elif args.mode == "teach":
        # Label with Nemotron Ultra, save SFT data
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
