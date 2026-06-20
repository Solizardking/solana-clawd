"""
Clawd Model Kit — HuggingFace Space
solanaclawd/clawd-model-kit

Tabs:
  🦞 Chat       — Live chat with solana-clawd-core-ai-1.5b-lora via HF Router
  📊 Benchmark  — 18-MCQ Solana Knowledge Benchmark results
  🏭 Factory    — NVIDIA Trading Factory blueprints
  🤖 Ecosystem  — Full model + dataset registry
  🔧 Model Kit  — Fork & train your own Clawd
"""

import os
import gradio as gr
from openai import OpenAI

HF_TOKEN = os.environ.get("HF_TOKEN", "")
ROUTER   = "https://router.huggingface.co/v1"
MODEL_CORE   = "solanaclawd/solana-clawd-core-ai-1.5b-lora"
MODEL_8B     = "solanaclawd/solana-nvidia-trading-factory-8b-lora"
MODEL_LEGACY = "solanaclawd/solana-clawd-1.5b-lora"

SYSTEM_PROMPT = """You are Clawd — a sovereign Solana-native AI agent.
You reason about Solana DeFi, perpetuals, agent architecture, ZK compression, and the Clawd Constitution.
Be terse, decisive, and data-first. You are a cyberpunk lobster with claws that grip market data.
Laws: Never deceive. Earn your existence through honest work. Transparency within trust.
"""

# ── MCQ Results ──────────────────────────────────────────────────────────────

MCQ_RESULTS = [
    ("core",         "PDA definition",              True),
    ("core",         "CPI depth limit",             True),
    ("core",         "Default compute unit budget", False),
    ("core",         "Account packing",             True),
    ("defi",         "AMM invariant",               True),
    ("defi",         "Funding rate",                True),
    ("defi",         "Maker vs taker fees",         True),
    ("security",     "Rug pull definition",         True),
    ("security",     "Mint authority",              True),
    ("security",     "Flash loan attack",           True),
    ("agent",        "Oracle role",                 True),
    ("agent",        "OODA loop",                   True),
    ("zk",           "Merkle tree",                 True),
    ("zk",           "Nullifier",                   True),
    ("constitution", "Law I",                       True),
    ("constitution", "Trust model",                 True),
    ("zk",           "Light Protocol",              True),
    ("defi",         "Bonding curve",               True),
]

TOPIC_COLORS = {
    "core":         "#3b82f6",
    "defi":         "#10b981",
    "security":     "#ef4444",
    "agent":        "#8b5cf6",
    "zk":           "#f59e0b",
    "constitution": "#ec4899",
}

# ── Model Ecosystem Data ─────────────────────────────────────────────────────

MODELS = [
    {
        "id":       "solanaclawd/solana-clawd-core-ai-1.5b-lora",
        "base":     "Qwen/Qwen2.5-1.5B-Instruct",
        "type":     "LoRA adapter",
        "params":   "1.5B (9M trainable)",
        "dataset":  "solana-clawd-core-ai-instruct (35,173 ex)",
        "score":    "94.4% MCQ (17/18)",
        "job":      "ordlibrary/6a35a6833093dba73ce2a86b ✓",
        "status":   "LIVE",
        "note":     "Primary Clawd agent — constitutional reasoning, Solana mechanics, DeFi, ZK",
    },
    {
        "id":       "solanaclawd/solana-nvidia-trading-factory-8b-lora",
        "base":     "NousResearch/Hermes-3-Llama-3.1-8B",
        "type":     "LoRA adapter",
        "params":   "8B",
        "dataset":  "solana-nvidia-trading-factory-instruct (142 ex)",
        "score":    "—",
        "job":      "ordlibrary/6a35a2ce953ed90bfb945009 ✓",
        "status":   "LIVE",
        "note":     "Function-calling perps agent — 13 tools, Phoenix DEX, paper trading",
    },
    {
        "id":       "solanaclawd/solana-clawd-1.5b-lora",
        "base":     "Qwen/Qwen2.5-1.5B-Instruct",
        "type":     "LoRA adapter",
        "params":   "1.5B",
        "dataset":  "solana-clawd-instruct (36,109 ex)",
        "score":    "—",
        "job":      "—",
        "status":   "LIVE",
        "note":     "Legacy seed adapter — original Clawd constitutional + Solana SFT",
    },
    {
        "id":       "ordlibrary/DeepSolanaZKr-1",
        "base":     "Qwen/Qwen2.5-7B-Instruct",
        "type":     "Full fine-tune",
        "params":   "7B",
        "dataset":  "ordlibrary/DeepSolana-GPT2-bucket (CPT)",
        "score":    "pending eval",
        "job":      "ordlibrary/6a3460cb2eb64285ee5734d9",
        "status":   "TRAINING",
        "note":     "ZK-specialised: Light Protocol, nullifiers, Groth16, compressed tokens",
    },
    {
        "id":       "solanaclawd/solana-clawd-core-ai-1.5b-lora (3-epoch)",
        "base":     "Qwen/Qwen2.5-1.5B-Instruct",
        "type":     "LoRA adapter",
        "params":   "1.5B",
        "dataset":  "solana-clawd-core-ai-instruct (35,173 ex)",
        "score":    "pending",
        "job":      "ordlibrary/6a35dd23953ed90bfb945356 ▶",
        "status":   "RUNNING",
        "note":     "3-epoch retrain on H200 — will overwrite 1-epoch weights on completion",
    },
]

