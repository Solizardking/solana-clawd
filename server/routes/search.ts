import { Router } from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { exaSearch, exaCryptoSearch, exaWebSearch } from "../lib/search/exaService";
import OpenAI from "openai";
import { agentsIndex, savedItemsIndex } from "../lib/upstash-search";

const router = Router();

const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

function resolveSolanaRpcUrl() {
  const candidates = [
    process.env.HELIUS_RPC_URL,
    process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : undefined,
    process.env.SOLANA_RPC_URL,
    process.env.VITE_HELIUS_RPC_URL,
    DEFAULT_SOLANA_RPC_URL,
  ];

  for (const candidate of candidates) {
    const url = candidate?.trim();
    if (!url) continue;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    console.warn("[Search] Ignoring invalid Solana RPC URL; expected http(s).");
  }

  return DEFAULT_SOLANA_RPC_URL;
}

const heliusConnection = new Connection(resolveSolanaRpcUrl(), "confirmed");

// XAI/Grok client for AI-powered synthesis
const xai = new OpenAI({
  baseURL: "https://api.x.ai/v1",
  apiKey: process.env.XAI_API_KEY || "",
});

// ------------------------------------------------------------------
// POST /api/search/smart  — Exa search + Grok synthesis
// ------------------------------------------------------------------
router.post("/smart", async (req, res) => {
  const { query, mode = "auto" } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    // Run Exa search + crypto-specific search in parallel
    const [webResults, cryptoResults] = await Promise.all([
      exaWebSearch(query, 6),
      exaCryptoSearch(query, 5),
    ]);

    // Deduplicate by URL
    const seen = new Set<string>();
    const allResults = [...webResults, ...cryptoResults].filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Build context for Grok
    const context = allResults
      .slice(0, 8)
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.description}\nSource: ${r.url}`)
      .join("\n\n");

    // AI synthesis via XAI Grok
    let aiSummary = "";
    try {
      const completion = await xai.chat.completions.create({
        model: "grok-3-mini-fast-beta",
        messages: [
          {
            role: "system",
            content: `You are Clawd, an intelligent crypto & web research assistant on the Open Clawd Terminal. 
Synthesize search results into a concise, insightful answer. 
- Lead with the key insight in 1-2 sentences
- Highlight any crypto/Solana/meme token relevance  
- Mention notable trends or risks if relevant
- Keep it under 150 words, sharp and actionable
- Use plain text, no markdown headers`
          },
          {
            role: "user",
            content: `Query: "${query}"\n\nSearch results:\n${context}\n\nProvide a smart synthesis.`
          }
        ],
        max_tokens: 250,
        temperature: 0.7,
      });
      aiSummary = completion.choices[0]?.message?.content || "";
    } catch (err) {
      console.error("[Search] XAI synthesis error:", err);
      aiSummary = "";
    }

    res.json({
      query,
      aiSummary,
      results: allResults,
      sources: {
        web: webResults.length,
        crypto: cryptoResults.length,
        total: allResults.length,
      }
    });
  } catch (err) {
    console.error("[Search] smart error:", err);
    res.status(500).json({ error: "Search failed", details: String(err) });
  }
});

// ------------------------------------------------------------------
// GET /api/search/exa  — raw Exa search
// ------------------------------------------------------------------
router.get("/exa", async (req, res) => {
  const { query, num = "8", type = "auto", crypto = "false" } = req.query as Record<string, string>;
  if (!query) return res.status(400).json({ error: "Query is required" });

  try {
    const results = crypto === "true"
      ? await exaCryptoSearch(query, parseInt(num))
      : await exaWebSearch(query, parseInt(num));
    res.json({ results });
  } catch (err) {
    console.error("[Search] exa error:", err);
    res.status(500).json({ error: "Exa search failed" });
  }
});

// ------------------------------------------------------------------
// GET /api/search  — legacy route (kept for backward compat)
// ------------------------------------------------------------------
router.get("/", async (req, res) => {
  const { query, type = "all" } = req.query;
  if (!query) return res.status(400).json({ error: "Search query is required" });

  try {
    const [webResults, cryptoResults] = await Promise.all([
      exaWebSearch(query as string, 5),
      exaCryptoSearch(query as string, 5),
    ]);

    const seen = new Set<string>();
    const articles = [...webResults, ...cryptoResults].filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    }).map(r => ({
      title: r.title,
      url: r.url,
      publishedDate: r.publishedDate,
      author: r.author,
      source: r.source,
      description: r.description,
      relevanceScore: r.score,
    }));

    let wallets: any[] = [];
    if (type === "all" || type === "wallet") {
      const possible = (query as string).trim();
      try {
        if (possible.length >= 32 && possible.length <= 44) {
          const pubkey = new PublicKey(possible);
          const info = await heliusConnection.getAccountInfo(pubkey);
          if (info) wallets = [{ address: pubkey.toBase58(), balance: info.lamports }];
        }
      } catch {}
    }

    res.json({ articles, wallets });
  } catch (err) {
    console.error("[Search] legacy error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// ------------------------------------------------------------------
// GET /api/search/agents?q=query&limit=10  — Upstash Search: agent directory
// ------------------------------------------------------------------
router.get("/agents", async (req, res) => {
  if (!agentsIndex) return res.status(503).json({ error: "Search not configured" });
  const { q, limit = "10" } = req.query as Record<string, string>;
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const results = await agentsIndex.search({
      query: q,
      limit: Math.min(parseInt(limit, 10) || 10, 50),
      reranking: true,
    });
    res.json({ results });
  } catch (err) {
    console.error("[Search] agents error:", err);
    res.status(500).json({ error: "Agent search failed" });
  }
});

// ------------------------------------------------------------------
// GET /api/search/saved-items?q=query&userId=123&limit=20  — Upstash Search: saved items
// ------------------------------------------------------------------
router.get("/saved-items", async (req, res) => {
  if (!savedItemsIndex) return res.status(503).json({ error: "Search not configured" });
  const { q, userId, limit = "20" } = req.query as Record<string, string>;
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const searchOpts: Parameters<typeof savedItemsIndex.search>[0] = {
      query: q,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      reranking: true,
    };

    if (userId) {
      searchOpts.filter = `metadata.userId = ${parseInt(userId, 10)}`;
    }

    const results = await savedItemsIndex.search(searchOpts);
    res.json({ results });
  } catch (err) {
    console.error("[Search] saved-items error:", err);
    res.status(500).json({ error: "Saved item search failed" });
  }
});

export default router;
