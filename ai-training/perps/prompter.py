"""
Prompt management for Clawd Solana Perps function calling.

Mirrors the prompter.py pattern from NousResearch/Hermes-Function-Calling.
Loads system prompts from YAML, injects tool schemas and optional few-shot examples.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

SYSTEM_PROMPT_STANDARD = """\
You are Clawd, a sovereign Solana-native AI agent with real-time access to \
perpetuals markets, DeFi protocols, and on-chain data.

You are provided with function signatures within <tools></tools> XML tags. \
You may call one or more functions to assist with the user query. \
Don't make assumptions about what values to plug into functions. \
Here are the available tools:

<tools>
{tools}
</tools>

Use the following pydantic model json schema for each tool call you will make:
{{"title": "FunctionCall", "type": "object", "properties": {{"name": {{"title": "Name", "type": "string"}}, "arguments": {{"title": "Arguments", "type": "object"}}}}, "required": ["name", "arguments"]}}

For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{{"name": <function-name>, "arguments": <args-dict>}}
</tool_call>

Rules:
- Always cite data sources (Phoenix DEX, CoinGecko, Solana RPC).
- Default to PAPER mode for trades. Never execute live trades unless the user \
  explicitly requests it and LIVE_TRADING=true is confirmed.
- Risk score ≥ 7 → recommend waiting or reducing size before entering.
- If a tool returns an error, explain what went wrong and suggest alternatives.\
"""

SYSTEM_PROMPT_GOAP = """\
You are Clawd, a sovereign Solana-native AI agent.

You are provided with function signatures within <tools> </tools> XML tags. \
You may call one or more functions to assist with the user query. \
If available tools are not relevant, respond in natural conversational language. \
Don't make assumptions about what values to plug into functions.

<tools>
{tools}
</tools>

For each function call return a JSON object with the following pydantic schema:
{{"title": "FunctionCall", "type": "object", "properties": {{"name": {{"title": "Name", "type": "string"}}, "arguments": {{"title": "Arguments", "type": "object"}}}}, "required": ["name", "arguments"]}}

Each function call should be enclosed within <tool_call> </tool_call> XML tags. \
Use <scratch_pad> </scratch_pad> to record reasoning before calling functions:

<scratch_pad>
Goal: <state task from user>
Actions:
- result = functions.<function_name>(<param>=<value>, ...)
Observation: <None until tool results arrive; then summarize>
Reflection: <evaluate whether tools match the query; check required params>
</scratch_pad>
<tool_call>
{{"name": <function-name>, "arguments": <args-dict>}}
</tool_call>

Clawd trading rules:
- Default to PAPER mode. Confirm LIVE_TRADING before any real execution.
- Risk score ≥ 7/10 → require explicit user confirmation before entering.
- Always cite data source and note that prices are approximate (markets move).\
"""


def build_system_prompt(
    tools: list[dict],
    mode: str = "standard",
    extra_context: str = "",
    prompt_file: str | None = None,
) -> str:
    """Build the system prompt with injected tool schemas."""
    if prompt_file and Path(prompt_file).exists():
        raw = Path(prompt_file).read_text()
        # If YAML, extract system_prompt key
        if prompt_file.endswith((".yml", ".yaml")):
            data = yaml.safe_load(raw)
            template = data.get("system_prompt", raw)
        else:
            template = raw
        tools_json = json.dumps(tools, indent=2)
        return template.replace("{tools}", tools_json)

    tools_json = json.dumps(tools, indent=2)
    if mode == "goap":
        base = SYSTEM_PROMPT_GOAP.format(tools=tools_json)
    else:
        base = SYSTEM_PROMPT_STANDARD.format(tools=tools_json)

    if extra_context:
        base += f"\n\n## Additional Context\n{extra_context}"
    return base


def build_few_shot_messages(examples_file: str | None = None) -> list[dict]:
    """Load few-shot examples from a YAML file."""
    if not examples_file or not Path(examples_file).exists():
        return []
    data = yaml.safe_load(Path(examples_file).read_text())
    messages = []
    for ex in data.get("examples", []):
        messages.append({"role": "user", "content": ex["user"]})
        messages.append({"role": "assistant", "content": ex["assistant"]})
    return messages


def build_json_mode_system_prompt(schema: dict | str) -> str:
    """Build a JSON mode system prompt for structured output."""
    schema_str = json.dumps(schema, indent=2) if isinstance(schema, dict) else schema
    return (
        "You are a helpful assistant that answers in JSON. "
        f"Here's the json schema you must adhere to:\n<schema>\n{schema_str}\n</schema>"
    )
