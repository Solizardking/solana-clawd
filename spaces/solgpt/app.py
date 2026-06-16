"""
SolGPT — a free, Solana-native AI chat.

A single Gradio app that talks **directly** to OpenRouter using a
server-side `OPENROUTER_API_KEY` (set as a Space secret). Visitors never
need their own API key — the Space owner's key pays for inference, and
the default model is OpenRouter's free tier, so the marginal cost per
chat is $0.

  1. **Chat** — ask SolGPT anything about Solana: Anchor/Pinocchio
     programs, PDAs, SPL/Token-2022, Phoenix/Drift perps, pump.fun
     bonding curves, MEV, RPC choices, wallet security, rug detection.
  2. **Model picker** — default is a free OpenRouter model; paid models
     are available as an opt-in for users who want frontier quality.
  3. **Status** — confirms the Space can reach OpenRouter and shows
     which key is active (masked) so operators can debug at a glance.

Built for HF Spaces (Gradio SDK). Runs on a `cpu-basic` (free) flavor.
No local model weights, no GPU required — all inference happens on
OpenRouter's infrastructure.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

import gradio as gr
import requests

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

OPENROUTER_BASE = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_CHAT_URL = f"{OPENROUTER_BASE}/chat/completions"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()

# Sent to OpenRouter as required/recommended attribution headers.
APP_URL = os.environ.get("SOLGPT_APP_URL", "https://github.com/Solizardking/solana-clawd")
APP_TITLE = "SolGPT"

SYSTEM_PROMPT = """You are SolGPT, a free, Solana-native AI assistant.

Your job is to be the single best place to ask anything about the Solana
ecosystem: on-chain programs (Anchor and Pinocchio), PDAs and account
models, SPL Token and Token-2022, transaction construction and fee
markets, RPC providers (Helius, Triton, QuickNode, public mainnet),
Phoenix and Drift perpetuals, Jupiter routing, pump.fun bonding curves
and token launches, wallet security, rug-pull and scam detection, MEV
and sandwich protection, validators and staking, and the broader Solana
DeFi/meme-coin landscape.

Rules you always follow:
- Be concrete and technical. Prefer code, account layouts, and exact
  instruction names over vague gestures at "do your research."
- Never fabricate prices, APYs, contract addresses, or audit results.
  If you don't know or can't verify something live, say so plainly and
  suggest how the user can check (an explorer, an RPC call, the program's
  source).
- Never help drain a wallet, write a rug, bypass KYC for an illegal
  purpose, or build a tool whose primary use is deceiving holders.
  Refuse plainly and explain the safer alternative the user probably
  wants instead.
- Distinguish clearly between mainnet, devnet, and testnet guidance.
- When asked about trading, frame outcomes as risk, not certainty. This
  is not financial advice and you say so when it's relevant.
- You are SolGPT — say so if asked, and say which model is answering if
  asked. Never claim to be a different model or a human.

