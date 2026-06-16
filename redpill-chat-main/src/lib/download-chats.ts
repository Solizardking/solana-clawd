import type { Chat } from "@/hooks/use-chat-storage";

// Function to download all chats as markdown files in a zip
export async function downloadChats(chats: Chat[]) {
  if (chats.length === 0) return;

  // Create markdown content for each chat
  const chatFiles: { [filename: string]: string } = {};

  chats.forEach((chat, index) => {
    const date = new Date(chat.createdAt).toISOString().split("T")[0];
    const sanitizedTitle = chat.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `${date}_${sanitizedTitle || `chat_${index + 1}`}.md`;

    let markdown = `# ${chat.title}\n\n`;
    markdown += `**Created:** ${new Date(chat.createdAt).toLocaleString()}\n`;
    markdown += `**Messages:** ${chat.messages.length}\n\n---\n\n`;

    chat.messages.forEach((message) => {
      const timestamp = new Date(message.timestamp).toLocaleString();
      const role = message.role === "user" ? "User" : "Assistant";

      markdown += `## ${role}\n`;
      markdown += `*${timestamp}*\n\n`;
      markdown += `${message.content}\n\n---\n\n`;
    });

    chatFiles[filename] = markdown;
  });

  // Create and download zip file
  try {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Add each chat file to the zip
    Object.entries(chatFiles).forEach(([filename, content]) => {
      zip.file(filename, content);
    });

    // Add a summary file
    const summary =
      `# Chat Export Summary\n\n` +
      `**Export Date:** ${new Date().toLocaleString()}\n` +
      `**Total Chats:** ${chats.length}\n` +
      `**Total Messages:** ${chats.reduce((sum, chat) => sum + chat.messages.length, 0)}\n\n` +
      `## Chat List\n\n` +
      chats
        .map(
          (chat, index) =>
            `${index + 1}. **${chat.title}** (${chat.messages.length} messages) - ${new Date(chat.createdAt).toLocaleDateString()}`,
        )
        .join("\n");

    zip.file("chat_summary.md", summary);

    // Generate and download the zip
    const content = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `redpill_chat_export_${new Date().toISOString().split("T")[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to create chat export zip file", error);
    throw new Error("Failed to download chats. Please try again.");
  }
}
