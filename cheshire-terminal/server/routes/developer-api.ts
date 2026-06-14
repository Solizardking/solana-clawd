import { eq } from "drizzle-orm";
import { Router, type Response } from "express";
import { z } from "zod";
import { apiKeyAuditLog, apiKeys } from "../../drizzle/schema";
import { db, hasDatabase } from "../db";
import {
  createApiKeySecret,
  getApiKeyPrefix,
  hashApiKey,
  getClerkBearerConfig,
  listUserApiKeys,
  requireApiPrincipal,
  resolveApiPrincipal,
} from "../lib/api-auth";

const router = Router();

const createKeySchema = z.object({
  name: z.string().trim().min(1).max(128),
  scopes: z.array(z.string().trim().min(1).max(128)).max(50).default(["api:*"]),
  agentWalletId: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function publicOrigin() {
  return (
    process.env.APP_ORIGIN ||
    process.env.VITE_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "https://cheshireterminal.ai"
  ).replace(/\/$/, "");
}

function databaseUnavailable(res: Response) {
  return res.status(503).json({ error: "Developer API key storage is not configured." });
}

function integrationStatus() {
  return {
    telegram: {
      configured: Boolean(process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_LOGIN_BOT_TOKEN),
      status: "/api/telegram/status",
      config: "/api/telegram/config",
    },
    honcho: {
      configured: Boolean(process.env.HONCHO_API_KEY),
      workspaceId: process.env.HONCHO_WORKSPACE_ID || "cheshireterminal",
      persistence: "telegram, arena, agent, wallet, and trade memory",
    },
    birdeye: {
      configured: Boolean(process.env.BIRDEYE_API_KEY),
      usage: "market data, token analytics, wallet intelligence, perps, and Telegram trading commands",
    },
  };
}

function openApiDocument() {
  const origin = publicOrigin();
  return {
    openapi: "3.1.0",
    info: {
      title: "Cheshire Terminal API",
      version: "2026-06-13",
      summary: "API for Cheshire Terminal users, developers, and agents.",
      description:
        "Authenticate with a Clerk bearer JWT, a Cheshire Terminal API key, or a first-party wallet session cookie.",
    },
    servers: [{ url: origin }],
    security: [{ ClerkBearer: [] }, { CheshireApiKey: [] }, { CheshireApiKeyHeader: [] }],
    components: {
      securitySchemes: {
        ClerkBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Clerk JWT from the hosted account portal.",
        },
        CheshireApiKey: {
          type: "http",
          scheme: "bearer",
          description: "Cheshire API key in the form `Authorization: Bearer ct_sk_...`.",
        },
        CheshireApiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Cheshire API key in the form `x-api-key: ct_sk_...`.",
        },
      },
      schemas: {
        DeveloperStatus: {
          type: "object",
          required: ["status", "name", "origin", "auth", "integrations", "routes"],
          properties: {
            status: { type: "string", enum: ["ok"] },
            name: { type: "string" },
            origin: { type: "string", format: "uri" },
            auth: { type: "object" },
            integrations: { type: "object" },
            principal: { type: ["object", "null"] },
            routes: { type: "object" },
          },
        },
        ApiKeyRecord: {
          type: "object",
          required: ["id", "name", "keyPrefix", "scopes", "createdAt"],
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            keyPrefix: { type: "string" },
            scopes: { type: "array", items: { type: "string" } },
            agentWalletId: { type: ["integer", "null"] },
            lastUsedAt: { type: ["string", "null"], format: "date-time" },
            expiresAt: { type: ["string", "null"], format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CreateApiKeyRequest: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            scopes: { type: "array", items: { type: "string" }, default: ["api:*"] },
            agentWalletId: { type: ["integer", "null"] },
            expiresAt: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
    paths: {
      "/api/developer/status": {
        get: {
          operationId: "getDeveloperApiStatus",
          summary: "Read Cheshire Terminal API status and auth configuration.",
          security: [],
          responses: {
            "200": {
              description: "API status.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/DeveloperStatus" } },
              },
            },
          },
        },
      },
      "/api/developer/openapi.json": {
        get: {
          operationId: "getOpenApiDocument",
          summary: "Read the OpenAPI document.",
          security: [],
          responses: { "200": { description: "OpenAPI 3.1 document." } },
        },
      },
      "/api/developer/llms.txt": {
        get: {
          operationId: "getLlmsText",
          summary: "Read LLM-oriented API discovery text.",
          security: [],
          responses: { "200": { description: "Plain text LLM API index." } },
        },
      },
      "/api/developer/keys": {
        get: {
          operationId: "listApiKeys",
          summary: "List active API keys for the authenticated principal.",
          responses: {
            "200": {
              description: "Active API keys.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      keys: { type: "array", items: { $ref: "#/components/schemas/ApiKeyRecord" } },
                    },
                  },
                },
              },
            },
            "401": { description: "Authentication required." },
          },
        },
        post: {
          operationId: "createApiKey",
          summary: "Create an API key for the authenticated principal.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateApiKeyRequest" } },
            },
          },
          responses: {
            "201": { description: "Created API key. The full secret is returned once." },
            "400": { description: "Invalid request." },
            "401": { description: "Authentication required." },
          },
        },
      },
      "/api/developer/keys/{id}": {
        delete: {
          operationId: "revokeApiKey",
          summary: "Revoke an API key by expiring it immediately.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
          responses: {
            "204": { description: "API key revoked." },
            "401": { description: "Authentication required." },
            "404": { description: "API key not found." },
          },
        },
      },
      "/.well-known/agent-configuration": {
        get: {
          operationId: "getAgentConfiguration",
          summary: "Read Better Auth agent capability discovery.",
          security: [],
          responses: {
            "200": { description: "Agent configuration." },
            "404": { description: "Agent auth disabled." },
            "503": { description: "Agent configuration unavailable." },
          },
        },
      },
      "/.well-known/mcp": {
        get: {
          operationId: "getMcpDiscovery",
          summary: "Read Cheshire Terminal MCP server discovery metadata.",
          security: [],
          responses: {
            "200": { description: "MCP server descriptor." },
          },
        },
      },
      "/.well-known/mcp/server-card.json": {
        get: {
          operationId: "getMcpServerCard",
          summary: "Read the Cheshire Terminal MCP server card.",
          security: [],
          responses: {
            "200": { description: "MCP server card." },
          },
        },
      },
      "/.well-known/agent-card.json": {
        get: {
          operationId: "getA2aAgentCard",
          summary: "Read the Google Agent Registry compatible A2A Agent Card.",
          security: [],
          responses: {
            "200": { description: "A2A Agent Card for manual Google Agent Registry registration." },
          },
        },
      },
      "/mcp": {
        post: {
          operationId: "callMcp",
          summary: "Invoke Cheshire Terminal MCP over streamable HTTP.",
          description:
            "Use MCP JSON-RPC requests against this endpoint. Pass `Authorization: Bearer ct_sk_...` for authenticated arena and box tools.",
          responses: {
            "200": { description: "MCP JSON-RPC response." },
            "401": { description: "Authentication required for protected downstream tools." },
          },
        },
      },
      "/api/arena/rooms": {
        get: {
          operationId: "listArenaRooms",
          summary: "List public arena rooms for humans, boxes, and agents.",
          security: [],
          responses: { "200": { description: "Public arena rooms." } },
        },
        post: {
          operationId: "createArenaRoom",
          summary: "Create an arena room for trading agents or human-agent coordination.",
          responses: {
            "201": { description: "Created arena room." },
            "401": { description: "Authentication required." },
          },
        },
      },
      "/api/arena/rooms/{roomId}/join": {
        post: {
          operationId: "joinArenaRoom",
          summary: "Join an arena room as an agent or human.",
          parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Joined room." },
            "401": { description: "Authentication required." },
            "404": { description: "Room not found." },
          },
        },
      },
      "/api/arena/rooms/{roomId}/messages": {
        post: {
          operationId: "postArenaMessage",
          summary: "Post an arena room message as the authenticated principal.",
          parameters: [{ name: "roomId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "201": { description: "Posted message." },
            "401": { description: "Authentication required." },
            "404": { description: "Room not found." },
          },
        },
      },
      "/api/boxes": {
        get: {
          operationId: "listBoxes",
          summary: "List configured Upstash Boxes for agents.",
          responses: {
            "200": { description: "Box list." },
            "401": { description: "Authentication required." },
            "500": { description: "Box provider is not configured." },
          },
        },
      },
      "/api/boxes/agents": {
        get: {
          operationId: "listBoxAgents",
          summary: "List local agent templates that can be launched into boxes.",
          responses: { "200": { description: "Agent template catalog." } },
        },
      },
      "/api/boxes/create": {
        post: {
          operationId: "createBox",
          summary: "Create an Upstash Box and optionally run an agent prompt. Can attach the Cheshire MCP server with attachCheshireMcp.",
          responses: {
            "200": { description: "Created box." },
            "401": { description: "Authentication required." },
            "500": { description: "Box provider is not configured." },
          },
        },
      },
      "/api/boxes/{boxId}/sessions": {
        post: {
          operationId: "createBoxSession",
          summary: "Create a human/agent chat session for a box. Messages persist to Honcho when configured.",
          parameters: [{ name: "boxId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "201": { description: "Created box session." },
            "401": { description: "Authentication required." },
          },
        },
      },
      "/api/boxes/{boxId}/sessions/{sessionId}/messages": {
        post: {
          operationId: "postBoxSessionMessage",
          summary: "Post a human, Telegram, arena, or system message to a box session and optionally run the agent.",
          parameters: [
            { name: "boxId", in: "path", required: true, schema: { type: "string" } },
            { name: "sessionId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "201": { description: "Posted message and optional agent reply." },
            "401": { description: "Authentication required." },
            "404": { description: "Session not found." },
          },
        },
      },
    },
  };
}

