---
name: gemini-deep-research
description: Run autonomous multi-step web research with citations using the Gemini Deep Research Agent. Supports collaborative planning, visualizations, MCP servers, file search, and multimodal inputs.
homepage: https://ai.google.dev/gemini-api/docs/interactions/deep-research
metadata:
  clawdbot:
    emoji: 🔬
    requires:
      env:
      - GEMINI_API_KEY
    primaryEnv: GEMINI_API_KEY
attestation:
  verified: true
  verified_at: '2026-06-06'
  registries:
  - https://x402.wtf/skills/gemini-deep-research
  - https://solanaclawd.com/skills/gemini-deep-research
---

# Gemini Deep Research Agent

Autonomously plans, executes, and synthesizes multi-step web research with
citations, visualizations, and collaborative planning.

## Quickstart

**Basic research:**
```bash
clawd-skills run gemini-deep-research --query "Analyze the current state of Solana DeFi: TVL trends, top protocols, and growth projections"
```

**With collaborative planning:**
```bash
clawd-skills run gemini-deep-research --query "Research Google TPU history and competitive landscape" --plan
```

**Max depth research:**
```bash
clawd-skills run gemini-deep-research --model max \
  --query "Comprehensive analysis of the global semiconductor supply chain and market trends"
```

**With multimodal input:**
```bash
clawd-skills run gemini-deep-research --query "Analyze this chart and research current market dynamics" \
  --document https://example.com/quarterly-report.pdf
```

## Models

| Flag | Model | Best For |
|---|---|---|
| `--model default` (default) | `deep-research-preview-04-2026` | Speed, efficiency, UI streaming |
| `--model max` | `deep-research-max-preview-04-2026` | Maximum comprehensiveness |

## Collaborative Planning

Enable `--plan` to review and refine the research plan before execution:
1. Agent proposes a research plan
2. You review and refine ("focus more on X, less on Y")
3. Agent executes the approved plan

## Visualization

The agent auto-generates charts and graphs when `--visualize` is enabled.
Prompt for visuals explicitly: "Include charts showing market trends."

## Tools

| Tool | Flag | Description |
|---|---|---|
| Google Search | (default) | Search the public web |
| URL Context | (default) | Read and summarize specific web pages |
| Code Execution | (default) | Execute Python for calculations |
| File Search | `--file-store STORE_ID` | Search your uploaded document corpora |
| MCP Servers | `--mcp NAME URL` | Connect to external MCP tools |

## Output Formatting

Steer the output format in your query:
```
Research the competitive landscape of EV batteries.

Format: Technical report with:
1. Executive Summary
2. Key Players (with data table comparing capacity and chemistry)
3. Supply Chain Risks
```

## Features

- **Autonomous planning**: Agent plans, searches, reads, and synthesizes
- **Citations**: Every claim linked to source URLs
- **Multimodal**: Images and PDFs as research context
- **Multi-turn**: Ask follow-up questions after research completes
- **Background execution**: Async; poll or stream for results

## Pricing

Estimated costs per task:
- **Deep Research**: ~$1-3/task (moderate analysis)
- **Deep Research Max**: ~$3-7/task (comprehensive analysis)

Costs vary based on search queries, tokens used, and caching.

## Limitations

- Max research time: 60 minutes
- Requires `background=true` (async execution)
- Custom function calling not supported (use MCP servers)
- Structured output not yet supported