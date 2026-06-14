import { apiRequest } from "./queryClient";

export interface ImageGenerationOptions {
  prompt: string;
  n?: number;
  responseFormat?: "url" | "b64_json";
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revisedPrompt?: string;
  file_output?: {
    file_id?: string;
    filename?: string;
    public_url?: string;
    public_url_error?: string;
  };
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface TokenRecommendation {
  name: string;
  symbol: string;
  description: string;
  initialBuyAmount: number;
  totalSupply: string;
  marketingPoints: string[];
  viralPotential: string;
}

class GrokAIClient {
  async generateImage(options: ImageGenerationOptions): Promise<GeneratedImage[]> {
    try {
      const data = await apiRequest<{ success: boolean; images: GeneratedImage[]; error?: string }>(
        "/api/xai/image-gen",
        {
          method: "POST",
          body: JSON.stringify({
            prompt: options.prompt,
            n: options.n || 1,
            response_format: options.responseFormat || "url",
          }),
        },
      );
      if (!data.success) throw new Error(data.error || "Image generation failed");
      return data.images || [];
    } catch (error) {
      console.error("Error generating image with Grok:", error);
      throw new Error(`Failed to generate image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeImage(imageBase64: string, prompt: string): Promise<string> {
    try {
      const data = await apiRequest<{ success: boolean; choices?: Array<{ message?: { content?: string } }>; error?: string }>(
        "/api/xai/analyze-image",
        {
          method: "POST",
          body: JSON.stringify({ base64Image: imageBase64, prompt }),
        },
      );
      if (!data.success) throw new Error(data.error || "Image analysis failed");
      return data.choices?.[0]?.message?.content || "I couldn't analyze this image.";
    } catch (error) {
      console.error("Error analyzing image with Grok:", error);
      throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generateTokenIdea(prompt: string): Promise<TokenRecommendation> {
    try {
      const systemPrompt = `You are a creative blockchain token advisor specializing in meme tokens.
Generate a viral-worthy token concept based on the user's prompt.
Return JSON with fields:
- name
- symbol
- description
- initialBuyAmount
- totalSupply
- marketingPoints
- viralPotential`;

      const data = await apiRequest<{ success: boolean; data: TokenRecommendation; error?: string }>(
        "/api/xai/json",
        {
          method: "POST",
          body: JSON.stringify({ prompt, system_prompt: systemPrompt }),
        },
      );
      if (!data.success) throw new Error(data.error || "Token idea failed");
      return data.data;
    } catch (error) {
      console.error("Error generating token idea:", error);
      throw new Error(`Failed to generate token idea: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyzeMemeIdea(idea: string): Promise<{ improvedPrompt: string; analysis: string }> {
    try {
      const data = await apiRequest<{
        success: boolean;
        data: { improvedPrompt?: string; analysis?: string };
        error?: string;
      }>("/api/xai/json", {
        method: "POST",
        body: JSON.stringify({
          prompt: idea,
          system_prompt:
            "You are a creative meme expert. Return JSON with improvedPrompt and analysis for making a stronger meme image prompt.",
        }),
      });
      if (!data.success) throw new Error(data.error || "Meme analysis failed");
      return {
        improvedPrompt: data.data?.improvedPrompt || idea,
        analysis: data.data?.analysis || "Using original prompt.",
      };
    } catch (error) {
      console.error("Error analyzing meme idea:", error);
      return {
        improvedPrompt: idea,
        analysis: "Failed to analyze your idea. Using original prompt.",
      };
    }
  }

  async chat(messages: Message[], onChunk: (chunk: string) => void): Promise<void> {
    try {
      const last = messages[messages.length - 1];
      const response = await fetch("/api/ai/chat-stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: last?.content || "",
          sessionId: "terminal-chat",
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body not available");

      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) onChunk(decoder.decode(value));
      }
    } catch (error) {
      console.error("Chat error:", error);
      throw new Error(`Chat failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const grokAI = new GrokAIClient();
