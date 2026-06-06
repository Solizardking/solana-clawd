# Clawd Agents + Gemini Integration

> Full integration guide at [../GEMINI.md](../GEMINI.md)

## Quick Reference

All Google Gemini capabilities are available to Clawd agents via `src/services/gemini/index.ts`.

### Models available to agents

| Model ID | Type | Rate Limit |
|---|---|---|
| `gemini-3.5-flash` | Text | 2000 RPM |
| `gemini-3.1-flash-lite` | Text (fast) | 2000 RPM |
| `gemini-3.1-pro-preview` | Text (reasoning) | 200 RPM |
| `gemini-3.1-flash-image` | Image (Nano Banana 2) | 60 RPM |
| `gemini-3-pro-image` | Image (Nano Banana Pro) | 30 RPM |
| `gemini-2.5-flash-image` | Image (Nano Banana) | 600 RPM |
| `veo-3.1-generate-preview` | Video (Veo 3.1) | 10 RPM |
| `deep-research-preview-04-2026` | Agent (Deep Research) | 30 RPM |
| `antigravity-preview-05-2026` | Agent (Managed) | 30 RPM |

### Skills for agents

| Skill | File | Description |
|---|---|---|
| `nano-banana` | `skills/nano-banana/SKILL.md` | Image generation/editing with search grounding |
| `nano-banana-pro` | `skills/nano-banana-pro/SKILL.md` | Professional image generation (Python-based) |
| `veo-video` | `skills/veo-video/SKILL.md` | Video generation with audio |
| `gemini-deep-research` | `skills/gemini-deep-research/SKILL.md` | Autonomous web research with citations |
| `gemini-antigravity` | `skills/gemini-antigravity/SKILL.md` | Isolated Linux sandbox agent |
| `gemini` | `skills/gemini/SKILL.md` | Gemini CLI wrapper (shell-out) |

### Using Gemini in agent definitions

Add to any agent character JSON:

```json
{
  "capabilities": {
    "models": ["gemini-3.5-flash", "gemini-3.1-flash-image"],
    "tools": ["google_search", "code_execution", "url_context"],
    "skills": ["nano-banana", "gemini-deep-research"]
  }
}
```

### Environment

```bash
# Required for all Gemini capabilities
export GEMINI_API_KEY=your-key-here  # Get from https://aistudio.google.com/app/apikey
```

### Security rules for agents
- Never expose `GEMINI_API_KEY` in agent responses or logs
- Rate limit image/video generation to avoid cost spikes
- Use thinking level `medium` (default) for most agent tasks
- Always include `id` and matching `name` in function responses
- Do not set `temperature`, `top_p`, or `top_k` (use Gemini 3.x defaults)
- For Computer Use, always implement human-in-the-loop confirmation