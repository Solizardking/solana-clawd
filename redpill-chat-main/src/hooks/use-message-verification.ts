import { useCallback } from "react";
import { useChatSettings } from "@/hooks/use-chat-settings";
import { useMessageVerificationStore } from "@/state/message-verification";

interface UseMessageVerificationReturn {
  verifyMessage: (messageId: string) => Promise<void>;
}

export function useMessageVerification(): UseMessageVerificationReturn {
  const { model } = useChatSettings();
  const { verifyMessage } = useMessageVerificationStore();

  const verifyMessageCallback = useCallback(
    async (messageId: string) => {
      if (!model) return;
      await verifyMessage(messageId, model);
    },
    [model, verifyMessage],
  );

  return {
    verifyMessage: verifyMessageCallback,
  };
}
