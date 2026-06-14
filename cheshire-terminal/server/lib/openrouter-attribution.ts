const DEFAULT_OPENROUTER_APP_URL = "https://cheshireterminal.ai/";

function normalizeOpenRouterAppUrl(value: string | undefined) {
  const raw = (value || DEFAULT_OPENROUTER_APP_URL).trim();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    return `${url.protocol}//${url.host}/`;
  } catch {
    const cleaned = raw.replace(/\/api\/auth\/?$/, "").replace(/\/+$/, "");
    return cleaned ? `${cleaned}/` : DEFAULT_OPENROUTER_APP_URL;
  }
}

function envOrDefault(value: string | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  return trimmed || fallback;
}

export const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_APP_URL = normalizeOpenRouterAppUrl(
  process.env.OPENROUTER_APP_URL || process.env.OPENROUTER_HTTP_REFERER,
);
export const OPENROUTER_APP_TITLE = envOrDefault(process.env.OPENROUTER_APP_TITLE, "Cheshire Terminal");
export const OPENROUTER_APP_CATEGORIES = envOrDefault(
  process.env.OPENROUTER_APP_CATEGORIES,
  "cli-agent,cloud-agent",
);

export function getOpenRouterAttributionHeaders() {
  return {
    "HTTP-Referer": OPENROUTER_APP_URL,
    "X-OpenRouter-Title": OPENROUTER_APP_TITLE,
    "X-OpenRouter-Categories": OPENROUTER_APP_CATEGORIES,
  };
}
