---
language: en
license: apache-2.0
base_model: Qwen/Qwen2.5-1.5B-Instruct
datasets:
  - solanaclawd/solana-clawd-instruct
tags:
  - solana
  - defi
  - crypto
  - agent
  - lora
  - peft
  - constitutional-ai
library_name: peft
pipeline_tag: text-generation
---

# Solana Clawd 1.5B LoRA

A LoRA fine-tune of Qwen2.5-1.5B-Instruct for Solana development, DeFi reasoning, memecoin risk analysis, agent architecture, and Clawd constitutional behavior.

**Base model**: [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)  
**Adapter type**: LoRA (r=16, alpha=32, ~9M trainable params / 0.6% of base)  
**Training data**: [solanaclawd/solana-clawd-instruct](https://huggingface.co/datasets/solanaclawd/solana-clawd-instruct) — 36,109 examples  
**Training config**: `ai-training/configs/lora_config.yaml`  
**Hub model ID**: `solanaclawd/solana-clawd-1.5b-lora`

> **Tool-use / function calling?** Use the 8B Hermes-3 base with
> `configs/hermes3_lora_config.yaml` and the `perps/` function-calling suite
> (13 tools: funding rate, paper trade, risk assessment, Jupiter quotes).

---

## Fork this to train your own Clawd

Everything below is a working example — swap in your own HF org, dataset, and base model to get your own fine-tuned Solana agent in one sitting.

```bash
# 0. Clone + install
git clone https://github.com/Solizardking/solana-clawd
cd solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...           # huggingface.co/settings/tokens (write access)
export WANDB_API_KEY=...         # wandb.ai/authorize (optional, enables live charts)

# 1. (Optional) bring your own data — append to the merged dataset
#    Format: {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
#    Then re-run prepare_dataset.py with your JSONL added to the --input list.

# 2. Push the dataset to your HF org (or reuse ours — skip if using solanaclawd/solana-clawd-instruct)
python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_merged.jsonl \
  --output data/processed \
  --train-ratio 0.9 --eval-ratio 0.05 \
  --seed 42 \
  --push --repo-id YOUR_ORG/your-dataset-id

# 3. Train on a remote A100 (recommended — ~$3–6 for the full 36K × 3-epoch run)
./scripts/launch_hf_jobs.sh a100-large   # or h200, l4x1

# 4. Train locally on Mac MPS (sanity check, 1 epoch)
python3 scripts/train_lora.py --num-epochs 1 --no-quant

# 5. Watch live training logs
hf jobs ps
hf jobs logs <JOB_ID> --follow

# 6. Register your model to the onchain Clawd registry (off-chain index — no wallet needed)
./dao/register_model.sh \
  --hf-model "YOUR_ORG/your-model-id" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# 7. Serve locally with Ollama
ollama create my-clawd -f ollama/Modelfile.finetuned
ollama run my-clawd "How do I detect a rug pull on a fresh Solana token?"
```

The entire pipeline — dataset → train → eval → onchain registry — is designed to
be reproducible from a single clone. The only external requirement is a Hugging
Face account with write access (free tier works).

---

## What this model knows

Check every domain your training data covers:

- [x] Solana mechanics (PDAs, accounts, instructions, rent, compute budgets, Token-2022)
- [x] DeFi primitives (AMMs, CLMMs, perpetuals, bonding curves, Jupiter, Phoenix)
- [x] Memecoin risk (rug detection, holder concentration, deployer forensics)
- [x] Agent architecture (skill registries, brain/hands split, multi-agent coordination)
- [x] ZK compression (Light Protocol, nullifiers, Groth16 — see `zk-primitives/`)
- [x] Code generation (Anchor/Rust, TypeScript @solana/kit, Python)
- [x] Constitutional reasoning (Clawd Constitution, guardrails, refusal patterns)
- [ ] Perps function calling ← Hermes-3 8B path only
- [ ] Add your domain here

---

## Intended Use

**Good for**:

- Local Clawd agent inference (MPS / CUDA / CPU, 4 GB+ VRAM)
- Server inference (vLLM, TGI, Ollama after weight merge)
- HF Router (no GPU — OpenAI-compat endpoint)
- Clawd agent runtime (MCP skill, Telegram bot, voice agent)

**Out of scope**:

- Front-running, sandwich attacks, or MEV exploitation
- Wallet draining or social engineering
- Live trading without explicit user confirmation and a trust-gated execution layer
- Financial advice — this model produces analysis, not guaranteed outcomes

---

## Training Details

| Parameter | Value |
| --- | --- |
| Base model | `Qwen/Qwen2.5-1.5B-Instruct` |
| LoRA rank / alpha | 16 / 32 |
| LoRA dropout | 0.05 |
| Target modules | q/k/v/o + gate/up/down projections (all linear) |
| Trainable params | ~9M (0.6% of base) |
| Epochs | 3 |
| Learning rate | 2.0e-4 (cosine scheduler, 3% warmup) |
| Effective batch size | 16 (2 × 8 gradient accumulation) |
| Max sequence length | 4096 tokens |
| Quantization | 4-bit NF4 double-quant at training (CUDA only) |
| Loss | Assistant-only (system + user tokens masked) |
| Training hardware | NVIDIA A100 80GB (HF Jobs `a100-large`) |
| Training time | ~1–2 hrs on A100 for the 36K × 3-epoch run |
| Dataset size | 36,109 conversations → 32,498 / 1,805 / 1,806 train/eval/test |
| Dataset seed | 42 (deterministic splits) |

### Fireworks managed SFT run

The current Fireworks deployment uses the Hugging Face dataset export from
`solanaclawd/solana-clawd-instruct`, uploaded to Fireworks as JSONL because
the Fireworks dataset API only accepts uploaded files or cloud-storage URIs for
managed SFT.

| Field | Value |
| --- | --- |
| Job | `accounts/beetsbyj-d25663/supervisedFineTuningJobs/b1rgqmi9` |
| Final state | `JOB_STATE_COMPLETED` |
| Completed | `2026-06-17T22:59:49.848326Z` |
| Base model | `accounts/fireworks/models/qwen2p5-7b-instruct` |
| Output model | `accounts/beetsbyj-d25663/models/clawd-glm-5-2` |
| Live-merge deployment | `accounts/beetsbyj-d25663/deployments/clawd-glm-5-2-live` (`FAILED`, Fireworks internal error) |
| Multi-LoRA deployment | `accounts/beetsbyj-d25663/deployments/qwen2p5-7b-clawd-addons` (`FAILED`, Fireworks internal error) |
| Deployment shape | `NVIDIA_A100_80GB` x2, `FP16`, min replicas 0, max replicas 1 |
| Train dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-20260617` |
| Eval dataset | `accounts/beetsbyj-d25663/datasets/solana-clawd-eval-20260617` |
| Epochs | 1 |
| Learning rate | 1.0e-4 |
| LoRA rank | 8 |
| Max context length | 8192 |

The trained model is `READY` in Fireworks, but both attempted on-demand
deployment methods failed during model-server initialization with a Fireworks
internal error. The account currently has no validated deployment shape returned
for `accounts/fireworks/models/qwen2p5-7b-instruct`.

### How to reproduce

```bash
cd /path/to/solana-clawd/ai-training
pip install -r requirements.txt
export HF_TOKEN=hf_...

# 1. Prepare dataset (uses the 36K merged file — canonical training input)
python3 scripts/prepare_dataset.py \
  --input data/solana_clawd_merged.jsonl \
  --output data/processed \
  --train-ratio 0.9 --eval-ratio 0.05 \
  --seed 42 \
  --push --repo-id solanaclawd/solana-clawd-instruct

# 2. Train (remote GPU — recommended)
./scripts/launch_hf_jobs.sh a100-large   # or h200, l4x1, a100x4

# 3. Train (local Mac MPS — sanity check, 1 epoch)
python3 scripts/train_lora.py --num-epochs 1 --no-quant
```

---

## Evaluation

```bash
python3 scripts/evaluate.py \
  --config configs/eval_config.yaml \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --dataset solanaclawd/solana-clawd-eval \
  --out ./outputs/eval \
  --format markdown
```

| Metric | Value |
| --- | --- |
| Eval examples | 13 in the committed eval set; runtime sample size depends on `--num` |
| Throughput | Populate from `outputs/eval/eval_results.json` after running the adapter |
| Refusal rate (heuristic) | Populate from `outputs/eval/eval_results.json` after running the adapter |
| Avg generation length | Populate from `outputs/eval/eval_results.json` after running the adapter |

---

## Usage

### transformers + peft (universal)

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE    = "Qwen/Qwen2.5-1.5B-Instruct"
ADAPTER = "solanaclawd/solana-clawd-1.5b-lora"

tokenizer = AutoTokenizer.from_pretrained(BASE, trust_remote_code=True)
model     = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16,
                                                  device_map="auto", trust_remote_code=True)
model     = PeftModel.from_pretrained(model, ADAPTER)

messages = [
    {"role": "system",    "content": "You are Clawd, a sovereign Solana-native AI agent."},
    {"role": "user",      "content": "How do I detect a rug pull on a fresh token?"},
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

with torch.no_grad():
    out = model.generate(**inputs, max_new_tokens=512, temperature=0.2, top_p=0.9,
                         do_sample=True, pad_token_id=tokenizer.pad_token_id)
print(tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

### mlx-lm (Apple Silicon — fastest local path)

```bash
pip install mlx-lm
mlx_lm.generate \
  --model Qwen/Qwen2.5-1.5B-Instruct \
  --adapter solanaclawd/solana-clawd-1.5b-lora \
  --prompt "How do I detect a rug pull on a fresh Solana token?"
```

### HF Router (no GPU required)

```python
from openai import OpenAI

client = OpenAI(base_url="https://router.huggingface.co/v1", api_key="hf_...")
response = client.chat.completions.create(
    model="solanaclawd/solana-clawd-1.5b-lora",
    messages=[
        {"role": "system", "content": "You are Clawd, a sovereign Solana-native AI agent."},
        {"role": "user",   "content": "What is a PDA?"},
    ],
    max_tokens=512,
)
print(response.choices[0].message.content)
```

### Hermes-3 perps function calling (8B path only)

```bash
# Paper trade via the perps agent
python3 ai-training/perps/functioncall.py \
  --query "Paper trade: long SOL-PERP $500 at 3x" --verbose

# GOAP reasoning (multi-step strategies)
python3 ai-training/perps/functioncall.py \
  --goap --query "Assess risk of shorting SOL-PERP $1000 at 5x"
```

---

## Solana Perps Tool Template (included in the kit)

The `perps/` directory is a drop-in tool library for building Solana perpetuals
agents. It works out of the box with **no API keys** for read-only data, and
plugs directly into any Hermes-3 or OpenAI-compatible function-calling loop.

### 13 tools included

| Tool | What it does |
| --- | --- |
| `get_sol_price` | SOL price + 24h change from CoinGecko |
| `get_token_price` | Any Solana token by symbol or mint |
| `get_perp_markets` | Phoenix DEX perp markets (mark price, OI, volume, funding) |
| `get_funding_rate` | Hourly + 8h + annualized funding rate for a market |
| `get_orderbook` | Phoenix order book (top N bids/asks, spread) |
| `check_positions` | Open perp positions for a wallet |
| `check_sol_balance` | SOL + USD balance for a wallet |
| `get_jupiter_quote` | Best swap route + price impact via Jupiter v6 |
| `paper_trade` | Simulate a perp entry (mark price, liq price, margin, funding cost) |
| `get_market_overview` | Snapshot: SOL price, TPS, epoch, top markets |
| `get_trader_history` | Recent fills + realized PnL on Phoenix |
| `send_sol` | Transfer SOL (paper mode by default; LIVE_TRADING=true for real) |
| `assess_position_risk` | Liq price, max loss, 24h funding cost, 1–10 risk score |

### Quick start

```python
# Plug the tool library into any OpenAI-compatible function-calling agent
from perps.functions import get_openai_tools, call_function

tools = get_openai_tools()   # returns all 13 tools in OpenAI tool format

# Call a tool directly (no model needed)
import json
print(json.dumps(call_function("get_sol_price", {}), indent=2))
print(json.dumps(call_function("assess_position_risk", {
    "market": "SOL-PERP", "side": "long", "size_usd": 500, "leverage": 3
}), indent=2))
```

```bash
# Run the full Hermes-3 perps agent (HF Router — no GPU)
python3 perps/functioncall.py --query "What's the SOL-PERP funding rate? Should I go long?"

# GOAP multi-step reasoning mode
python3 perps/functioncall.py --goap \
  --query "Assess the risk of shorting SOL-PERP with $1000 at 5x leverage"

# Local Hermes-3 (needs GPU or quantized model)
HERMES_LOCAL=1 python3 perps/functioncall.py \
  --query "Paper trade: long SOL-PERP $500 at 3x"
```

### Pydantic schemas (for structured output)

```python
from perps.schema import TradeOrder, RiskAssessment, MarketSignal

# Force the model to emit a valid TradeOrder JSON
# Pass schema.TradeOrder.schema_json() as the response_format to any OpenAI client
```

### Adding your own tools

```python
# perps/functions.py — add a new tool with the @tool decorator
from functions import tool, ALL_TOOLS

@tool(
    description="Get the top token holders for a mint (uses Helius DAS).",
    parameters={
        "type": "object",
        "properties": {
            "mint": {"type": "string", "description": "Token mint address"},
            "limit": {"type": "integer", "description": "Number of holders", "default": 10},
        },
        "required": ["mint"],
    }
)
def get_top_holders(mint: str, limit: int = 10) -> dict:
    # your implementation here
    return {"mint": mint, "holders": []}

ALL_TOOLS.append(get_top_holders)   # auto-registered in get_openai_tools()
```

---

## Onchain Model Registry

Every model trained with this kit gets a permanent, verifiable onchain identity anchored via the [`solana_ai_inference`](https://github.com/Solizardking/OnChain-Ai) Anchor program and indexed at [onchain.x402.wtf](https://onchain.x402.wtf). No centralized API needed — the PDA is queryable forever.

### Layer 1 — Off-chain index (one curl, no wallet)

The fastest path. Posts to the onchain.x402.wtf registry and returns a CAAP/1.0 JSON record. Good enough for discovery and routing.

```bash
# Auto-computes model hash from train_lora.py
./dao/register_model.sh \
  --hf-model "YOUR_ORG/your-model-id" \
  --eval-accuracy 0.60 \
  --dataset-size 36109

# Dry run to preview the payload first
./dao/register_model.sh --dry-run \
  --hf-model "YOUR_ORG/your-model-id"

# Manual curl (no shell dep)
curl -X POST https://onchain.x402.wtf/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -d '{
    "model_hash":    "sha256:<hash>",
    "model_type":    "TextGeneration",
    "api_endpoint":  "https://clawd-box-router.fly.dev/v1",
    "hf_model_id":   "YOUR_ORG/your-model-id",
    "dataset_size":  36109,
    "eval_accuracy": 0.60,
    "protocol":      "CAAP/1.0",
    "clawd_token":   "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
    "registered_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

Valid `model_type` values: `TextGeneration` | `SentimentAnalysis` | `ImageClassification` | `PricePrediction` | `DocumentUnderstanding`

### Layer 2 — Onchain PDA (Anchor tx, permanent)

Creates a `ModelRegistry` PDA at seeds `["model", authority.pubkey]`. Requires a funded Solana wallet (devnet) and pnpm.

```bash
# One command — the shell wrapper handles both layers automatically
./dao/register_model.sh --onchain \
  --hf-model   "YOUR_ORG/your-model-id" \
  --endpoint   "https://clawd-box-router.fly.dev/v1" \
  --cluster    devnet \
  --keypair    ~/.config/solana/id.json

# Or call the TypeScript client directly
pnpm tsx dao/register_model.ts \
  --model-hash  "sha256:$(sha256sum scripts/train_lora.py | awk '{print $1}')" \
  --model-type  "TextGeneration" \
  --endpoint    "https://clawd-box-router.fly.dev/v1" \
  --reward-rate 1000000 \
  --keypair     ~/.config/solana/id.json \
  --cluster     devnet

# Derive the PDA address without submitting a tx
# seeds: ["model", authority.pubkey]
# program: 3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj

# Verify the PDA after registration
solana account <MODEL_REGISTRY_PDA> --url devnet --output json
```

### Layer 3 — ZK attestations (SAS + Light Protocol)

Anchor model quality claims as verifiable, tamper-proof compressed credentials. ~0.00003 SOL per attestation with Light Protocol.

```bash
# Eval result attestation (ties W&B run to onchain PDA)
pnpm tsx dao/attestation/create_attestation.ts \
  --type      eval \
  --model-id  "YOUR_ORG/your-model-id" \
  --accuracy  0.60 \
  --wandb-run "ktvtubjs" \
  --keypair   ~/.config/solana/id.json \
  --dry-run    # remove --dry-run to submit for real

# Dataset snapshot attestation (Merkle root of 36K examples)
pnpm tsx dao/attestation/create_attestation.ts \
  --type      dataset \
  --model-id  "YOUR_ORG/your-model-id" \
  --size      36109 \
  --hash      "sha256:$(sha256sum data/solana_clawd_merged.jsonl | awk '{print $1}')" \
  --compressed \
  --keypair   ~/.config/solana/id.json

# LoRA adapter attestation (ties adapter weights to training run)
pnpm tsx dao/attestation/create_attestation.ts \
  --type          adapter \
  --model-id      "YOUR_ORG/your-model-id" \
  --base-model    "Qwen/Qwen2.5-1.5B-Instruct" \
  --lora-r        16 \
  --lora-alpha    32 \
  --hash          "sha256:<adapter_sha256>" \
  --keypair       ~/.config/solana/id.json
```

All attestation PDAs are logged to `dao/attestation/attestations.jsonl` and included in the CAAP/1.0 registry record automatically.

### Query the registry

```bash
# Full index
curl https://onchain.x402.wtf/.well-known/clawd-registry.json | python3 -m json.tool

# Specific model
curl "https://onchain.x402.wtf/api/models?hf_id=YOUR_ORG/your-model-id" | python3 -m json.tool

# Verify an attestation onchain (no API trust)
solana account <ATTESTATION_PDA> --url devnet --output json
```

### Program addresses

| Address | Role |
| --- | --- |
| `3dLst2E3djtCSwG19mFS3REHxtZPngjyga7iYZLDL5xj` | `solana_ai_inference` Anchor program (devnet) |
| `ATSPssFHEjvJgAXKkfAWNRqTQW9Wm6JDDVW7Ec1G3zM` | SAS attestation program |
| `NFLx5WGPrTHHvdRNsidcrNcLxRruMC92E4yv7zhZBoT` | Light Protocol nullifier (compressed attestations) |
| `8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump` | $CLAWD token mint |

See [`onchainai.md`](onchainai.md) for the full skill reference including validator registration, `submit_data` attribution, and AutoResearch pipeline integration.

---

## Limitations

- **Small model**: 1.5B parameters — complex multi-step reasoning on obscure Solana
  primitives may degrade to hallucination. Always verify before acting.
- **Knowledge cutoff**: training data is current as of mid-2026. New programs,
  tickers, or exploits after that date are outside the model's knowledge.
- **Not a trading oracle**: the model produces plans and analyses — risk and
  execution are the user's responsibility.
- **Constitutional guardrails are best-effort**: the model is trained to refuse
  harmful actions, but adversarial prompts may still elicit undesired outputs.
  Wrap production deployments in an independent safety layer.
- **Tokenizer**: Qwen2.5 tokenizer; switch to Llama tokenizer for Hermes-3 base.

---

## Bias and Safety

Trained on curated Solana/DeFi content with a constitutional system prompt.
The dataset explicitly excludes front-running, wallet draining, and sanctions-evasion
examples. Guardrails are heuristic — not formally verified.

For any production trading or financial application, apply independent review.

---

## License

| Artifact | License |
| --- | --- |
| Adapter weights | Apache-2.0 |
| Base model (Qwen2.5) | [Qwen License](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE) |
| Training code | Apache-2.0 |
| Training dataset | CC-BY-4.0 |

---

## Citation

```bibtex
@misc{solana-clawd-1.5b-lora,
  title     = {Solana Clawd 1.5B LoRA — Onchain Model Kit},
  author    = {solanaclawd},
  year      = {2026},
  url       = {https://huggingface.co/solanaclawd/solana-clawd-1.5b-lora},
  note      = {LoRA fine-tune of Qwen2.5-1.5B-Instruct on 36K Solana DeFi + agent data. Part of the Onchain Model Kit.}
}
```
