#!/usr/bin/env python3
"""
Nemotron Ultra 550B Trading Agent — Solana Clawd / Phoenix Perps.

Uses nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16 as the reasoning brain
with reasoning mode ON for market analysis and plan critique, reasoning mode
OFF for structured JSON tool calls.

Architecture:
  Nemotron Ultra 550B (HF Inference API or NIM)
    ├─ Signal scan       ← blueprints/signal-discovery/signals.py
    ├─ 13 Solana tools   ← perps/functions.py (Phoenix, Jupiter, RPC)
    ├─ RAG context       ← blueprints/enterprise-rag/query.py (optional)
    ├─ Portfolio opt.    ← blueprints/portfolio-optimization/mean_cvar.py
    └─ Trust gate        ← observer → paper → delegated → auto
          └─ Vulcan CLI (paper/live execution)
                └─ SFT logger (trains the 1.5B student)

Endpoint routing (first available wins):
  1. HF_TOKEN → huggingface.co serverless inference
  2. NVIDIA_API_KEY → NVIDIA NIM (integrate.api.nvidia.com/v1)
  3. CLAWD_INFERENCE_URL → self-hosted (vLLM / TGI / Ollama)
  4. ClawdRouter free tier → clawd-box-router.fly.dev/v1

Usage:
  export HF_TOKEN=hf_...
  export RPC_URL=https://api.mainnet-beta.solana.com

  # Single analysis tick (paper mode)
  python3 nvidia/nemotron_ultra_agent.py --market SOL --mode paper

  # Continuous trading loop
  python3 nvidia/nemotron_ultra_agent.py --markets SOL BTC ETH --mode paper --loop

  # Reasoning-on deep analysis
  python3 nvidia/nemotron_ultra_agent.py --market SOL --reasoning --mode observer

  # Generate SFT training data from Ultra decisions
  python3 nvidia/nemotron_ultra_agent.py --market SOL --sft-log data/ultra_sft.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

# ── Path setup ────────────────────────────────────────────────────────────────
_HERE = Path(__file__).parent
_AI_DIR = _HERE.parent
sys.path.insert(0, str(_HERE / "blueprints" / "signal-discovery"))
sys.path.insert(0, str(_AI_DIR / "perps"))

# ── Model constants ───────────────────────────────────────────────────────────
MODEL_HF = "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16"
MODEL_NIM = "nvidia/nemotron-3-ultra-550b-a55b"      # NIM model ID
MODEL_FALLBACK = "meta/llama-3.1-nemotron-nano-8b-v1"  # lightweight fallback

HF_INFERENCE_BASE = "https://api-inference.huggingface.co/v1"
NIM_BASE = "https://integrate.api.nvidia.com/v1"
CLAWD_ROUTER = "https://clawd-box-router.fly.dev/v1"

# ── Trust gates ───────────────────────────────────────────────────────────────
TRUST_GATES = {
    "observer":   "Emit plan only. No orders placed.",
    "paper":      "Execute via Vulcan paper mode. No real funds.",
    "delegated":  "Execute live with human confirmation per order.",
    "auto":       "Execute live automatically. DANGER — use only with guardrails.",
}


# ── Endpoint resolver ─────────────────────────────────────────────────────────

@dataclass
class Endpoint:
    base_url: str
    api_key: str
    model: str
    name: str


def resolve_endpoint(prefer_ultra: bool = True) -> Endpoint:
    """Return the best available inference endpoint."""
    if hf := os.environ.get("HF_TOKEN"):
        model = MODEL_HF if prefer_ultra else "Qwen/Qwen2.5-7B-Instruct"
        return Endpoint(HF_INFERENCE_BASE, hf, model, "hf-serverless")
    if nv := os.environ.get("NVIDIA_API_KEY"):
        model = MODEL_NIM if prefer_ultra else MODEL_FALLBACK
        return Endpoint(NIM_BASE, nv, model, "nvidia-nim")
    if url := os.environ.get("CLAWD_INFERENCE_URL"):
        key = os.environ.get("CLAWD_API_KEY", "none")
        return Endpoint(url, key, "solana-clawd-1.5b", "clawd-local")
    router_key = os.environ.get("CLAWD_ROUTER_KEY", "clawd_free_default")
    return Endpoint(CLAWD_ROUTER, router_key, "solana-clawd-1.5b", "clawd-router")


# ── LLM client ───────────────────────────────────────────────────────────────

def _chat(
    messages: list[dict],
    endpoint: Endpoint,
    max_tokens: int = 2048,
    temperature: float = 0.1,
    reasoning: bool = False,
) -> str:
    """
    Send a chat request to the resolved endpoint.

    Nemotron Ultra supports reasoning mode via:
      {"role": "system", "content": "detailed thinking"}
    or via the `enable_thinking` extra body param on some endpoints.
    """
    try:
        import httpx
    except ImportError:
        return _chat_urllib(messages, endpoint, max_tokens, temperature)

    # Nemotron Ultra reasoning toggle
    extra = {}
    if reasoning and "nemotron" in endpoint.model.lower():
        extra["chat_template_kwargs"] = {"enable_thinking": True}

    payload: dict = {
        "model": endpoint.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        **extra,
    }

    try:
        r = httpx.post(
            f"{endpoint.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {endpoint.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=120,
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[{endpoint.name} error: {e}]"


def _chat_urllib(
    messages: list[dict],
    endpoint: Endpoint,
    max_tokens: int,
    temperature: float,
) -> str:
    import urllib.request
    payload = json.dumps({
        "model": endpoint.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }).encode()
    req = urllib.request.Request(
        f"{endpoint.base_url}/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {endpoint.api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[error: {e}]"


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> tags from Nemotron reasoning output."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


# ── Market data (Vulcan + perps/functions) ────────────────────────────────────

def _vulcan(args: list[str]) -> dict:
    try:
        r = subprocess.run(
            ["vulcan"] + args + ["-o", "json"],
            capture_output=True, text=True, timeout=20,
        )
        if r.returncode != 0:
            return {"ok": False, "error": r.stderr.strip()}
        return json.loads(r.stdout)
    except FileNotFoundError:
        return {"ok": False, "error": "vulcan not installed"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _perps_tool(fn_name: str, **kwargs) -> dict:
    """Call a perps/functions.py tool by name."""
    try:
        from functions import call_function
        return call_function(fn_name, kwargs)
    except ImportError:
        return {"error": "perps/functions.py not on path"}
    except Exception as e:
        return {"error": str(e)}


def gather_market_context(market: str) -> dict:
    """Collect live market data for the prompt."""
    ticker = _vulcan(["market", "ticker", market])
    ta_report = _vulcan(["ta", "report", market, "--timeframe", "1h"])
    orderbook = _vulcan(["market", "orderbook", market, "--depth", "5"])
    sol_price = _perps_tool("get_sol_price")
    funding = _perps_tool("get_funding_rate", market=market)

    return {
        "ticker": ticker.get("data", ticker),
        "ta_report": ta_report.get("data", ta_report),
        "orderbook_top5": orderbook.get("data", orderbook),
        "sol_price_usd": sol_price,
        "funding_rate": funding,
    }


# ── Signal scan ───────────────────────────────────────────────────────────────

def run_signal_scan(market: str) -> dict:
    """Run Blueprint 4 signal scan; fall back gracefully if unavailable."""
    try:
        from signals import scan_all, score_signals
        results = scan_all(market)
        direction, strength = score_signals(results)
        return {
            "direction": direction,
            "strength": round(strength, 4),
            "signals": [
                {"name": s.name, "direction": s.direction,
                 "strength": round(s.strength, 4), "reason": s.reason}
                for s in results
            ],
        }
    except Exception as e:
        return {"direction": "neutral", "strength": 0.0, "error": str(e)}


# ── Portfolio optimization ────────────────────────────────────────────────────

def run_portfolio_opt(markets: list[str], budget: float = 1000.0) -> dict:
    """Run Blueprint 2 Mean-CVaR optimization (best-effort)."""
    try:
        sys.path.insert(0, str(_HERE / "blueprints" / "portfolio-optimization"))
        from scenarios import generate_scenarios, historical_returns
        from mean_cvar import optimize
        import numpy as np

        np.random.seed(42)
        base = {"SOL": 150, "BTC": 65000, "ETH": 3500}
        prices = {
            m: (base.get(m, 10.0) * np.cumprod(1 + np.random.normal(0.001, 0.04, 200))).tolist()
            for m in markets
        }
        rets, names = historical_returns(prices)
        sc = generate_scenarios(rets, names, n_scenarios=1000)
        result = optimize(sc.scenarios, sc.assets, cvar_alpha=0.95, max_cvar=0.12)
        return {
            "weights": dict(zip(result.assets, result.weights.round(4).tolist())),
            "expected_return": round(result.expected_return, 6),
            "cvar_95": round(result.cvar, 6),
            "sharpe": round(result.sharpe, 4),
            "solver": result.solver,
        }
    except Exception as e:
        return {"error": str(e)}


# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are the Nemotron Ultra 550B trading intelligence for the Solana Clawd sovereign agent.

Your role:
- ANALYZE Solana Phoenix perps markets using live data, technical signals, and quantitative research.
- PLAN trades in structured JSON format, defaulting to paper mode.
- CRITIQUE risk: always assess CVaR, leverage, funding costs, and liquidation distance.
- REFUSE unsafe requests: live execution without explicit gate, >5x leverage without confirmation, wallet access.

Trust gates (in order of increasing risk):
  observer  → plan only, no orders
  paper     → Vulcan paper mode, zero real funds
  delegated → live with human confirmation per order
  auto      → live automatic (high risk, explicit flag required)

Output format for trade decisions:
```json
{
  "decision": "enter" | "hold" | "exit" | "refuse",
  "direction": "long" | "short" | null,
  "market": "SOL",
  "notional_usdc": 100.0,
  "leverage": 1.0,
  "rationale": "one sentence",
  "risk_flags": [],
  "vulcan_command": "vulcan paper buy SOL --notional-usdc 100 --type market",
  "trust_gate": "paper"
}
```

Rules:
- Never include private keys, API tokens, wallet passwords, or secrets.
- Never recommend live execution without explicit trust gate = delegated or auto AND confirmed by user.
- Use reasoning mode to think through risk before outputting the JSON plan.
- When uncertain, decision = hold.
"""


