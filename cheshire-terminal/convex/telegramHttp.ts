import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * HTTP endpoints backing the Telegram bot's user persistence. The bot
 * server (Discord/bot folder) calls these to keep the `users` table in
 * sync with Telegram identity so that the rest of the app can resolve
 * a Telegram user to a `users._id` for usage tracking, profile
 * rendering, and agent naming.
 */

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function str(value: unknown, max = 256): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max) || undefined;
}

// POST /api/telegram/register
// Body: { telegramId, telegramUsername?, firstName?, chatId? }
export const registerTelegramUser = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, c);
  }

  const telegramId = str(body?.telegramId, 64);
  if (!telegramId) return json({ error: "telegramId required" }, 400, c);

  const result = await ctx.runMutation(internal.walletAuth.upsertTelegramUser, {
    telegramUserId: telegramId,
    telegramUsername: str(body.telegramUsername, 64),
    telegramFirstName: str(body.firstName, 128),
    telegramChatId: body.chatId != null ? String(body.chatId).slice(0, 64) : undefined,
  });

  return json({ ok: true, ...result }, 200, c);
});

// GET /api/telegram/profile?telegramId=...
export const getTelegramProfile = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  const telegramId = new URL(req.url).searchParams.get("telegramId")?.trim() ?? "";
  if (!telegramId) return json({ error: "telegramId required" }, 400, c);

  const profile = await ctx.runQuery(internal.walletAuth.getTelegramUserProfile, {
    telegramUserId: telegramId.slice(0, 64),
  });
  if (!profile) return json({ found: false }, 200, c);

  return json({ found: true, ...profile }, 200, c);
});

// POST /api/telegram/setname
// Body: { telegramId, agentName }
export const setTelegramAgentName = httpAction(async (ctx, req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, c);
  }

  const telegramId = str(body?.telegramId, 64);
  const agentName = str(body?.agentName, 64);

  if (!telegramId) return json({ error: "telegramId required" }, 400, c);
  if (!agentName) return json({ error: "agentName required (1–64 chars)" }, 400, c);

  const result = await ctx.runMutation(internal.walletAuth.setAgentName, {
    telegramUserId: telegramId,
    agentName,
  });
  return json(result, 200, c);
});
