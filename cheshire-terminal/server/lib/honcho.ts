/**
 * Shared Honcho client: persistent memory for conversations, agents, arena
 * decisions, wallet sessions, and trading events.
 *
 * Helpers are intentionally graceful. If Honcho is not configured or the API is
 * unavailable, they no-op so product flows keep working.
 */

import { Honcho, type MessageInput } from "@honcho-ai/sdk";

export const HONCHO_WS_ID = process.env.HONCHO_WORKSPACE_ID || "cheshireterminal";
const ASSISTANT_PEER_ID = "clawd-assistant";

let client: Honcho | null | undefined;

function honchoClient(): Honcho | null {
  if (!process.env.HONCHO_API_KEY) return null;
  if (client !== undefined) return client;
  client = new Honcho({
    apiKey: process.env.HONCHO_API_KEY,
    workspaceId: HONCHO_WS_ID,
    baseURL: process.env.HONCHO_URL,
    timeout: 6_000,
    maxRetries: 1,
  });
  return client;
}

export function honchoPeerId(input: {
  walletAddress?: string | null;
  telegramId?: string | number | null;
  sessionId?: string | null;
  agentId?: string | null;
}) {
  const wallet = input.walletAddress?.trim();
  if (wallet) return `wallet:${wallet}`;
  if (input.telegramId != null && String(input.telegramId).trim()) return `telegram:${String(input.telegramId).trim()}`;
  if (input.agentId?.trim()) return `agent:${input.agentId.trim()}`;
  if (input.sessionId?.trim()) return `session:${input.sessionId.trim()}`;
  return "anonymous";
}

export function honchoSessionId(scope: string, id: string | number | null | undefined) {
  const normalized = String(id ?? "global")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "-")
    .slice(0, 160);
  return `${scope}:${normalized || "global"}`;
}

export async function honchoFetch(_path: string, _options: RequestInit = {}) {
  // Kept for existing health checks. The SDK owns the actual API shape.
  const honcho = honchoClient();
  if (!honcho) return null;
  try {
    return await honcho.getMetadata();
  } catch {
    return null;
  }
}

export async function honchoEnsurePeer(peerId: string) {
  const honcho = honchoClient();
  if (!honcho) return null;
  try {
    return await honcho.peer(peerId);
  } catch {
    return null;
  }
}

export async function honchoEnsureSession(sessionId: string) {
  const honcho = honchoClient();
  if (!honcho) return null;
  try {
    return await honcho.session(sessionId);
  } catch {
    return null;
  }
}

export async function honchoAddMessages(
  sessionId: string,
  peerId: string,
  messages: { role: "user" | "assistant"; content: string; metadata?: Record<string, unknown> }[],
) {
  const honcho = honchoClient();
  if (!honcho || !messages.length) return null;

  try {
    const [peer, assistant] = await Promise.all([
      honcho.peer(peerId, { metadata: { source: "cheshireterminal" } }),
      honcho.peer(ASSISTANT_PEER_ID, { metadata: { source: "cheshireterminal", role: "assistant" } }),
    ]);
    const session = await honcho.session(sessionId, {
      metadata: { source: "cheshireterminal" },
      peers: [peer, assistant],
    } as any);
    const honchoMessages: MessageInput[] = messages.map((message) => {
      const sender = message.role === "assistant" ? assistant : peer;
      return sender.message(message.content, {
        metadata: message.metadata ?? {},
      });
    });
    return await session.addMessages(honchoMessages);
  } catch {
    return null;
  }
}

export async function honchoGetContext(
  sessionId: string,
  peerId: string,
  tokens = 2_000,
): Promise<{ messages: unknown[]; summary: string } | null> {
  const honcho = honchoClient();
  if (!honcho) return null;
  try {
    const session = await honcho.session(sessionId);
    const context = await session.context({ peerPerspective: peerId, tokens });
    return {
      messages: [],
      summary: String(context ?? ""),
    };
  } catch {
    return null;
  }
}

export async function honchoInsight(peerId: string, query: string): Promise<string> {
  const honcho = honchoClient();
  if (!honcho) return "";
  try {
    const peer = await honcho.peer(peerId);
    return (await peer.chat(query, { reasoningLevel: "low" })) ?? "";
  } catch {
    return "";
  }
}

export async function honchoLogEvent(input: {
  peerId: string;
  sessionId: string;
  role?: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  return honchoAddMessages(input.sessionId, input.peerId, [{
    role: input.role ?? "user",
    content: input.content,
    metadata: input.metadata,
  }]);
}

export async function honchoLogTrade(
  walletAddress: string,
  trade: {
    sessionId?: string;
    symbol: string;
    mint: string;
    side: "buy" | "sell";
    amountInRaw?: number | string;
    amountOut?: number | null;
    notionalUsd?: number | null;
    txSignature?: string;
    source?: "clawd" | "mirror" | "jupiter" | "dflow" | "telegram" | "arena";
  },
) {
  const peerId = honchoPeerId({ walletAddress });
  const sessionId = trade.sessionId || honchoSessionId("trades", walletAddress);
  const tradeContent = [
    `Executed trade: ${trade.side.toUpperCase()} ${trade.symbol}`,
    trade.mint ? `mint=${trade.mint}` : "",
    trade.amountInRaw != null ? `amountInRaw=${trade.amountInRaw}` : "",
    trade.amountOut != null ? `amountOut=${trade.amountOut}` : "",
    trade.notionalUsd != null ? `notionalUsd=${Number(trade.notionalUsd).toFixed(2)}` : "",
    trade.txSignature ? `tx=${trade.txSignature}` : "",
    trade.source ? `source=${trade.source}` : "",
  ].filter(Boolean).join(" | ");

  return honchoLogEvent({
    peerId,
    sessionId,
    content: tradeContent,
    metadata: { type: "trade", ...trade },
  });
}

export async function honchoLogAgent(
  walletAddress: string,
  agent: {
    id: string;
    name: string;
    type: string;
    personality?: string;
    complexity?: number;
    description?: string;
  },
) {
  const peerId = honchoPeerId({ walletAddress });
  const content = [
    `Agent created: ${agent.name} (${agent.type})`,
    agent.personality ? `personality=${agent.personality}` : "",
    agent.complexity != null ? `complexity=${agent.complexity}/10` : "",
    agent.description ? `description=${agent.description.slice(0, 240)}` : "",
    `id=${agent.id}`,
  ].filter(Boolean).join(" | ");

  return honchoLogEvent({
    peerId,
    sessionId: honchoSessionId("agents", walletAddress),
    content,
    metadata: { ...agent, type: "agent_created", agentType: agent.type },
  });
}
