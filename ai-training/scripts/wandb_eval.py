"""
Weave / W&B evaluation for the Solana Clawd instruct model.

Usage:
    export WANDB_API_KEY=<your-key-from-https://wandb.ai/authorize>
    python3 scripts/wandb_eval.py

Project: clawdsolana-clawd/clawd
Model:   OpenPipe/Qwen3-14B-Instruct  (via W&B Inference)
Dataset: weave:///wandb/json-qa/object/json-qa:v3
"""

import asyncio
import os
import re
from textwrap import dedent

import weave
from openai import OpenAI


class JsonModel(weave.Model):
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
    _client: OpenAI

    def __init__(self):
        super().__init__()
        api_key = os.environ.get("WANDB_API_KEY")
        if not api_key:
            raise RuntimeError(
                "WANDB_API_KEY not set. "
                "Get yours at https://wandb.ai/authorize and export it:\n"
                "  export WANDB_API_KEY=<your-key>"
            )
        self._client = OpenAI(
            base_url="https://api.inference.wandb.ai/v1",
            api_key=api_key,
            project="clawdsolana-clawd/clawd",
        )

    @weave.op
    def predict(self, context: str, question: str) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.prompt.format()},
                {
                    "role": "user",
                    "content": f"Context: {context}\nQuestion: {question}",
                },
            ],
        )
        return response.choices[0].message.content


@weave.op
def correct_answer_format(answer: str, output: str) -> dict[str, bool]:
    parsed_output = re.search(r"<answer>(.*?)</answer>", output, re.DOTALL)
    if parsed_output is None:
        return {"correct_answer": False, "correct_format": False}
    return {"correct_answer": parsed_output.group(1) == answer, "correct_format": True}


if __name__ == "__main__":
    if not os.environ.get("WANDB_API_KEY"):
        print("WANDB_API_KEY is not set — export it first:")
        print("  export WANDB_API_KEY=<your-key>")
        print("  Get it at: https://wandb.ai/authorize")
        raise SystemExit(1)

    weave.init("clawdsolana-clawd/clawd")

    import pandas as pd
    jsonqa = weave.Dataset.from_uri(
        "weave:///wandb/json-qa/object/json-qa:v3"
    ).to_pandas()

    model = JsonModel()

    eval = weave.Evaluation(
        name="json-qa-eval",
        dataset=weave.Dataset.from_pandas(jsonqa),
        scorers=[correct_answer_format],
    )

    asyncio.run(eval.evaluate(model))
