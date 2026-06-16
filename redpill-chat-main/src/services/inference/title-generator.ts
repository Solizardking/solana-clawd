import { TITLE_GENERATION_PROMPT, TITLE_GENERATION_MODEL } from "@/constants";
import { env } from "@/env";

export async function generateChatTitle(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  if (!messages || messages.length === 0) return "New Chat";

  try {
    // Take first 4 messages for title generation (to keep context focused)
    const conversationForTitle = messages
      .slice(0, Math.min(4, messages.length))
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content.slice(0, 500)}`)
      .join("\n\n");

    const response = await fetch(
      `${env.NEXT_PUBLIC_REDPILL_API_URL}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: TITLE_GENERATION_MODEL,
          messages: [
            { role: "system", content: TITLE_GENERATION_PROMPT },
            {
              role: "user",
              content: `Generate a title for this conversation:\n\n${conversationForTitle}`,
            },
          ],
          stream: false,
          max_tokens: 30,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const title = data.choices?.[0]?.message?.content?.trim() || "";

    // Clean up the title (remove quotes, trim)
    const cleanTitle = title.replace(/^["']|["']$/g, "").trim();

    // Validate title length
    if (cleanTitle && cleanTitle.length > 0 && cleanTitle.length <= 50) {
      return cleanTitle;
    }

    return "New Chat";
  } catch (error) {
    console.error("Failed to generate chat title", error);
    return "New Chat";
  }
}
