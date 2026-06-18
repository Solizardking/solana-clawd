"""
Weave / W&B evaluation for DeepSolanaZKr-1 (GLM-5.2 fine-tune).

Runs the JSON QA benchmark against any W&B Inference-hosted model and traces
results to the clawdsolana-clawd/clawd Weave project.

Usage:
    export WANDB_API_KEY=<your-key-from-https://wandb.ai/authorize>

    # Baseline (pre-fine-tune, W&B Inference)
    python3 scripts/wandb_eval.py

    # Post-fine-tune eval against DeepSolanaZKr-1 on W&B Inference
    python3 scripts/wandb_eval.py --model ordlibrary/DeepSolanaZKr-1

    # Against any OpenAI-compatible endpoint (e.g. local vLLM)
    python3 scripts/wandb_eval.py \
        --model DeepSolanaZKr-1 \
        --base-url http://localhost:8000/v1 \
        --api-key none

Project:   clawdsolana-clawd/clawd
Dataset:   weave:///wandb/json-qa/object/json-qa:v3

Training runs:
  Baseline (Qwen3-14B, pre-finetune):  019edb80-957d-70dc-9289-9a27b188e57b  accuracy=60%
  Qwen2.5-7B DeepSolanaZKr-1 (job 6a3460cb2eb64285ee5734d9): pending completion
"""

import argparse
import asyncio
import os
import re
from textwrap import dedent

import weave
from openai import OpenAI

WANDB_PROJECT  = "clawdsolana-clawd/clawd"
WANDB_BASE_URL = "https://api.inference.wandb.ai/v1"

# Current HF Jobs training run — update after each relaunch
CURRENT_HF_JOB = "6a3460cb2eb64285ee5734d9"
CURRENT_MODEL  = "ordlibrary/DeepSolanaZKr-1"


class SolanaClawdModel(weave.Model):
    prompt: weave.Prompt = weave.StringPrompt(
        dedent("""
You are an assistant that answers questions about JSON data provided by the user.
The JSON data represents structured information of various kinds, and may be deeply nested.
In the first user message, you will receive the JSON data under a label called 'context',
and a question under a label called 'question'. Your job is to answer the question with
as much accuracy and brevity as possible. Give only the answer with no preamble.
You must output the answer in XML format, between <answer> and </answer> tags.
""")
    )
    model: str = "OpenPipe/Qwen3-14B-Instruct"
    base_url: str = WANDB_BASE_URL
    _client: OpenAI

    def __init__(self, model: str = "OpenPipe/Qwen3-14B-Instruct",
                 base_url: str = WANDB_BASE_URL, api_key: str | None = None):
        super().__init__(model=model, base_url=base_url)
        resolved_key = api_key or os.environ.get("WANDB_API_KEY")
        if not resolved_key:
            raise RuntimeError(
                "WANDB_API_KEY not set. "
                "Get yours at https://wandb.ai/authorize and export it:\n"
                "  export WANDB_API_KEY=<your-key>"
            )
        self._client = OpenAI(
            base_url=base_url,
            api_key=resolved_key,
            **({"project": WANDB_PROJECT} if base_url == WANDB_BASE_URL else {}),
        )

    @weave.op
    def predict(self, context: str, question: str) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.prompt.format()},
                {"role": "user", "content": f"Context: {context}\nQuestion: {question}"},
            ],
            max_tokens=256,
            temperature=0.0,
        )
        return response.choices[0].message.content


@weave.op
def correct_answer_format(answer: str, output: str) -> dict[str, bool]:
    parsed = re.search(r"<answer>(.*?)</answer>", output, re.DOTALL)
    if parsed is None:
        return {"correct_answer": False, "correct_format": False}
    return {"correct_answer": parsed.group(1).strip() == answer.strip(), "correct_format": True}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="W&B Weave eval for DeepSolanaZKr-1")
    p.add_argument("--model",    default="OpenPipe/Qwen3-14B-Instruct",
                   help="Model to evaluate (default: baseline Qwen3-14B)")
    p.add_argument("--base-url", default=WANDB_BASE_URL,
                   help="OpenAI-compatible inference base URL")
    p.add_argument("--api-key",  default=None,
                   help="API key (defaults to WANDB_API_KEY env var)")
    p.add_argument("--eval-name", default=None,
                   help="Weave eval run name (auto-generated if omitted)")
    p.add_argument("--num-samples", type=int, default=20,
                   help="Number of JSON QA examples to evaluate (default: 20)")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if not (args.api_key or os.environ.get("WANDB_API_KEY")):
        print("WANDB_API_KEY is not set — export it first:")
        print("  export WANDB_API_KEY=<your-key>")
        print("  Get it at: https://wandb.ai/authorize")
        raise SystemExit(1)

    # Name the run with model + HF job for traceability
    run_name = args.eval_name or f"eval-{args.model.split('/')[-1]}-hfjob-{CURRENT_HF_JOB[:8]}"
    print(f"Initializing Weave project: {WANDB_PROJECT}")
    print(f"Eval run name:              {run_name}")
    print(f"Model:                      {args.model}")
    print(f"HF training job:            {CURRENT_HF_JOB}")
    print()

    weave.init(WANDB_PROJECT)

    dataset_uri = "weave:///wandb/json-qa/object/json-qa:v3"
    jsonqa_full = weave.Dataset.from_uri(dataset_uri).to_pandas()

    # Subsample for speed — use full dataset for final post-finetune eval
    jsonqa = jsonqa_full.sample(min(args.num_samples, len(jsonqa_full)), random_state=42)
    print(f"Loaded {len(jsonqa)} / {len(jsonqa_full)} JSON QA examples")

    model = SolanaClawdModel(
        model=args.model,
        base_url=args.base_url,
        api_key=args.api_key,
    )

    evaluation = weave.Evaluation(
        name=run_name,
        dataset=weave.Dataset.from_pandas(jsonqa),
        scorers=[correct_answer_format],
    )

    results = asyncio.run(evaluation.evaluate(model))

    # Print summary
    print()
    print("─" * 50)
    print(f"Model:            {args.model}")
    print(f"HF job:           {CURRENT_HF_JOB}")
    print(f"Examples:         {len(jsonqa)}")
    if isinstance(results, dict):
        for k, v in results.items():
            print(f"{k:<25} {v}")
    print(f"Weave traces:     https://wandb.ai/{WANDB_PROJECT}/weave")
    print("─" * 50)
