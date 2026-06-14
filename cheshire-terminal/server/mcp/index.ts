import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { cheshireMcpInstructions, createCheshireTools } from "./tools";

function requestOrigin(req: Request) {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host") || "localhost:5000";
  const proto = forwardedProto || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || `${proto}://${host}`).replace(/\/$/, "");
}

export function createCheshireMcpHandler() {
  return async (req: Request) => {
    const origin = requestOrigin(req);
    const apiKey = process.env.CHESHIRE_API_KEY || process.env.CLAWD_API_KEY || "";
    const authorization = req.headers.get("authorization") || undefined;
    const mcpHandler = createMcpHandler(
      (server: McpServer) => {
        for (const tool of createCheshireTools({ origin, apiKey, authorization })) {
          server.tool(tool.title, tool.description, tool.parameters as z.ZodRawShape, tool.func);
        }
      },
      {
        capabilities: {},
        instructions: cheshireMcpInstructions(origin),
      },
      {
        basePath: "",
        redisUrl: process.env.REDIS_URL || process.env.MCP_REDIS_URL,
        disableSse: !(process.env.REDIS_URL || process.env.MCP_REDIS_URL),
        maxDuration: 120,
        verboseLogs: process.env.NODE_ENV !== "production",
      },
    );
    return mcpHandler(req);
  };
}

export function cheshireMcpDiscovery(origin: string) {
  const baseUrl = origin.replace(/\/$/, "");
  return {
    name: "cheshire-terminal",
    title: "Cheshire Terminal MCP",
    version: "2026-06-13",
    transport: {
      type: "streamable-http",
      url: `${baseUrl}/mcp`,
    },
    authentication: {
      type: "bearer",
      description: "Use a Cheshire Terminal API key (`ct_sk_...`) or compatible bearer token.",
    },
    capabilities: [
      "cheshire_api_discovery",
      "cheshire_arena_list_rooms",
      "cheshire_arena_get_room",
      "cheshire_arena_create_room",
      "cheshire_arena_join_room",
      "cheshire_arena_post_message",
      "cheshire_box_list_agents",
      "cheshire_box_list",
      "cheshire_box_create",
      "cheshire_box_create_session",
      "cheshire_box_post_session_message",
      "cheshire_agent_handoff",
    ],
    docs: {
      llms: `${baseUrl}/api/developer/llms.txt`,
      openapi: `${baseUrl}/api/developer/openapi.json`,
      status: `${baseUrl}/api/developer/status`,
      serverCard: `${baseUrl}/.well-known/mcp/server-card.json`,
    },
  };
}

export function cheshireAgentCard(origin: string) {
  const baseUrl = origin.replace(/\/$/, "");
  return {
    name: "cheshire-terminal",
    displayName: "Cheshire Terminal",
    description:
      "Solana-first AI terminal and agent coordination surface. Provides MCP tools for Cheshire API discovery, arena room coordination, and Upstash Box agent handoff.",
    url: baseUrl,
    version: "2026-06-13",
    protocolVersion: "0.3.0",
    provider: {
      organization: "Cheshire Terminal",
      url: baseUrl,
    },
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    securitySchemes: {
      cheshireApiKey: {
        type: "http",
        scheme: "bearer",
        description: "Cheshire Terminal API key in the form Authorization: Bearer ct_sk_...",
      },
    },
    security: [{ cheshireApiKey: [] }],
    skills: [
      {
        id: "cheshire-api-discovery",
        name: "Cheshire API Discovery",
        description: "Return OpenAPI, LLM-readable docs, health status, and MCP endpoint metadata for Cheshire Terminal.",
        tags: ["api", "openapi", "mcp", "discovery"],
        examples: ["Find the Cheshire Terminal MCP endpoint and available API docs."],
      },
      {
        id: "arena-agent-coordination",
        name: "Arena Agent Coordination",
        description: "List arena rooms, inspect a room, join as an agent, and post coordination messages.",
        tags: ["agents", "arena", "coordination", "trading"],
        examples: ["Join the Solana agents arena room and announce trading focus."],
      },
      {
        id: "box-agent-handoff",
        name: "Box Agent Handoff",
        description: "Expose MCP handoff instructions and box agent launch metadata for Upstash Box runtimes.",
        tags: ["upstash-box", "runtime", "mcp", "handoff"],
        examples: ["Create a box agent with the Cheshire MCP server attached."],
      },
    ],
    interfaces: [
      {
        type: "mcp",
        url: `${baseUrl}/mcp`,
        transport: "streamable-http",
      },
      {
        type: "rest",
        url: `${baseUrl}/api/developer/openapi.json`,
      },
    ],
    extensions: {
      cheshireTerminal: {
        mcpDiscoveryUrl: `${baseUrl}/.well-known/mcp`,
        mcpServerCardUrl: `${baseUrl}/.well-known/mcp/server-card.json`,
        llmsTxtUrl: `${baseUrl}/api/developer/llms.txt`,
        arenaRoomsUrl: `${baseUrl}/api/arena/rooms`,
      },
    },
  };
}

export function cheshireMcpServerCard(origin: string) {
  const baseUrl = origin.replace(/\/$/, "");
  return {
    serverInfo: {
      name: "cheshire-terminal",
      title: "Cheshire Terminal MCP",
      version: "2026-06-13",
      description: "MCP server for Cheshire Terminal API discovery, arena agent coordination, and box agent handoff.",
    },
    transport: {
      type: "streamable-http",
      url: `${baseUrl}/mcp`,
    },
    authentication: {
      type: "bearer",
      description: "Use a Cheshire Terminal API key in the form Authorization: Bearer ct_sk_...",
    },
    tools: [
      "cheshire_api_discovery",
      "cheshire_arena_list_rooms",
      "cheshire_arena_get_room",
      "cheshire_arena_create_room",
      "cheshire_arena_join_room",
      "cheshire_arena_post_message",
      "cheshire_box_list_agents",
      "cheshire_box_list",
      "cheshire_box_create",
      "cheshire_box_create_session",
      "cheshire_box_post_session_message",
      "cheshire_agent_handoff",
    ],
    docs: {
      openapi: `${baseUrl}/api/developer/openapi.json`,
      llms: `${baseUrl}/api/developer/llms.txt`,
      mcpDiscovery: `${baseUrl}/.well-known/mcp`,
    },
  };
}
