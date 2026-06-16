import {
  type AttachmentAdapter,
  type CompleteAttachment,
  CompositeAttachmentAdapter,
  type PendingAttachment,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(",")
        ? (result.split(",", 2)[1] ?? "")
        : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);

    reader.readAsDataURL(file);
  });

class GenericFileAttachmentAdapter implements AttachmentAdapter {
  public accept = "*";

  public async add({
    file,
  }: {
    file: File;
  }): Promise<PendingAttachment & { type: "file" }> {
    return {
      id: createId(),
      type: "file",
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  public async send(
    attachment: PendingAttachment & { type: "file" },
  ): Promise<CompleteAttachment & { type: "file" }> {
    return {
      ...attachment,
      type: "file",
      status: { type: "complete" },
      content: [
        {
          type: "file",
          filename: attachment.name,
          mimeType: attachment.contentType,
          data: await fileToBase64(attachment.file),
        },
      ],
    };
  }

  public async remove() {
    // No-op for local files
  }
}

export const createLocalAttachmentAdapter = (): AttachmentAdapter => {
  return new CompositeAttachmentAdapter([
    // Handles inline previews for images
    new SimpleImageAttachmentAdapter(),
    // Converts text-like files into document attachments
    new SimpleTextAttachmentAdapter(),
    // Fallback for any other file types
    new GenericFileAttachmentAdapter(),
  ]);
};
