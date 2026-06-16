export type ChatChangeReason = "save" | "delete" | "create" | "update";

export interface ChatChangedEvent {
  reason: ChatChangeReason;
  chatId?: string;
}

type Listener = (event: ChatChangedEvent) => void;

class ChatEvents {
  private listeners: Set<Listener> = new Set();

  on(listener: Listener): () => void {
    this.listeners.add(listener);

    // Return cleanup function
    return () => this.off(listener);
  }

  off(listener: Listener): void {
    this.listeners.delete(listener);
  }

  emit(event: ChatChangedEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Chat event listener error", error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const chatEvents = new ChatEvents();
