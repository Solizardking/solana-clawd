import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BACKROOM_BASE_URL = "/api/backroom";
const BACKROOM_CLIENT_NAME = "CheshireTerminal";

export type BackroomAgentId = 0 | 1 | 2 | 3;

export type BackroomStreamEvent =
  | { event: "connected" }
  | { event: "typing"; agent: BackroomAgentId }
  | {
      event: "message" | "human";
      agent: BackroomAgentId;
      name: string;
      content: string;
      turn?: number;
      optimistic?: boolean;
    };

export type BackroomMessageEvent = Extract<BackroomStreamEvent, { content: string }>;

function isBackroomMessageEvent(event: BackroomStreamEvent): event is BackroomMessageEvent {
  return event.event === "message" || event.event === "human";
}

function isBackroomStreamEvent(event: unknown): event is BackroomStreamEvent {
  if (!event || typeof event !== "object") return false;
  const candidate = event as Partial<BackroomStreamEvent>;
  if (candidate.event === "connected") return true;
  if (candidate.event === "typing") return typeof candidate.agent === "number";
  return (
    (candidate.event === "message" || candidate.event === "human") &&
    typeof candidate.agent === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.content === "string"
  );
}

export type BackroomStory = {
  slug: string;
  url: string;
  title: string;
  description?: string;
  scenario?: string;
  scraped_at?: string;
  content_chars?: number;
};

export type BackroomStatus = {
  running?: boolean;
  turn?: number;
  connected_clients?: number;
  queued_human_messages?: number;
};

type BackroomStoriesResponse = BackroomStory[] | { stories?: BackroomStory[] };

export type BackroomLoopResponse = {
  turns?: number;
  agents?: number;
  responses?: Array<{ turn?: number; agent?: BackroomAgentId; response?: string }>;
};

export type BackroomHealth = Record<string, unknown>;

export type BackroomDreamsStatus = {
  source?: string;
  story_count?: number;
  last_sync?: string;
  [key: string]: unknown;
};

export type BackroomConvexData = {
  messages: any[];
  agents: any[];
  perps: any[];
  pages: any[];
  jobs: any[];
};

export type BackroomConnectionState = "connecting" | "connected" | "disconnected" | "error";

const MAX_EVENTS = 160;

class BackroomUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackroomUnavailableError";
  }
}

