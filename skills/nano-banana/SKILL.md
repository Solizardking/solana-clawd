---
name: nano-banana
description: Generate and edit images using Nano Banana 2 (Gemini 3.1 Flash Image) with Google Search grounding, up to 4K, 14 reference images, video-to-image, and thinking mode.
homepage: https://ai.google.dev/gemini-api/docs/image-generation
metadata:
  clawdbot:
    emoji: 🍌
    requires:
      env:
      - GEMINI_API_KEY
    primaryEnv: GEMINI_API_KEY
attestation:
  verified: true
  verified_at: '2026-06-06'
  registries:
  - https://x402.wtf/skills/nano-banana
  - https://x402.wtf/skills/nano-banana
---

# Nano Banana 2 (Gemini 3.1 Flash Image)

Generate and edit images using the latest Gemini image models.

## Quickstart

**Generate an image:**
```bash
clawd-skills run nano-banana --prompt "A Solana lobster mascot in cyberpunk style, neon blue and orange, holding a crypto wallet" --output clawd-logo.png --resolution 2K --aspect-ratio "16:9"
```

**Edit an image:**
```bash
clawd-skills run nano-banana --mode edit --prompt "Add a glowing Solana logo in the background" --input-image original.png --output edited.png
```

**With search grounding (real-time data):**
```bash
clawd-skills run nano-banana --prompt "5-day weather forecast chart for San Francisco with outfit suggestions" --search --resolution 2K
```

## Model Selection

| Flag | Model | Use For |
|---|---|---|
| `--model flash` (default) | `gemini-3.1-flash-image` | Speed, efficiency, high volume |
| `--model pro` | `gemini-3-pro-image` | Professional quality, complex text |
| `--model legacy` | `gemini-2.5-flash-image` | Legacy compatibility |

## Resolution & Aspect Ratio

| Resolution | Pixel Dimensions (1:1) |
|---|---|
| `512` | 512×512 |
| `1K` (default) | 1024×1024 |
| `2K` | 2048×2048 |
| `4K` | 4096×4096 |

**Aspect ratios:** `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `21:9`, `2:3`, `3:2`, `4:5`, `5:4`, `1:4`, `4:1`, `1:8`, `8:1`

## Search Grounding

Enable `--search` to ground images in real-time web data:
- Weather forecasts and charts
- Stock/crypto price charts
- News events and articles
- Current sports scores
- Product information

**Image Search Grounding** (`--image-search`): For accurate visual references via Google Images.

## Thinking Mode

`--thinking high` enables deeper reasoning for complex compositions.
Default is `minimal` for speed.

## Reference Images

Nano Banana 2 supports up to **14 reference images**:
- Up to 4 character images for consistency
- Up to 10 object images for high-fidelity

```bash
clawd-skills run nano-banana --prompt "These people in a group photo making funny faces" \
  --reference person1.png --reference person2.png --reference person3.png
```

## Video-to-Image

Generate images from video context (YouTube or uploaded):
```bash
clawd-skills run nano-banana --video-to-image "https://www.youtube.com/watch?v=..." \
  --prompt "A poster image capturing key themes" --output poster.png
```

## Prompting Tips

- **Describe the scene**, don't just list keywords
- Use photography terms for realism: "85mm portrait lens", "golden hour", "bokeh"
- Specify style: "kawaii sticker", "film noir", "3D cartoon"
- For text: Describe the font and layout precisely
- For product shots: "studio-lit", "product photograph", "three-point lighting"

## Notes

- All images include SynthID watermark
- Supported languages: EN, ar-EG, de-DE, es-MX, fr-FR, hi-IN, id-ID, it-IT, ja-JP, ko-KR, pt-BR, ru-RU, vi-VN, zh-CN
- Max 14 reference images per request
- Generated images are automatically saved with timestamps