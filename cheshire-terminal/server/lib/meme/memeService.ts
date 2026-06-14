import Together from "together-ai";

interface MemeGenerationOptions {
  prompt: string;
  width?: number;
  height?: number;
}

class MemeService {
  private together: Together | null = null;

  constructor() {
    if (process.env.TOGETHER_API_KEY) {
      this.together = new Together({
        apiKey: process.env.TOGETHER_API_KEY
      });
    }
  }

  async generateMemeImage(options: MemeGenerationOptions): Promise<string> {
    try {
      if (!this.together) {
        throw new Error('TOGETHER_API_KEY is not configured');
      }

      console.log("Generating meme image with prompt:", options.prompt);

      const response = await this.together.images.generate({
        model: "black-forest-labs/FLUX.1-dev",
        prompt: options.prompt,
        width: options.width || 1024,
        height: options.height || 768,
        steps: 4,
        n: 1,
        response_format: "url"
      });

      const image = response.data?.[0];
      if (!image || !("url" in image) || !image.url) {
        throw new Error('No image URL received from the API');
      }

      return image.url;
    } catch (error) {
      console.error('Error generating meme image:', error);
      throw new Error('Failed to generate meme image');
    }
  }

  getMemeTemplates() {
    return [
      {
        id: "1",
        name: "Classic Doge",
        prompt: "A Shiba Inu dog with comic sans text, cryptocurrency meme style",
        url: "https://placekitten.com/512/512" // Placeholder URL
      },
      {
        id: "2",
        name: "Stonks Guy",
        prompt: "3D rendered man in suit standing in front of rising charts, cryptocurrency meme",
        url: "https://placekitten.com/512/512" // Placeholder URL
      },
      {
        id: "3",
        name: "Wojak",
        prompt: "Simple line drawing of a bald man expressing extreme emotions, crypto trading meme",
        url: "https://placekitten.com/512/512" // Placeholder URL
      },
      {
        id: "4",
        name: "Pepe Trading",
        prompt: "Green frog character looking at cryptocurrency charts, trading meme style",
        url: "https://placekitten.com/512/512" // Placeholder URL
      }
    ];
  }
}

export const memeService = new MemeService();
