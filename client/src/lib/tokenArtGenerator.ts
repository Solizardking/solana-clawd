import { apiRequest } from "./queryClient";

interface TokenImagePrompt {
  name: string;
  description: string;
  theme?: string;
  style?: string;
}

export const tokenArtGenerator = {
  async generatePrompt({
    name,
    description,
    theme = "meme",
    style = "vibrant",
  }: TokenImagePrompt): Promise<string> {
    try {
      const response = await apiRequest<{ enhanced?: string; error?: string }>(
        "/api/imagine/expand-prompt",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "image",
            prompt: `Token logo prompt. Name: ${name}. Description: ${description}. Theme: ${theme}. Style: ${style}.`,
          }),
        },
      );
      return response.enhanced || "A modern, professional cryptocurrency token logo with vibrant colors";
    } catch (error) {
      console.error("Error generating image prompt:", error);
      return "A modern, professional cryptocurrency token logo with vibrant colors";
    }
  },

  async generateImage(prompt: string): Promise<string> {
    try {
      const response = await apiRequest<{ success: boolean; images?: Array<{ url?: string; b64_json?: string }>; error?: string }>(
        "/api/xai/image-gen",
        {
          method: "POST",
          body: JSON.stringify({
            prompt,
            n: 1,
            aspect_ratio: "1:1",
            resolution: "1k",
            storage_options: {
              filename: "token-art.png",
              public_url: true,
            },
          }),
        },
      );
      if (!response.success) throw new Error(response.error || "Image generation failed");
      const image = response.images?.[0];
      const url = image?.url || (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : "");
      if (!url) throw new Error("No image URL returned");
      return url;
    } catch (error) {
      console.error("Error generating image:", error);
      throw new Error("Failed to generate token image");
    }
  },

  async generateTokenArt(details: TokenImagePrompt): Promise<{
    imageUrl: string;
    prompt: string;
  }> {
    const prompt = await this.generatePrompt(details);
    const imageUrl = await this.generateImage(prompt);
    return { imageUrl, prompt };
  },
};
