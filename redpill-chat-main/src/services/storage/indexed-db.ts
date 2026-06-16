import type { Chat } from "@/hooks/use-chat-storage";

const DB_NAME = "redpill-chat";
export const DB_VERSION = 1;
const CHATS_STORE = "chats";

export interface StoredChat extends Chat {
  lastAccessedAt: number;
  decryptionFailed?: boolean;
  dataCorrupted?: boolean;
  encryptedData?: string;
  version?: number;
  loadedAt?: number;
}

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private saveQueue: Promise<void> = Promise.resolve();

  async initialize(): Promise<void> {
    // Check if IndexedDB is available
    if (typeof window === "undefined" || !window.indexedDB) {
      throw new Error("IndexedDB not available");
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error("IndexedDB open error", error);
        reject(
          new Error(
            `Failed to open database: ${error?.message || "Unknown error"}`,
          ),
        );
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        try {
          if (!db.objectStoreNames.contains(CHATS_STORE)) {
            const store = db.createObjectStore(CHATS_STORE, { keyPath: "id" });
            store.createIndex("lastAccessedAt", "lastAccessedAt", {
              unique: false,
            });
            store.createIndex("createdAt", "createdAt", { unique: false });
          }
        } catch (error) {
          console.error("Failed to create object store", error);
          reject(new Error(`Failed to upgrade database: ${error}`));
        }
      };

      request.onblocked = () => {
        console.warn("IndexedDB upgrade blocked - close other tabs");
        reject(new Error("Database upgrade blocked"));
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  async saveChat(chat: Chat): Promise<void> {
    const chatSnapshot = JSON.parse(JSON.stringify(chat));
    this.saveQueue = this.saveQueue
      .catch((error) => {
        console.error(
          "Previous save operation failed, recovering queue",
          error,
        );
      })
      .then(() => this.saveChatInternal(chatSnapshot));
    return this.saveQueue;
  }

  private async saveChatInternal(chat: Chat): Promise<void> {
    const db = await this.ensureDB();

    // Don't save blank chats to IndexedDB
    if (chat.messages.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], "readwrite");
      const store = transaction.objectStore(CHATS_STORE);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = (event) => {
        const target = event.target as IDBRequest;
        console.error("[IndexedDB] Transaction error", target.error);
        reject(new Error("Failed to save chat"));
      };

      transaction.onabort = (event) => {
        const target = event.target as IDBRequest;
        console.error("[IndexedDB] Transaction aborted", target.error);
        reject(new Error("Transaction aborted"));
      };

      const getRequest = store.get(chat.id);

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as StoredChat | undefined;

        // Ensure messages have proper timestamp format
        const messagesForStorage = chat.messages.map((msg) => ({
          ...msg,
          timestamp:
            msg.timestamp instanceof Date
              ? msg.timestamp.toISOString()
              : msg.timestamp,
        }));

        const storedChat: StoredChat = {
          ...chat,
          messages: messagesForStorage as unknown as Chat["messages"],
          lastAccessedAt: Date.now(),
          decryptionFailed: (chat as StoredChat).decryptionFailed,
          dataCorrupted: (chat as StoredChat).dataCorrupted,
          encryptedData: (chat as StoredChat).encryptedData,
          version: 1,
          loadedAt:
            (chat as StoredChat).loadedAt ??
            existingChat?.loadedAt ??
            undefined,
        };

        const putRequest = store.put(storedChat);

        putRequest.onerror = () => {
          reject(new Error("Failed to save chat"));
        };
      };

      getRequest.onerror = () =>
        reject(new Error("Failed to check existing chat"));
    });
  }

  private async getChatInternal(id: string): Promise<StoredChat | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], "readonly");
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        const chat = request.result;
        if (chat) {
          // Convert string timestamps back to Date objects
          chat.messages = chat.messages.map((msg: Record<string, unknown>) => {
            const rawTimestamp = msg.timestamp;
            const safeTimestamp =
              typeof rawTimestamp === "string" ||
              typeof rawTimestamp === "number" ||
              rawTimestamp instanceof Date
                ? new Date(rawTimestamp)
                : new Date();

            return {
              ...msg,
              timestamp: safeTimestamp,
            };
          });
        }
        resolve(chat || null);
      };
      request.onerror = () => reject(new Error("Failed to get chat"));
    });
  }

  async getChat(id: string): Promise<StoredChat | null> {
    await this.saveQueue.catch(() => {});
    const chat = await this.getChatInternal(id);
    if (chat) {
      this.updateLastAccessed(id).catch((error) =>
        console.error("Failed to update last accessed time", error),
      );
    }
    return chat;
  }

  async deleteChat(id: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], "readwrite");
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete chat"));
    });
  }

  async getAllChats(): Promise<StoredChat[]> {
    await this.saveQueue.catch(() => {});
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], "readonly");
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.openCursor(null, "next");

      const chats: StoredChat[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const chat = cursor.value;
          // Convert string timestamps back to Date objects
          chat.messages = chat.messages.map((msg: Record<string, unknown>) => {
            const rawTimestamp = msg.timestamp;
            const safeTimestamp =
              typeof rawTimestamp === "string" ||
              typeof rawTimestamp === "number" ||
              rawTimestamp instanceof Date
                ? new Date(rawTimestamp)
                : new Date();

            return {
              ...msg,
              timestamp: safeTimestamp,
            };
          });
          chats.push(chat);
          cursor.continue();
        } else {
          resolve(chats);
        }
      };

      request.onerror = () => reject(new Error("Failed to get all chats"));
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CHATS_STORE], "readwrite");
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to clear all chats"));
    });
  }

  private async updateLastAccessed(id: string): Promise<void> {
    this.saveQueue = this.saveQueue
      .catch((error) => {
        console.error(
          "Previous save operation failed, recovering queue",
          error,
        );
      })
      .then(async () => {
        const db = await this.ensureDB();
        const chat = await this.getChatInternal(id);

        if (chat) {
          return new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([CHATS_STORE], "readwrite");
            const store = transaction.objectStore(CHATS_STORE);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () =>
              reject(new Error("Failed to update last accessed"));

            chat.lastAccessedAt = Date.now();
            const request = store.put(chat);

            request.onerror = () =>
              reject(new Error("Failed to update last accessed"));
          });
        }
      });
    return this.saveQueue;
  }
}

export const indexedDBStorage = new IndexedDBStorage();
