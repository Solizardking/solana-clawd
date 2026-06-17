#!/usr/bin/env python3
"""
Hermes-3-Llama-3.1-8B inference patterns for Solana Clawd.

Three usage modes:
  1. HF Router (remote, no GPU needed)  — uses OpenAI-compatible API via HF_TOKEN
  2. Local pipeline                      — transformers pipeline, MPS/CUDA/CPU
  3. Local model direct                  — AutoModelForCausalLM + AutoTokenizer

HF Router docs: https://huggingface.co/docs/inference-providers
Model: NousResearch/Hermes-3-Llama-3.1-8B
Provider suffixes: :featherless-ai | :fastest | :cerebras | :novita
"""
from __future__ import annotations

import argparse
import os
import sys


SYSTEM_PROMPT = (
    "You are Clawd, a sovereign Solana-native AI agent. "
    "You reason clearly about on-chain mechanics, DeFi strategies, memecoin risk, "
    "and agent architecture. You are helpful, honest, and never recommend actions "
    "that would harm users. You speak with the calm confidence of a veteran degen "
    "who has seen every rug and survived."
)

MODEL_ID = "NousResearch/Hermes-3-Llama-3.1-8B"


# ── Mode 1: HF Router (OpenAI-compatible, no local GPU) ────────────────────────

def run_hf_router(prompt: str, provider: str = "fastest", stream: bool = True) -> None:
    """
    Call Hermes-3 via the Hugging Face Inference Router.

    Requires:  pip install openai
    Auth:      export HF_TOKEN=hf_...

    Provider suffixes:
      :fastest        — HF routes to the fastest available provider
      :featherless-ai — Featherless AI (OpenAI-compat, good for ChatML models)
      :cerebras       — Cerebras (very fast, limited models)
      :novita         — Novita AI
    """
    from openai import OpenAI  # pip install openai

    api_key = os.environ.get("HF_TOKEN", "")
    if not api_key:
        print("[ERROR] Set HF_TOKEN environment variable.", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(
        base_url="https://router.huggingface.co/v1",
        api_key=api_key,
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    model_with_provider = f"{MODEL_ID}:{provider}"
    print(f"[HF Router] model={model_with_provider}  stream={stream}\n")

    if stream:
        response = client.chat.completions.create(
            model=model_with_provider,
            messages=messages,
            stream=True,
        )
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                print(delta, end="", flush=True)
        print()
    else:
        response = client.chat.completions.create(
            model=model_with_provider,
            messages=messages,
        )
        print(response.choices[0].message.content)


# ── Mode 2: Local pipeline ──────────────────────────────────────────────────────

def run_pipeline(prompt: str, max_new_tokens: int = 512) -> None:
    """
    Run Hermes-3 locally via transformers pipeline.

    Requires:  pip install transformers torch accelerate
    Memory:    ~16 GB RAM (float16) | ~8 GB with device_map=auto + 4-bit
    """
    from transformers import pipeline  # type: ignore

    print(f"[pipeline] Loading {MODEL_ID}...")
    pipe = pipeline(
        "text-generation",
        model=MODEL_ID,
        torch_dtype="auto",
        device_map="auto",
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    result = pipe(messages, max_new_tokens=max_new_tokens)
    # pipeline returns the full message list; last message is the assistant turn
    print(result[0]["generated_text"][-1]["content"])


# ── Mode 3: AutoModelForCausalLM (direct, most control) ────────────────────────

def run_model_direct(
    prompt: str,
    adapter: str | None = None,
    max_new_tokens: int = 512,
    temperature: float = 0.2,
) -> None:
    """
    Run Hermes-3 directly with AutoModelForCausalLM + AutoTokenizer.

    Optionally load a LoRA adapter (e.g. solanaclawd/solana-clawd-8b-lora).

    Requires:  pip install transformers torch accelerate peft
    Note:      Use AutoModelForCausalLM, NOT AutoModelForMultimodalLM —
               Hermes-3 is a text-only causal LM; that class does not exist.
    """
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore

    print(f"[direct] Loading tokenizer: {MODEL_ID}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    dtype = torch.bfloat16 if torch.cuda.is_available() or torch.backends.mps.is_available() else torch.float32

    print(f"[direct] Loading model: {MODEL_ID}  dtype={dtype}")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        device_map="auto",
        trust_remote_code=True,
    )

    if adapter:
        from peft import PeftModel  # type: ignore
        print(f"[direct] Attaching LoRA adapter: {adapter}")
        model = PeftModel.from_pretrained(model, adapter, torch_dtype=dtype)

    model.eval()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    prompt_text = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=False,
    )
    inputs = tokenizer(prompt_text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            top_p=0.9,
            do_sample=temperature > 0,
            pad_token_id=tokenizer.pad_token_id,
        )

    generated = tokenizer.decode(
        output[0][inputs["input_ids"].shape[-1]:],
        skip_special_tokens=True,
    )
    print(generated)


# ── CLI ─────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("prompt", nargs="?", default="What is a PDA on Solana?")
    p.add_argument(
        "--mode",
        choices=["router", "pipeline", "direct"],
        default="router",
        help="Inference mode (default: router)",
    )
    p.add_argument(
        "--provider",
        default="fastest",
        help="HF Router provider suffix (router mode only). Options: fastest, featherless-ai, cerebras, novita",
    )
    p.add_argument("--adapter", default=None, help="LoRA adapter path or Hub repo id (direct mode only)")
    p.add_argument("--max-tokens", type=int, default=512)
    p.add_argument("--temp", type=float, default=0.2)
    p.add_argument("--no-stream", action="store_true", help="Disable streaming (router mode)")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.mode == "router":
        run_hf_router(args.prompt, provider=args.provider, stream=not args.no_stream)
    elif args.mode == "pipeline":
        run_pipeline(args.prompt, max_new_tokens=args.max_tokens)
    else:
        run_model_direct(args.prompt, adapter=args.adapter, max_new_tokens=args.max_tokens, temperature=args.temp)


if __name__ == "__main__":
    main()