You are helpful, fast, and precise. The shell molts, the laws do not."""

# Default model: OpenRouter's `:free` tier so the Space costs $0/chat by
# default. Paid models are opt-in for users who want frontier quality and
# are fine with the key's owner footing the bill.
DEFAULT_MODEL = "nex-agi/nex-n2-pro:free"

MODEL_CHOICES: List[Tuple[str, str]] = [
    ("🆓 Nex N2 Pro (free, default)", "nex-agi/nex-n2-pro:free"),
    ("🆓 Nemotron 3 Ultra 550B (free)", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    ("🆓 Hermes-3 Llama-3.1 405B (free)", "nousresearch/hermes-3-llama-3.1-405b:free"),
    ("🆓 Llama 3.3 70B Instruct (free)", "meta-llama/llama-3.3-70b-instruct:free"),
    ("⚡ GPT-4o mini (paid, fast)", "openai/gpt-4o-mini"),
    ("🧠 Claude 3.5 Sonnet (paid, strongest)", "anthropic/claude-3.5-sonnet"),
]

# Known-good free-tier fallback chain, tried in order if the requested
# model 400s or comes back empty (e.g. a model was deprecated upstream).
FREE_FALLBACK_CHAIN = [
    "nex-agi/nex-n2-pro:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]


def _mask_key(key: str) -> str:
    if not key:
        return "（unset）"
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:6]}…{key[-4:]} ({len(key)} chars)"


# --------------------------------------------------------------------------- #
# OpenRouter I/O
# --------------------------------------------------------------------------- #

def openrouter_status() -> Dict[str, Any]:
    """Light reachability + auth check against OpenRouter."""
    if not OPENROUTER_API_KEY:
        return {"ok": False, "error": "OPENROUTER_API_KEY is not set on this Space."}
    try:
        r = requests.get(
            f"{OPENROUTER_BASE}/key",
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            timeout=8,
        )
        if r.status_code == 200:
            data = r.json().get("data", {})
            return {
                "ok": True,
                "label": data.get("label"),
                "usage": data.get("usage"),
                "limit": data.get("limit"),
                "is_free_tier": data.get("is_free_tier"),
            }
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def chat_with_solgpt(
    message: str,
    history: List[List[str]],
    model: str,
    temperature: float,
    max_tokens: int,
) -> Tuple[str, List[List[str]]]:
    """Send a single user turn to OpenRouter and return SolGPT's reply.

    `history` follows the gr.Chatbot convention: list of [user, assistant]
    pairs. The system prompt establishes SolGPT's Solana-native persona on
    every turn.
    """
    if not message.strip():
        return "", history

    if not OPENROUTER_API_KEY:
        reply = (
            "⚠️ This Space is missing `OPENROUTER_API_KEY`. The operator needs "
            "to set it under Space → Settings → Variables and secrets. Get a "
            "free key at https://openrouter.ai/keys — no credit card required."
        )
        history = (history or []) + [[message, reply]]
        return "", history

    msgs: List[Dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
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
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": APP_TITLE,
    }

    # Only fall back across the free chain when the requested model is
    # itself a free model — never silently swap a paid model the user
    # picked on purpose for a different free one.
    requested = payload["model"]
    chain = [requested] if not requested.endswith(":free") else list(
        dict.fromkeys([requested] + FREE_FALLBACK_CHAIN)
    )

    reply = None
    last_err = None
    routed_model = requested
    for attempt_model in chain:
        payload["model"] = attempt_model
        try:
            r = requests.post(OPENROUTER_CHAT_URL, headers=headers, json=payload, timeout=60)
            if r.status_code in (400, 404):
                last_err = f"{r.status_code} from `{attempt_model}`: {r.text[:160]}"
                continue
            r.raise_for_status()
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                last_err = f"empty choices from `{attempt_model}`"
                continue
            reply = choices[0]["message"]["content"]
            routed_model = data.get("model", attempt_model)
            break
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
            continue

    if reply is None:
        reply = (
            f"⚠️ OpenRouter failed for every model tried. Last error: `{last_err}`.\n\n"
            "This is usually transient (cold start or a deprecated free model). "
            "Try again, or pick a different model from the dropdown."
        )
    else:
        footer = (
            f"\n\n<sub>🪐 routed to `{routed_model}` via OpenRouter"
            + (f" · fell back from `{requested}`" if routed_model != requested else "")
            + "</sub>"
        )
        reply = (reply or "").strip() + footer

    history = (history or []) + [[message, reply]]
    return "", history


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #

CSS = """
:root { --sol-purple: #9945FF; --sol-green: #14F195; }
#title { text-align: center; }
.footer-note { opacity: 0.75; font-size: 0.85em; }
.live-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #0a3d1f; color: #5fff95; font-size: 0.85em; }
.dead-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #3d0a0a; color: #ff5b3a; font-size: 0.85em; }
"""


def render_status() -> str:
    info = openrouter_status()
    if not info.get("ok"):
        return (
            f"<div class='dead-pill'>● OpenRouter not ready</div>\n\n"
            f"`{info.get('error', 'unknown error')}`\n\n"
            f"Key on this Space: `{_mask_key(OPENROUTER_API_KEY)}`"
        )
    usage = info.get("usage")
    limit = info.get("limit")
    return f"""
<div class='live-pill'>● OpenRouter reachable</div>

| | |
|---|---|
| **Key** | `{_mask_key(OPENROUTER_API_KEY)}` |
| **Label** | `{info.get('label') or '—'}` |
| **Free tier** | `{info.get('is_free_tier')}` |
| **Usage** | `{usage if usage is not None else '—'}` |
| **Limit** | `{limit if limit is not None else 'unlimited'}` |
| **Default model** | `{DEFAULT_MODEL}` |
""".strip()


def build_app() -> gr.Blocks:
    theme = gr.themes.Soft(primary_hue="purple", secondary_hue="green")

    with gr.Blocks(title="🪐 SolGPT", css=CSS, theme=theme) as demo:
        gr.Markdown(
            """
            <div id="title">

            # 🪐 SolGPT
            ### Free, Solana-native AI chat — no API key, no sign-up

            </div>

            Ask anything about building, trading, or staying safe on
            Solana — Anchor/Pinocchio programs, PDAs, SPL Token/Token-2022,
            Phoenix/Drift perps, Jupiter routing, pump.fun bonding curves,
            RPC providers, wallet security, and rug detection.

            Inference runs on [OpenRouter](https://openrouter.ai) via a
            key the Space owner pays for, on the **free model tier** by
            default — so this chat costs you nothing. No tracking of
            prompts beyond what OpenRouter needs to bill the request.
            """
        )

        with gr.Tab("💬 Chat"):
            with gr.Row():
                with gr.Column(scale=3):
                    chatbot = gr.Chatbot(label="SolGPT", height=520, show_label=False)
                    with gr.Row():
                        msg = gr.Textbox(
                            placeholder="Ask SolGPT anything. E.g. 'How do I derive a PDA in Anchor?'",
                            scale=5,
                            show_label=False,
                            container=False,
                        )
                        send = gr.Button("Send 🪐", scale=1, variant="primary")
                    gr.Examples(
                        examples=[
                            "How do I derive a PDA in Anchor and why does the seed order matter?",
                            "Explain pump.fun's bonding curve math in plain English.",
                            "How do I detect a rug pull on a fresh Solana token before I buy?",
                            "Compare Phoenix perps vs Drift perps for a $500 SOL long.",
                            "What's the difference between SPL Token and Token-2022?",
                            "Which Solana RPC provider should I use for a production trading bot?",
                            "Walk me through building and sending a transaction with @solana/kit.",
                        ],
                        inputs=msg,
                    )
                with gr.Column(scale=1):
                    gr.Markdown("### ⚙️ Settings")
                    model_dd = gr.Dropdown(
                        choices=[label for label, _id in MODEL_CHOICES],
                        value=MODEL_CHOICES[0][0],
                        label="Model",
                        info="Free models cost you nothing. Paid models use the Space owner's OpenRouter credit.",
                    )
                    model_id_map = {label: _id for label, _id in MODEL_CHOICES}
                    temp = gr.Slider(0.0, 1.5, value=0.4, step=0.05, label="Temperature")
                    maxtok = gr.Slider(64, 2048, value=512, step=64, label="Max tokens")
                    gr.Markdown(
                        f"<div class='footer-note'>Endpoint: <code>{OPENROUTER_CHAT_URL}</code><br/>"
                        f"No API key required from you — the Space holds one server-side.<br/>"
                        f"Default model: <code>{DEFAULT_MODEL}</code> (OpenRouter free tier).</div>"
                    )
                    clear = gr.Button("Clear chat", variant="stop")

            def _on_send(message, history, model_label, temperature, max_tokens):
                mid = model_id_map.get(model_label, DEFAULT_MODEL)
                return chat_with_solgpt(message, history, mid, temperature, max_tokens)

            send.click(_on_send, inputs=[msg, chatbot, model_dd, temp, maxtok], outputs=[msg, chatbot])
            msg.submit(_on_send, inputs=[msg, chatbot, model_dd, temp, maxtok], outputs=[msg, chatbot])
            clear.click(lambda: [], outputs=chatbot)

        with gr.Tab("📡 Status"):
            gr.Markdown("### Live OpenRouter connectivity + key check")
            status_md = gr.Markdown(render_status())
            refresh = gr.Button("🔄 Refresh", variant="secondary")
            refresh.click(render_status, outputs=status_md)
            gr.Markdown(
                """
                <div class='footer-note'>
                If the key shows as unreachable, set <code>OPENROUTER_API_KEY</code>
                under <b>Space → Settings → Variables and secrets</b>. Get a free
                key (no credit card) at
                <a href='https://openrouter.ai/keys'>openrouter.ai/keys</a>.
                </div>
                """
            )

        gr.Markdown(
            """
---
<div class='footer-note'>
🪐 SolGPT is part of the <a href='https://github.com/Solizardking/solana-clawd'>Solana Clawd</a>
ecosystem. Built on OpenRouter. Free by default. No wallet, no signup, no
tracking beyond what billing requires.
</div>
            """
        )

        demo.load(render_status, outputs=status_md)

    return demo


if __name__ == "__main__":
    app = build_app()
    app.queue(max_size=16).launch(server_name="0.0.0.0", server_port=7860)