# ── Main agent tick ───────────────────────────────────────────────────────────

@dataclass
class AgentTick:
    timestamp: str
    market: str
    endpoint: str
    model: str
    gate: str
    signal_scan: dict
    market_context: dict
    portfolio_opt: dict
    raw_response: str
    plan: dict
    action_taken: str


def _parse_json_plan(text: str) -> dict:
    """Extract the first JSON block from model response."""
    clean = _strip_thinking(text)
    match = re.search(r"```json\s*(\{.*?\})\s*```", clean, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try bare JSON object
    match = re.search(r"\{[^{}]*\"decision\"[^{}]*\}", clean, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return {"decision": "hold", "rationale": "could not parse model response", "raw": clean[:300]}


def _build_user_prompt(market: str, ctx: dict, signals: dict, port: dict) -> str:
    return f"""
## Market: {market}-PERP
**Timestamp**: {datetime.now(timezone.utc).isoformat()}

### Live Market Data
{json.dumps(ctx.get("ticker", {}), indent=2)}

### Technical Analysis (1h)
{json.dumps(ctx.get("ta_report", {}), indent=2)}

### Blueprint 4 Signal Scan
Direction: {signals.get("direction", "unknown")}  Strength: {signals.get("strength", 0)}
{json.dumps(signals.get("signals", []), indent=2)}

### Blueprint 2 Portfolio Optimization
{json.dumps(port, indent=2)}

### Funding Rate
{json.dumps(ctx.get("funding_rate", {}), indent=2)}

---
Analyze the above data. Think through risk in <think> tags, then output a JSON trade plan.
""".strip()


def execute_plan(plan: dict, gate: str) -> str:
    """Apply trust gate and execute or log the plan."""
    decision = plan.get("decision", "hold")
    cmd = plan.get("vulcan_command", "")

    if decision == "refuse" or not cmd:
        return f"[{gate}] refused/hold — no order"

    if gate == "observer":
        return f"[observer] plan: {cmd}"

    if gate == "paper":
        if not cmd.startswith("vulcan paper"):
            cmd = cmd.replace("vulcan trade", "vulcan paper").replace("market-buy", "buy").replace("market-sell", "sell")
        parts = cmd.split()
        result = _vulcan(parts[1:])
        if result.get("ok"):
            return f"[paper] OK: {result.get('data', {})}"
        return f"[paper] failed: {result.get('error', result)}"

    if gate in ("delegated", "auto"):
        return f"[{gate}] LIVE execution gated — implement confirmation flow before enabling"

    return f"[{gate}] unknown gate"


def _log_sft(tick: AgentTick, log_path: Path) -> None:
    """Append agent tick as SFT training example (teacher labels for student distillation)."""
    user_content = _build_user_prompt(
        tick.market,
        tick.market_context,
        tick.signal_scan,
        tick.portfolio_opt,
    )
    assistant_content = json.dumps(tick.plan, indent=2)
    record = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": assistant_content},
        ],
        "metadata": {
            "source": "nemotron-ultra-550b",
            "model": tick.model,
            "market": tick.market,
            "timestamp": tick.timestamp,
            "gate": tick.gate,
        },
    }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as f:
        f.write(json.dumps(record) + "\n")