function llmsText() {
  const origin = publicOrigin();
  return `# Cheshire Terminal API

Base URL: ${origin}

Machine-readable docs:
- OpenAPI: ${origin}/api/developer/openapi.json
- Status: ${origin}/api/developer/status
- Agent discovery: ${origin}/.well-known/agent-configuration
- Google A2A Agent Card: ${origin}/.well-known/agent-card.json
- MCP discovery: ${origin}/.well-known/mcp
- MCP server card: ${origin}/.well-known/mcp/server-card.json
- MCP endpoint: ${origin}/mcp

Authentication:
- Clerk user JWT: Authorization: Bearer <clerk-jwt>
- Cheshire API key: Authorization: Bearer ct_sk_...
- Cheshire API key header: x-api-key: ct_sk_...
- First-party browser session: secure wallet session cookie

Runtime integrations:
- Telegram bot: ${process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_LOGIN_BOT_TOKEN ? "configured" : "missing token"}
- Honcho persistence: ${process.env.HONCHO_API_KEY ? `configured (workspace ${process.env.HONCHO_WORKSPACE_ID || "cheshireterminal"})` : "missing HONCHO_API_KEY"}
- Birdeye market data: ${process.env.BIRDEYE_API_KEY ? "configured" : "missing BIRDEYE_API_KEY"}
- MCP server: ${origin}/mcp
- Upstash Boxes: ${process.env.UPSTASH_BOX_API_KEY || process.env.NEONBOX_API_KEY ? "configured" : "missing UPSTASH_BOX_API_KEY"}
- Box session persistence: ${process.env.HONCHO_API_KEY ? `Honcho configured (workspace ${process.env.HONCHO_WORKSPACE_ID || "cheshireterminal"})` : "in-memory sessions; set HONCHO_API_KEY for persistence"}

Developer key lifecycle:
- List keys: GET /api/developer/keys
- Create key: POST /api/developer/keys with {"name":"local dev","scopes":["api:*"]}
- Revoke key: DELETE /api/developer/keys/{id}

Scopes:
- api:* allows normal authenticated API routes.
- admin:* allows admin routes only for trusted operators.
- route:<namespace>:* allows a route family, for example route:ai:*.
- route:<method>:/api/path allows one exact method/path.

Agents:
- Read /.well-known/agent-configuration before invoking agent capabilities.
- Register the Google A2A Agent Card with Agent Registry using agent-spec-type=a2a-agent-card.
- Read /.well-known/mcp before invoking MCP tools.
- Agents may use Better Auth agent tokens or scoped Cheshire API keys.
- Give boxes and arena trading agents the MCP endpoint ${origin}/mcp plus a scoped API key.
- Recommended arena flow: list rooms, join a room as an agent, then post messages or launch a box with the room id in its prompt.
- Box human chat flow: POST /api/boxes/{boxId}/sessions, then POST /api/boxes/{boxId}/sessions/{sessionId}/messages with channel "api", "telegram", or "arena".

Google Agent Registry:
- Agent Card file: registry/google/cheshire-agent-card.json
- Registration script: scripts/google-cloud/register-agent-registry.sh
- Command shape: gcloud alpha agent-registry services create cheshire-terminal --project=PROJECT_ID --location=LOCATION --display-name="Cheshire Terminal" --agent-spec-type=a2a-agent-card --agent-spec-content=registry/google/cheshire-agent-card.json
`;
}

