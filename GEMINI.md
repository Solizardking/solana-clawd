# OpenClawd + Gemini Integration Guide

## Overview

OpenClawd ships with first-class integration for the **Google Gemini ecosystem**, including:

| Capability | Model / API | Status |
|---|---|---|
| **Text Generation** | Gemini 3.5 Flash (`gemini-3.5-flash`) | ✅ Production |
| **Reasoning (Thinking)** | Gemini 3.1 Pro Preview | ✅ Production |
| **Image Generation** | Nano Banana 2 (`gemini-3.1-flash-image`) | ✅ Production |
| **Image Generation Pro** | Nano Banana Pro (`gemini-3-pro-image`) | ✅ Production |
| **Image Editing** | Nano Banana 2 (text+image to image) | ✅ Production |
| **Video Generation** | Veo 3.1 (`veo-3.1-generate-preview`) | ✅ Beta |
| **Google Search Grounding** | All Gemini 3+ models | ✅ Production |
| **Image Search Grounding** | Gemini 3.1 Flash Image | ✅ Production |
| **Code Execution** | All Gemini models | ✅ Production |
| **URL Context** | All Gemini models | ✅ Production |
| **Function Calling** | All Gemini models | ✅ Production |
| **Deep Research** | Deep Research Agent | ✅ Beta |
| **Managed Agents** | Antigravity (`antigravity-preview`) | ✅ Beta |
| **Computer Use** | Computer Use Preview | ✅ Beta |
| **Live API (voice)** | Gemini 3.1 Flash Live | ✅ Beta |

## Setup

### 1. Get an API Key

Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 2. Configure Environment

```bash
# Add to your .env file
GEMINI_API_KEY=your-key-here
```

### 3. Install Dependencies

```bash
pnpm install
```

The `@google/genai` package is included in the project dependencies.

## Using Gemini in OpenClawd

### Via the TUI (Clawd Terminal)

Launch the clawd TUI with Gemini as the backend:

```bash
# With GEMINI_API_KEY set in .env
clawd

# Or specify directly
clawd --provider gemini --model gemini-3.5-flash
```

### Via the Leviathan Runtime

```typescript
import { createGeminiInferProvider } from "./services/gemini";

const provider = createGeminiInferProvider();
await tailFlick(provider, context);
```

### Programmatic API

```typescript
import {
  getGeminiClient,
  generateImage,
  generateVideo,
  deepResearch,
  runManagedAgent,
  startComputerUse,
  GEMINI_MODELS,
} from "./services/gemini";

// Text generation with search grounding
const client = getGeminiClient();
const response = await client.models.generateContent({
  model: GEMINI_MODELS.text,
  contents: "What's happening in crypto today?",
  config: {
    tools: [{ googleSearch: {} }],
  },
});

// Image generation (Nano Banana)
const result = await generateImage(
  "A Solana lobster mascot in a sleek cyberpunk style, neon blue and orange",
  "./output/clawd-cyberpunk.png",
  { resolution: "2K", aspectRatio: "16:9" }
);

// Deep research
const research = await deepResearch(
  "Analyze the Solana DeFi ecosystem: TVL trends, top protocols, and growth projections"
);
console.log(research.outputText);
console.log(research.citations);

// Managed agent (code execution sandbox)
const agentResult = await runManagedAgent(
  "Clone a Solana program repo, run anchor build, and report any errors"
);
console.log(agentResult.outputText);
```

## Models Reference

### Text Models

| Model | ID | Best For |
|---|---|---|
| **Gemini 3.5 Flash** | `gemini-3.5-flash` | Default — best overall performance, agentic/coding tasks |
| **Gemini 3.1 Flash-Lite** | `gemini-3.1-flash-lite` | Cost-efficient, high-volume |
| **Gemini 3.1 Pro Preview** | `gemini-3.1-pro-preview` | Deep reasoning, complex analysis |

### Image Models (Nano Banana)

| Model | ID | Best For |
|---|---|---|
| **Nano Banana 2** | `gemini-3.1-flash-image` | High-efficiency, speed, production |
| **Nano Banana Pro** | `gemini-3-pro-image` | Professional asset production, 4K, complex instructions |
| **Nano Banana** | `gemini-2.5-flash-image` | Legacy, cost-efficiency |

### Video Models (Veo)

