import "./env";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import compression from "compression";
import cors from "cors";
import { rateLimit } from "./lib/rate-limit";
import { telegramBot } from "./lib/telegram/bot";
import { startAgentHostBot } from "./lib/telegram/agent-host-bot";
import { discordBot } from "./lib/discord/bot";
import { startClawdDiscordRelay } from "./lib/discord/trading-relay";
import { liveStatus } from "./lib/clawd/solana-trader";
import { getPublicAppUrl } from "./lib/telegram/auth";
import { getUpstashConfigStatus, getUpstashProbeStatus } from "./lib/upstash-status";
import {
  cheshireAgentCard,
  cheshireMcpDiscovery,
  cheshireMcpServerCard,
  createCheshireMcpHandler,
} from "./mcp";

const runningScript = process.argv[1] || "";
const shouldForceProduction =
  process.env.NODE_ENV === "production" ||
  runningScript.includes("/dist/index.js") ||
  runningScript.endsWith("dist/index.js");

if (shouldForceProduction) {
  process.env.NODE_ENV = "production";
}

// ── Production secret guards ─────────────────────────────────────────────────
// Fail fast on missing secrets so a misconfigured deploy is obvious in logs.
if (process.env.NODE_ENV === "production") {
  const missing: string[] = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (≥32 chars)");
  if (!process.env.CLAWD_ADMIN_KEY) missing.push("CLAWD_ADMIN_KEY");
  if (!process.env.ADMIN_SECRET) missing.push("ADMIN_SECRET");
  if (missing.length > 0) {
    console.error(`[server] FATAL: Required production secrets are not set:\n  ${missing.join("\n  ")}\nSet them in your environment and restart.`);
    process.exit(1);
  }
}

// ── Global crash guards ──────────────────────────────────────────────────────
// Prevent the process from dying on unhandled errors — log and continue instead.
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception (process kept alive):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled promise rejection (process kept alive):', reason, 'at promise:', promise);
});

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const configuredOrigins = [
  process.env.APP_ORIGIN,
  process.env.VITE_APP_URL,
  process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : undefined,
]
  .filter(Boolean)
  .flatMap((value) => String(value).split(","))
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const isAllowedCorsOrigin = (origin: string, host?: string) => {
  const normalized = origin.replace(/\/$/, "");
  if (host) {
    try {
      if (new URL(normalized).host === host) return true;
    } catch {}
  }
  if (configuredOrigins.includes(normalized)) return true;
  if (process.env.NODE_ENV !== "production") {
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(normalized);
  }
  return false;
};

// Credentialed CORS must not reflect arbitrary origins. Same-origin requests have
// no Origin header and continue normally.
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() ?? req.headers.host;
  callback(null, {
    origin: !origin || isAllowedCorsOrigin(origin, host),
    credentials: true,
  });
}));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "0"); // CSP makes this obsolete; set to 0 to disable broken IE behaviour
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Origin-Agent-Cluster", "?1");
  // Telegram Login uses a popup and needs opener access for postMessage.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(self)");
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://cloud.livekit.io",
    "https://telegram.org",
    "https://oauth.telegram.org",
    "https://plugin.jup.ag",
    "https://clerk.cheshireterminal.ai",
    "https://*.clerk.accounts.dev",
    "https://*.clerk.com",
  ];
  if (process.env.NODE_ENV !== "production") {
    scriptSrc.push("'unsafe-eval'");
  }
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' wss: ws: https:",
      "frame-src 'self' https://dexscreener.com https://oauth.telegram.org https://telegram.org https://plugin.jup.ag https://jup.ag https://live.browser-use.com https://*.cloudflarestream.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' blob: data: https: https://*.cloudflarestream.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
}));

const generalApiLimiter = rateLimit({
  namespace: "api:general",
  windowMs: 60_000,
  max: 600,
  message: "Too many API requests. Please slow down.",
});

app.use((req, res, next) => {
  if (
    req.method === "OPTIONS" ||
    req.path === "/api/health" ||
    req.path === "/api/public-config" ||
    !req.path.startsWith("/api/")
  ) {
    return next();
  }
  return generalApiLimiter(req, res, next);
});

// Add body parsers early in the middleware chain.
// 1MB is sufficient for all API payloads; upload routes (IPFS, gallery) use
// their own multer middleware with higher limits.
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString("utf8");
  },
}));
app.use(express.urlencoded({
  extended: false,
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString("utf8");
  },
}));

