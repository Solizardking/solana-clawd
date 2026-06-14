/**
 * NVIDIA AI client library
 * Provides methods for interacting with NVIDIA's AI models through our backend API
 */

export interface NvidiaModelInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  context_window: number;
}

export interface NvidiaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NvidiaChatOptions {
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface NvidiaImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  cfg_scale?: number;
  mode?: string;
  seed?: number;
  steps?: number;
}

class NvidiaAI {
  /**
   * Get available NVIDIA AI models
   * @returns List of available models
   */
  async getAvailableModels(): Promise<NvidiaModelInfo[]> {
    try {
      const response = await fetch('/api/nvidia/models');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch NVIDIA models: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Error fetching NVIDIA models:', error);
      throw error;
    }
  }

  /**
   * Send a chat completion request to NVIDIA AI
   * @param messages Array of messages for the conversation
   * @param model Optional model ID (defaults to server default)
   * @param options Optional parameters like temperature, max_tokens
   * @returns The AI response text
   */
  async chat(
    messages: NvidiaMessage[],
    model?: string,
    options: NvidiaChatOptions = {}
  ): Promise<string> {
    try {
      const response = await fetch('/api/nvidia/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          model,
          temperature: options.temperature,
          max_tokens: options.max_tokens,
          stream: options.stream
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API request failed: ${errorText}`);
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error('NVIDIA chat error:', error);
      throw error;
    }
  }

  /**
   * Stream a chat completion from NVIDIA AI
   * @param messages Array of messages for the conversation
   * @param onChunk Callback for each chunk of the stream
   * @param model Optional model ID (defaults to server default)
   * @param options Optional parameters like temperature, max_tokens
   * @returns The complete response when finished
   */
  async streamChat(
    messages: NvidiaMessage[],
    onChunk: (chunk: string) => void,
    model?: string,
    options: Omit<NvidiaChatOptions, 'stream'> = {}
  ): Promise<string> {
    try {
      // First, get the complete response
      const fullResponse = await this.chat(messages, model, options);
      
      // Now simulate streaming by breaking it into chunks and sending them with delays
      // This creates a smoother user experience even though the API doesn't natively support streaming
      const words = fullResponse.split(' ');
      const chunkSize = 3; // Send 3 words at a time
      let streamedResponse = '';
      
      // Send chunks with delays to simulate streaming
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
        streamedResponse += chunk;
        onChunk(chunk);
        
        // Add a delay between chunks to simulate streaming (skip delay for last chunk)
        if (i + chunkSize < words.length) {
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay between chunks
        }
      }
      
      return streamedResponse;
    } catch (error) {
      console.error('NVIDIA streaming error:', error);
      throw error;
    }
  }

  /**
   * Perform token analysis using NVIDIA AI
   * @param tokenAddress The token contract address to analyze
   * @param tokenData Additional data about the token
   * @returns Analysis results
   */
  async analyzeToken(
    tokenAddress: string,
    tokenData: Record<string, any>
  ): Promise<string> {
    const systemPrompt = `You are a cryptocurrency expert specializing in token security analysis. 
    Analyze the provided token data and provide a detailed security assessment. 
    Focus on potential red flags, contract vulnerabilities, and overall safety for investors.`;
    
    const userPrompt = `Please analyze this token contract and data:
    Token Address: ${tokenAddress}
    Token Data: ${JSON.stringify(tokenData, null, 2)}
    
    Provide a comprehensive security analysis with these sections:
    1. Overview
    2. Security Score (0-100)
    3. Risk Factors
    4. Recommendations
    `;
    
    try {
      return await this.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
    } catch (error) {
      console.error('Token analysis error:', error);
      throw error;
    }
  }

  /**
   * Generate an image using NVIDIA's image generation model
   * @param options Image generation options including prompt, size, etc.
   * @returns URL or base64 string of the generated image
   */
  async generateImage(options: NvidiaImageOptions): Promise<string> {
    try {
      const response = await fetch('/api/nvidia/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA Image API request failed: ${errorText}`);
      }

      const data = await response.json();
      return data.image;
    } catch (error) {
      console.error('NVIDIA image generation error:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const nvidiaAI = new NvidiaAI();

export default nvidiaAI;