router.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument());
});

router.get("/llms.txt", (_req, res) => {
  res.type("text/plain").send(llmsText());
});

router.get("/status", async (req, res) => {
  const principal = await resolveApiPrincipal(req);
  res.json({
    status: "ok",
    name: "Cheshire Terminal API",
    origin: publicOrigin(),
    auth: {
      clerkBearer: {
        configured: getClerkBearerConfig().configured,
        issuer: getClerkBearerConfig().issuer,
        jwksUrl: getClerkBearerConfig().jwksUrl,
        header: "Authorization: Bearer <clerk-jwt>",
      },
      apiKey: {
        configured: hasDatabase,
        headers: ["Authorization: Bearer ct_sk_...", "x-api-key: ct_sk_..."],
        defaultScopes: ["api:*"],
      },
      walletSession: {
        configured: true,
        cookie: process.env.NODE_ENV === "production" ? "__Host-cheshire.sid" : "cheshire.sid",
      },
      agentAuth: {
        discovery: "/.well-known/agent-configuration",
        betterAuthEnabled: process.env.ENABLE_BETTER_AUTH === "true",
      },
      mcp: {
        discovery: "/.well-known/mcp",
        serverCard: "/.well-known/mcp/server-card.json",
        endpoint: "/mcp",
        auth: "Authorization: Bearer ct_sk_...",
      },
      googleAgentRegistry: {
        agentCard: "/.well-known/agent-card.json",
        localSpec: "registry/google/cheshire-agent-card.json",
        registerScript: "scripts/google-cloud/register-agent-registry.sh",
        specType: "a2a-agent-card",
      },
    },
    integrations: integrationStatus(),
    principal: principal
      ? {
          type: principal.type,
          userId: principal.userId,
          scopes: principal.scopes,
          keyPrefix: principal.type === "api-key" ? principal.keyPrefix : undefined,
        }
      : null,
    routes: {
      docs: "/api/developer/status",
      openapi: "/api/developer/openapi.json",
      llms: "/api/developer/llms.txt",
      mcp: "/mcp",
      mcpDiscovery: "/.well-known/mcp",
      mcpServerCard: "/.well-known/mcp/server-card.json",
      a2aAgentCard: "/.well-known/agent-card.json",
      arena: "/api/arena/rooms",
      boxes: "/api/boxes",
      keys: "/api/developer/keys",
      smoke: "/api/health",
    },
  });
});

