import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "production",
    platform: "vercel",
  });
});

let routesReady: Promise<void> | undefined;

function ensureRoutes() {
  if (!routesReady) {
    const server = createServer(app);
    routesReady = import("./routes").then(({ registerRoutes }) => registerRoutes(app, server)).then(() => {
      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        if (err.type === "entity.too.large") {
          return res.status(413).json({
            message: "File size too large. Maximum size is 10MB.",
            error: err.message,
          });
        }

        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        console.error("[api] request error:", err);
        res.status(status).json({ message });
      });
    });
  }

  return routesReady;
}

app.use(async (_req, _res, next) => {
  try {
    await ensureRoutes();
    next();
  } catch (error) {
    next(error);
  }
});

export default app;
