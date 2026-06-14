import { Router } from "express";
import { z } from "zod";
import {
  createHeliusAgentWebhook,
  getAgentExplorerStatus,
  ingestAgentExplorerPayload,
  isAuthorizedHeliusWebhook,
  listAgentExplorerFeed,
  subscribeAgentExplorerEvents,
} from "../lib/agent-explorer";

const router = Router();

const webhookCreateSchema = z.object({
  webhookUrl: z.string().url().optional(),
  authHeader: z.string().min(1).optional(),
  accountAddresses: z.array(z.string()).max(64).optional(),
  transactionTypes: z.array(z.string()).max(32).optional(),
});

router.get("/status", (_req, res) => {
  res.json({ success: true, status: getAgentExplorerStatus() });
});

router.get("/feed", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const items = await listAgentExplorerFeed(limit);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Agent feed failed" });
  }
});

router.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: status\ndata: ${JSON.stringify(getAgentExplorerStatus())}\n\n`);

  const unsubscribe = subscribeAgentExplorerEvents((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.item)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ now: Date.now() })}\n\n`);
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post("/webhook/helius", async (req, res) => {
  if (!isAuthorizedHeliusWebhook(req.headers)) {
    return res.status(401).json({ success: false, error: "Invalid webhook auth header" });
  }

  try {
    const items = await ingestAgentExplorerPayload(req.body, "helius-webhook");
    res.status(202).json({ success: true, count: items.length, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Webhook ingest failed" });
  }
});

router.post("/webhooks/helius/register", async (req, res) => {
  try {
    const parsed = webhookCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid webhook request", details: parsed.error.format() });
    }
    const result = await createHeliusAgentWebhook(parsed.data);
    res.status(201).json({ success: true, webhook: result });
  } catch (error) {
    res.status(502).json({ success: false, error: error instanceof Error ? error.message : "Could not create Helius webhook" });
  }
});

export default router;
