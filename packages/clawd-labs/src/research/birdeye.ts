const BASE = "https://public-api.birdeye.so";

export interface TokenOverview {
  address: string;
  symbol: string;
  name: string;
  price: number;
  volume24h: number;
  marketCap: number;
  priceChange24h: number;
  holder: number;
}

export interface TrendingToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
  volume24hUSD: number;
  rank: number;
}

export class BirdeyeClient {
  constructor(private apiKey: string) {}

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": this.apiKey, "x-chain": "solana" },
    });
    if (!res.ok) throw new Error(`Birdeye ${res.status}: ${path}`);
    const json = (await res.json()) as { data: T };
    return json.data;
  }

  async trending(limit = 10): Promise<TrendingToken[]> {
    type Raw = { items: Array<{ address: string; symbol: string; name: string; price: number; volume24hUSD: number; rank: number }> };
    const data = await this.get<Raw>("/defi/token_trending", { sort_by: "rank", sort_type: "asc", offset: "0", limit: String(limit) });
    return data.items ?? [];
  }

  async tokenOverview(address: string): Promise<TokenOverview> {
    type Raw = { address: string; symbol: string; name: string; price: number; volume24h: number; marketCap: number; priceChange24h: number; holder: number };
    return this.get<Raw>(`/defi/token_overview`, { address });
  }

  async newMemeListings(limit = 10): Promise<TrendingToken[]> {
    type Raw = { items: Array<{ address: string; symbol: string; name: string; price: number; volume24hUSD: number; rank: number }> };
    const data = await this.get<Raw>("/defi/v2/tokens/new_listing", { meme_platform_enabled: "true", limit: String(limit) });
    return data.items ?? [];
  }
}