// Add health check endpoint
app.get('/api/health', async (req, res) => {
  const live = liveStatus();
  const probeUpstash = req.query.probe === "upstash" || req.query.probe === "true";
  const upstash = probeUpstash
    ? await getUpstashProbeStatus()
    : getUpstashConfigStatus();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    clawdLive: live.live,
    clawdTraderConfigured: live.configured,
    upstash,
  });
});

function getServerSolanaRpcUrl() {
  return (
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : undefined) ||
    'https://api.mainnet-beta.solana.com'
  );
}

// Public browser config. Vite embeds VITE_* values at build time, but Fly
// secrets are runtime values, so the SPA reads wallet RPC config here.
app.get('/api/public-config', (req, res) => {
  const host = req.get("host") || "localhost:5000";
  const browserRpcUrl =
    process.env.PUBLIC_SOLANA_RPC_URL ||
    process.env.VITE_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_PUBLIC_RPC_URL ||
    `${req.protocol}://${host}/api/solana/rpc`;

  res.setHeader("Cache-Control", "no-store");
  res.json({
    solanaNetwork: 'mainnet-beta',
    // Only expose an intentionally public browser RPC. HELIUS_RPC_URL and
    // VITE_HELIUS_RPC_URL often contain private API keys in Fly runtime env.
    walletRpcUrl: browserRpcUrl,
    features: {
      backroomAvailable: Boolean((process.env.BACKROOM_BASE_URL || "").trim()),
      clawdrouterAvailable: Boolean((process.env.CLAWDROUTER_BASE_URL || "").trim() && ((process.env.CLAWDROUTER_API_KEY || process.env.X402_AUTH_TOKEN || "").trim())),
    },
  });
});

const mcpHandler = createCheshireMcpHandler();

function getRequestOrigin(req: Request) {
  const forwardedProto = req.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim();
  const forwardedHost = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || "localhost:5000";
  const proto = forwardedProto || (host.includes("localhost") || host.startsWith("127.") ? "http" : req.protocol || "https");
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || `${proto}://${host}`).replace(/\/$/, "");
}

function toWebRequest(req: Request) {
  const origin = getRequestOrigin(req);
  const url = new URL(req.originalUrl || req.url, origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const rawBody = typeof (req as any).rawBody === "string" ? (req as any).rawBody : undefined;
  const body = hasBody ? rawBody ?? JSON.stringify(req.body ?? {}) : undefined;
  return new Request(url, { method: req.method, headers, body });
}

async function sendWebResponse(res: Response, response: globalThis.Response) {
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.status(response.status).send(body);
}

app.get("/.well-known/mcp", (req, res) => {
  res.json(cheshireMcpDiscovery(getRequestOrigin(req)));
});

app.get("/.well-known/mcp/server-card.json", (req, res) => {
  res.json(cheshireMcpServerCard(getRequestOrigin(req)));
});

app.get("/.well-known/agent-card.json", (req, res) => {
  res.json(cheshireAgentCard(getRequestOrigin(req)));
});

app.all("/mcp", async (req, res, next) => {
  try {
    const response = await mcpHandler(toWebRequest(req));
    await sendWebResponse(res, response);
  } catch (error) {
    next(error);
  }
});

const BACKROOM_BASE_URL = (process.env.BACKROOM_BASE_URL || "").trim().replace(/\/$/, "");
const BACKROOM_CONVEX_HTTP_URL = (process.env.BACKROOM_CONVEX_HTTP_URL || "").trim().replace(/\/$/, "");
const BACKROOM_CLIENT_NAME = "CheshireTerminal";

function sendMissingServiceConfig(res: Response, service: "backroom" | "backroom-convex") {
  const envVar = service === "backroom" ? "BACKROOM_BASE_URL" : "BACKROOM_CONVEX_HTTP_URL";
  res.status(503).json({
    error: `${service} service is not configured`,
    details: `Set ${envVar} to enable this endpoint.`,
  });
}

async function forwardBackroomGet(pathname: string, req: Request, res: Response) {
  if (!BACKROOM_BASE_URL) {
    sendMissingServiceConfig(res, "backroom");
    return;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") params.set(key, value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") params.append(key, item);
      }
    }
  }
  const query = params.toString();
  const upstream = await fetch(`${BACKROOM_BASE_URL}${pathname}${query ? `?${query}` : ""}`);
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
}

