export interface NormalizedChartPoint {
  unixTime: number;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  price: number;
  source?: string;
}

export function normalizeChartPoint(item: any): NormalizedChartPoint | null {
  const unixTime = Number(item?.unixTime ?? item?.unix_time ?? item?.time ?? item?.timestamp);
  const normalizedUnixTime = unixTime > 10_000_000_000 ? Math.floor(unixTime / 1000) : unixTime;
  const open = Number(item?.open ?? item?.o ?? item?.price);
  const high = Number(item?.high ?? item?.h ?? item?.price);
  const low = Number(item?.low ?? item?.l ?? item?.price);
  const close = Number(item?.close ?? item?.c ?? item?.price);
  const volume = Number(item?.volume ?? item?.v ?? item?.v_usd ?? item?.vUsd ?? item?.vBase ?? item?.vQuote ?? 0);

  if (!Number.isFinite(normalizedUnixTime) || !Number.isFinite(close)) return null;

  return {
    unixTime: normalizedUnixTime,
    timestamp: normalizedUnixTime * 1000,
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    price: close,
    source: item?.source,
  };
}

export function normalizeChartResponse(response: any): NormalizedChartPoint[] {
  const items =
    response?.data?.items ||
    response?.items ||
    response?.ohlcv ||
    response?.oclhv ||
    response?.data ||
    response;

  if (!Array.isArray(items)) return [];

  return items
    .map(normalizeChartPoint)
    .filter(Boolean)
    .sort((a, b) => a!.unixTime - b!.unixTime) as NormalizedChartPoint[];
}
