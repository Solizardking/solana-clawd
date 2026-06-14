import Exa from "exa-js";

let exa: Exa | null = null;

function getExa() {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  if (!exa) {
    exa = new Exa(apiKey);
  }

  return exa;
}

export interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  highlights?: string[];
  text?: string;
  source: string;
  description: string;
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function mapResult(r: any): ExaResult {
  return {
    id: r.id || r.url,
    title: r.title || "Untitled",
    url: r.url,
    publishedDate: r.publishedDate,
    author: r.author,
    score: r.score,
    highlights: Array.isArray(r.highlights) ? r.highlights : [],
    text: r.text,
    source: extractDomain(r.url),
    description: (Array.isArray(r.highlights) ? r.highlights[0] : undefined) || (typeof r.text === "string" ? r.text.slice(0, 220) : ""),
  };
}

export async function exaSearch(query: string, opts: {
  numResults?: number;
  type?: "auto" | "keyword" | "neural";
  includeDomains?: string[];
  getText?: boolean;
  maxCharacters?: number;
} = {}): Promise<ExaResult[]> {
  try {
    const client = getExa();
    if (!client) {
      console.warn("[ExaService] EXA_API_KEY not configured; returning no search results");
      return [];
    }

    const result = await client.search(query, {
      numResults: opts.numResults ?? 8,
      type: opts.type ?? "auto",
      contents: {
        highlights: true,
        ...(opts.getText ? { text: { maxCharacters: opts.maxCharacters ?? 5000 } } : {}),
      },
      ...(opts.includeDomains ? { includeDomains: opts.includeDomains } : {}),
    });
    return (result.results || []).map(mapResult);
  } catch (err) {
    console.error("[ExaService] search error:", err);
    return [];
  }
}

export async function exaGetContents(urls: string[], maxCharacters = 10000): Promise<ExaResult[]> {
  try {
    const client = getExa();
    if (!client) {
      console.warn("[ExaService] EXA_API_KEY not configured; returning no contents");
      return [];
    }

    const result = await client.getContents(urls, { text: { maxCharacters } });
    return (result.results || []).map(mapResult);
  } catch (err) {
    console.error("[ExaService] getContents error:", err);
    return [];
  }
}

export async function exaCryptoSearch(query: string, numResults = 8): Promise<ExaResult[]> {
  return exaSearch(`${query} crypto solana defi`, {
    numResults,
    type: "auto",
    includeDomains: [
      "coindesk.com", "cointelegraph.com", "decrypt.co",
      "theblock.co", "cryptoslate.com", "beincrypto.com",
      "dexscreener.com", "coingecko.com", "coinmarketcap.com",
      "solana.com", "birdeye.so", "pump.fun",
    ],
  });
}

export async function exaWebSearch(query: string, numResults = 8): Promise<ExaResult[]> {
  return exaSearch(query, { numResults, type: "auto" });
}

// Keep backward-compat class export used by existing search.ts
export class ExaSearchService {
  async searchContent(opts: { query: string; numResults?: number; includeDomains?: string[] }): Promise<ExaResult[]> {
    return exaSearch(opts.query, { numResults: opts.numResults, includeDomains: opts.includeDomains });
  }
  async getContentDetails(urls: string[]): Promise<ExaResult[]> {
    return exaGetContents(urls);
  }
}
export const exaService = new ExaSearchService();