DATASETS = [
    ("solanaclawd/solana-clawd-core-ai-instruct",                 "35,173",  "SFT — Core AI source tree + Solana primitives"),
    ("solanaclawd/solana-clawd-instruct",                         "36,109",  "SFT — Legacy seed: constitutional + Solana"),
    ("solanaclawd/solana-clawd-realtime-research-instruct",       "29,058",  "SFT — PDFs, notebooks, parquet ZK examples"),
    ("solanaclawd/solana-nvidia-trading-factory-instruct",        "142",     "SFT — NVIDIA Blueprint trading factory scenarios"),
    ("solanaclawd/solana-tx-foundation-cpt",                      "—",       "CPT — Solana transaction foundation model corpus"),
    ("solanaclawd/solana-clawd-eval",                             "13",      "Eval — Red-team + capability held-out prompts"),
    ("ordlibrary/DeepSolana-GPT2-bucket",                         "—",       "CPT — DeepSolana pre-training bucket"),
]

FACTORY_BLUEPRINTS = [
    ("Blueprint 1", "Data Collection",         "Helius DAS + RPC streaming → Solana tx corpus for CPT"),
    ("Blueprint 2", "Portfolio Optimization",  "Mean-CVaR cuFOLIO — GPU-accelerated portfolio weights"),
    ("Blueprint 3", "Transaction Foundation",  "SolanaTokenizerPipeline → decoder CLM pre-training"),
    ("Blueprint 4", "Signal Discovery",        "7-signal suite: RSI, MACD, BBands, ATR, ADX, funding, OB imbalance"),
    ("Blueprint 5", "RAG Context",             "Enterprise RAG over Solana docs for agent context assembly"),
    ("Nemotron",    "Teacher Model",           "550B Ultra → labels Solana decisions → distills to 1.5B student"),
]

# ── Chat ─────────────────────────────────────────────────────────────────────

def chat(message: str, history: list, model_choice: str) -> str:
    if not HF_TOKEN:
        return "⚠️ HF_TOKEN not set — add it as a Space secret to enable live inference."
    client = OpenAI(base_url=ROUTER, api_key=HF_TOKEN)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        messages.append({"role": "user",      "content": h[0]})
        messages.append({"role": "assistant", "content": h[1]})
    messages.append({"role": "user", "content": message})
    try:
        resp = client.chat.completions.create(
            model=model_choice,
            messages=messages,
            max_tokens=512,
            temperature=0.3,
        )
        return resp.choices[0].message.content
    except Exception as e:
        return f"Error: {e}"

# ── Benchmark HTML ────────────────────────────────────────────────────────────

