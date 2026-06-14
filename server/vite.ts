import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import { nanoid } from "nanoid";

function htmlContentSecurityPolicy() {
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

  return [
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
  ].join("; ");
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const viteConfigUrl = pathToFileURL(
    path.resolve(__dirname, "..", "vite.config.ts"),
  ).href;
  const [{ createServer: createViteServer, createLogger }, { default: viteConfig }] =
    await Promise.all([import("vite"), import(viteConfigUrl)]);
  const viteLogger = createLogger();

  const appUrl = process.env.NODE_ENV === "production" ? process.env.VITE_APP_URL : undefined;
  const parsedAppUrl = appUrl ? new URL(appUrl) : null;
  const boundAddress = server.address();
  const boundPort =
    typeof boundAddress === "object" && boundAddress && "port" in boundAddress
      ? boundAddress.port
      : undefined;
  const hmrProtocol: "ws" | "wss" = parsedAppUrl?.protocol === "https:" ? "wss" : "ws";
  const hmrHost = parsedAppUrl?.hostname ?? "127.0.0.1";
  const hmrClientPort = parsedAppUrl?.port
    ? Number(parsedAppUrl.port)
    : parsedAppUrl
      ? parsedAppUrl.protocol === "https:"
        ? 443
        : 80
      : boundPort;
  const serverOptions = {
    middlewareMode: true,
    hmr: {
      server,
      protocol: hmrProtocol,
      host: hmrHost,
      clientPort: hmrClientPort,
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Never let the SPA catch-all hijack unhandled /api/* routes — return
    // a proper JSON 404 so clients don't receive HTML with a 200 status.
    if (url.startsWith("/api/") || url === "/api") {
      return res
        .status(404)
        .json({ error: "Not Found", path: url });
    }

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res
        .status(200)
        .set({
          "Content-Type": "text/html",
          "Content-Security-Policy": htmlContentSecurityPolicy(),
        })
        .end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `[server] WARNING: Could not find build directory: ${distPath}. Static files will not be served. Run 'npm run build' first.`,
    );
    return;
  }

  app.use(express.static(distPath, {
    dotfiles: "ignore",
    etag: true,
    fallthrough: true,
    lastModified: true,
    maxAge: "1h",
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }));

  // fall through to index.html if the file doesn't exist — but NEVER for
  // /api/* (those should return JSON 404 instead of SPA HTML with 200).
  app.use("*", (req, res) => {
    const url = req.originalUrl;
    if (url.startsWith("/api/") || url === "/api") {
      return res
        .status(404)
        .json({ error: "Not Found", path: url });
    }
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Security-Policy", htmlContentSecurityPolicy());
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
