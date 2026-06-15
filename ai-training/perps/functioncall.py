#!/usr/bin/env python3
"""
Clawd Solana Perps — Hermes-3 Function Calling Inference.

Adapted from NousResearch/Hermes-Function-Calling for Solana perps data.
Uses Hermes-3-Llama-3.1-8B with 13 Solana perps tools via:
  - HF Inference Router (default, no GPU needed)  — export HF_TOKEN=hf_...
  - Local transformers pipeline                    — export HERMES_LOCAL=1

Usage:
  python functioncall.py --query "What is the SOL price and funding rate?"
  python functioncall.py --query "Paper trade: long SOL-PERP $500 at 3x leverage"
  python functioncall.py --query "Assess the risk of shorting SOL-PERP $1000 at 5x"
  python functioncall.py --query "Show me my positions" --wallet <WALLET_ADDRESS>
  python functioncall.py --goap  # Enable GOAP scratch-pad reasoning

  # HF Router with specific provider:
  HERMES_PROVIDER=featherless-ai python functioncall.py --query "..."

  # Local model:
  HERMES_LOCAL=1 python functioncall.py --query "..."

  # With fine-tuned LoRA adapter:
  HERMES_LOCAL=1 HERMES_ADAPTER=solanaclawd/solana-clawd-8b-lora python functioncall.py ...
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

from functions import call_function, get_openai_tools
from prompter import build_system_prompt
from schema import FunctionCall

MODEL_ID = os.environ.get("HERMES_MODEL", "NousResearch/Hermes-3-Llama-3.1-8B")
PROVIDER = os.environ.get("HERMES_PROVIDER", "fastest")
MAX_DEPTH = int(os.environ.get("HERMES_MAX_DEPTH", "5"))


def parse_tool_calls_from_text(text: str) -> list[dict]:
    """Parse <tool_call>{...}</tool_call> blocks from model output (local mode)."""
    pattern = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)
    calls = []
    for m in pattern.finditer(text):
        try:
            obj = json.loads(m.group(1))
            fc = FunctionCall(**obj)
            calls.append({
                "id": f"call_{len(calls)}",
                "type": "function",
                "function": {"name": fc.name, "arguments": json.dumps(fc.arguments)},
            })
        except Exception:
            continue
    return calls


class HermesPerpsAgent:
    """Hermes-3 agent with Solana perps function calling loop."""

    def __init__(
        self,
        use_local: bool = False,
        adapter: str | None = None,
        max_depth: int = MAX_DEPTH,
        goap_mode: bool = False,
        verbose: bool = False,
    ):
        self.use_local = use_local
        self.adapter = adapter
        self.max_depth = max_depth
        self.goap_mode = goap_mode
        self.verbose = verbose
        self.tools = get_openai_tools()
        self._client = None
        self._pipeline = None
        self._model = None
        self._tokenizer = None

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            hf_token = os.environ.get("HF_TOKEN", "")
            if not hf_token:
                print("[ERROR] Set HF_TOKEN for HF Router mode.", file=sys.stderr)
                sys.exit(1)
            self._client = OpenAI(
                base_url="https://router.huggingface.co/v1",
                api_key=hf_token,
            )
        return self._client

    def _get_pipeline(self):
        if self._pipeline is None:
            from transformers import pipeline
            print(f"[Loading] {MODEL_ID} (this takes a while)...", flush=True)
            self._pipeline = pipeline(
                "text-generation", model=MODEL_ID, torch_dtype="auto", device_map="auto"
            )
        return self._pipeline

    def _get_model(self):
        if self._model is None:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            print(f"[Loading] {MODEL_ID}...", flush=True)
            self._tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
            if self._tokenizer.pad_token is None:
                self._tokenizer.pad_token = self._tokenizer.eos_token
            dtype = (
                torch.bfloat16
                if torch.cuda.is_available() or (hasattr(torch.backends, "mps") and torch.backends.mps.is_available())
                else torch.float32
            )
            self._model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID, torch_dtype=dtype, device_map="auto", trust_remote_code=True
            )
            if self.adapter:
                from peft import PeftModel
                print(f"[Loading] LoRA adapter: {self.adapter}", flush=True)
                self._model = PeftModel.from_pretrained(self._model, self.adapter, torch_dtype=dtype)
            self._model.eval()
        return self._model, self._tokenizer

    def _chat_router(self, messages: list[dict]) -> tuple[str, list[dict]]:
        """Chat via HF Router with native tool_calls support."""
        client = self._get_client()
        resp = client.chat.completions.create(
            model=f"{MODEL_ID}:{PROVIDER}",
            messages=messages,
            tools=self.tools,
            tool_choice="auto",
            max_tokens=1024,
            temperature=0.2,
        )
        msg = resp.choices[0].message
        content = msg.content or ""
        tool_calls = []
        for tc in (msg.tool_calls or []):
            tool_calls.append({
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            })
        return content, tool_calls

    def _chat_local(self, messages: list[dict]) -> tuple[str, list[dict]]:
        """Chat via local pipeline, parsing <tool_call> XML from output."""
        if self.adapter:
            model, tokenizer = self._get_model()
            import torch
            prompt_text = tokenizer.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=False
            )
            inputs = tokenizer(prompt_text, return_tensors="pt").to(model.device)
            with torch.no_grad():
                output = model.generate(
                    **inputs, max_new_tokens=1024, temperature=0.2, top_p=0.9,
                    do_sample=True, pad_token_id=tokenizer.pad_token_id
                )
            content = tokenizer.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
        else:
            pipe = self._get_pipeline()
            result = pipe(messages, max_new_tokens=1024)
            content = result[0]["generated_text"][-1]["content"]

        tool_calls = parse_tool_calls_from_text(content)
        return content, tool_calls

    def run(self, query: str, wallet: str = "", **context) -> str:
        """Run the function calling loop and return the final answer."""
        system_prompt = build_system_prompt(
            tools=self.tools,
            mode="goap" if self.goap_mode else "standard",
            extra_context=f"User wallet: {wallet}" if wallet else "",
        )
        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query},
        ]

        for depth in range(self.max_depth):
            if self.verbose:
                print(f"\n[iter {depth+1}/{self.max_depth}]", flush=True)

            if self.use_local:
                content, tool_calls = self._chat_local(messages)
            else:
                content, tool_calls = self._chat_router(messages)

            if not tool_calls:
                # Final answer — strip any residual XML tags
                return re.sub(r"<scratch_pad>.*?</scratch_pad>", "", content, flags=re.DOTALL).strip()

            # Show tool calls if verbose
            if self.verbose:
                for tc in tool_calls:
                    fn = tc["function"]
                    print(f"  → {fn['name']}({fn['arguments'][:60]}...)", flush=True)

            messages.append({
                "role": "assistant",
                "content": content,
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                fn_args_str = tc["function"]["arguments"]
                try:
                    fn_args = json.loads(fn_args_str)
                except json.JSONDecodeError:
                    fn_args = {}
                result = call_function(fn_name, fn_args)
                print(f"[{fn_name}] → {result[:120]}...", flush=True) if self.verbose else None
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

        return "[max depth reached — partial data above may help]"


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--query", "-q", default="What is the current SOL price and Phoenix perp funding rate?",
                   help="Query to send to the agent")
    p.add_argument("--wallet", default="", help="Optional wallet address for balance / position queries")
    p.add_argument("--model-path", default=MODEL_ID, help=f"Model ID or local path (default: {MODEL_ID})")
    p.add_argument("--local", action="store_true", help="Use local transformers pipeline instead of HF Router")
    p.add_argument("--adapter", default=None, help="LoRA adapter path or Hub repo ID (local mode)")
    p.add_argument("--max-depth", type=int, default=MAX_DEPTH, help="Max recursive tool call iterations")
    p.add_argument("--goap", action="store_true", help="Enable GOAP scratch-pad reasoning mode")
    p.add_argument("--verbose", "-v", action="store_true", help="Show tool calls and iteration info")
    args = p.parse_args()

    agent = HermesPerpsAgent(
        use_local=args.local or os.environ.get("HERMES_LOCAL", "").lower() == "1",
        adapter=args.adapter or os.environ.get("HERMES_ADAPTER"),
        max_depth=args.max_depth,
        goap_mode=args.goap,
        verbose=args.verbose,
    )

    mode = "local" if agent.use_local else f"HF Router ({PROVIDER})"
    print(f"\n🦞 Clawd Perps Agent — {MODEL_ID} [{mode}]\n")
    print(f"Query: {args.query}\n{'─'*60}")

    answer = agent.run(args.query, wallet=args.wallet)
    print(f"\n{answer}\n")


if __name__ == "__main__":
    main()