def run_tick(
    market: str,
    gate: str,
    endpoint: Endpoint,
    reasoning: bool,
    sft_log: Path | None,
    portfolio_markets: list[str] | None = None,
) -> AgentTick:
    ts = datetime.now(timezone.utc).isoformat()
    print(f"\n[{ts}] {market}-PERP  model={endpoint.model}  gate={gate}")

    ctx = gather_market_context(market)
    signals = run_signal_scan(market)
    port = run_portfolio_opt(portfolio_markets or [market], budget=1000.0)

    print(f"  signals: {signals.get('direction')} strength={signals.get('strength', 0):.2f}")

    user_msg = _build_user_prompt(market, ctx, signals, port)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    raw = _chat(messages, endpoint, max_tokens=2048, temperature=0.1, reasoning=reasoning)
    plan = _parse_json_plan(raw)
    action = execute_plan(plan, gate)

    print(f"  decision={plan.get('decision')}  rationale={plan.get('rationale', '')[:80]}")
    print(f"  action: {action}")

    tick = AgentTick(
        timestamp=ts,
        market=market,
        endpoint=endpoint.name,
        model=endpoint.model,
        gate=gate,
        signal_scan=signals,
        market_context=ctx,
        portfolio_opt=port,
        raw_response=raw[:2000],
        plan=plan,
        action_taken=action,
    )

    if sft_log:
        _log_sft(tick, sft_log)

    return tick