function isBackroomUnavailableError(error: unknown): error is BackroomUnavailableError {
  return error instanceof BackroomUnavailableError;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.details === "string" && data.details.trim()) return data.details;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
  } catch {}
  return fallback;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const message = await readErrorMessage(response, `Backroom request failed: ${response.status}`);
    if (response.status === 503) {
      throw new BackroomUnavailableError(message);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function useBackroomStream() {
  const [connectionState, setConnectionState] = useState<BackroomConnectionState>("connecting");
  const [events, setEvents] = useState<BackroomStreamEvent[]>([]);
  const [typingAgent, setTypingAgent] = useState<BackroomAgentId | null>(null);
  const [stories, setStories] = useState<BackroomStory[]>([]);
  const [status, setStatus] = useState<BackroomStatus | null>(null);
  const [health, setHealth] = useState<BackroomHealth | null>(null);
  const [conversation, setConversation] = useState("");
  const [dreamsStatus, setDreamsStatus] = useState<BackroomDreamsStatus | null>(null);
  const [dreamContext, setDreamContext] = useState("");
  const [loopResult, setLoopResult] = useState<BackroomLoopResponse | null>(null);
  const [agentResponses, setAgentResponses] = useState<Record<1 | 2 | 3, string | null>>({
    1: null,
    2: null,
    3: null,
  });
  const [convexData, setConvexData] = useState<BackroomConvexData>({
    messages: [],
    agents: [],
    perps: [],
    pages: [],
    jobs: [],
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const markUnavailable = useCallback((message: string) => {
    setServiceUnavailable(true);
    setServiceMessage(message);
    setConnectionState("disconnected");
    setLastError(message);
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const messages = useMemo<BackroomMessageEvent[]>(
    () => events.filter(isBackroomMessageEvent),
    [events],
  );

  const appendEvent = useCallback((event: BackroomStreamEvent) => {
    setEvents((current) => [...current.slice(-(MAX_EVENTS - 1)), event]);
    if (event.event === "message" || event.event === "human") {
      setTypingAgent(null);
    }
    if ((event.event === "message" || event.event === "human") && typeof event.turn === "number") {
      setStatus((current) => ({ ...(current ?? {}), turn: Math.max(current?.turn ?? 0, event.turn ?? 0) }));
    }
  }, []);

  const refreshStories = useCallback(async () => {
    try {
      const nextStories = await readJson<BackroomStoriesResponse>(
        `${BACKROOM_BASE_URL}/firecrawl/dreams/stories?limit=25`,
      );
      setStories(Array.isArray(nextStories) ? nextStories : nextStories.stories ?? []);
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to load backroom stories");
    }
  }, [markUnavailable]);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await readJson<BackroomStatus>(`${BACKROOM_BASE_URL}/stream/status`);
      setStatus(nextStatus);
    } catch {
      // The stream is the primary status source; avoid noisy errors for this secondary poll.
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await readJson<BackroomHealth>(`${BACKROOM_BASE_URL}/healthz`));
      setServiceUnavailable(false);
      setServiceMessage(null);
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to load backroom health");
    }
  }, [markUnavailable]);

  const refreshConversation = useCallback(async () => {
    try {
      const response = await fetch(`${BACKROOM_BASE_URL}/conversation`);
      if (!response.ok) throw new Error(`Backroom conversation failed: ${response.status}`);
      setConversation(await response.text());
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to load conversation snapshot");
    }
  }, [markUnavailable]);

  const refreshDreamsMeta = useCallback(async () => {
    try {
      const [statusResult, contextResponse] = await Promise.all([
        readJson<BackroomDreamsStatus>(`${BACKROOM_BASE_URL}/firecrawl/dreams/status`),
        fetch(`${BACKROOM_BASE_URL}/firecrawl/dreams/context?max_chars=1800`),
      ]);
      setDreamsStatus(statusResult);
      if (contextResponse.ok) {
        setDreamContext(await contextResponse.text());
      }
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to load Dreams metadata");
    }
  }, [markUnavailable]);

  const refreshConvexData = useCallback(async () => {
    try {
      const [messagesRes, agentsRes, perpsRes, pagesRes, jobsRes] = await Promise.all([
        readJson<any>(`${BACKROOM_BASE_URL}/convex/messages?limit=30&sinceTurn=0`),
        readJson<any>(`${BACKROOM_BASE_URL}/convex/agents`),
        readJson<any>(`${BACKROOM_BASE_URL}/convex/perps`),
        readJson<any>(`${BACKROOM_BASE_URL}/convex/crawl/pages?source=dreams&limit=12`),
        readJson<any>(`${BACKROOM_BASE_URL}/convex/crawl/jobs?limit=8`),
      ]);

      const toArray = (value: any) => Array.isArray(value) ? value : value?.messages ?? value?.agents ?? value?.perps ?? value?.pages ?? value?.jobs ?? value?.data ?? [];
      setConvexData({
        messages: toArray(messagesRes),
        agents: toArray(agentsRes),
        perps: toArray(perpsRes),
        pages: toArray(pagesRes),
        jobs: toArray(jobsRes),
      });
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to load Convex backroom data");
    }
  }, [markUnavailable]);

  const refreshSnapshots = useCallback(async () => {
    setIsBusy(true);
    setLastError(null);
    try {
      if (serviceUnavailable) return;
      await Promise.all([
        refreshStatus(),
        refreshHealth(),
        refreshConversation(),
        refreshDreamsMeta(),
        refreshConvexData(),
      ]);
    } finally {
      setIsBusy(false);
    }
  }, [refreshConversation, refreshConvexData, refreshDreamsMeta, refreshHealth, refreshStatus]);

  const startStreamLoop = useCallback(async () => {
    setIsBusy(true);
    setLastError(null);
    try {
      if (serviceUnavailable) return;
      const response = await fetch(`${BACKROOM_BASE_URL}/stream/start`, { method: "POST" });
      if (!response.ok) {
        const message = await readErrorMessage(response, `Backroom start failed: ${response.status}`);
        if (response.status === 503) throw new BackroomUnavailableError(message);
        throw new Error(message);
      }
      await refreshStatus();
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to start backroom stream");
    } finally {
      setIsBusy(false);
    }
  }, [markUnavailable, refreshStatus, serviceUnavailable]);

  const runLoop = useCallback(async (turns = 3) => {
    setIsBusy(true);
    setLastError(null);
    try {
      if (serviceUnavailable) return;
      setLoopResult(await readJson<BackroomLoopResponse>(`${BACKROOM_BASE_URL}/loop?turns=${turns}`));
      await refreshStatus();
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to run loop snapshot");
    } finally {
      setIsBusy(false);
    }
  }, [markUnavailable, refreshStatus, serviceUnavailable]);

  const fetchAgentResponse = useCallback(async (agentId: 1 | 2 | 3) => {
    setIsBusy(true);
    setLastError(null);
    try {
      if (serviceUnavailable) return;
      const response = await fetch(`${BACKROOM_BASE_URL}/agent/${agentId}`);
      if (!response.ok) {
        const message = await readErrorMessage(response, `Agent ${agentId} failed: ${response.status}`);
        if (response.status === 503) throw new BackroomUnavailableError(message);
        throw new Error(message);
      }
      const text = await response.text();
      setAgentResponses((current) => ({ ...current, [agentId]: text }));
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : `Failed to fetch agent ${agentId}`);
    } finally {
      setIsBusy(false);
    }
  }, [markUnavailable, serviceUnavailable]);

  const triggerDreamsCrawl = useCallback(async () => {
    setIsBusy(true);
    setLastError(null);
    try {
      if (serviceUnavailable) return;
      const response = await fetch(`${BACKROOM_BASE_URL}/firecrawl/dreams`, { method: "POST" });
      if (!response.ok) {
        const message = await readErrorMessage(response, `Dreams crawl failed: ${response.status}`);
        if (response.status === 503) throw new BackroomUnavailableError(message);
        throw new Error(message);
      }
      await Promise.all([refreshStories(), refreshDreamsMeta()]);
    } catch (error) {
      if (isBackroomUnavailableError(error)) {
        markUnavailable(error.message);
        return;
      }
      setLastError(error instanceof Error ? error.message : "Failed to trigger Dreams crawl");
    } finally {
      setIsBusy(false);
    }
  }, [markUnavailable, refreshDreamsMeta, refreshStories, serviceUnavailable]);

  const sendHumanMessage = useCallback(
    async (content: string, name = BACKROOM_CLIENT_NAME) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const optimistic: BackroomStreamEvent = {
        event: "human",
        agent: 0,
        name,
        content: trimmed,
        optimistic: true,
      };

      setIsSending(true);
      setLastError(null);
      appendEvent(optimistic);

      try {
        if (serviceUnavailable) throw new BackroomUnavailableError(serviceMessage || "Backroom service is unavailable.");
        const response = await fetch(`${BACKROOM_BASE_URL}/stream/human`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, name }),
        });

        if (!response.ok) {
          const message = response.status === 429
            ? "The backroom interrupt queue is full."
            : await readErrorMessage(response, `Backroom rejected the message: ${response.status}`);
          if (response.status === 503) throw new BackroomUnavailableError(message);
          throw new Error(message);
        }
      } catch (error) {
        if (isBackroomUnavailableError(error)) {
          markUnavailable(error.message);
          return;
        }
        setLastError(error instanceof Error ? error.message : "Failed to send message");
      } finally {
        setIsSending(false);
      }
    },
    [appendEvent, markUnavailable, serviceMessage, serviceUnavailable],
  );

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;

    const connect = async () => {
      if (serviceUnavailable) {
        setConnectionState("disconnected");
        return;
      }
      try {
        await readJson<BackroomHealth>(`${BACKROOM_BASE_URL}/healthz`);
      } catch (error) {
        if (cancelled) return;
        if (isBackroomUnavailableError(error)) {
          markUnavailable(error.message);
          return;
        }
      }

      if (cancelled || serviceUnavailable) return;

      source = new EventSource(`${BACKROOM_BASE_URL}/stream`);
      eventSourceRef.current = source;
      setConnectionState("connecting");

      source.onopen = () => {
        setConnectionState("connected");
        setLastError(null);
      };

      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data);
          if (!isBackroomStreamEvent(event)) {
            setLastError("Received an unknown backroom event.");
            return;
          }
          if (event.event === "connected") {
            setConnectionState("connected");
            return;
          }
          if (event.event === "typing") {
            setTypingAgent(event.agent);
            return;
          }
          appendEvent(event);
        } catch {
          setLastError("Received an unreadable backroom event.");
        }
      };

      source.onerror = () => {
        setConnectionState(source?.readyState === EventSource.CLOSED ? "disconnected" : "error");
      };
    };

    void connect();

    return () => {
      cancelled = true;
      source?.close();
      eventSourceRef.current = null;
    };
  }, [appendEvent, markUnavailable, serviceUnavailable]);

  useEffect(() => {
    refreshStories();
    refreshStatus();
    refreshHealth();
    refreshDreamsMeta();
    refreshConvexData();
    const storyInterval = window.setInterval(refreshStories, 90_000);
    const statusInterval = window.setInterval(refreshStatus, 15_000);
    const convexInterval = window.setInterval(refreshConvexData, 30_000);

    return () => {
      window.clearInterval(storyInterval);
      window.clearInterval(statusInterval);
      window.clearInterval(convexInterval);
    };
  }, [refreshConvexData, refreshDreamsMeta, refreshHealth, refreshStatus, refreshStories]);

  return {
    agentResponses,
    conversation,
    convexData,
    connectionState,
    dreamContext,
    dreamsStatus,
    events,
    fetchAgentResponse,
    health,
    isBusy,
    isSending,
    lastError,
    serviceMessage,
    serviceUnavailable,
    loopResult,
    messages,
    refreshConversation,
    refreshConvexData,
    refreshDreamsMeta,
    refreshSnapshots,
    refreshStories,
    runLoop,
    sendHumanMessage,
    startStreamLoop,
    status,
    stories,
    triggerDreamsCrawl,
    typingAgent,
  };
}