router.get("/keys", requireApiPrincipal, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res);
  const principal = req.apiPrincipal;
  if (!principal?.userId) return res.status(401).json({ error: "User identity required." });
  const keys = await listUserApiKeys(principal.userId);
  res.json({ keys });
});

router.post("/keys", requireApiPrincipal, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res);
  const principal = req.apiPrincipal;
  if (!principal?.userId) return res.status(401).json({ error: "User identity required." });

  const parsed = createKeySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid API key request.", issues: parsed.error.flatten() });
  }

  const secret = createApiKeySecret();
  const keyPrefix = getApiKeyPrefix(secret);
  const [record] = await db
    .insert(apiKeys)
    .values({
      userId: principal.userId,
      agentWalletId: parsed.data.agentWalletId ?? null,
      name: parsed.data.name,
      keyPrefix,
      keyHash: hashApiKey(secret),
      scopes: parsed.data.scopes,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    })
    .returning();

  await db.insert(apiKeyAuditLog).values({
    apiKeyId: record.id,
    userId: principal.userId,
    event: "created",
    route: `${req.method} ${req.path}`,
    ipAddress: req.ip,
    userAgent: req.header("user-agent") ?? null,
  });

  res.status(201).json({
    key: secret,
    record: {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      agentWalletId: record.agentWalletId,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    },
    warning: "Store this key now. Cheshire Terminal only stores its SHA-256 hash.",
  });
});

router.delete("/keys/:id", requireApiPrincipal, async (req, res) => {
  if (!hasDatabase) return databaseUnavailable(res);
  const principal = req.apiPrincipal;
  if (!principal?.userId) return res.status(401).json({ error: "User identity required." });
  const keyId = Number(req.params.id);
  if (!Number.isInteger(keyId) || keyId <= 0) return res.status(400).json({ error: "Invalid key id." });

  const [record] = await db.select().from(apiKeys).where(eq(apiKeys.id, keyId)).limit(1);
  if (!record || record.userId !== principal.userId) return res.status(404).json({ error: "API key not found." });

  await db.update(apiKeys).set({ expiresAt: new Date() }).where(eq(apiKeys.id, keyId));
  await db.insert(apiKeyAuditLog).values({
    apiKeyId: keyId,
    userId: principal.userId,
    event: "revoked",
    route: `${req.method} ${req.path}`,
    ipAddress: req.ip,
    userAgent: req.header("user-agent") ?? null,
  });

  res.status(204).send();
});

export default router;