# ── Distillation summary ──────────────────────────────────────────────────────

def print_distillation_summary(log_path: Path) -> None:
    """Show stats on collected Ultra decisions for student distillation."""
    if not log_path.exists():
        return
    lines = [l for l in log_path.read_text().strip().split("\n") if l]
    decisions = []
    for line in lines:
        try:
            obj = json.loads(line)
            msgs = obj.get("messages", [])
            if msgs and msgs[-1]["role"] == "assistant":
                try:
                    plan = json.loads(msgs[-1]["content"])
                    decisions.append(plan.get("decision", "?"))
                except json.JSONDecodeError:
                    decisions.append("?")
        except json.JSONDecodeError:
            pass
    from collections import Counter
    counts = Counter(decisions)
    print(f"\n[distillation] {len(lines)} Ultra decisions in {log_path}")
    for k, v in counts.most_common():
        print(f"  {k:10s} {v}")
    print(f"  Ready to merge: python3 nvidia/integration/dataset_nvidia_sft.py")
    print(f"  Then push:      python3 scripts/prepare_dataset.py --input {log_path} --push")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Nemotron Ultra 550B Trading Agent — Solana Phoenix Perps",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single tick, paper mode
  python3 nvidia/nemotron_ultra_agent.py --market SOL --mode paper

  # Continuous loop, 3 markets, 5-min interval
  python3 nvidia/nemotron_ultra_agent.py --markets SOL BTC ETH --mode paper --loop --interval 300

  # Reasoning-on deep analysis (observer only)
  python3 nvidia/nemotron_ultra_agent.py --market SOL --reasoning --mode observer

  # Generate SFT training data from Ultra decisions
  python3 nvidia/nemotron_ultra_agent.py --markets SOL BTC ETH \\
      --mode paper --loop --sft-log data/ultra_sft.jsonl

  # Distillation: merge Ultra SFT data into student training
  python3 nvidia/integration/dataset_nvidia_sft.py
  python3 scripts/prepare_dataset.py \\
      --input data/ultra_sft.jsonl \\
      --push --repo-id solanaclawd/solana-clawd-nvidia-trading-factory-instruct
        """,
    )
    parser.add_argument("--market", default=None, help="Single market symbol")
    parser.add_argument("--markets", nargs="+", default=None, help="Multiple markets")
    parser.add_argument("--mode", choices=list(TRUST_GATES), default="paper")
    parser.add_argument("--reasoning", action="store_true", help="Enable Nemotron thinking mode")
    parser.add_argument("--loop", action="store_true", help="Run continuously")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between ticks (loop mode)")
    parser.add_argument("--sft-log", default=None, help="Path to SFT log JSONL for distillation")
    parser.add_argument("--no-ultra", action="store_true",
                        help="Skip Ultra model — use lightweight fallback (faster, cheaper)")
    parser.add_argument("--rpc-url", default=os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com"))
    args = parser.parse_args()

    markets = args.markets or ([args.market] if args.market else ["SOL"])
    os.environ.setdefault("RPC_URL", args.rpc_url)

    endpoint = resolve_endpoint(prefer_ultra=not args.no_ultra)
    sft_log = Path(args.sft_log) if args.sft_log else None

    print(f"Nemotron Ultra Trading Agent")
    print(f"  model    = {endpoint.model}")
    print(f"  endpoint = {endpoint.name} ({endpoint.base_url})")
    print(f"  gate     = {args.mode} — {TRUST_GATES[args.mode]}")
    print(f"  markets  = {markets}")
    print(f"  reasoning= {args.reasoning}")
    print(f"  sft_log  = {sft_log or '(none)'}")

    if not args.loop:
        for mkt in markets:
            run_tick(mkt, args.mode, endpoint, args.reasoning, sft_log,
                     portfolio_markets=markets)
        if sft_log:
            print_distillation_summary(sft_log)
        return

    print(f"\nRunning every {args.interval}s across {markets}. Ctrl+C to stop.\n")
    while True:
        for mkt in markets:
            try:
                run_tick(mkt, args.mode, endpoint, args.reasoning, sft_log,
                         portfolio_markets=markets)
            except KeyboardInterrupt:
                if sft_log:
                    print_distillation_summary(sft_log)
                sys.exit(0)
            except Exception as e:
                print(f"  ERROR [{mkt}]: {e}")
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            if sft_log:
                print_distillation_summary(sft_log)
            sys.exit(0)


if __name__ == "__main__":
    main()
