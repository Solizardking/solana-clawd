import { create } from "zustand";
import { env } from "@/env";
import type {
  MessageVerificationState,
  SignatureData,
} from "@/types/message-verification";

interface MessageVerificationStore {
  verifications: Map<string, MessageVerificationState>;
  verifyMessage: (messageId: string, model: string) => Promise<void>;
}

export const useMessageVerificationStore = create<MessageVerificationStore>(
  (set, get) => ({
    verifications: new Map(),

    verifyMessage: async (messageId: string, model: string) => {
      if (!messageId || !model) {
        return;
      }

      const state = get();
      const existing = state.verifications.get(messageId);

      // Don't verify if already verified or currently verifying
      if (existing?.signatureData || existing?.isVerifying) {
        return;
      }

      // Set verifying state
      const newVerifications = new Map(state.verifications);
      newVerifications.set(messageId, {
        isVerifying: true,
        signatureData: null,
        error: null,
      });
      set({ verifications: newVerifications });

      try {
        const response = await fetch(
          `${env.NEXT_PUBLIC_REDPILL_API_URL}/v1/signature/${messageId}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to get message signature: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();

        // Set success state
        const successVerifications = new Map(get().verifications);
        successVerifications.set(messageId, {
          isVerifying: false,
          signatureData: data as SignatureData,
          error: null,
        });
        set({ verifications: successVerifications });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to verify signature";
        console.error("Signature verification failed:", err);

        // Set error state
        const errorVerifications = new Map(get().verifications);
        errorVerifications.set(messageId, {
          isVerifying: false,
          signatureData: null,
          error: errorMessage,
        });
        set({ verifications: errorVerifications });
      }
    },
  }),
);
