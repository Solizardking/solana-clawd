"""
Blueprint 3 — AI Model Distillation for Financial Data.

Generates teacher outputs from the Solana trading-factory dataset,
then writes a distilled SFT JSONL ready for student LoRA training.

Supports:
  - response distillation: teacher answers become student targets
  - cot distillation: teacher reasons step-by-step; student learns traces
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _load_teacher_hf(model_id: str):
    from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline
    from peft import PeftModel

    print(f"[distill] loading teacher: {model_id}")
    base_id = "NousResearch/Hermes-3-Llama-3.1-8B"
    base = AutoModelForCausalLM.from_pretrained(base_id, torch_dtype="auto", device_map="auto")
    model = PeftModel.from_pretrained(base, model_id)
    tok = AutoTokenizer.from_pretrained(model_id)
    return pipeline("text-generation", model=model, tokenizer=tok, max_new_tokens=512)


def _load_teacher_nim(model_id: str):
    """Use NVIDIA NIM API as teacher (no local GPU needed)."""
    import httpx

    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key:
        raise EnvironmentError("NVIDIA_API_KEY not set")

    def generate(messages: list[dict]) -> str:
        r = httpx.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": model_id, "messages": messages, "max_tokens": 512},
            timeout=60,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    return generate


def distill_response(
    examples: list[dict],
    teacher_fn,
    mode: str,
) -> list[dict]:
    """Replace assistant turns with teacher-generated outputs."""
    distilled = []
    for i, ex in enumerate(examples):
        messages = ex.get("messages", [])
        if not messages:
            continue
        # keep system + user turns, regenerate assistant
        context = [m for m in messages if m["role"] != "assistant"]
        if mode == "cot":
            context_cot = context + [{
                "role": "user",
                "content": "Before answering, think step-by-step in <thinking> tags.",
            }]
            prompt = context_cot
        else:
            prompt = context

        try:
            if callable(teacher_fn) and hasattr(teacher_fn, "__self__"):
                # HuggingFace pipeline
                out = teacher_fn(prompt)[0]["generated_text"][-1]["content"]
            else:
                # NIM callable
                out = teacher_fn(prompt)
        except Exception as e:
            print(f"  [distill] example {i}: teacher error: {e}")
            continue

        new_messages = context + [{"role": "assistant", "content": out}]
        distilled.append({"messages": new_messages})

        if (i + 1) % 10 == 0:
            print(f"  [distill] {i+1}/{len(examples)} done")

    return distilled


def main() -> None:
    parser = argparse.ArgumentParser(description="Distill teacher model into student SFT data")
    parser.add_argument("--mode", choices=["response", "cot"], default="response")
    parser.add_argument("--teacher", default="solanaclawd/solana-nvidia-trading-factory-8b-lora")
    parser.add_argument("--backend", choices=["nim", "hf"], default="nim",
                        help="nim=NVIDIA API, hf=local HuggingFace")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"ERROR: dataset not found: {dataset_path}", file=sys.stderr)
        sys.exit(1)

    examples = []
    with dataset_path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    examples.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    if args.limit:
        examples = examples[: args.limit]

    print(f"[distill] mode={args.mode}  teacher={args.teacher}  examples={len(examples)}")

    if args.dry_run:
        print(f"[DRY RUN] would distill {len(examples)} examples → {args.output}")
        return

    if args.backend == "nim":
        teacher_fn = _load_teacher_nim(args.teacher)
    else:
        teacher_fn = _load_teacher_hf(args.teacher)

    distilled = distill_response(examples, teacher_fn, args.mode)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        for ex in distilled:
            f.write(json.dumps(ex) + "\n")

    print(f"[distill] wrote {len(distilled)} examples → {out_path}")


if __name__ == "__main__":
    main()
