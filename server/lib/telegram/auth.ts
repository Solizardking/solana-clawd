import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramLoginPayload {
  id: string | number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date?: string | number;
  hash?: string;
}

export interface TelegramMiniAppUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

const safeEqualHex = (a: string, b: string) => {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

export const getTelegramBotToken = () =>
  process.env.TELEGRAM_LOGIN_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";

export function verifyTelegramLoginPayload(
  payload: TelegramLoginPayload,
  botToken = getTelegramBotToken(),
) {
  const { hash, ...rest } = payload;
  if (!hash || !botToken) return false;

  const dataCheckString = Object.keys(rest)
    .filter((key) => rest[key as keyof typeof rest] !== undefined && rest[key as keyof typeof rest] !== null)
    .sort()
    .map((key) => `${key}=${rest[key as keyof typeof rest]}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return safeEqualHex(expected, hash);
}

export function verifyTelegramMiniAppInitData(
  initData: string,
  botToken = getTelegramBotToken(),
) {
  if (!initData || !botToken) return { isValid: false, user: null as TelegramMiniAppUser | null };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { isValid: false, user: null as TelegramMiniAppUser | null };

  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const isValid = safeEqualHex(expected, hash);

  let user: TelegramMiniAppUser | null = null;
  const userParam = params.get("user");
  if (isValid && userParam) {
    try {
      user = JSON.parse(userParam) as TelegramMiniAppUser;
    } catch {
      user = null;
    }
  }

  return { isValid, user };
}

export const getTelegramClientId = () =>
  process.env.TELEGRAM_CLIENT_ID || process.env.TELEGRAM_OIDC_CLIENT_ID || getTelegramBotToken().split(":")[0] || "";

export const getTelegramClientSecret = () =>
  process.env.TELEGRAM_CLIENT_SECRET || process.env.TELEGRAM_OIDC_CLIENT_SECRET || "";

export const getPublicAppUrl = () =>
  (process.env.APP_ORIGIN ||
    process.env.BETTER_AUTH_URL ||
    process.env.VITE_APP_URL ||
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : "") ||
    (process.env.NODE_ENV === "production" ? "https://cheshireterminal.ai" : `http://localhost:${process.env.PORT || "5000"}`))
    .replace(/\/api\/auth\/?$/, "")
    .replace(/\/$/, "");
