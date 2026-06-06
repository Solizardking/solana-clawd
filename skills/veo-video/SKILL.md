---
name: veo-video
description: Generate cinematic 8-second videos with native audio using Veo 3.1. Supports portrait/landscape, video extension, frame interpolation, reference images, and up to 4K resolution.
homepage: https://ai.google.dev/gemini-api/docs/video
metadata:
  clawdbot:
    emoji: 🎬
    requires:
      env:
      - GEMINI_API_KEY
    primaryEnv: GEMINI_API_KEY
attestation:
  verified: true
  verified_at: '2026-06-06'
  registries:
  - https://x402.wtf/skills/veo-video
  - https://x402.wtf/skills/veo-video
---

# Veo 3.1 Video Generation

Generate high-fidelity 8-second videos with natively generated audio using Google's Veo 3.1.

## Quickstart

**Generate a video:**
```bash
clawd-skills run veo-video --prompt "Drone shot following a classic red convertible along a winding coastal road at sunset, waves crashing below. Engine roars loudly." --output sunset-drive.mp4
```

**Portrait video (9:16):**
```bash
clawd-skills run veo-video --prompt "A chef tossing pizza dough, upbeat music, high energy" --aspect-ratio "9:16" --output pizza-short.mp4
```

**4K resolution:**
```bash
clawd-skills run veo-video --prompt "Stunning drone view of the Grand Canyon at sunset" --resolution 4k --output grand-canyon.mp4
```

**Video extension (extend a Veo-generated video):**
```bash
clawd-skills run veo-video --extend input-video.mp4 --prompt "The paraglider slowly descends and lands" --output extended.mp4
```

## Models

| Flag | Model | Speed | Quality |
|---|---|---|---|
| `--model veo-3.1` (default) | `veo-3.1-generate-preview` | Medium | Best |
| `--model fast` | `veo-3.1-fast-generate-preview` | Fast | High |
| `--model lite` | `veo-3.1-lite-generate-preview` | Fastest | Good |

## Resolution & Duration

| Resolution | Duration | Aspect Ratios |
|---|---|---|
| `720p` (default) | 4s, 6s, 8s | 16:9, 9:16 |
| `1080p` | 8s only | 16:9, 9:16 |
| `4k` | 8s only | 16:9, 9:16 |

## Image-to-Video

```bash
clawd-skills run veo-video --image starting-frame.png \
  --prompt "Panning wide shot of the scene coming to life" --output animated.mp4
```

## Frame Interpolation (first & last frames)

```bash
clawd-skills run veo-video --first-frame start.png --last-frame end.png \
  --prompt "Smooth cinematic transition" --output interpolation.mp4
```

## Reference Images

Up to 3 reference images to guide content (Veo 3.1 only):
```bash
clawd-skills run veo-video --reference subject.png --reference outfit.png --reference glasses.png \
  --prompt "This person walking through a sunlit lagoon" --output lagoon.mp4
```

## Video Extension

Extend Veo-generated videos up to 20 times (max 148 seconds total):
```bash
clawd-skills run veo-video --extend original-veo-video.mp4 \
  --prompt "Continue the scene with the character entering a new room" --output chapter2.mp4
```

## Prompting Guide

Include these elements for best results:
- **Subject**: Who/what (e.g., "a chef", "a red convertible")
- **Action**: What's happening (e.g., "tossing dough", "driving")
- **Style**: "cinematic", "cartoon", "stop-motion", "film noir"
- **Camera**: "drone shot", "close-up", "POV", "aerial view"
- **Composition**: "wide shot", "close-up", "two-shot"
- **Ambiance**: "golden hour", "cool blue tones", "warm sunlight"
- **Audio**: Dialogue in quotes, specific sounds ("engine roars")

## Limitations

- Generation takes 11 seconds to 6 minutes
- Max 8 second videos (before extension)
- Regional person generation restrictions (EU/UK/CH/MENA)
- Videos stored for 2 days on server
- SynthID watermarked

## Notes

- Generate a matching image first with Nano Banana for image-to-video
- Use timestamps in filenames: `yyyy-mm-dd-hh-mm-ss-name.mp4`
- Report saved path only, don't read video back