async function forwardBackroomPost(pathname: string, req: Request, res: Response) {
  if (!BACKROOM_BASE_URL) {
    sendMissingServiceConfig(res, "backroom");
    return;
  }
  const upstream = await fetch(`${BACKROOM_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body ?? {}),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
}

async function forwardConvexGet(pathname: string, req: Request, res: Response) {
  if (!BACKROOM_CONVEX_HTTP_URL) {
    sendMissingServiceConfig(res, "backroom-convex");
    return;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") params.set(key, value);
  }
  const query = params.toString();
  const upstream = await fetch(`${BACKROOM_CONVEX_HTTP_URL}${pathname}${query ? `?${query}` : ""}`);
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
}

app.get("/api/backroom/stream", async (_req, res) => {
  if (!BACKROOM_BASE_URL) {
    sendMissingServiceConfig(res, "backroom");
    return;
  }
  const upstream = await fetch(`${BACKROOM_BASE_URL}/stream`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    res.status(upstream.status || 502).json({ error: "Backroom stream unavailable" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  let closed = false;
  const close = () => {
    closed = true;
    reader.cancel().catch(() => {});
  };
  res.on("close", close);

  try {
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (error) {
    if (!closed) {
      console.error("[backroom] stream proxy failed:", error);
    }
  } finally {
    res.off("close", close);
    res.end();
  }
});

app.get("/api/backroom/stream/status", async (_req, res) => {
  if (!BACKROOM_BASE_URL) {
    sendMissingServiceConfig(res, "backroom");
    return;
  }
  const upstream = await fetch(`${BACKROOM_BASE_URL}/stream/status`);
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
});

app.post("/api/backroom/stream/start", async (req, res) => {
  await forwardBackroomPost("/stream/start", req, res);
});

app.get("/api/backroom/conversation", async (req, res) => {
  await forwardBackroomGet("/conversation", req, res);
});

app.get("/api/backroom/loop", async (req, res) => {
  await forwardBackroomGet("/loop", req, res);
});

app.get("/api/backroom/agent/:agentId", async (req, res) => {
  const agentId = String(req.params.agentId);
  if (!["1", "2", "3"].includes(agentId)) {
    res.status(400).json({ error: "agentId must be 1, 2, or 3" });
    return;
  }
  await forwardBackroomGet(`/agent${agentId}`, req, res);
});

app.get("/api/backroom/arena", async (req, res) => {
  await forwardBackroomGet("/arena", req, res);
});

app.get("/api/backroom/healthz", async (req, res) => {
  await forwardBackroomGet("/healthz", req, res);
});

app.get("/api/backroom/firecrawl/dreams/stories", async (req, res) => {
  await forwardBackroomGet("/firecrawl/dreams/stories", req, res);
});

app.get("/api/backroom/firecrawl/dreams/status", async (req, res) => {
  await forwardBackroomGet("/firecrawl/dreams/status", req, res);
});

app.get("/api/backroom/firecrawl/dreams/context", async (req, res) => {
  await forwardBackroomGet("/firecrawl/dreams/context", req, res);
});

app.post("/api/backroom/firecrawl/dreams", async (req, res) => {
  await forwardBackroomPost("/firecrawl/dreams", req, res);
});

app.post("/api/backroom/stream/human", async (req, res) => {
  if (!BACKROOM_BASE_URL) {
    sendMissingServiceConfig(res, "backroom");
    return;
  }
  const upstream = await fetch(`${BACKROOM_BASE_URL}/stream/human`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: String(req.body?.content ?? ""),
      name: String(req.body?.name ?? BACKROOM_CLIENT_NAME),
    }),
  });
  const text = await upstream.text();
  res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(text);
});

app.get("/api/backroom/convex/messages", async (req, res) => {
  await forwardConvexGet("/messages", req, res);
});

app.get("/api/backroom/convex/agents", async (req, res) => {
  await forwardConvexGet("/agents", req, res);
});

app.get("/api/backroom/convex/perps", async (req, res) => {
  await forwardConvexGet("/perps", req, res);
});

app.get("/api/backroom/convex/crawl/pages", async (req, res) => {
  await forwardConvexGet("/crawl/pages", req, res);
});

app.get("/api/backroom/convex/crawl/jobs", async (req, res) => {
  await forwardConvexGet("/crawl/jobs", req, res);
});

app.post('/api/solana/rpc', async (req, res, next) => {
  try {
    const upstream = await fetch(getServerSolanaRpcUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15_000),
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (error) {
    next(error);
  }
});

// Middleware to log requests and responses
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// ── Bind the port FIRST, then register routes/WebSocket/Telegram/Vite ──────
// Heavy module-level initializers (Helius RPC, PumpFun SDK, Solana wallet,
// StreamFlow, etc.) are pulled in transitively by `registerRoutes`, and add
// ~40s before the server can listen. In deployment that exceeds the health-
// check window. Solution: create the http server, start listening (so /api/
// health responds instantly), then do the heavy work in the background.
const requestedPort = parseInt(process.env.PORT || "5000", 10);
const listenHost = process.env.HOST || "0.0.0.0";
let port = requestedPort;

const server = createServer(app);

// Auto-retry on EADDRINUSE (common on macOS where AirPlay Receiver holds port 5000).
let portRetries = 0;
const MAX_PORT_RETRIES = 10;

// `reusePort` is not supported on macOS/Windows — only enable where it works (Linux).
function buildListenOptions(p: number): any {
  const opts: any = { port: p, host: listenHost };
  if (process.platform === "linux") opts.reusePort = true;
  return opts;
}

function listenWithRetry(): Promise<number> {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      cleanup();
      resolve(port);
    };

    const onError = (err: any) => {
      if (err?.code === "EADDRINUSE" && portRetries < MAX_PORT_RETRIES) {
        portRetries += 1;
        const nextPort = port + 1;
        console.warn(
          `[server] Port ${port} in use (EADDRINUSE) — retrying on ${nextPort}. ` +
          `(On macOS, port 5000 is often held by AirPlay Receiver: disable it in System Settings → General → AirDrop & Handoff, or use PORT=${nextPort}.)`
        );
        port = nextPort;
        setTimeout(() => server.listen(buildListenOptions(port)), 200);
        return;
      }

      cleanup();
      reject(err);
    };

    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };

    server.on("listening", onListening);
    server.on("error", onError);
    server.listen(buildListenOptions(port));
  });
}

// Now register everything else asynchronously. Express allows route additions
// after `listen()`, so any request that arrives before this completes will hit
// the default 404 (or /api/health, which is already wired up).
(async () => {
  try {
    await listenWithRetry();
    process.env.PORT = String(port);

    let appUrl = process.env.VITE_APP_URL
      ? process.env.VITE_APP_URL.replace(/\/api\/auth\/?$/, "").replace(/\/$/, "")
      : getPublicAppUrl();
    if (process.env.NODE_ENV !== "production" && port !== requestedPort) {
      try {
        const parsed = new URL(appUrl);
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
          parsed.port = String(port);
          appUrl = parsed.toString().replace(/\/$/, "");
        }
      } catch {
        // Keep the configured URL if it is not parseable.
      }
    }
    process.env.VITE_APP_URL = appUrl;

    log(`Server running on port ${port}`);
    log(`Health check endpoint available at http://${listenHost}:${port}/api/health`);
    if (port !== requestedPort) {
      log(`NOTE: requested port ${requestedPort} was busy, bound ${port} instead. Open http://localhost:${port}`);
    }

    await registerRoutes(app, server);
    startClawdDiscordRelay();
    log(`WebSocket server running on ws://${listenHost}:${port}/ws`);

    // Start Telegram bot
    if (process.env.TELEGRAM_BOT_ENABLED === "false") {
      log("Telegram bot startup skipped because TELEGRAM_BOT_ENABLED=false");
    } else {
      try {
        telegramBot.start();
        log('Telegram bot startup initiated');
      } catch (error) {
        console.error('Error starting Telegram bot:', error);
        log('Failed to start Telegram bot, continuing without it');
      }
    }

    // Start the Agent-Host bot (separate token, hosts user-built CLAWD agents)
    if (process.env.TELEGRAM_AGENT_HOST_BOT_ENABLED === "false") {
      log("Agent-host Telegram bot startup skipped because TELEGRAM_AGENT_HOST_BOT_ENABLED=false");
    } else {
      startAgentHostBot().catch((e) =>
        console.error('[agent-host-bot] startup failed:', e),
      );
    }

    // Start Discord bot (non-blocking — site keeps working if Discord is down)
    discordBot.start().catch((e) =>
      console.error('[discord] startup failed:', e),
    );

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server error:', err);

      if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large. Maximum size is 1MB.' });
      }

      const status: number = err.status || err.statusCode || 500;
      const isClientError = status >= 400 && status < 500;
      // In production never expose raw 5xx messages — they can contain file paths, stack frames, etc.
      const message = isClientError || process.env.NODE_ENV !== "production"
        ? (err.message || "Internal Server Error")
        : "Internal Server Error";

      res.status(status).json({ error: message });
    });

    // Set up Vite (dev) or static serving (prod) AFTER API routes so the SPA
    // catch-all doesn't shadow `/api/*`.
    if (!shouldForceProduction) {
      try {
        await setupVite(app, server);
      } catch (error) {
        console.error('Error setting up Vite:', error);
      }
    } else {
      serveStatic(app);
    }

    log(`Telegram bot web app URL: ${appUrl}`);
  } catch (error) {
    console.error('[server] Fatal error during startup:', error);
    process.exitCode = 1;
  }
})();
