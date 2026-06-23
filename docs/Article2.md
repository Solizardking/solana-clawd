Training Solana's First Native AI Model on a MacBook
How we diagnosed a broken smoke test, redesigned a LoRA training pipeline, and validated a full local AI stack on Apple Silicon — all in one session.

The Setup
Inside a single repo lives something unusual: a complete AI training pipeline for a Solana-native language model, designed to run on a MacBook Pro with an M4 Max chip and 48 GB of unified memory, then scale out to A100 GPUs on Hugging Face Jobs when it's time for the real thing.

The model is called Clawd — a Solana-specific AI that knows how to reason about transactions, perps trading, ZK proofs, token launches, and the full on-chain lifecycle. It's not a general assistant. It's purpose-built for the Solana ecosystem, trained on datasets like solanaclawd/solana-clawd-instruct, DeepSolana corpus data, Jupiter swap traces, BigQuery-exported DEX transactions, and a proprietary instruction set built from months of Solana developer tooling.

Today we tried to train it.

The Problem With Smoke Tests
The current run was a Qwen/Qwen2.5-7B-Instruct model fine-tuned with LoRA on MPS (Apple's Metal Performance Shaders GPU backend). It had been running for about two and a half hours, sitting at step 1 of 100.

That's 90 seconds per step.

The config looked reasonable at first glance — max_steps: 100, warmup_steps: 50, standard LoRA settings. But look closer and something is immediately wrong: 50% of the run is warmup. The model never gets to train at its target learning rate. You'd get a loss curve that looks like it's improving, but you'd just be watching warmup — the optimizer never even sees full LR.

More critically: max_steps: 100 was marked in the config as a "local smoke test." The full 3-epoch run would be 1,713 steps. At 90 seconds per step, that's 42 hours on a MacBook.

We killed it.

Why MPS Hits a Wall at 7B
Apple Silicon's MPS backend for PyTorch is genuinely impressive for inference and small-model training. The M4 Max has 48 GB of unified memory — more than a 24 GB A10G cloud GPU — which means a 7B model in bfloat16 (~14.5 GB) fits easily. No quantization needed.

But memory isn't the bottleneck. Compute throughput is.

A100 80GB GPU: roughly 312 TFLOPS of bfloat16 compute.
M4 Max GPU: roughly 10–14 TFLOPS of bfloat16 compute.

That's a 20–30× gap in raw throughput that no amount of unified memory or clever MPS optimization closes. For a 1.5B model it's workable — a full fine-tune might take 20-30 minutes. For 7B it becomes a multi-day commitment. For 70B+ it's simply not possible.

The fix is knowing what to run where. MPS is for iteration, dry-runs, and 1.5B-scale models. A100 is for production adapters.

Redesigning for the Cloud
The training stack had already anticipated this. The repo contains a scripts/launch_hf_jobs.sh script that wraps hf jobs uv run — Hugging Face's managed GPU compute — with all the right env var forwarding, volume mounts, WANDB integration, and detach flags.

The cloud config (configs/glm52_lora_config.yaml) was already set up correctly for a real run:

max_steps: -1 — full 3 epochs, no artificial cap
warmup_ratio: 0.03 — proper 3% warmup, not a fixed step count
gradient_checkpointing: true — saves memory on GPU (explicitly disabled in the MPS config)
r: 32, alpha: 64 — higher LoRA rank than the local smoke config
push_to_hub: true — ships the adapter to ordlibrary/Clawd-GLM-5.2 on completion
One thing needed fixing: quantization was enabled (load_in_4bit: true) even though the config comment said "Disable on A100-80 / H200 for speed." On a 24 GB L4 you need 4-bit quantization to fit a 7B model. On an A100 with 80 GB, you don't — and running without quantization is faster because you skip the dequantization overhead on every forward pass. One line change, correct for free.

The launch command:


./scripts/launch_hf_jobs.sh a100-large glm52
The Transaction Foundation Model
Parallel to the main LoRA fine-tune is something more architecturally interesting: a transaction foundation model.

This is a Clawd adaptation of NVIDIA's AI Blueprint 1 — "Build Your Own Transaction Foundation Model" — repurposed for Solana. The pipeline is two stages:

Stage 1 — Continued Pretraining (CPT): The base Qwen2.5-7B model trains on raw {"text": ...} transaction records — serialized Solana transactions normalized into readable text. No instruction following, no chat format. Just the model learning the semantic structure of Solana transaction data: account patterns, instruction layouts, program IDs, fee structures, and the statistical regularities of on-chain activity.

Stage 2 — SFT: After CPT, the model fine-tunes on Clawd's full instruction corpus — trading strategies, Solana dev tasks, ZK proofs, perps tool-use, and more. The hypothesis is that CPT-injected transaction semantics should improve the model's reasoning on anything that involves reading or generating transaction-shaped data.

The pipeline uses Unsloth on cloud — a training library that uses custom CUDA kernels to run 4-bit LoRA training 2-5× faster than vanilla TRL. On an A100, that collapses a multi-hour training run into something under 3 hours.

The data pipeline behind it involves:

BigQuery exports of Solana mainnet DEX transactions (public dataset: bigquery-public-data.crypto_solana_mainnet_us)
Jupiter swap quote traces
Phoenix perps fills
The DeepSolana corpus
Cleaned, deduplicated, packed, and stored at data/model_kit/tx_foundation_cpt_clean.jsonl — 17,262 examples ready to go.

The Local Stack: Everything Passing
With cloud jobs queued, we turned to the local stack defined in nvidia/LOCAL_MAC_STACK.md. This is the operational control plane for everything that should run on the Mac without GPU credits:

Model-kit doctor (constitution + three-laws hash attestation)
NVIDIA config validation (6 configs)
Trading factory strategy bundle (7 paper-mode artifacts)
AIQ plan evaluation (10-role coverage, observer/paper safety gate)
Tx-foundation preflight (data readiness check)
Tx-foundation smoke plan (full CPT+SFT+evaluate+push dry-run)
Perps manifest (SOL observer mode tool schema)
Core-AI 1.5B training dry-run (MPS confirmed, dataset resolved)
10 steps. All passing.

MPS is available. PyTorch 2.9.1 is installed. FAISS is installed. The full ML Python stack is healthy. Ollama has nemotron3:33b, hermes3:8b, 8bit/solana-trading-factory:latest, 8bit/solana-clawd-core-ai:latest, 8bit/DeepSolana:latest, and more locally available for inference and RAG fallback.

The only blockers are environmental: HF_TOKEN (needed for cloud job launch), WANDB_API_KEY (optional tracking), and NVIDIA_API_KEY (optional NIM acceleration — the RAG pipeline already falls back to local Nemotron via Ollama).

What's Actually Being Built
Stepping back: what is this stack?

Clawd is an attempt to build a domain-specific AI that actually understands Solana — not because it was told about it in a system prompt, but because the weights themselves have been trained on Solana data. The goal is a model that can:

Read a transaction and explain what happened
Generate correct LoRA/anchor instruction data
Reason about perps positions, funding rates, and liquidation risk
Execute tool-use flows for DEX trading
Understand ZK compression, Light Protocol trees, and Groth16 proofs
The training lane table makes this concrete:

Lane	Model	Target
Core AI (local)	Qwen2.5-1.5B	Fast iteration adapter
Transaction Foundation	Qwen2.5-7B	CPT+SFT on raw tx data
Trading Factory	Hermes-3-8B	Tool-use / perps adapter
Teacher/Eval	Nemotron 30B	Reasoning, labeling, RAG
Each lane produces a different adapter, trained for a different purpose. They can be composed — a trading agent might run the transaction foundation model as its base with a trading factory LoRA on top.

The on-chain component adds another dimension: model hashes, three-laws attestation, and a constitution that governs what the model is allowed to generate. The model-kit doctor step checks this every run — the model's own governance artifacts are hash-attested and verified before any training proceeds.

The Lesson
Building AI on Apple Silicon is genuinely powerful — 48 GB of unified memory, a healthy MPS backend, and a Python stack that mostly just works. But knowing where MPS ends and A100 begins is the difference between a 5-minute dry-run and a 42-hour mistake.

The right mental model: MPS is for understanding your pipeline. A100 is for executing it.

Once you know that, the workflow becomes clean: iterate locally with dry-runs and 1.5B smoke tests, then launch the real adapters to the cloud with a single command. The whole stack — validation, training, evaluation, push to Hub — is codified and reproducible. Nothing happens by hand.

That's the part that's actually cool.

Built on: Apple M4 Max, 48 GB unified memory, PyTorch 2.9.1 + MPS, Hugging Face Jobs (A100-80GB), TRL + PEFT + Unsloth, Solana Clawd AI Training Stack.