import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
  BROWSER_CACHE: KVNamespace;
  BROWSER_RUN_TOKEN?: string;
  CACHE_TTL_SECONDS?: string;
  MAX_NAVIGATION_MS?: string;
}

type ExtractFormat = "text" | "html";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function requireToken(request: Request, env: Env) {
  if (!env.BROWSER_RUN_TOKEN) return null;
  const expected = `Bearer ${env.BROWSER_RUN_TOKEN}`;
  return request.headers.get("authorization") === expected
    ? null
    : json({ error: "unauthorized" }, { status: 401 });
}

function normalizeTarget(input: unknown) {
  if (typeof input !== "string" || !input.trim()) throw new Error("url required");
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("url must be http or https");
  return url.toString();
}

async function readBody(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

async function withPage<T>(env: Env, url: string, action: (page: any) => Promise<T>) {
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: Number(env.MAX_NAVIGATION_MS || 30000),
    });
    return await action(page);
  } finally {
    await browser.close();
  }
}

async function screenshot(request: Request, env: Env) {
  const unauthorized = requireToken(request, env);
  if (unauthorized) return unauthorized;

  const body = await readBody(request);
  const url = normalizeTarget(body.url);
  const fullPage = body.fullPage !== false;
  const cacheKey = `shot:${url}:${fullPage ? "full" : "viewport"}`;
  const cached = await env.BROWSER_CACHE.get(cacheKey, { type: "arrayBuffer" });
  if (cached) {
    return new Response(cached, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
        "x-browser-run-cache": "hit",
      },
    });
  }

  const image = await withPage(env, url, async (page) => {
    const shot = await page.screenshot({ fullPage, type: "png" });
    return shot as ArrayBuffer;
  });
  await env.BROWSER_CACHE.put(cacheKey, image, {
    expirationTtl: Number(env.CACHE_TTL_SECONDS || 86400),
  });

  return new Response(image, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
      "x-browser-run-cache": "miss",
    },
  });
}

async function extract(request: Request, env: Env) {
  const unauthorized = requireToken(request, env);
  if (unauthorized) return unauthorized;

  const body = await readBody(request);
  const url = normalizeTarget(body.url);
  const format: ExtractFormat = body.format === "html" ? "html" : "text";
  const cacheKey = `extract:${format}:${url}`;
  const cached = await env.BROWSER_CACHE.get(cacheKey, { type: "json" });
  if (cached) return json({ ...(cached as object), cached: true });

  const result = await withPage(env, url, async (page) => {
    const title = await page.title();
    const content = format === "html"
      ? await page.content()
      : await page.evaluate(() => document.body?.innerText || "");
    return {
      url,
      title,
      format,
      content: String(content).slice(0, 200000),
      capturedAt: new Date().toISOString(),
    };
  });

  await env.BROWSER_CACHE.put(cacheKey, JSON.stringify(result), {
    expirationTtl: Number(env.CACHE_TTL_SECONDS || 86400),
  });
  return json({ ...result, cached: false });
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/health") {
        return json({ ok: true, service: "cheshire-browser-run", cache: "kv", browser: "cloudflare" });
      }
      if (pathname === "/v1/screenshot") return screenshot(request, env);
      if (pathname === "/v1/extract") return extract(request, env);
      return json({ error: "not found" }, { status: 404 });
    } catch (error: any) {
      return json({ error: error.message || "browser run failed" }, { status: 400 });
    }
  },
} satisfies ExportedHandler<Env>;
