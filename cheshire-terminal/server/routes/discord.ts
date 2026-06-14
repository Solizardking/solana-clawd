import { Router, type Request } from "express";
import { discordBot, type DiscordMessageEvent } from "../lib/discord/bot";
import { getDiscordTradingConfig, relayTradingEvent } from "../lib/discord/trading-relay";

const router = Router();

router.get("/status", (_req, res) => {
  res.json(discordBot.status());
});

router.get("/trading/status", (_req, res) => {
  const config = getDiscordTradingConfig();
  res.json({
    configured: config.configured,
    channelId: config.channelId || null,
    serverId: config.serverId || null,
    appUrl: config.appUrl,
  });
});

router.post("/trading/relay", async (req, res) => {
  const { source, title, description, severity, fields, url, dedupeKey, minIntervalMs, payload } = req.body ?? {};
  if (!source || !title) {
    return res.status(400).json({ error: "source and title required" });
  }

  const result = await relayTradingEvent({
    source: String(source),
    title: String(title),
    description: description ? String(description) : undefined,
    severity,
    fields,
    url,
    dedupeKey,
    minIntervalMs,
    raw: payload ?? req.body,
  });
  res.status(result.status).json(result.data);
});

function hasRelaySecret(req: Request) {
  const expected = process.env.DISCORD_RELAY_SECRET || process.env.ADMIN_SECRET;
  if (!expected) return true;
  const provided =
    req.header("x-discord-relay-secret") ||
    req.header("x-admin-secret") ||
    (typeof req.query.secret === "string" ? req.query.secret : "");
  return provided === expected;
}

router.post("/trading/webhook/:source", async (req, res) => {
  if (!hasRelaySecret(req)) {
    return res.status(401).json({ error: "invalid relay secret" });
  }

  const body = req.body ?? {};
  const result = await relayTradingEvent({
    source: `webhook:${req.params.source}`,
    title: String(body.title || body.event || body.type || `Inbound ${req.params.source}`),
    description: body.description ? String(body.description) : undefined,
    severity: body.severity,
    fields: Array.isArray(body.fields) ? body.fields : undefined,
    url: typeof body.url === "string" ? body.url : undefined,
    dedupeKey: typeof body.dedupeKey === "string" ? body.dedupeKey : undefined,
    minIntervalMs: typeof body.minIntervalMs === "number" ? body.minIntervalMs : undefined,
    raw: body.payload ?? body,
  });
  res.status(result.status).json(result.data);
});

router.get("/channels", async (_req, res) => {
  try {
    const channels = await discordBot.listChannels();
    res.json({ channels });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

router.get("/messages/:channelId", async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? "50"), 10);
    const messages = await discordBot.getMessages(req.params.channelId, limit);
    res.json({ messages });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

router.post("/messages", async (req, res) => {
  const { channelId, channelName, content, authorTag } = req.body ?? {};
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "content required" });
  }
  try {
    let id = channelId as string | undefined;
    if (!id && channelName) {
      const ch = await discordBot.findChannelByName(channelName);
      if (!ch) return res.status(404).json({ error: `channel not found: ${channelName}` });
      id = ch.id;
    }
    if (!id) return res.status(400).json({ error: "channelId or channelName required" });
    const sent = await discordBot.sendMessage(id, content, authorTag);
    res.json(sent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SSE live stream of new Discord messages, optionally filtered by channelId
router.get("/stream", (req, res) => {
  const channelId = req.query.channelId ? String(req.query.channelId) : null;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: ready\ndata: ${JSON.stringify(discordBot.status())}\n\n`);

  const onMessage = (msg: DiscordMessageEvent) => {
    if (channelId && msg.channelId !== channelId) return;
    res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  };
  discordBot.on("message", onMessage);

  const ka = setInterval(() => {
    try { res.write(`: keep-alive\n\n`); } catch { /* ignore */ }
  }, 25000);

  req.on("close", () => {
    clearInterval(ka);
    discordBot.off("message", onMessage);
    res.end();
  });
});

export default router;