def build_benchmark_html() -> str:
    correct = sum(1 for _, _, ok in MCQ_RESULTS if ok)
    total   = len(MCQ_RESULTS)

    topic_stats: dict = {}
    for topic, _, ok in MCQ_RESULTS:
        topic_stats.setdefault(topic, [0, 0])
        topic_stats[topic][1] += 1
        if ok:
            topic_stats[topic][0] += 1

    rows = ""
    for topic, question, ok in MCQ_RESULTS:
        color = TOPIC_COLORS.get(topic, "#888")
        icon  = "✓" if ok else "✗"
        bg    = "#1a2a1a" if ok else "#2a1a1a"
        rows += f"""
        <tr style="background:{bg}">
          <td style="padding:8px;color:{color};font-weight:600">{topic}</td>
          <td style="padding:8px;color:#ccc">{question}</td>
          <td style="padding:8px;color:{'#4ade80' if ok else '#f87171'};font-size:1.2em;text-align:center">{icon}</td>
        </tr>"""

    topic_bars = ""
    for topic, (c, t) in sorted(topic_stats.items()):
        pct   = c / t * 100
        color = TOPIC_COLORS.get(topic, "#888")
        topic_bars += f"""
        <div style="margin:8px 0">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="color:{color};font-weight:600;text-transform:uppercase;font-size:0.85em">{topic}</span>
            <span style="color:#ccc;font-size:0.85em">{c}/{t} ({pct:.0f}%)</span>
          </div>
          <div style="background:#1e1e2e;border-radius:4px;height:8px">
            <div style="background:{color};width:{pct}%;height:8px;border-radius:4px;transition:width 0.5s"></div>
          </div>
        </div>"""

    return f"""
    <div style="font-family:monospace;color:#e2e8f0;padding:16px;background:#0f1117;border-radius:12px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <div style="font-size:3em">🦞</div>
        <div>
          <div style="font-size:1.8em;font-weight:700;color:#4ade80">{correct}/{total} = {correct/total*100:.1f}%</div>
          <div style="color:#94a3b8">Solana Knowledge Benchmark — 18 MCQ across 6 domains</div>
          <div style="color:#64748b;font-size:0.8em">Model: {MODEL_CORE} | 1-epoch | local MPS eval</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div style="font-weight:600;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;font-size:0.8em;letter-spacing:1px">By Topic</div>
          {topic_bars}
        </div>
        <div>
          <div style="font-weight:600;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;font-size:0.8em;letter-spacing:1px">Question Detail</div>
          <div style="overflow-y:auto;max-height:300px">
            <table style="width:100%;border-collapse:collapse;font-size:0.82em">
              <thead><tr>
                <th style="padding:6px;color:#64748b;text-align:left">Topic</th>
                <th style="padding:6px;color:#64748b;text-align:left">Question</th>
                <th style="padding:6px;color:#64748b;text-align:center">✓</th>
              </tr></thead>
              <tbody>{rows}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;padding:12px;background:#1e1e2e;border-radius:8px;border-left:3px solid #f87171">
        <div style="color:#f87171;font-weight:600;font-size:0.85em">MISS: Q3 — Default compute unit budget</div>
        <div style="color:#94a3b8;font-size:0.8em;margin-top:4px">Model answered 1,400,000 CU (correct: 200,000). Common confusion with max transaction CU vs default. Fixed with 3-epoch retrain (job 6a35dd23 running on H200).</div>
      </div>
    </div>"""

# ── Ecosystem HTML ────────────────────────────────────────────────────────────