| Model | ID | Best For |
|---|---|---|
| **Veo 3.1 Preview** | `veo-3.1-generate-preview` | Latest, best quality + audio |
| **Veo 3.1 Fast** | `veo-3.1-fast-generate-preview` | Speed-optimized |
| **Veo 3.1 Lite** | `veo-3.1-lite-generate-preview` | Cost-efficient |

### Agent Models

| Model | ID | Best For |
|---|---|---|
| **Deep Research** | `deep-research-preview-04-2026` | Web research, reports, citations |
| **Deep Research Max** | `deep-research-max-preview-04-2026` | Comprehensive research |
| **Antigravity** | `antigravity-preview-05-2026` | Managed agent with sandbox |
| **Computer Use** | `gemini-2.5-computer-use-preview-10-2025` | Browser automation |

## Nano Banana Image Generation

### Prompting Guide

Good prompts are **descriptive** and **scene-focused**, not keyword lists.

**Photorealistic:**
```
A photo of a close-up portrait of an elderly Japanese ceramicist with deep,
sun-etched wrinkles and a warm, knowing smile. Captured with an 85mm portrait lens,
soft golden hour light, serene and masterful mood.
```

**Stylized illustrations:**
```
A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. Bold clean
outlines, simple cel-shading, vibrant colors. Background must be white.
```

**Product mockups:**
```
A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug
in matte black, on a polished concrete surface. Three-point softbox lighting.
Ultra-realistic, sharp focus.
```

**Accurate text rendering:**
```
Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'.
Clean, bold, sans-serif font. Black and white. Circular design with coffee bean motif.
```

### Features

- **Up to 14 reference images** (Nano Banana 2: 10 objects + 4 characters)
- **Aspect ratios**: 1:1, 16:9, 9:16, 4:3, 21:9, and more
- **Resolutions**: 512, 1K, 2K, 4K (model-dependent)
- **Google Search Grounding**: Real-time data in images (weather, stock charts, news)
- **Image Search Grounding**: Accurate visual references via web search
- **Thinking mode**: Model reasons through complex compositions
- **Video-to-image**: Generate images from video context (3.1 Flash)

## Veo Video Generation

### Prompting Guide

Veo generates 8-second videos with natively generated audio.

**Elements to include:**
- **Subject**: What/who is in the video
- **Action**: What's happening
- **Style**: Cinematic, cartoon, stop-motion, etc.
- **Camera**: Aerial view, close-up, dolly shot, POV
- **Composition**: Wide shot, close-up, two-shot
- **Ambiance**: Lighting, color tones, mood
- **Audio cues**: Dialogue in quotes, sound effects

**Example:**
```
Drone shot following a classic red convertible along a winding coastal road at sunset,
waves crashing against rocks. The engine roars loudly. Cinematic, warm golden light.
```

### Features
- **Portrait & landscape** (9:16, 16:9)
- **Video extension**: Extend up to 20 times
- **Frame interpolation**: Specify first & last frames
- **Reference images**: Up to 3 for style/content guidance
- **Resolutions**: 720p, 1080p, 4K (model-dependent)

## Deep Research Agent

The Deep Research agent autonomously plans, executes, and synthesizes multi-step
research with citations.

### Usage

```bash
# In the TUI
clawd --agent deep-research "Analyze Solana validator economics and MEV"

# Programmatic
import { deepResearch } from "./services/gemini";

const result = await deepResearch(
  "Compare Solana DeFi protocols by TVL, revenue, and tokenomics"
);

console.log(result.citations);
// [{ title: "DefiLlama - Solana", url: "https://defillama.com/chain/Solana" }, ...]
```

### Features
- **Collaborative planning**: Review and refine research plans before execution
- **Visualizations**: Auto-generated charts and graphs
- **Multimodal inputs**: Images and PDFs as research context
- **File Search**: Ground research in your own document corpora
- **MCP servers**: Connect to external tools
- **Citations**: Every claim linked to source URLs

Pricing: ~$1-7 per task depending on depth.

## Managed Agents (Antigravity)

Antigravity provisions a Linux sandbox, runs agent loops, and returns results.

### Usage

```typescript
import { runManagedAgent } from "./services/gemini";

const result = await runManagedAgent(
  "Write a Python script that generates the first 50 Fibonacci numbers, " +
  "plots them as a chart, and saves both to files.",
  {
    systemInstruction: "You are a math analysis agent. Always include charts.",
    sources: [
      {
        type: "inline",
        target: ".agents/AGENTS.md",
        content: "Always use matplotlib. Include summary tables.",
      },
    ],
  }
);

// Download files from the sandbox
// curl "https://generativelanguage.googleapis.com/v1beta/files/environment-{envId}:download" \
//   -H "x-goog-api-key: $GEMINI_API_KEY" -o snapshot.tar
```

