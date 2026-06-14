import { Router } from 'express';
import nvidiaAPI, { generateNvidiaResponse, generateNvidiaImage, getAvailableModels } from '../lib/nvidia/integrate';
import { objectStore } from '../lib/objectStore';
import { estimateTokensFromText, trackUsageFromRequest } from '../lib/usage';

const router = Router();

// Interface for chat request body
interface ChatRequestBody {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// Interface for image generation request body
interface ImageGenerationBody {
  prompt: string;
  width?: number;
  height?: number;
  cfg_scale?: number;
  mode?: string;
  seed?: number;
  steps?: number;
}

/**
 * Generate a completion from NVIDIA's LLM models
 * Compatible with OpenAI Chat API format
 */
router.post('/chat', async (req, res) => {
  try {
    const { 
      messages, 
      model, 
      stream = false,
      temperature,
      max_tokens 
    } = req.body as ChatRequestBody;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // For now, streaming is not supported due to the API limitations
    // Just use the regular completion API
    const response = await generateNvidiaResponse(messages, { 
      model,
      temperature,
      max_tokens
    });
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: model ?? "nvidia",
      route: "/api/nvidia/chat",
      totalTokens: estimateTokensFromText(JSON.stringify(messages), response),
      metadata: { stream },
    });
    
    res.json({ response });
  } catch (error) {
    console.error('NVIDIA API error:', error);
    res.status(500).json({ error: 'Failed to get response from NVIDIA API' });
  }
});

/**
 * Generate an image using NVIDIA's image generation model
 */
router.post('/image', async (req, res) => {
  try {
    const {
      prompt,
      width,
      height,
      cfg_scale,
      mode,
      seed,
      steps
    } = req.body as ImageGenerationBody;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const imageData = await generateNvidiaImage({
      prompt,
      width,
      height,
      cfg_scale,
      mode,
      seed,
      steps
    });

    // imageData is base64 — save as data URI to gallery
    if (imageData) {
      const dataUrl = `data:image/png;base64,${imageData}`;
      const item = objectStore.makeItem({ type: 'image', title: prompt, prompt, sourceUrl: dataUrl, model: 'nvidia' });
      objectStore.saveGalleryItem(item).then(saved => {
        const broadcast = req.app.locals.broadcastGalleryItem as Function | undefined;
        broadcast?.(saved);
      }).catch(() => {});
    }
    trackUsageFromRequest(req, {
      eventType: "image_generation",
      productArea: "ai",
      model: "nvidia",
      route: "/api/nvidia/image",
      units: imageData ? 1 : 0,
      totalTokens: estimateTokensFromText(prompt),
      metadata: { width, height, cfg_scale, mode, steps },
    });

    res.json({ image: imageData });
  } catch (error) {
    console.error('NVIDIA Image API error:', error);
    res.status(500).json({ error: 'Failed to generate image with NVIDIA API' });
  }
});

/**
 * Get information about the available NVIDIA models
 */
router.get('/models', (req, res) => {
  const models = getAvailableModels();
  res.json({ models });
});

export default router;