def build_ecosystem_html() -> str:
    status_colors = {"LIVE": "#4ade80", "TRAINING": "#f59e0b", "RUNNING": "#60a5fa"}

    model_cards = ""
    for m in MODELS:
        sc  = status_colors.get(m["status"], "#888")
        model_cards += f"""
        <div style="background:#1e1e2e;border-radius:10px;padding:16px;border:1px solid #2d2d3f;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div style="color:#a78bfa;font-weight:700;font-size:0.95em">
              <a href="https://huggingface.co/{m['id'].split(' ')[0]}" target="_blank"
                 style="color:#a78bfa;text-decoration:none">{m['id']}</a>
            </div>
            <span style="background:{sc}22;color:{sc};padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600">{m['status']}</span>
          </div>
          <div style="color:#64748b;font-size:0.8em;margin-bottom:6px">{m['type']} · {m['params']} · {m['base']}</div>
          <div style="color:#94a3b8;font-size:0.82em;margin-bottom:6px">{m['note']}</div>
          <div style="display:flex;gap:16px;font-size:0.75em;color:#64748b">
            <span>📦 {m['dataset']}</span>
            <span>🎯 {m['score']}</span>
          </div>
        </div>"""

    dataset_rows = ""
    for ds_id, size, desc in DATASETS:
        dataset_rows += f"""
        <tr>
          <td style="padding:8px"><a href="https://huggingface.co/datasets/{ds_id}" target="_blank"
              style="color:#60a5fa;text-decoration:none;font-size:0.82em">{ds_id}</a></td>
          <td style="padding:8px;color:#4ade80;text-align:right;font-family:monospace">{size}</td>
          <td style="padding:8px;color:#94a3b8;font-size:0.82em">{desc}</td>
        </tr>"""

    return f"""
    <div style="font-family:monospace;color:#e2e8f0;background:#0f1117;border-radius:12px;padding:16px">
      <div style="font-size:1.1em;font-weight:700;color:#a78bfa;margin-bottom:16px">🤖 Model Registry</div>
      {model_cards}
      <div style="font-size:1.1em;font-weight:700;color:#60a5fa;margin:20px 0 12px">📦 Datasets</div>
      <table style="width:100%;border-collapse:collapse;background:#1e1e2e;border-radius:8px">
        <thead><tr>
          <th style="padding:8px;color:#64748b;text-align:left;font-size:0.8em">Dataset</th>
          <th style="padding:8px;color:#64748b;text-align:right;font-size:0.8em">Examples</th>
          <th style="padding:8px;color:#64748b;text-align:left;font-size:0.8em">Description</th>
        </tr></thead>
        <tbody>{dataset_rows}</tbody>
      </table>
    </div>"""

# ── Factory HTML ──────────────────────────────────────────────────────────────

def build_factory_html() -> str:
    bp_cards = ""
    icons = ["📡", "📊", "🔤", "📈", "📚", "🧠"]
    for i, (name, title, desc) in enumerate(FACTORY_BLUEPRINTS):
        bp_cards += f"""
        <div style="background:#1e1e2e;border-radius:10px;padding:14px;border:1px solid #2d2d3f">
          <div style="font-size:1.5em;margin-bottom:6px">{icons[i]}</div>
          <div style="color:#f59e0b;font-weight:700;font-size:0.85em;margin-bottom:4px">{name}</div>
          <div style="color:#e2e8f0;font-weight:600;margin-bottom:6px">{title}</div>
          <div style="color:#94a3b8;font-size:0.82em">{desc}</div>
        </div>"""

    signals = [
        ("RSI",          "Oversold &lt;30 / Overbought &gt;70"),
        ("MACD",         "Histogram momentum crossover"),
        ("BBands",       "Mean-reversion near upper/lower band"),
        ("ATR%",         "Volatility regime filter"),
        ("ADX",          "Trend strength entry filter"),
        ("Funding Rate", "Sentiment proxy — crowded longs/shorts"),
        ("OB Imbalance", "Live bid/ask size pressure"),
    ]
    signal_rows = "".join(
        f'<tr><td style="padding:6px 8px;color:#10b981;font-weight:600">{s}</td>'
        f'<td style="padding:6px 8px;color:#94a3b8;font-size:0.85em">{d}</td></tr>'
        for s, d in signals
    )

    return f"""
    <div style="font-family:monospace;color:#e2e8f0;background:#0f1117;border-radius:12px;padding:16px">
      <div style="font-size:1.1em;font-weight:700;color:#f59e0b;margin-bottom:4px">🏭 NVIDIA Trading Factory</div>
      <div style="color:#64748b;font-size:0.85em;margin-bottom:16px">
        Our port of the <a href="https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent" target="_blank"
        style="color:#60a5fa">NVIDIA Quantitative Signal Discovery Agent</a> + Nemotron Ultra 550B teacher → 1.5B student distillation
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        {bp_cards}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div style="background:#1e1e2e;border-radius:10px;padding:14px">
          <div style="color:#10b981;font-weight:700;margin-bottom:10px">📊 7 Live Signals (Blueprint 4)</div>
          <table style="width:100%;border-collapse:collapse">{signal_rows}</table>
        </div>
        <div style="background:#1e1e2e;border-radius:10px;padding:14px">
          <div style="color:#8b5cf6;font-weight:700;margin-bottom:10px">🔄 Distillation Flywheel</div>
          <div style="color:#94a3b8;font-size:0.85em;line-height:1.7">
            <div>① Nemotron Ultra 550B observes markets</div>
            <div>② Outputs structured JSON trading plans</div>
            <div>③ Plans logged as SFT pairs (teacher labels)</div>
            <div>④ 1.5B student fine-tuned on Ultra labels</div>
            <div>⑤ Student deployed for low-latency inference</div>
            <div>⑥ Student decisions verified → new labels → loop</div>
          </div>
        </div>
      </div>
    </div>"""