### Features
- **Isolated Linux sandbox** (4 CPU, 16GB RAM)
- **Pre-installed**: Python 3.12, Node.js 22, numpy, pandas, etc.
- **Sources**: Git repos, GCS buckets, inline files
- **Network rules**: Allowlist with credential injection
- **Environment persistence**: Reuse sandbox across interactions

## Computer Use

Browser automation via screenshot-based control.

### Usage

```typescript
import { startComputerUse, continueComputerUse } from "./services/gemini";

// Start a session
const { interaction, steps } = await startComputerUse(
  "Search for highly rated smart fridges on Google Shopping and create a list"
);

// Execute function calls and continue
for (const step of steps) {
  if (step.type === "function_call") {
    // Execute click_at, type_text_at, scroll_document, etc.
    // Then capture new screenshot and continue
    const result = await continueComputerUse(
      interaction.id,
      "Continue the task",
      { data: newScreenshot, mimeType: "image/png" }
    );
  }
}
```

### Supported Actions
- `open_web_browser`, `search`, `navigate`, `go_back`, `go_forward`
- `click_at`, `hover_at`, `type_text_at`, `key_combination`
- `scroll_document`, `scroll_at`, `drag_and_drop`
- `wait_5_seconds`

### Safety
- Built-in safety decisions: `require_confirmation` for risky actions
- Human-in-the-loop required for CAPTCHAs, financial transactions, legal agreements
- Sandboxed execution environment recommended

## Gemini 3 API Migration Notes

When migrating from older Gemini or other providers:

- **Don't set `temperature`, `top_p`, `top_k`** — Gemini 3.x is optimized for defaults
- **Use `thinkingLevel` instead of `thinkingBudget`**: `minimal`, `low`, `medium` (default), `high`
- **Include `id` in function responses**: Must match the function call ID
- **Default thinking level is `medium`** (changed from `high` in 3 Flash Preview)
- **Thought preservation**: Reasoning context carries forward across multi-turn automatically

## Pricing

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|---|---|---|
| Gemini 3.5 Flash | $0.30 | $1.20 |
| Gemini 3.1 Flash-Lite | $0.10 | $0.40 |
| Gemini 3.1 Flash Image (Nano Banana 2) | Per-image pricing | See [pricing page](https://ai.google.dev/gemini-api/docs/pricing) |
| Gemini 3 Pro Image (Nano Banana Pro) | Per-image pricing | — |
| Veo 3.1 | Per-second pricing | — |
| Deep Research | ~$1-7/task | Based on queries + tokens |

See [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing) for latest rates.

## Security & Safety

### API Key Management
- Never commit `GEMINI_API_KEY` to git
- Use `.env` file (gitignored)
- Rotate keys regularly

### Safety Filters
- All generated images include SynthID watermark
- Safety filters block harmful content
- Computer Use requires human confirmation for risky actions

### Data Privacy
- By default, Google does not train on API data
- See [Google AI Privacy](https://ai.google.dev/gemini-api/docs/data-privacy) for details

## Integration Architecture

```
src/services/gemini/index.ts
├── getGeminiClient()          — GoogleGenAI client singleton
├── createGeminiInferProvider() — Leviathan InferProvider adapter
├── generateImage()            — Nano Banana text-to-image
├── editImage()                — Nano Banana image editing
├── generateVideo()            — Veo video generation (async)
├── deepResearch()             — Deep Research Agent (async)
├── runManagedAgent()          — Antigravity managed agent
├── startComputerUse()         — Computer Use browser control
└── continueComputerUse()      — Multi-turn Computer Use

skills/nano-banana/SKILL.md    — Clawd skill: image generation
skills/veo-video/SKILL.md      — Clawd skill: video generation
skills/gemini-deep-research/SKILL.md — Clawd skill: deep research
```

## What's Next

- Try [Nano Banana 2 in AI Studio](https://aistudio.google.com/apps?features=nano_banana_2)
- Explore [Veo Studio](https://aistudio.google.com/apps/bundled/veo_studio)
- Read the [Gemini API docs](https://ai.google.dev/gemini-api/docs)
- Check the [Gemini Cookbook](https://github.com/google-gemini/cookbook)