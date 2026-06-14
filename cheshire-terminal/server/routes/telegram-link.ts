import { Router } from "express";
import { sql, eq } from "drizzle-orm";
import { db } from "../db";
import { walletTelegramLinks } from "@shared/schema";
import { getTelegramBotToken, verifyTelegramLoginPayload } from "../lib/telegram/auth";

const router = Router();

let tableReady = false;
async function ensureTable() {
  if (tableReady || !db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS wallet_telegram_links (
        id SERIAL PRIMARY KEY,
        "walletAddress" VARCHAR(64) NOT NULL UNIQUE,
        "telegramId" VARCHAR(32) NOT NULL UNIQUE,
        "telegramUsername" VARCHAR(64),
        "telegramFirstName" VARCHAR(128),
        "photoUrl" TEXT,
        "authDate" INTEGER,
        "linkedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    tableReady = true;
  } catch (e) {
    console.error("[telegram-link] CREATE TABLE failed:", e);
  }
}

let cachedBotUsername: string | null = null;

// ── GET /api/telegram-link/bot-username ───────────────────────────────────────
// Used by frontend to render the Telegram Login Widget script tag.
router.get("/bot-username", async (_req, res) => {
  const configured =
    process.env.TELEGRAM_LOGIN_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || "";
  if (configured) return res.json({ username: configured.replace(/^@/, "") });

  if (cachedBotUsername) return res.json({ username: cachedBotUsername });

  const token = getTelegramBotToken();
  if (!token) return res.json({ username: "" });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    cachedBotUsername = data?.ok && data.result?.username ? data.result.username : "";
    return res.json({ username: cachedBotUsername });
  } catch {
    return res.json({ username: "" });
  }
});

// ── GET /api/telegram-link/status/:wallet ────────────────────────────────────
router.get("/status/:wallet", async (req, res) => {
  if (!db) return res.json({ linked: false });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(walletTelegramLinks)
      .where(eq(walletTelegramLinks.walletAddress, req.params.wallet));
    if (!row) return res.json({ linked: false });
    res.json({
      linked: true,
      telegramUsername: row.telegramUsername,
      telegramFirstName: row.telegramFirstName,
      photoUrl: row.photoUrl,
      linkedAt: row.linkedAt,
    });
  } catch (e: any) {
    res.status(500).json({ linked: false, error: e.message });
  }
});

// ── GET /api/telegram-link/by-telegram-id/:telegramId ────────────────────────
router.get("/by-telegram-id/:telegramId", async (req, res) => {
  if (!db) return res.json({ found: false });
  await ensureTable();
  try {
    const [row] = await db
      .select()
      .from(walletTelegramLinks)
      .where(eq(walletTelegramLinks.telegramId, req.params.telegramId));
    if (!row) return res.json({ found: false });
    res.json({ found: true, walletAddress: row.walletAddress, telegramUsername: row.telegramUsername });
  } catch (e: any) {
    res.status(500).json({ found: false, error: e.message });
  }
});

// ── POST /api/telegram-link/verify ───────────────────────────────────────────
// Body: { walletAddress, auth: <Telegram Login Widget payload> }
router.post("/verify", async (req, res) => {
  if (!db) return res.status(503).json({ error: "DB unavailable" });
  await ensureTable();
  const botToken = getTelegramBotToken();
  if (!botToken) {
    return res
      .status(500)
      .json({ error: "Telegram Login not configured (missing TELEGRAM_BOT_TOKEN)" });
  }
  const { walletAddress, auth } = req.body as { walletAddress?: string; auth?: any };
  if (!walletAddress || walletAddress.length < 32) {
    return res.status(400).json({ error: "walletAddress required" });
  }
  if (!auth || typeof auth !== "object" || !auth.hash || !auth.id) {
    return res.status(400).json({ error: "Invalid Telegram auth payload" });
  }
  // Reject auth payloads older than 1 day
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(auth.auth_date || 0)) > 86400) {
    return res.status(400).json({ error: "Telegram auth payload expired" });
  }
  if (!verifyTelegramLoginPayload(auth, botToken)) {
    return res.status(400).json({ error: "Telegram auth signature invalid" });
  }

  try {
    await db
      .insert(walletTelegramLinks)
      .values({
        walletAddress,
        telegramId: String(auth.id),
        telegramUsername: auth.username ?? null,
        telegramFirstName: auth.first_name ?? null,
        photoUrl: auth.photo_url ?? null,
        authDate: Number(auth.auth_date) || null,
      })
      .onConflictDoUpdate({
        target: walletTelegramLinks.walletAddress,
        set: {
          telegramId: String(auth.id),
          telegramUsername: auth.username ?? null,
          telegramFirstName: auth.first_name ?? null,
          photoUrl: auth.photo_url ?? null,
          authDate: Number(auth.auth_date) || null,
          linkedAt: new Date(),
        },
      });
    res.json({
      success: true,
      telegramUsername: auth.username,
      telegramFirstName: auth.first_name,
    });
  } catch (e: any) {
    console.error("[telegram-link] verify error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
