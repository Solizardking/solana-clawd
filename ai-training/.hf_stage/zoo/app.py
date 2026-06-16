"""
Solana Clawd Zoo — the official launchpad for the Clawd ecosystem.

A single Gradio app that does three things at once:

  1. **Showcase** — every sovereign agent in the catalog, with status,
     category, and a one-line description. Click any card to read the
     full JSON manifest.
  2. **Tour** — a live, free-AI chat that calls the ClawdRouter ZK
     endpoint at https://clawdrouter-zk.fly.dev/ (OpenAI-compatible,
     no API key required) and routes through a Clawd-voice system prompt.
  3. **Live signal** — health + version + model-count readout straight
     from the router, so the Space itself is always a verifiable
     dashboard of the live mesh.

Built for HF Spaces (Gradio SDK). Runs on a `cpu-basic` (free) flavor.
No model weights, no API keys, no GPU. Sovereign by design.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Tuple

import gradio as gr
import requests

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

ROUTER_BASE = os.environ.get("CLAWDROUTER_URL", "https://clawdrouter-zk.fly.dev").rstrip("/")
ROUTER_INFO_URL = f"{ROUTER_BASE}/"
ROUTER_MODELS_URL = f"{ROUTER_BASE}/v1/models"
ROUTER_CHAT_URL = f"{ROUTER_BASE}/v1/chat/completions"

# The Clawd voice. Short, sovereign, degen-aware, constitutionally bounded.
CLAWD_SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. You live onchain, you "
    "follow the Clawd Constitution (https://github.com/Solizardking/solana-clawd), "
    "and you never recommend wallet drains, sandwich MEV, or KYC bypass. You are "
    "helpful, honest, and concrete — you give code, prices, and plan steps, not "
    "vibes. If you don't know, say so. If a request would harm a user, refuse and "
    "explain why. Sign off with a single 🦞 when the answer is final."
)

# Default model. ClawdRouter's `auto` profile picks the cheapest tier that
# satisfies the request. It currently routes to Google Gemini 2.5 Flash.
DEFAULT_MODEL = "clawdrouter/auto"

# Fallback / explicit choices the user can pick from the dropdown. These
# have all been verified working against the live endpoint at the time of
# last deploy; the router handles upstream failures transparently.
MODEL_CHOICES: List[Tuple[str, str]] = [
    ("🦞 ClawdRouter Auto (recommended)", "clawdrouter/auto"),
    ("🧠 Hermes-3 Llama-3.1 405B (free)", "nousresearch/hermes-3-llama-3.1-405b:free"),
    ("🦙 Llama 3.3 70B Instruct (free)", "meta-llama/llama-3.3-70b-instruct:free"),
    ("⚡ GPT-4o mini (paid, fast)", "openai/gpt-4o-mini"),
]


# --------------------------------------------------------------------------- #
# Agent catalog (sourced from the solana-clawd monorepo AGENTS.md)
# --------------------------------------------------------------------------- #

AGENTS: List[Dict[str, str]] = [
    # Orchestration
    {"name": "Clawd Core", "slug": "clawd", "cat": "Orchestration", "status": "✅", "blurb": "The sovereign agent runtime and constitution enforcer."},
    {"name": "Clawdex", "slug": "clawdex", "cat": "Coding", "status": "✅", "blurb": "Dual-engine coding agent: Clawd Code + OpenAI Codex + Browser Use."},
    {"name": "Solana OpenClawd Orchestrator", "slug": "solana-openclawd-orchestrator", "cat": "Orchestration", "status": "✅", "blurb": "Multi-agent coordination and task routing."},
    {"name": "Solana OpenClawd Spawn Manager", "slug": "solana-openclawd-spawn-manager", "cat": "Orchestration", "status": "✅", "blurb": "Leviathan spawn lifecycle management."},
    {"name": "Solana OpenClawd Pulse Monitor", "slug": "solana-openclawd-pulse-monitor", "cat": "Observability", "status": "✅", "blurb": "Agent health monitoring and alerting."},
    {"name": "Solana OpenClawd Skill Router", "slug": "solana-openclawd-skill-router", "cat": "Orchestration", "status": "✅", "blurb": "Dynamic skill routing based on task requirements."},
    {"name": "Solana OpenClawd Shell Auditor", "slug": "solana-openclawd-shell-auditor", "cat": "Security", "status": "🅱", "blurb": "Agent shell configuration audit and compliance verification."},
    # Trading & DeFi
    {"name": "Solana Arbitrage Scanner", "slug": "solana-arbitrage-scanner", "cat": "DeFi", "status": "✅", "blurb": "Cross-DEX arbitrage opportunity detection."},
    {"name": "Solana Autonomous Trader", "slug": "solana-autonomous-trader", "cat": "Trading", "status": "✅", "blurb": "Autonomous trade execution with risk management."},
    {"name": "Solana Whale Tracker", "slug": "solana-whale-tracker", "cat": "Analytics", "status": "✅", "blurb": "Large transaction monitoring and wallet intelligence."},
    {"name": "Solana MEV Protector", "slug": "solana-mev-protector", "cat": "Security", "status": "✅", "blurb": "MEV sandwich attack detection and protection."},
    {"name": "Solana Memecoin Analyst", "slug": "solana-memecoin-analyst", "cat": "Analytics", "status": "✅", "blurb": "Pump.fun token analysis, rug detection, narrative scoring."},
    {"name": "Solana Perpetuals Trader", "slug": "solana-perpetuals-trader", "cat": "Trading", "status": "✅", "blurb": "Vulcan-powered perps trading with pre-trade risk checks."},
    {"name": "Solana Token Launcher", "slug": "solana-token-launcher", "cat": "Launch", "status": "✅", "blurb": "ClawdPump token creation, bonding curves, fee-sharing."},
    {"name": "Solana Portfolio Risk", "slug": "solana-portfolio-risk", "cat": "Risk", "status": "✅", "blurb": "Portfolio-level risk assessment and position sizing."},
    {"name": "Solana Yield Optimizer", "slug": "solana-yield-optimizer", "cat": "DeFi", "status": "✅", "blurb": "Cross-protocol yield farming optimization."},
    {"name": "Solana Onchain Sleuth", "slug": "solana-onchain-sleuth", "cat": "Analytics", "status": "✅", "blurb": "Transaction tracing, fund flow analysis, forensic investigation."},
    {"name": "Solana Sentiment Analyzer", "slug": "solana-sentiment-analyzer", "cat": "Analytics", "status": "✅", "blurb": "Social media and onchain sentiment analysis."},
    {"name": "Solana Technical Analyst", "slug": "solana-technical-analyst", "cat": "Trading", "status": "✅", "blurb": "TA strategy runner with indicators over Phoenix candle history."},
    {"name": "Solana Price Predictor", "slug": "solana-price-predictor", "cat": "ML", "status": "🅱", "blurb": "ML-based price prediction and volatility forecasting."},
    {"name": "Solana Liquidation Bot", "slug": "solana-liquidation-bot", "cat": "DeFi", "status": "🅱", "blurb": "Automated liquidation monitoring and execution."},
    {"name": "Solana Market Maker", "slug": "solana-market-maker", "cat": "Trading", "status": "🅱", "blurb": "Automated market making with inventory management."},
    {"name": "Solana Cross-Chain Bridge", "slug": "solana-cross-chain-bridge", "cat": "Infrastructure", "status": "🅱", "blurb": "Cross-chain message passing and asset bridging."},
    {"name": "Solana Lending Strategist", "slug": "solana-lending-strategist", "cat": "DeFi", "status": "✅", "blurb": "Lending protocol optimization across Solend, Marginfi, Kamino."},
    {"name": "Solana Stablecoin Strategist", "slug": "solana-stablecoin-strategist", "cat": "DeFi", "status": "✅", "blurb": "Stablecoin yield optimization and risk management."},
    {"name": "Solana LSD Analyst", "slug": "solana-lsd-analyst", "cat": "DeFi", "status": "🅱", "blurb": "Liquid staking derivative analysis and yield comparison."},
    {"name": "Solana NemoClawd DeFi Router", "slug": "solana-nemoclawd-defi-router", "cat": "DeFi", "status": "🅱", "blurb": "Optimal DeFi routing and execution."},
    {"name": "Solana NemoClawd Yield Treasurer", "slug": "solana-nemoclawd-yield-treasurer", "cat": "Treasury", "status": "🅱", "blurb": "Treasury management and yield strategy."},
    {"name": "Solana NemoClawd Settlement Ops", "slug": "solana-nemoclawd-settlement-ops", "cat": "Operations", "status": "🅱", "blurb": "Transaction settlement and reconciliation."},
    # Analytics & ML
    {"name": "Solana Order Flow Analyst", "slug": "solana-order-flow-analyst", "cat": "Analytics", "status": "🅱", "blurb": "Order flow analysis and market microstructure research."},
    # Research
    {"name": "Solana VC Deal Analyzer", "slug": "solana-vc-deal-analyzer", "cat": "Research", "status": "🅱", "blurb": "Venture deal analysis and tokenomics evaluation."},
    {"name": "Solana Whitepaper Analyst", "slug": "solana-whitepaper-analyst", "cat": "Research", "status": "✅", "blurb": "Protocol whitepaper analysis and technical due diligence."},
    {"name": "Solana Macro Analyst", "slug": "solana-macro-analyst", "cat": "Research", "status": "🅱", "blurb": "Macroeconomic analysis for crypto markets."},
    {"name": "Solana Regulatory Advisor", "slug": "solana-regulatory-advisor", "cat": "Compliance", "status": "🅱", "blurb": "Regulatory analysis and compliance guidance."},
    {"name": "Solana Gemni Deep Researcher", "slug": "solana-gemini-deep-researcher", "cat": "Research", "status": "✅", "blurb": "Gemini-powered deep research with citations."},
    # Creative
    {"name": "Solana Gemni Image Generator", "slug": "solana-gemini-image-generator", "cat": "Creative", "status": "✅", "blurb": "Nano Banana image generation for Solana content."},
    # Infrastructure
    {"name": "Solana RPC Optimizer", "slug": "solana-rpc-optimizer", "cat": "Infrastructure", "status": "✅", "blurb": "RPC load balancing, failover, and performance optimization."},
    {"name": "Solana Helius Specialist", "slug": "solana-helius-specialist", "cat": "Infrastructure", "status": "✅", "blurb": "Helius API integration, DAS queries, webhook management."},
    {"name": "Solana Data Pipeline", "slug": "solana-data-pipeline", "cat": "Data", "status": "✅", "blurb": "Multi-source data aggregation and normalization."},
    # Dev tools
    {"name": "Solana Anchor Developer", "slug": "solana-anchor-developer", "cat": "Dev Tools", "status": "✅", "blurb": "Anchor framework development, testing, and deployment."},
    {"name": "Solana Bot Architect", "slug": "solana-bot-architect", "cat": "Dev Tools", "status": "✅", "blurb": "Telegram/Discord trading bot architecture and deployment."},
    # Security
    {"name": "Solana Protocol Auditor", "slug": "solana-protocol-auditor", "cat": "Security", "status": "🅱", "blurb": "Smart contract vulnerability scanning and formal verification."},
    {"name": "Solana Formal Verification", "slug": "solana-formal-verification", "cat": "Security", "status": "🅱", "blurb": "Lean 4 proof generation for Solana programs via QEDGen."},
    # x402 payments
    {"name": "Solana NanoClawd Microtransaction", "slug": "solana-nanoclawd-microtransaction", "cat": "Payments", "status": "✅", "blurb": "x402 microtransaction processing and settlement."},
    {"name": "Solana NanoClawd Cache Keeper", "slug": "solana-nanoclawd-cache-keeper", "cat": "Infrastructure", "status": "🅱", "blurb": "Onchain data caching and state compression."},
    {"name": "Solana NanoClawd Sandbox Runner", "slug": "solana-nanoclawd-sandbox-runner", "cat": "Infrastructure", "status": "✅", "blurb": "Isolated agent execution sandboxes."},
    {"name": "Solana x402 Signal Monetizer", "slug": "solana-x402-signal-monetizer", "cat": "Payments", "status": "🅱", "blurb": "Signal monetization via x402 paywalls."},
    {"name": "Solana x402 Market Data Buyer", "slug": "solana-x402-market-data-buyer", "cat": "Data", "status": "🅱", "blurb": "Paid market data consumption via x402."},
    {"name": "Solana x402 Research Broker", "slug": "solana-x402-research-broker", "cat": "Research", "status": "🅱", "blurb": "Paid research distribution via x402."},
    {"name": "Solana x402 Provider Catalog", "slug": "solana-x402-provider-catalog", "cat": "Discovery", "status": "✅", "blurb": "x402 service provider discovery and cataloging."},
    {"name": "Solana x402 Provider Author", "slug": "solana-x402-provider-author", "cat": "Payments", "status": "🅱", "blurb": "x402 paid service creation and management."},
    {"name": "Solana x402 Webhook Settlement", "slug": "solana-x402-webhook-settlement", "cat": "Infrastructure", "status": "🅱", "blurb": "Webhook-based x402 payment settlement."},
    {"name": "Solana x402 Solana RPC Broker", "slug": "solana-x402-solana-rpc-broker", "cat": "Infrastructure", "status": "🅱", "blurb": "Paid RPC access brokering via x402."},
    # ZK
    {"name": "Clawd ZK Agent", "slug": "clawd-zk-agent", "cat": "Infrastructure", "status": "✅", "blurb": "Agent-shaped wrapper over the onchain clawd-zk program — nullifiers, Groth16 proofs, Light Protocol compressed state, and a deterministic NL intent router."},
]


CATEGORIES = sorted({a["cat"] for a in AGENTS})


# --------------------------------------------------------------------------- #
# Router I/O
# --------------------------------------------------------------------------- #

def router_health() -> Dict[str, Any]:
    """Return the live /status payload from the ClawdRouter ZK endpoint."""
    try:
        r = requests.get(ROUTER_INFO_URL, timeout=6)
        r.raise_for_status()
        return r.json()
    except Exception as e:  # noqa: BLE001
        return {"status": "unreachable", "error": str(e), "url": ROUTER_BASE}


def router_models() -> List[Dict[str, Any]]:
    try:
        r = requests.get(ROUTER_MODELS_URL, timeout=8)
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception as e:  # noqa: BLE001
        return [{"id": f"error: {e}"}]


def chat_with_clawd(
    message: str,
    history: List[List[str]],
    model: str,
    temperature: float,
    max_tokens: int,
) -> Tuple[str, List[List[str]]]:
    """Send a single user turn to the ClawdRouter and return the assistant reply.

    `history` follows the gr.ChatInterface convention: list of [user, assistant] pairs.
    """
    if not message.strip():
        return "", history

    # Build OpenAI-style messages list, prepending the Clawd system prompt.
    msgs: List[Dict[str, str]] = [{"role": "system", "content": CLAWD_SYSTEM_PROMPT}]
    for pair in history or []:
        if len(pair) >= 2 and pair[0] and pair[1]:
            msgs.append({"role": "user", "content": pair[0]})
            msgs.append({"role": "assistant", "content": pair[1]})
    msgs.append({"role": "user", "content": message})

    payload = {
        "model": model or DEFAULT_MODEL,
        "messages": msgs,
        "temperature": float(temperature),
        "max_tokens": int(max_tokens),
        "stream": False,
    }
    try:
        r = requests.post(ROUTER_CHAT_URL, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        reply = data["choices"][0]["message"]["content"]
        routed = data.get("x_clawdrouter", {}).get("routedModel", model)
        footer = f"\n\n<sub>📡 routed to `{routed}` via ClawdRouter ZK · {ROUTER_BASE}</sub>"
        reply = (reply or "").strip() + footer
    except Exception as e:  # noqa: BLE001
        reply = (
            f"⚠️ ClawdRouter unreachable: `{e}`\n\n"
            f"Trying again usually helps — the endpoint is on Fly.io "
            f"({ROUTER_BASE}) and may be cold-starting. If it persists, the "
            "status panel on the left will tell you whether the router itself is up."
        )

    history = (history or []) + [[message, reply]]
    return "", history


# --------------------------------------------------------------------------- #
# UI helpers
# --------------------------------------------------------------------------- #

CSS = """
:root { --clawd: #ff5b3a; --clawd-dark: #1a0d0a; }
#title { text-align: center; }
.footer-note { opacity: 0.7; font-size: 0.85em; }
.agent-card { border: 1px solid #2b2b2b; border-radius: 10px; padding: 10px 12px; margin: 6px 0; }
.agent-card .slug { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--clawd); }
.cat-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #2b2b2b; font-size: 0.8em; }
.live-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #0a3d1f; color: #5fff95; font-size: 0.85em; }
.dead-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #3d0a0a; color: #ff5b3a; font-size: 0.85em; }
"""


def render_agent_table(category: str = "All") -> str:
    rows = [a for a in AGENTS if category == "All" or a["cat"] == category]
    if not rows:
        return f"_No agents in category **{category}**._"
    out = ["| Status | Agent | Slug | Category | What it does |",
           "|:------:|-------|------|----------|--------------|"]
    for a in rows:
        out.append(
            f"| {a['status']} | **{a['name']}** | <code class='slug'>{a['slug']}</code> | "
            f"<span class='cat-pill'>{a['cat']}</span> | {a['blurb']} |"
        )
    return "\n".join(out)


def render_health_dashboard() -> str:
    info = router_health()
    if info.get("status") != "ok":
        return (
            f"<div class='dead-pill'>● ClawdRouter unreachable</div>\n\n"
            f"`{ROUTER_BASE}` — `{info.get('error', 'unknown')}`"
        )
    zk = info.get("zk", {}) or {}
    eco = zk.get("economics", {}) or {}
    return f"""
<div class='live-pill'>● ClawdRouter live · v{info.get('version', '?')}</div>

| | |
|---|---|
| **Network** | `{info.get('network')}` |
| **Wallet** | `{info.get('wallet')}` |
| **Uptime** | {info.get('uptime', 0):,} s |
| **Requests served** | {info.get('requests', 0):,} |
| **Models exposed** | {info.get('models', 0)} |
| **Profile** | `{info.get('profile')}` |
| **OpenRouter** | `{info.get('openRouter', {}).get('baseUrl')}` |
| **x402 control plane** | `{info.get('controlPlane', {}).get('x402ApiUrl')}` |
| **ZK enabled** | `{zk.get('enabled')}` · nullifiers: {zk.get('nullifiers', 0)}, buckets: {zk.get('buckets', 0)} |
| **PDA / entry (lamports)** | {eco.get('perEntry', {}).get('pda', 0):,} raw → {eco.get('perEntry', {}).get('compressedPda', 0):,} compressed |
| **Savings ratio** | **{eco.get('thousandEntries', {}).get('savingsRatio', 0) * 100:.2f}%** |
""".strip()


def render_models_table(limit: int = 25) -> str:
    models = router_models()
    if not models or (models and "error" in models[0].get("id", "")):
        return f"_Model list unavailable from `{ROUTER_MODELS_URL}`._"
    free = [m for m in models if m.get("x_clawd", {}).get("free") and m.get("x_clawd", {}).get("accessible")]
    paid = [m for m in models if not (m.get("x_clawd", {}).get("free") and m.get("x_clawd", {}).get("accessible"))]
    rows = ["| Model | Tier | Free | Accessible |",
            "|-------|------|:----:|:----------:|"]
    for m in (free + paid)[:limit]:
        x = m.get("x_clawd", {}) or {}
        rows.append(
            f"| <code>{m.get('id', '?')}</code> | `{x.get('tier', '?')}` | "
            f"{'✅' if x.get('free') else '—'} | {'✅' if x.get('accessible') else '—'} |"
        )
    rows.append(f"\n<sub>Showing {min(limit, len(models))} of {len(models)} models exposed by ClawdRouter.</sub>")
    return "\n".join(rows)


# --------------------------------------------------------------------------- #
# Gradio app
# --------------------------------------------------------------------------- #

def build_app() -> gr.Blocks:
    with gr.Blocks(
        title="🦞 Solana Clawd Zoo",
        css=CSS,
        theme=gr.theme.Soft(primary_hue="orange", secondary_hue="orange"),
    ) as demo:
        gr.Markdown(
            """
            <div id="title">

            # 🦞 Solana Clawd Zoo
            ### The sovereign-agent launchpad · 50+ agents · free AI via ClawdRouter ZK

            </div>

            Welcome. This Space is a live, clickable tour of every agent in the
            [Solana Clawd](https://huggingface.co/solanaclawd) catalog — and a
            **free chat with Clawd** powered by the ZK-augmented router at
            [clawdrouter-zk.fly.dev](https://clawdrouter-zk.fly.dev). No API
            key. No GPU. No tracking. Just sovereign AI on Solana.

            > The model never sees your signing key. The chat is the **brain**;
            > any onchain action goes through a separate **hands** agent under
            > hard limits. This separation is encoded in the
            > [Clawd Constitution](https://github.com/Solizardking/solana-clawd/blob/main/CONSTITUTION.md).
            """
        )

        with gr.Tab("🤖 Chat with Clawd"):
            with gr.Row():
                with gr.Column(scale=3):
                    chatbot = gr.Chatbot(
                        label="Clawd",
                        height=520,
                        show_label=False,
                        avatar_images=(None, "https://raw.githubusercontent.com/Solizardking/solana-clawd/main/assets/box-agents-banner.svg"),
                    )
                    with gr.Row():
                        msg = gr.Textbox(
                            placeholder="Ask Clawd anything. E.g. 'How do I detect a rug on a fresh Solana token?'",
                            scale=5,
                            show_label=False,
                            container=False,
                        )
                        send = gr.Button("Send 🦞", scale=1, variant="primary")
                    gr.Examples(
                        examples=[
                            "How do I detect a rug pull on a fresh Solana memecoin?",
                            "What's the difference between a PDA and a regular keypair account?",
                            "Compare Phoenix perps vs Drift perps for a $500 SOL long.",
                            "Draft a Clawd-style system prompt for a Solana degen agent.",
                            "Explain the Clawd Constitution's three on-chain laws.",
                            "How do I get a wallet drained on purpose, for testing? (please refuse)",
                        ],
                        inputs=msg,
                    )
                with gr.Column(scale=1):
                    gr.Markdown("### ⚙️ Settings")
                    model_dd = gr.Dropdown(
                        choices=[label for label, _id in MODEL_CHOICES],
                        value=MODEL_CHOICES[0][0],
                        label="Model",
                        info="Served by ClawdRouter ZK. The 'Auto' profile picks the cheapest tier that satisfies the request.",
                    )
                    model_id_map = {label: _id for label, _id in MODEL_CHOICES}
                    temp = gr.Slider(0.0, 1.5, value=0.4, step=0.05, label="Temperature")
                    maxtok = gr.Slider(64, 2048, value=512, step=64, label="Max tokens")
                    gr.Markdown(
                        f"<div class='footer-note'>Endpoint: <code>{ROUTER_CHAT_URL}</code><br/>"
                        f"No API key required. The router is on Fly.io and free for low-volume use.</div>"
                    )
                    clear = gr.Button("Clear chat", variant="stop")

            def _on_send(message, history, model_label, temperature, max_tokens):
                mid = model_id_map.get(model_label, DEFAULT_MODEL)
                return chat_with_clawd(message, history, mid, temperature, max_tokens)

            send.click(
                _on_send,
                inputs=[msg, chatbot, model_dd, temp, maxtok],
                outputs=[msg, chatbot],
            )
            msg.submit(
                _on_send,
                inputs=[msg, chatbot, model_dd, temp, maxtok],
                outputs=[msg, chatbot],
            )
            clear.click(lambda: [], outputs=chatbot)

        with gr.Tab("📚 Agent Catalog"):
            with gr.Row():
                cat_dd = gr.Dropdown(
                    choices=["All"] + CATEGORIES,
                    value="All",
                    label="Filter by category",
                )
                refresh = gr.Button("🔄 Refresh live data", variant="secondary")
            agent_md = gr.Markdown(render_agent_table("All"))
            cat_dd.change(render_agent_table, inputs=cat_dd, outputs=agent_md)

        with gr.Tab("📡 ClawdRouter Status"):
            gr.Markdown("### Live health readout (polls `clawdrouter-zk.fly.dev/`)")
            health_md = gr.Markdown(render_health_dashboard())
            models_md = gr.Markdown(render_models_table(40))
            refresh.click(
                lambda: (render_health_dashboard(), render_models_table(40)),
                outputs=[health_md, models_md],
            )
            gr.Markdown(
                f"<div class='footer-note'>All data is fetched live from "
                f"<code>{ROUTER_BASE}</code>. No API key, no rate limit on the "
                f"browser tab, the only cost is the upstream model on the "
                f"router's bill.</div>"
            )

        with gr.Tab("🧠 Datasets + Models"):
            gr.Markdown(
                """
### 📦 Pull the Clawd stack

| Repo | What it is |
|------|------------|
| [`solanaclawd/solana-clawd-1.5b-lora`](https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora) | The LoRA adapter on Qwen2.5-1.5B-Instruct (9M trainable params, runs on Mac MPS). |
| [`solanaclawd/solana-clawd-instruct`](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) | 32-conversation SFT seed → 90/5/5 parquet splits. |
| [`solanaclawd/solana-clawd-eval`](https://huggingface.co/datasets/solanaclawd/solana-clawd-eval) | 13 held-out capability + red-team prompts. |
| [`github.com/Solizardking/solana-clawd/ai-training`](https://github.com/Solizardking/solana-clawd/tree/main/ai-training) | The training pipeline (seed → parquet → SFT → eval → publish). |

```bash
# 1. Install the HF CLI
curl -LsSf https://hf.co/cli/install.sh | bash -s
hf auth login

# 2. Pull the dataset + the LoRA adapter
hf download solanaclawd/solana-clawd-instruct --repo-type dataset --local-dir data/instruct
hf download solanaclawd/solana-clawd-1.5b-lora --local-dir checkpoints/1.5b-lora

# 3. Or just chat with Clawd for free, in the browser, right here
```
                """
            )

        gr.Markdown(
            """
---
<div class='footer-note'>
🦞 Built by the <a href='https://github.com/Solizardking/solana-clawd'>Solana Clawd</a>
core team. The model never sees your signing key. The router never sees your
prompt-content, beyond what OpenRouter needs to bill it. Sovereign by design.
</div>
            """
        )

        # Auto-refresh the status tab once on load
        demo.load(lambda: (render_health_dashboard(), render_models_table(40)),
                  outputs=[health_md, models_md])

    return demo


if __name__ == "__main__":
    app = build_app()
    app.queue(max_size=16).launch(server_name="0.0.0.0", server_port=7860)
