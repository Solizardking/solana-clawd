import {
  ActionBarPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  type ReasoningMessagePartComponent,
  type ThreadMessage,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Brain,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldCheck,
  Square,
} from "lucide-react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { ComposerControls } from "@/components/assistant-ui/composer-controls";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { MessageVerificationDialog } from "@/components/message-verification-dialog";
import { Button } from "@/components/ui/button";
import { useAssistantBranchHistory } from "@/hooks/use-assistant-branch-history";
import { useChatKey } from "@/hooks/use-chat-key";
import { useMessageVerification } from "@/hooks/use-message-verification";
import { useMessageVerificationStore } from "@/state/message-verification";
import { useModelsStore } from "@/state/models";
import { cn } from "@/lib/utils";

interface MessageWithCustomMetadata {
  metadata?: {
    custom?: {
      messageId?: string;
      model?: string;
    };
  };
}

export const Thread: FC = () => {
  useAssistantBranchHistory();

  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <ThreadPrimitive.Root
          className="aui-root aui-thread-root @container flex h-full w-full flex-col bg-background"
          style={{
            ["--thread-max-width" as string]: "44rem",
          }}
        >
          <ThreadPrimitive.Viewport className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-4">
            <ThreadWelcome />

            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                EditComposer,
                AssistantMessage,
              }}
            />
            <ThreadPrimitive.If empty={false}>
              <div className="aui-thread-viewport-spacer min-h-8 grow" />
            </ThreadPrimitive.If>
            <Composer />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </MotionConfig>
    </LazyMotion>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  return (
    <ThreadPrimitive.Empty>
      <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
        <div className="aui-thread-welcome-center flex w-full flex-grow flex-col items-center justify-center">
          <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-8">
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="aui-thread-welcome-message-motion-1 text-2xl font-semibold"
            >
              Hello there!
            </m.div>
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.1 }}
              className="aui-thread-welcome-message-motion-2 text-2xl text-muted-foreground/65"
            >
              How can I help you today?
            </m.div>
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};

const ThreadWelcomeSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full gap-2 @md:grid-cols-2">
      {[
        {
          title: "What's the weather",
          label: "in San Francisco?",
          action: "What's the weather in San Francisco?",
        },
        {
          title: "Explain React hooks",
          label: "like useState and useEffect",
          action: "Explain React hooks like useState and useEffect",
        },
        {
          title: "Write a SQL query",
          label: "to find top customers",
          action: "Write a SQL query to find top customers",
        },
        {
          title: "Create a meal plan",
          label: "for healthy weight loss",
          action: "Create a meal plan for healthy weight loss",
        },
      ].map((suggestedAction, index) => (
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.05 * index }}
          key={`suggested-action-${suggestedAction.title}-${index}`}
          className="aui-thread-welcome-suggestion-display [&:nth-child(n+3)]:hidden @md:[&:nth-child(n+3)]:block"
        >
          <ThreadPrimitive.Suggestion
            prompt={suggestedAction.action}
            method="replace"
            autoSend
            asChild
          >
            <Button
              variant="ghost"
              className="aui-thread-welcome-suggestion h-auto w-full flex-1 flex-wrap items-start justify-start gap-1 rounded-3xl border px-5 py-4 text-left text-sm @md:flex-col dark:hover:bg-accent/60"
              aria-label={suggestedAction.action}
            >
              <span className="aui-thread-welcome-suggestion-text-1 font-medium">
                {suggestedAction.title}
              </span>
              <span className="aui-thread-welcome-suggestion-text-2 text-muted-foreground">
                {suggestedAction.label}
              </span>
            </Button>
          </ThreadPrimitive.Suggestion>
        </m.div>
      ))}
    </div>
  );
};

const Composer: FC = () => {
  const { isLoading } = useChatKey();

  return (
    <div className="aui-composer-wrapper sticky bottom-0 mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 overflow-visible rounded-t-3xl bg-background pb-4 md:pb-6">
      <ThreadScrollToBottom />
      <ThreadPrimitive.Empty>
        <ThreadWelcomeSuggestions />
      </ThreadPrimitive.Empty>
      <ComposerControls />
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col rounded-3xl border border-border bg-muted px-1 pt-2 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-muted-foreground/15">
        <ComposerAttachments />
        <ComposerPrimitive.Input
          placeholder="Send a message..."
          className="aui-composer-input mb-1 max-h-32 min-h-16 w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-base outline-none placeholder:text-muted-foreground focus:outline-primary"
          rows={1}
          autoFocus={!isLoading}
          aria-label="Message input"
          disabled={isLoading}
        />
        <ComposerAction />
      </ComposerPrimitive.Root>
    </div>
  );
};

