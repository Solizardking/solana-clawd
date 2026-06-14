/**
 * News integration — optional NewsAPI/Exa headlines + search.
 * Server-side only; keys never exposed to browser.
 */
import { Router } from "express";
import { z } from "zod";

const router = Router();

const NEWS_BASE = "https://newsapi.org/v2";
const KEY = () => process.env.NEWS_API_KEY || "";
const EXA_KEY = () => process.env.EXA_API_KEY || "";
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: any }>();

function emptyNewsResponse() {
  return {
    status: "ok",
    totalResults: 0,
    articles: [],
    provider: "none",
    message: "News search is not configured. Token trending uses Birdeye separately.",
  };
}

async function exaNewsSearch(query: string, pageSize = 20) {
  const key = EXA_KEY();
  if (!key) return emptyNewsResponse();

  const cacheKey = `exa:${query}:${pageSize}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ query, numResults: pageSize, useAutoprompt: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `Exa error ${r.status}`);

  const articles = (data.results || []).map((item: any) => {
    let host = "Web";
    try {
      if (item.url) host = new URL(item.url).hostname;
    } catch {
      host = "Web";
    }
    return {
      title: item.title || item.url,
      description: item.snippet || "",
      url: item.url,
      source: { name: item.author || host },
      publishedAt: item.publishedDate || null,
    };
  });
  const result = { status: "ok", totalResults: articles.length, articles, provider: "exa" };
  cache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

async function newsFetch(path: string, params: Record<string, any>) {
  const key = KEY();
  if (!key) {
    const query = String(params.q || "crypto Solana AI latest news");
    return exaNewsSearch(query, Number(params.pageSize) || 20);
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const url = `${NEWS_BASE}${path}?${qs.toString()}`;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

  const r = await fetch(url, {
    headers: { "X-Api-Key": key, "User-Agent": "CheshireTerminal/1.0" },
  });
  const data = await r.json();
  if (!r.ok || data.status !== "ok") {
    throw new Error(data.message || `NewsAPI error ${r.status}`);
  }
  cache.set(url, { at: Date.now(), data });
  return data;
}

// GET /api/news/headlines — top headlines (general or filtered)
router.get("/headlines", async (req, res) => {
  try {
    const v = z
      .object({
        country: z.string().optional(),
        category: z
          .enum(["business", "entertainment", "general", "health", "science", "sports", "technology"])
          .optional(),
        sources: z.string().optional(),
        q: z.string().optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(req.query);

    const params: Record<string, any> = { pageSize: v.pageSize ?? 20 };
    if (v.sources) params.sources = v.sources;
    else {
      params.country = v.country ?? "us";
      if (v.category) params.category = v.category;
    }
    if (v.q) params.q = v.q;

    const data = await newsFetch("/top-headlines", params);
    res.json({ status: "ok", totalResults: data.totalResults, articles: data.articles, provider: data.provider || "newsapi" });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e?.message });
  }
});

// GET /api/news/trending — curated crypto/Solana/AI headline mix
router.get("/trending", async (_req, res) => {
  try {
    const data = await newsFetch("/everything", {
      q: "(crypto OR Solana OR memecoin OR Bitcoin OR Ethereum OR AI) AND (launch OR price OR rally OR ETF)",
      language: "en",
      sortBy: "publishedAt",
      pageSize: 25,
    });
    res.json({ status: "ok", totalResults: data.totalResults, articles: data.articles, provider: data.provider || "newsapi" });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e?.message });
  }
});

// GET /api/news/everything — full search
router.get("/everything", async (req, res) => {
  try {
    const v = z
      .object({
        q: z.string().min(1),
        sources: z.string().optional(),
        domains: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        language: z.string().optional(),
        sortBy: z.enum(["relevancy", "popularity", "publishedAt"]).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
        page: z.coerce.number().int().min(1).optional(),
      })
      .parse(req.query);
    const data = await newsFetch("/everything", { language: "en", ...v });
    res.json({ status: "ok", totalResults: data.totalResults, articles: data.articles, provider: data.provider || "newsapi" });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e?.message });
  }
});

// GET /api/news/sources
router.get("/sources", async (req, res) => {
  try {
    const v = z
      .object({
        category: z.string().optional(),
        language: z.string().optional(),
        country: z.string().optional(),
      })
      .parse(req.query);
    const data = await newsFetch("/top-headlines/sources", v);
    res.json({ status: "ok", sources: data.sources || [], provider: data.provider || "newsapi" });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e?.message });
  }
});

router.get("/health", (_req, res) => {
  res.json({ configured: !!KEY() || !!EXA_KEY(), provider: KEY() ? "newsapi" : EXA_KEY() ? "exa" : "none" });
});

export default router;
