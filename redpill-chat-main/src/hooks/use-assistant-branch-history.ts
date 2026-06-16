import type {
  MessageStatus,
  ThreadAssistantMessage,
  ThreadAssistantMessagePart,
} from "@assistant-ui/react";
import { useAssistantApi } from "@assistant-ui/react";
import { useEffect, useRef } from "react";

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

type AssistantSnapshot = {
  sourceId: string;
  parentId: string | null;
  content: readonly ThreadAssistantMessagePart[];
  metadata: ThreadAssistantMessage["metadata"];
  status: MessageStatus;
  createdAt: string;
  messageId: string;
};

type SnapshotMap = Map<string, Map<string, AssistantSnapshot>>;

type PendingRestore = {
  parentKey: string;
} | null;

const getParentKey = (parentId: string | null) => parentId ?? "root";

export const useAssistantBranchHistory = () => {
  const api = useAssistantApi();
  const snapshotsRef = useRef<SnapshotMap>(new Map());
  const pendingRestoreRef = useRef<PendingRestore>(null);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    const handleUpdate = () => {
      const thread = api.thread();
      const state = thread.getState();
      const { messages, isRunning } = state;

      for (const message of messages) {
        if (message.role !== "assistant") continue;
        if (message.status.type === "running") continue;

        const parentKey = getParentKey(message.parentId);
        const branchSourceId =
          (message.metadata.custom?.branchSourceId as string | undefined) ??
          message.id;

        let parentSnapshots = snapshotsRef.current.get(parentKey);
        if (!parentSnapshots) {
          parentSnapshots = new Map();
          snapshotsRef.current.set(parentKey, parentSnapshots);
        }

        const existing = parentSnapshots.get(branchSourceId);
        if (!existing || existing.messageId !== message.id) {
          parentSnapshots.set(branchSourceId, {
            sourceId: branchSourceId,
            parentId: message.parentId ?? null,
            content: clone(message.content),
            metadata: clone(message.metadata),
            status: clone(message.status),
            createdAt: message.createdAt.toISOString(),
            messageId: message.id,
          });
        }
      }

      if (!wasRunningRef.current && isRunning) {
        const runningMessage = [...messages]
          .reverse()
          .find((m) => m.role === "assistant" && m.status.type === "running");

        if (runningMessage) {
          const parentKey = getParentKey(runningMessage.parentId);
          pendingRestoreRef.current = { parentKey };
        } else {
          pendingRestoreRef.current = null;
        }
      }

      if (wasRunningRef.current && !isRunning) {
        const pending = pendingRestoreRef.current;
        pendingRestoreRef.current = null;

        const latestAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant");
        const latestAssistantId = latestAssistant?.id;

        if (pending && latestAssistantId) {
          const parentSnapshots = snapshotsRef.current.get(pending.parentKey);
          const snapshots = parentSnapshots
            ? Array.from(parentSnapshots.values()).filter(
                (snapshot) => snapshot.messageId !== latestAssistantId,
              )
            : [];

          if (snapshots.length > 0) {
            const sortedSnapshots = [...snapshots].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            );

            const repository = thread.export();
            const reorderedMessages: typeof repository.messages = [];
            let inserted = false;

            for (const entry of repository.messages) {
              const isLatestAssistant =
                entry.message.role === "assistant" &&
                entry.message.id === latestAssistantId;

              if (!inserted && isLatestAssistant) {
                for (const snapshot of sortedSnapshots) {
                  reorderedMessages.push({
                    parentId: snapshot.parentId,
                    message: {
                      id: snapshot.messageId,
                      role: "assistant",
                      content: clone(snapshot.content),
                      status: clone(snapshot.status),
                      metadata: {
                        ...clone(snapshot.metadata),
                        custom: {
                          ...clone(snapshot.metadata.custom ?? {}),
                          branchSourceId: snapshot.sourceId,
                        },
                      },
                      createdAt: new Date(snapshot.createdAt),
                    } satisfies ThreadAssistantMessage,
                  });
                }
                inserted = true;
              }

              reorderedMessages.push(entry);
            }

            if (inserted) {
              thread.import({
                headId: repository.headId,
                messages: reorderedMessages,
              });
            }
          }
        }

        if (latestAssistantId) {
          setTimeout(() => {
            try {
              thread
                .message({ id: latestAssistantId })
                .switchToBranch({ branchId: latestAssistantId });
            } catch (error) {
              console.warn("Failed to switch back to latest branch", error);
            }
          }, 0);
        }
      }

      wasRunningRef.current = isRunning;
    };

    handleUpdate();

    const unsubscribe = api.subscribe(handleUpdate);

    return () => {
      unsubscribe();
    };
  }, [api]);
};
