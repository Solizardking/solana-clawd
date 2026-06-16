"use client";

import type { ChatModelAdapter, ChatModelRunResult } from "@assistant-ui/react";
import { useEffect, useMemo } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { ChatRuntimeWrapper } from "@/components/chat-runtime-wrapper";
import { Header } from "@/components/header";
import { LeftSidebar } from "@/components/left-sidebar";
import { SettingSidebar } from "@/components/setting-sidebar";
import { UrlHashMessageHandler } from "@/components/url-hash-message-handler";
import { VerifierSidebar } from "@/components/verifier-sidebar";
import { RIGHT_PANEL_WIDTH, SIDEBAR_WIDTH } from "@/constants";
import { useChatKey } from "@/hooks/use-chat-key";
import { useChatLayout } from "@/hooks/use-chat-layout";
import { useChatSettings } from "@/hooks/use-chat-settings";
import {
  ChatStorageProvider,
  useChatStorageContext,
} from "@/lib/chat-storage-context";
import { createOpenAICompatibleAdapter } from "@/lib/openai-compatible-adapter";
import { useModelsStore } from "@/state/models";
import type { Model } from "@/types/model";

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === "object" && value !== null && Symbol.asyncIterator in value
  );
}

// Internal component that has access to ChatStorageContext
function ChatInterfaceInner({
  chatModelAdapter,
}: {
  chatModelAdapter: ChatModelAdapter;
}) {
  const { currentChat } = useChatStorageContext();

  const {
    isCompactLayout,
    isSidebarOpen,
    activeRightPanel,
    isRightPanelVisible,
    shouldShowOverlay,
    setIsSidebarOpen,
    toggleSidebar,
    toggleRightPanel,
    closeRightPanel,
  } = useChatLayout();

  return (
    <ChatRuntimeWrapper
      key={currentChat?.id}
      chatModelAdapter={chatModelAdapter}
    >
      <UrlHashMessageHandler />
      <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
        {shouldShowOverlay ? (
          <div
            aria-hidden
            className="fixed inset-0 z-20 bg-background/70 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => {
              setIsSidebarOpen(false);
              closeRightPanel();
            }}
          />
        ) : null}

        <LeftSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-250 ease-in-out"
          style={{
            marginLeft: !isCompactLayout && isSidebarOpen ? SIDEBAR_WIDTH : 0,
            marginRight:
              !isCompactLayout && isRightPanelVisible ? RIGHT_PANEL_WIDTH : 0,
          }}
        >
          <Header
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={toggleSidebar}
            activeRightPanel={activeRightPanel}
            onToggleSettings={() => toggleRightPanel("settings")}
            onToggleVerifier={() => toggleRightPanel("verifier")}
          />
          <Thread />
        </main>

        <SettingSidebar
          isVisible={activeRightPanel === "settings"}
          onClose={closeRightPanel}
        />
        <VerifierSidebar
          isVisible={activeRightPanel === "verifier"}
          onClose={closeRightPanel}
        />
      </div>
    </ChatRuntimeWrapper>
  );
}

interface ChatInterfaceProps {
  models: Model[];
  initialModel?: string;
}

export function ChatInterface({ models, initialModel }: ChatInterfaceProps) {
  const messagesInContext = useChatSettings((state) => state.messagesInContext);
  const responseLanguage = useChatSettings((state) => state.responseLanguage);
  const model = useChatSettings((state) => state.model);
  const temperature = useChatSettings((state) => state.temperature);
  const maxTokens = useChatSettings((state) => state.maxTokens);
  const setModel = useChatSettings((state) => state.setModel);
  const setModels = useModelsStore((state) => state.setModels);
  const availableModels = useModelsStore((state) => state.models);
  const { chatKey, isAuthenticated } = useChatKey();

  useEffect(() => {
    setModels(models);
  }, [models, setModels]);

  useEffect(() => {
    if (initialModel && models.length > 0) {
      const modelExists = models.some((m) => m.id === initialModel);
      if (modelExists) {
        setModel(initialModel);
      }
    }
  }, [initialModel, models, setModel]);

  const baseAdapter = useMemo<ChatModelAdapter>(() => {
    const apiKey = isAuthenticated && chatKey ? chatKey : "";
    return createOpenAICompatibleAdapter({
      model: model || undefined,
      apiKey,
    });
  }, [model, chatKey, isAuthenticated]);

  const chatModelAdapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run(args) {
        const { messages, context, config, ...rest } = args;

        const selectedModel = availableModels.find((m) => m.id === model);
        const modelProvider =
          selectedModel?.providers[0] ||
          model?.split("/")[0]?.trim() ||
          undefined;
        const modelIdentity = model
          ? `You are ${selectedModel?.name || model}, a large language model${
              modelProvider ? ` provided by ${modelProvider}` : ""
            }.`
          : undefined;

        const limitedMessages =
          typeof messagesInContext === "number" &&
          messagesInContext > 0 &&
          messages.length > messagesInContext
            ? messages.slice(-messagesInContext)
            : messages;

        const systemSegments: string[] = [];
        if (modelIdentity) {
          systemSegments.push(modelIdentity);
        }
        if (
          typeof context.system === "string" &&
          context.system.trim().length > 0
        ) {
          systemSegments.push(context.system.trim());
        }
        if (responseLanguage) {
          systemSegments.push(`Always respond in ${responseLanguage}.`);
        }

        const systemPrompt =
          systemSegments.length > 0
            ? systemSegments.join("\n\n")
            : context.system;

        const nextContext = {
          ...context,
          system: systemPrompt,
          callSettings: {
            ...context.callSettings,
            temperature,
            maxTokens,
          },
        };

        const nextConfig = {
          ...config,
          system: systemPrompt,
        };

        const result = baseAdapter.run({
          ...rest,
          context: nextContext,
          config: nextConfig,
          messages: limitedMessages,
        });

        if (isAsyncIterable<ChatModelRunResult>(result)) {
          for await (const chunk of result) {
            yield chunk;
          }
        } else {
          const resolved = await result;
          if (resolved) {
            yield resolved;
          }
        }
      },
    }),
    [
      availableModels,
      baseAdapter,
      messagesInContext,
      model,
      responseLanguage,
      temperature,
      maxTokens,
    ],
  );

  return (
    <ChatStorageProvider>
      <ChatInterfaceInner chatModelAdapter={chatModelAdapter} />
    </ChatStorageProvider>
  );
}