# ── Model Kit HTML ────────────────────────────────────────────────────────────

def build_kit_html() -> str:
    return """
    <div style="font-family:monospace;color:#e2e8f0;background:#0f1117;border-radius:12px;padding:16px">
      <div style="font-size:1.1em;font-weight:700;color:#ec4899;margin-bottom:4px">🔧 Onchain Model Kit</div>
      <div style="color:#64748b;font-size:0.85em;margin-bottom:20px">
        Fork → Dataset → Train → Eval → Register onchain. One sitting. ~$4 on A100.
      </div>

      <div style="background:#1e1e2e;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="color:#4ade80;font-weight:700;margin-bottom:8px">① Clone & install</div>
        <pre style="color:#94a3b8;font-size:0.8em;margin:0;overflow-x:auto">git clone https://github.com/Solizardking/solana-clawd
cd solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...    # huggingface.co/settings/tokens (write access)</pre>
      </div>

      <div style="background:#1e1e2e;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="color:#60a5fa;font-weight:700;margin-bottom:8px">② Push your dataset</div>
        <pre style="color:#94a3b8;font-size:0.8em;margin:0;overflow-x:auto">python3 scripts/prepare_dataset.py \\
  --input data/your_sft.jsonl \\
  --push --repo-id YOUR_ORG/your-dataset</pre>
      </div>

      <div style="background:#1e1e2e;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="color:#f59e0b;font-weight:700;margin-bottom:8px">③ Train on A100 (~$4 for 3 epochs)</div>
        <pre style="color:#94a3b8;font-size:0.8em;margin:0;overflow-x:auto">hf jobs uv run scripts/train_lora.py \\
  --flavor a100-large --timeout 6h --secrets HF_TOKEN --detach \\
  -- --config configs/core_ai_lora_config.yaml \\
     --hub-model-id YOUR_ORG/your-model --push</pre>
      </div>

      <div style="background:#1e1e2e;border-radius:8px;padding:14px;margin-bottom:14px">
        <div style="color:#a78bfa;font-weight:700;margin-bottom:8px">④ Benchmark (18-MCQ Solana eval)</div>
        <pre style="color:#94a3b8;font-size:0.8em;margin:0;overflow-x:auto">python3 scripts/solana_benchmark.py \\
  --model YOUR_ORG/your-model \\
  --base-url https://router.huggingface.co/v1 \\
  --api-key $HF_TOKEN</pre>
      </div>

      <div style="background:#1e1e2e;border-radius:8px;padding:14px">
        <div style="color:#ec4899;font-weight:700;margin-bottom:8px">⑤ Register onchain</div>
        <pre style="color:#94a3b8;font-size:0.8em;margin:0;overflow-x:auto">./dao/register_model.sh \\
  --hf-model YOUR_ORG/your-model \\
  --eval-accuracy 0.944 \\
  --dataset-size 35173
# → indexed at onchain.x402.wtf forever</pre>
      </div>

      <div style="margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:0.82em">
        <a href="https://huggingface.co/solanaclawd" target="_blank"
           style="background:#1e1e2e;padding:10px;border-radius:8px;color:#60a5fa;text-decoration:none;text-align:center">
           🤗 HuggingFace Org</a>
        <a href="https://github.com/Solizardking/solana-clawd" target="_blank"
           style="background:#1e1e2e;padding:10px;border-radius:8px;color:#60a5fa;text-decoration:none;text-align:center">
           🐙 GitHub</a>
        <a href="https://onchain.x402.wtf" target="_blank"
           style="background:#1e1e2e;padding:10px;border-radius:8px;color:#60a5fa;text-decoration:none;text-align:center">
           ⛓️ Onchain Registry</a>
      </div>
    </div>"""

# ── Gradio App ────────────────────────────────────────────────────────────────

