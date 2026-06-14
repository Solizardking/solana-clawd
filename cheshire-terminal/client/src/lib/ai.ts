import { apiRequest } from "./queryClient";

interface TokenDetails {
  name: string;
  symbol: string;
  description: string;
}

interface ChatResponse {
  tokenDetails: TokenDetails;
  artPrompt: string;
}

export async function chatWithCheshire(userMessage: string): Promise<ChatResponse> {
  try {
    return await apiRequest<ChatResponse>("POST", "/api/ai/chat", { message: userMessage });
  } catch (error) {
    console.error("Error in chat:", error);
    throw new Error("Failed to generate token concept. Please try again.");
  }
}

export async function generateMemeImage(prompt: string): Promise<string> {
  try {
    const data = await apiRequest<{ imageUrl: string }>("POST", "/api/ai/generate-image", { prompt });
    return data.imageUrl;
  } catch (error) {
    console.error("Error generating meme image:", error);
    throw new Error("Failed to generate meme image. Please try again.");
  }
}
