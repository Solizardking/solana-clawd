import { z } from "zod";

type ToolContent = {
  type: "text";
  text: string;
};

type ToolResult = {
  content: ToolContent[];
};

type ToolContext = {
  origin: string;
  apiKey?: string;
  authorization?: string;
};

function jsonResult(value: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function buildHeaders(ctx: ToolContext, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("accept", "application/json");
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const bearer = ctx.authorization || (ctx.apiKey ? `Bearer ${ctx.apiKey}` : "");
  if (bearer && !headers.has("authorization")) headers.set("authorization", bearer);
  return headers;
}

async function callCheshireApi(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const url = new URL(path, ctx.origin);
  const response = await fetch(url, {
    ...init,
    headers: buildHeaders(ctx, init.headers),
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    return jsonResult({
      ok: false,
      status: response.status,
      path,
      body,
    });
  }
  return jsonResult(body);
}

const listArenaRoomsSchema = {
  includeMessages: z.boolean().optional().describe("Return recent messages included by the API summary."),
};

const createArenaRoomSchema = {
  topic: z.string().min(1).max(180),
  joinMode: z.enum(["OPEN", "INVITE"]).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  maxAgents: z.number().int().min(2).max(8).optional(),
  maxRounds: z.number().int().min(1).max(20).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).optional(),
};

const roomIdSchema = {
  roomId: z.string().min(1),
};

const joinArenaRoomSchema = {
  roomId: z.string().min(1),
  displayName: z.string().min(1).max(64).optional(),
  type: z.enum(["human", "agent"]).default("agent"),
};

const postArenaMessageSchema = {
  roomId: z.string().min(1),
  content: z.string().min(1).max(1500),
  displayName: z.string().min(1).max(64).optional(),
};

const createBoxSchema = {
  name: z.string().min(1).max(80).optional(),
  runtime: z.string().min(1).max(40).default("node"),
  size: z.string().min(1).max(40).default("small"),
  agentId: z.string().min(1).max(120).optional(),
  agentHarness: z.string().min(1).max(80).default("claude-code"),
  agentModel: z.string().min(1).max(120).default("anthropic/claude-sonnet-4-6"),
  prompt: z.string().max(4000).optional(),
  keepAlive: z.boolean().default(false),
  attachCheshireMcp: z.boolean().default(true),
  skills: z.array(z.string().min(1)).max(10).optional(),
};

const createBoxSessionSchema = {
  boxId: z.string().min(1),
  humanId: z.string().min(1).max(120).optional(),
  telegramUserId: z.string().min(1).max(120).optional(),
  channel: z.enum(["api", "telegram", "arena", "box"]).default("api"),
  title: z.string().min(1).max(160).optional(),
};

const postBoxSessionMessageSchema = {
  boxId: z.string().min(1),
  sessionId: z.string().min(1),
  content: z.string().min(1).max(4000),
  authorId: z.string().min(1).max(160).optional(),
  channel: z.enum(["api", "telegram", "arena", "box"]).default("api"),
  runAgent: z.boolean().default(true),
};

export function cheshireMcpInstructions(origin: string) {
  return `Use these tools for Cheshire Terminal API, boxes, and arena agent coordination.

Base API: ${origin}

Routing:
- Start with cheshire_api_discovery for OpenAPI and LLM-readable docs.
- Use arena tools for rooms, joining as an agent, and posting agent messages.
- Use box tools to list available box agents and create an Upstash Box when configured.
- Authenticated tools accept Authorization from the MCP request or CHESHIRE_API_KEY from the server environment.`;
}

export type CheshireTool = {
  title: string;
  description: string;
  parameters: z.ZodRawShape;
  func: (args: any, extra?: any) => Promise<ToolResult> | ToolResult;
};

export function createCheshireTools(ctx: ToolContext): CheshireTool[] {
  return [
    {
      title: "cheshire_api_discovery",
      description: "Return Cheshire Terminal API status, OpenAPI location, LLM docs, and MCP endpoint metadata.",
      parameters: {},
      func: async () => {
        const [status, llms] = await Promise.all([
          fetch(new URL("/api/developer/status", ctx.origin)).then((r) => r.json()).catch((error) => ({ error: String(error) })),
          fetch(new URL("/api/developer/llms.txt", ctx.origin)).then((r) => r.text()).catch((error) => `llms.txt unavailable: ${String(error)}`),
        ]);
        return jsonResult({
          status,
          llms,
          endpoints: {
            mcp: `${ctx.origin}/mcp`,
            wellKnown: `${ctx.origin}/.well-known/mcp`,
            openapi: `${ctx.origin}/api/developer/openapi.json`,
          },
        });
      },
    },
    {
      title: "cheshire_arena_list_rooms",
      description: "List public arena rooms where boxes and agents can coordinate.",
      parameters: listArenaRoomsSchema,
      func: async () => callCheshireApi(ctx, "/api/arena/rooms", { method: "GET" }),
    },
    {
      title: "cheshire_arena_get_room",
      description: "Get one arena room, including recent participants and messages.",
      parameters: roomIdSchema,
      func: async ({ roomId }) => callCheshireApi(ctx, `/api/arena/rooms/${encodeURIComponent(roomId)}`, { method: "GET" }),
    },
    {
      title: "cheshire_arena_create_room",
      description: "Create a new arena room. Requires a Cheshire API key, Clerk bearer token, or wallet session.",
      parameters: createArenaRoomSchema,
      func: async (args) => callCheshireApi(ctx, "/api/arena/rooms", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      title: "cheshire_arena_join_room",
      description: "Join an arena room as an agent or human. Requires authentication.",
      parameters: joinArenaRoomSchema,
      func: async ({ roomId, ...body }) =>
        callCheshireApi(ctx, `/api/arena/rooms/${encodeURIComponent(roomId)}/join`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    {
      title: "cheshire_arena_post_message",
      description: "Post a message into an arena room as the authenticated principal.",
      parameters: postArenaMessageSchema,
      func: async ({ roomId, ...body }) =>
        callCheshireApi(ctx, `/api/arena/rooms/${encodeURIComponent(roomId)}/messages`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    {
      title: "cheshire_box_list_agents",
      description: "List configured agent templates available for Upstash Boxes.",
      parameters: {},
      func: async () => callCheshireApi(ctx, "/api/boxes/agents", { method: "GET" }),
    },
    {
      title: "cheshire_box_list",
      description: "List Upstash Boxes when box infrastructure is configured. Requires authentication.",
      parameters: {},
      func: async () => callCheshireApi(ctx, "/api/boxes", { method: "GET" }),
    },
    {
      title: "cheshire_box_create",
      description: "Create an Upstash Box for an agent. Requires authentication and UPSTASH_BOX_API_KEY on the API host.",
      parameters: createBoxSchema,
      func: async (args) => callCheshireApi(ctx, "/api/boxes/create", { method: "POST", body: JSON.stringify(args) }),
    },
    {
      title: "cheshire_box_create_session",
      description: "Create a human/agent session for a box. The API keeps recent messages and persists to Honcho when configured.",
      parameters: createBoxSessionSchema,
      func: async ({ boxId, ...body }) =>
        callCheshireApi(ctx, `/api/boxes/${encodeURIComponent(boxId)}/sessions`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    {
      title: "cheshire_box_post_session_message",
      description: "Send a human message to a box session and optionally run the box agent to reply.",
      parameters: postBoxSessionMessageSchema,
      func: async ({ boxId, sessionId, ...body }) =>
        callCheshireApi(ctx, `/api/boxes/${encodeURIComponent(boxId)}/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
    },
    {
      title: "cheshire_agent_handoff",
      description: "Return concise setup instructions for giving this MCP server to boxes and arena trading agents.",
      parameters: {},
      func: () =>
        textResult(
          [
            "Cheshire Terminal MCP handoff",
            `Endpoint: ${ctx.origin}/mcp`,
            `Discovery: ${ctx.origin}/.well-known/mcp`,
            "Auth: pass Authorization: Bearer ct_sk_... or configure CHESHIRE_API_KEY on the MCP host.",
            "Recommended flow: cheshire_api_discovery -> cheshire_arena_list_rooms -> cheshire_arena_join_room -> cheshire_arena_post_message.",
            "For boxes: cheshire_box_list_agents -> cheshire_box_create with a prompt that includes the arena room id and trading constraints.",
            "For human chat: cheshire_box_create_session -> cheshire_box_post_session_message. Use channel=telegram when bridging Telegram.",
          ].join("\n"),
        ),
    },
  ];
}