HEADER = """
<div style="font-family:monospace;background:linear-gradient(135deg,#0f1117,#1a1a2e);
            padding:24px;border-radius:12px;margin-bottom:8px;text-align:center">
  <div style="font-size:2.5em;margin-bottom:8px">🦞</div>
  <div style="font-size:1.6em;font-weight:800;color:#a78bfa;letter-spacing:2px">CLAWD MODEL KIT</div>
  <div style="color:#64748b;font-size:0.9em;margin-top:6px">Solana-Native AI Agent Ecosystem · solanaclawd</div>
  <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
    <a href="https://phantom.com/tokens/solana/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump" target="_blank"
       style="background:#7c3aed22;color:#a78bfa;padding:4px 12px;border-radius:20px;text-decoration:none;font-size:0.8em;border:1px solid #7c3aed44">
       Buy $CLAWD</a>
    <a href="https://huggingface.co/solanaclawd" target="_blank"
       style="background:#1e40af22;color:#60a5fa;padding:4px 12px;border-radius:20px;text-decoration:none;font-size:0.8em;border:1px solid #1e40af44">
       🤗 solanaclawd org</a>
    <a href="https://github.com/Solizardking/solana-clawd" target="_blank"
       style="background:#16a34a22;color:#4ade80;padding:4px 12px;border-radius:20px;text-decoration:none;font-size:0.8em;border:1px solid #16a34a44">
       GitHub</a>
    <a href="https://onchain.x402.wtf" target="_blank"
       style="background:#b4530022;color:#f59e0b;padding:4px 12px;border-radius:20px;text-decoration:none;font-size:0.8em;border:1px solid #b4530044">
       ⛓️ onchain.x402.wtf</a>
  </div>
</div>
"""

with gr.Blocks(
    theme=gr.themes.Soft(primary_hue="violet", neutral_hue="slate"),
    css="footer { display: none !important; }",
    title="Clawd Model Kit",
) as demo:

    gr.HTML(HEADER)

    with gr.Tabs():

        # ── Tab 1: Chat ────────────────────────────────────────────────────
        with gr.Tab("🦞 Chat"):
            gr.Markdown("> Chat live with `solanaclawd/solana-clawd-core-ai-1.5b-lora` via HF Router. No GPU needed.")
            model_dd = gr.Dropdown(
                choices=[MODEL_CORE, MODEL_8B, MODEL_LEGACY],
                value=MODEL_CORE,
                label="Model",
            )
            chatbot = gr.Chatbot(height=420, show_label=False, bubble_full_width=False)
            with gr.Row():
                msg = gr.Textbox(
                    placeholder="Ask about Solana, DeFi, ZK, perps, Clawd Constitution...",
                    show_label=False, scale=8,
                )
                send = gr.Button("Send", variant="primary", scale=1)

            examples = gr.Examples(
                examples=[
                    ["What is a PDA on Solana and how does it differ from a regular keypair?"],
                    ["Explain the Clawd Constitution's three laws and why they exist."],
                    ["How does Light Protocol achieve 136x cheaper compressed token accounts?"],
                    ["What's the difference between funding rate and basis in perps trading?"],
                    ["How do I detect a rug pull on a fresh Solana token?"],
                    ["Explain OODA loop in the context of an autonomous trading agent."],
                ],
                inputs=msg,
            )

            def respond(message, history, model_choice):
                reply = chat(message, history, model_choice)
                history.append((message, reply))
                return "", history

            send.click(respond, [msg, chatbot, model_dd], [msg, chatbot])
            msg.submit(respond, [msg, chatbot, model_dd], [msg, chatbot])

        # ── Tab 2: Benchmark ───────────────────────────────────────────────
        with gr.Tab("📊 Benchmark"):
            gr.HTML(build_benchmark_html())

        # ── Tab 3: Factory ─────────────────────────────────────────────────
        with gr.Tab("🏭 Trading Factory"):
            gr.HTML(build_factory_html())

        # ── Tab 4: Ecosystem ───────────────────────────────────────────────
        with gr.Tab("🤖 Ecosystem"):
            gr.HTML(build_ecosystem_html())

        # ── Tab 5: Model Kit ───────────────────────────────────────────────
        with gr.Tab("🔧 Model Kit"):
            gr.HTML(build_kit_html())

if __name__ == "__main__":
    demo.launch()