const ComposerAction: FC = () => {
  const { isLoading } = useChatKey();

  return (
    <div className="aui-composer-action-wrapper relative mx-1 mt-2 mb-2 flex items-center justify-between">
      <ComposerAddAttachment />

      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send message"
            side="bottom"
            type="submit"
            variant="default"
            size="icon"
            className="aui-composer-send size-[34px] rounded-full p-1"
            aria-label="Send message"
            disabled={isLoading}
          >
            <ArrowUpIcon className="aui-composer-send-icon size-5" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>

      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-[34px] rounded-full border border-muted-foreground/60 hover:bg-primary/75 dark:border-muted-foreground/90"
            aria-label="Stop generating"
          >
            <Square className="aui-composer-cancel-icon size-3.5 fill-white dark:fill-black" />
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-assistant-message-root relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in py-4 duration-200 fade-in slide-in-from-bottom-1 last:mb-24"
        data-role="assistant"
      >
        <div className="aui-assistant-message-content mx-2 leading-7 break-words text-foreground">
          <MessagePrimitive.Parts
            components={{
              Text: MarkdownText,
              Reasoning: AssistantReasoning,
              tools: { Fallback: ToolFallback },
            }}
          />
          <MessageError />
        </div>

        <div className="aui-assistant-message-footer mt-2 ml-2 flex">
          <BranchPicker />
          <AssistantActionBar />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const message = useMessage((m) => m);
  const { verifyMessage } = useMessageVerification();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const models = useModelsStore((state) => state.models);

  const messageCustom = (message as ThreadMessage & MessageWithCustomMetadata)
    ?.metadata?.custom;
  const messageId = messageCustom?.messageId;
  const messageModel = messageCustom?.model;

  // Check if the message was generated with a GPU TEE model
  const messageModelInfo = messageModel
    ? models.find((m) => m.id === messageModel)
    : null;
  const canVerifyMessage =
    messageModelInfo?.providers.includes("phala") ?? false;

  const verificationState = useMessageVerificationStore((state) =>
    messageId ? state.verifications.get(messageId) : undefined,
  );

  const { isVerifying, signatureData, error } = verificationState || {
    isVerifying: false,
    signatureData: null,
    error: null,
  };

  // Track previous completion status to detect status change
  const prevMessageStatusRef = useRef(message.status?.type);

  useEffect(() => {
    const currentStatus = message.status?.type;
    const prevStatus = prevMessageStatusRef.current;
    const justCompleted =
      prevStatus !== "complete" && currentStatus === "complete";
    const hasNoVerificationAttempt = !verificationState;

    // Only trigger verification when message just completed and can be verified
    if (
      justCompleted &&
      messageId &&
      hasNoVerificationAttempt &&
      canVerifyMessage
    ) {
      verifyMessage(messageId);
    }

    // Update previous status
    prevMessageStatusRef.current = currentStatus;
  }, [
    message.status?.type,
    messageId,
    verificationState,
    verifyMessage,
    canVerifyMessage,
  ]);

  return (
    <>
      <ActionBarPrimitive.Root
        hideWhenRunning
        autohide="not-last"
        autohideFloat="single-branch"
        className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
      >
        <ActionBarPrimitive.Copy asChild>
          <TooltipIconButton tooltip="Copy">
            <MessagePrimitive.If copied>
              <CheckIcon />
            </MessagePrimitive.If>
            <MessagePrimitive.If copied={false}>
              <CopyIcon />
            </MessagePrimitive.If>
          </TooltipIconButton>
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload asChild>
          <TooltipIconButton tooltip="Refresh">
            <RefreshCwIcon />
          </TooltipIconButton>
        </ActionBarPrimitive.Reload>
        {messageId && (
          <TooltipIconButton
            tooltip={
              isVerifying
                ? "Verifying message"
                : signatureData && !error
                  ? "Message verified"
                  : error
                    ? "Message verification failed"
                    : "Verify message"
            }
            onClick={() => setIsDialogOpen(true)}
            disabled={!canVerifyMessage}
            className={cn(
              isVerifying && "animate-spin",
              signatureData && !error && "text-green-600",
            )}
          >
            {isVerifying ? <RefreshCwIcon /> : <ShieldCheck />}
          </TooltipIconButton>
        )}
      </ActionBarPrimitive.Root>

      <MessageVerificationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        messageId={messageId || null}
      />
    </>
  );
};

const AssistantReasoning: ReasoningMessagePartComponent = ({ text }) => {
  const trimmed = text?.trim() ?? "";
  const [isExpanded, setIsExpanded] = useState(true);
  const [thinkingDuration, setThinkingDuration] = useState<
    number | undefined
  >();

  const message = useMessage((m) => m);
  const thinkingStartTimeRef = useRef<number | undefined>(undefined);

  // Track thinking state: starts when reasoning appears, ends when text content appears
  useEffect(() => {
    const hasReasoningText = Boolean(trimmed);
    const hasTextContent =
      message.content?.some((part) => part.type === "text") ?? false;

    // Start timing when reasoning first appears
    if (hasReasoningText && !thinkingStartTimeRef.current) {
      thinkingStartTimeRef.current = Date.now();
    }

    // Calculate duration when text content appears (reasoning -> text transition)
    if (
      hasReasoningText &&
      hasTextContent &&
      thinkingStartTimeRef.current !== undefined &&
      thinkingDuration === undefined
    ) {
      const duration = (Date.now() - thinkingStartTimeRef.current) / 1000;
      setThinkingDuration(duration);
    }
  }, [trimmed, message.content, thinkingDuration]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (!trimmed) return null;

  const isThinking = Boolean(trimmed) && thinkingDuration === undefined;
  const shouldShowDuration =
    thinkingDuration !== undefined && thinkingDuration > 0;

  return (
    <div className="aui-assistant-reasoning mb-5 w-full rounded-xl border border-border/60 bg-muted/40">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/60 transition-colors rounded-t-xl"
        aria-expanded={isExpanded}
        aria-label={
          isExpanded ? "Collapse reasoning details" : "Expand reasoning details"
        }
      >
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" aria-hidden />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold">
              {isThinking ? "Thinking" : "Thought"}
            </span>
            {shouldShowDuration && thinkingDuration !== undefined && (
              <span className="font-normal opacity-70 ml-1">
                for {formatDuration(thinkingDuration)}
              </span>
            )}
          </span>
          {isThinking && (
            <div className="inline-flex items-center space-x-1 ml-1">
              <div className="h-1 w-1 bg-muted-foreground/60 animate-bounce rounded-full [animation-delay:0ms]" />
              <div className="h-1 w-1 bg-muted-foreground/60 animate-bounce rounded-full [animation-delay:150ms]" />
              <div className="h-1 w-1 bg-muted-foreground/60 animate-bounce rounded-full [animation-delay:300ms]" />
            </div>
          )}
        </div>
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform duration-200 text-muted-foreground",
            isExpanded ? "rotate-180" : "rotate-0",
          )}
        />
      </button>
      {isExpanded && (
        <div className="aui-assistant-reasoning-body border-t border-border/60 px-4 py-3 font-mono text-xs leading-6 text-muted-foreground whitespace-pre-wrap">
          {trimmed}
        </div>
      )}
    </div>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root asChild>
      <div
        className="aui-user-message-root mx-auto grid w-full max-w-[var(--thread-max-width)] animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 py-4 duration-200 fade-in slide-in-from-bottom-1 first:mt-3 last:mb-5 [&:where(>*)]:col-start-2"
        data-role="user"
      >
        <UserMessageAttachments />

        <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
          <div className="aui-user-message-content rounded-3xl bg-muted px-5 py-2.5 break-words text-foreground">
            <MessagePrimitive.Parts />
          </div>
          <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
            <UserActionBar />
          </div>
        </div>

        <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </div>
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit p-4">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <div className="aui-edit-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-col gap-4 px-2 first:mt-4">
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-7/8 flex-col rounded-xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input flex min-h-[60px] w-full resize-none bg-transparent p-4 text-foreground outline-none"
          autoFocus
        />

        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center justify-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" aria-label="Cancel edit">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" aria-label="Update message">
              Update
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </div>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-xs text-muted-foreground",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
