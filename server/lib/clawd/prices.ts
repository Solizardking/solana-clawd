import fetch from 'node-fetch';
import type { PriceSnapshot, WatchItem } from './types';

const BIRDEYE = 'https://public-api.birdeye.so';

export const DEFAULT_WATCHLIST: WatchItem[] = [
  { symbol: 'CLAWD', mint: '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump', enabled: true },
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', enabled: true },
];

const history = new Map<string, number[]>();

export async function fetchSnapshot(item: WatchItem): Promise<PriceSnapshot | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;

  try {
    const r = await fetch(`${BIRDEYE}/defi/price?address=${item.mint}`, {
      headers: { 'x-api-key': key, accept: 'application/json', 'x-chain': 'solana' },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as any;
    const price = d?.data?.value ?? 0;
    if (!price) return null;

    const r2 = await fetch(`${BIRDEYE}/defi/token_overview?address=${item.mint}`, {
      headers: { 'x-api-key': key, accept: 'application/json', 'x-chain': 'solana' },
    }).catch(() => null);
    const overview: any = r2?.ok ? await r2.json() : null;

    const buf = history.get(item.mint) ?? [];
    buf.push(price);
    while (buf.length > 60) buf.shift();
    history.set(item.mint, buf);

    return {
      symbol: item.symbol,
      mint: item.mint,
      price,
      priceChange1h: overview?.data?.priceChange1hPercent ?? 0,
      priceChange24h: overview?.data?.priceChange24hPercent ?? 0,
      volume24h: overview?.data?.v24hUSD ?? 0,
      ts: Date.now(),
      history: [...buf],
    };
  } catch {
    return null;
  }
}

export async function fetchAllSnapshots(items: WatchItem[]): Promise<PriceSnapshot[]> {
  const enabled = items.filter((i) => i.enabled);
  const results = await Promise.all(enabled.map(fetchSnapshot));
  return results.filter((s): s is PriceSnapshot => s !== null);
}
