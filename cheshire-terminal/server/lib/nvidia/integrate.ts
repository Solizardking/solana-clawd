// @ts-nocheck
import fetch from 'node-fetch';

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_CHAT_API_URL = 'https://ai.api.nvidia.com/v1/chat/completions';
const NVIDIA_IMAGE_API_URL = 'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev';

// Model ID for Llama 3.3 Nemotron Super 49B
const DEFAULT_MODEL = 'models/llama-3-super/latest';

// Default parameters for the NVIDIA API
const DEFAULT_PARAMS = {
  temperature: 0.7,
  top_p: 0.95,
  max_tokens: 4096,
  frequency_penalty: 0,
  presence_penalty: 0,
};

/**
 * Interface for NVIDIA API chat message
 */
interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Interface for NVIDIA API request options
 */
interface NvidiaRequestOptions {
  model?: string;
  messages: NvidiaMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  seed?: number;
  stop?: string | string[];
}

/**
 * Interface for NVIDIA API response structure
 */
interface NvidiaResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Interface for image generation request options
 */
interface ImageGenerationOptions {
  prompt: string;
  width?: number;
  height?: number;
  cfg_scale?: number;
  mode?: string;
  samples?: number;
  seed?: number;
  steps?: number;
}

/**
 * Generates a text response using NVIDIA's AI model API
 * 
 * @param messages - Array of messages for context
 * @param options - Additional options for the API call
 * @returns The AI generated response
 */
export async function generateNvidiaResponse(
  messages: NvidiaMessage[],
  options: Partial<NvidiaRequestOptions> = {}
): Promise<string> {
  if (!NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY environment variable is not set');
  }

  // Combine default parameters with provided options
  const requestOptions = {
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? DEFAULT_PARAMS.temperature,
    top_p: options.top_p ?? DEFAULT_PARAMS.top_p,
    max_tokens: options.max_tokens ?? DEFAULT_PARAMS.max_tokens,
    frequency_penalty: options.frequency_penalty ?? DEFAULT_PARAMS.frequency_penalty,
    presence_penalty: options.presence_penalty ?? DEFAULT_PARAMS.presence_penalty,
    stream: options.stream ?? false,
    seed: options.seed,
    stop: options.stop,
  };

  try {
    const response = await fetch(NVIDIA_CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(requestOptions),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json() as NvidiaResponse;
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error generating NVIDIA response:', error);
    throw error;
  }
}

/**
 * Generate an image using NVIDIA's image generation API
 * 
 * @param options - Options for image generation
 * @returns The generated image data (base64 encoded)
 */
export async function generateNvidiaImage(
  options: ImageGenerationOptions
): Promise<string> {
  if (!NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY environment variable is not set');
  }
  
  const imageOptions = {
    prompt: options.prompt,
    width: options.width || 1024,
    height: options.height || 1024,
    cfg_scale: options.cfg_scale || 5,
    mode: options.mode || 'base',
    samples: options.samples || 1,
    seed: options.seed || 0,
    steps: options.steps || 50,
  };
  
  try {
    const response = await fetch(NVIDIA_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Accept': 'application/json'
      },
      body: JSON.stringify(imageOptions),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA Image API request failed with status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result && result.image_url) {
      return result.image_url; // Return image URL if available
    } else if (result && result.image_data) {
      return result.image_data; // Return base64 encoded image if available
    } else {
      throw new Error('No image data found in the response');
    }
  } catch (error) {
    console.error('Error generating NVIDIA image:', error);
    throw error;
  }
}

/**
 * Non-streaming chat completion for NVIDIA API
 * 
 * @param messages Chat messages
 * @param model Model to use
 * @param options Additional options
 * @returns Full response text
 */
export async function chatCompletion(
  messages: NvidiaMessage[],
  model?: string,
  options: Partial<Omit<NvidiaRequestOptions, 'messages' | 'model'>> = {}
): Promise<string> {
  return generateNvidiaResponse(messages, { model, ...options });
}

/**
 * Get available NVIDIA models
 * @returns List of available models with their details
 */
export function getAvailableModels() {
  // Since NVIDIA doesn't have a public models endpoint, we hard-code the ones we know of
  return [
    {
      id: "nvidia/llama-3.3-nemotron-super-49b-v1",
      name: "Llama 3.3 Nemotron Super 49B",
      description: "NVIDIA's advanced reasoning LLM built on Llama 3.3 architecture",
      capabilities: ["Deep reasoning", "Complex problem solving", "Technical analysis"],
      context_window: 16384
    }
  ];
}

export default {
  generateNvidiaResponse,
  generateNvidiaImage,
  chatCompletion,
  getAvailableModels
};
