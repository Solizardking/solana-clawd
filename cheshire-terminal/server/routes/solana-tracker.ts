import { Router } from "express";
import fetch from 'node-fetch';
import WebSocket from 'ws';

const router = Router();
const API_BASE_URL = "https://data.solanatracker.io";
const API_KEY = process.env.SOLANA_TRACKER_API_KEY || process.env.VITE_SOLANA_TRACKER_API_KEY;
const BIRDEYE_KEY = process.env.BIRDEYE_API_KEY;
const DATASTREAM_BASE_URL = "wss://datastream.solanatracker.io";

// UI time ranges map to candle sizes. Raw Solana Tracker intervals pass through.
const TIMEFRAME_INTERVALS: Record<string, string> = {
  '1h': '1m',
  '24h': '15m',
  '7d': '1h',
  '30d': '4h',
};

const VALID_INTERVALS = new Set([
  '1s', '5s', '15s', '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1mn',
]);

const OWNERSHIP_CHART_ENDPOINTS = {
  bundlers: '/bundlers/chart',
  holders: '/holders/chart',
  insiders: '/insiders/chart',
  snipers: '/snipers/chart',
} as const;

type OwnershipChartMetric = keyof typeof OWNERSHIP_CHART_ENDPOINTS;

const TOKEN_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeOhlcvItem(item: any) {
  const unixTime = Number(item.unixTime ?? item.unix_time ?? item.time ?? item.timestamp);
  const open = Number(item.open ?? item.o);
  const high = Number(item.high ?? item.h);
  const low = Number(item.low ?? item.l);
  const close = Number(item.close ?? item.c);
  const volume = Number(item.volume ?? item.v ?? item.v_usd ?? item.vUsd ?? item.vBase ?? item.vQuote ?? 0);

  if (!Number.isFinite(unixTime) || !Number.isFinite(close)) return null;

  return {
    ...item,
    unixTime,
    time: unixTime,
    timestamp: unixTime * 1000,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    price: close,
    source: 'solana-tracker',
  };
}

function normalizeOhlcvItems(data: any) {
  const rawItems = data?.data?.items || data?.items || data?.ohlcv || data?.oclhv || [];
  return (Array.isArray(rawItems) ? rawItems : [])
    .map(normalizeOhlcvItem)
    .filter(Boolean)
    .sort((a: any, b: any) => a.unixTime - b.unixTime);
}

function normalizeOwnershipSeries(metric: OwnershipChartMetric, data: any) {
  const seriesKey = metric === 'holders' ? 'holders' : metric;
  const rawItems = Array.isArray(data?.[seriesKey]) ? data[seriesKey] : [];

  return rawItems
    .map((item: any) => {
      const time = Number(item?.time ?? item?.timestamp);
      const value = Number(metric === 'holders' ? item?.holders : item?.percentage);

      if (!Number.isFinite(time) || !Number.isFinite(value)) return null;

      return {
        time,
        timestamp: time * 1000,
        value,
        metric,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.time - b.time);
}

function forwardQueryParams(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          params.append(key, String(item));
        }
      });
      return;
    }
    params.append(key, String(value));
  });
  return params.toString();
}

/**
 * Helper function to make API requests to Solana Tracker with proper headers
 */
const fetchFromSolanaTracker = async (endpoint: string, options: any = {}) => {
  if (!API_KEY) {
    throw new Error('Solana Tracker API key is missing');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const finalOptions = {
    ...options,
    headers: {
      'x-api-key': API_KEY,
      'Accept': 'application/json',
      ...options.headers,
    }
  };

  const response = await fetch(url, finalOptions);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText} (${response.status})`);
  }

  return response.json();
};

// Get trending tokens
router.get("/trending/:timeframe?", async (req, res) => {
  try {
    if (!API_KEY && BIRDEYE_KEY) {
      const r = await fetch("https://public-api.birdeye.so/defi/token_trending?sort_by=volume24hUSD&sort_type=desc&offset=0&limit=20", {
        headers: { "x-api-key": BIRDEYE_KEY, "x-chain": "solana", accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Birdeye API request failed: ${r.statusText} (${r.status})`);
      const d: any = await r.json();
      const tokens = d.data?.tokens || d.data?.items || [];
      res.json(tokens.map((token: any) => ({
        token: {
          symbol: token.symbol || "UNKNOWN",
          name: token.name || "Unknown Token",
          mint: token.address || token.mint || "",
          image: token.logoURI || token.logo_uri || "",
        },
        pools: [{ price: { usd: Number(token.price || 0) } }],
        events: {
          [req.params.timeframe || "1h"]: {
            priceChangePercentage: Number(token.price24hChangePercent ?? token.price_change_24h ?? 0),
          },
          "1h": {
            priceChangePercentage: Number(token.price24hChangePercent ?? token.price_change_24h ?? 0),
          },
        },
      })));
      return;
    }

    const timeframe = req.params.timeframe || '1h';
    const data = await fetchFromSolanaTracker(`/tokens/trending/${timeframe}`);

    res.json(data);
  } catch (error) {
    console.error("Error fetching trending tokens:", error);
    res.status(500).json({ error: "Failed to fetch trending tokens" });
  }
});

// Get token data including risk score
router.get("/token/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const data = await fetchFromSolanaTracker(`/tokens/${address}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token data:", error);
    res.status(500).json({ error: "Failed to fetch token data" });
  }
});

// Get token data by pool address
router.get("/token-by-pool/:poolAddress", async (req, res) => {
  try {
    const { poolAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/tokens/by-pool/${poolAddress}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token by pool:", error);
    res.status(500).json({ error: "Failed to fetch token data" });
  }
});

// Get OHLCV chart data
router.get("/chart/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const requestedType = String(req.query.type || req.query.timeframe || '24h');
    const interval = TIMEFRAME_INTERVALS[requestedType] || (VALID_INTERVALS.has(requestedType) ? requestedType : '15m');
    const { time_from, time_to, marketCap, removeOutliers, dynamicPools, currency, fastCache } = req.query;

    const params = new URLSearchParams({
      type: interval,
      ...(time_from && { time_from: time_from.toString() }),
      ...(time_to && { time_to: time_to.toString() }),
      ...(marketCap !== undefined && { marketCap: marketCap.toString() }),
      ...(removeOutliers !== undefined && { removeOutliers: removeOutliers.toString() }),
      ...(dynamicPools !== undefined && { dynamicPools: dynamicPools.toString() }),
      ...(currency && { currency: currency.toString() }),
      ...(fastCache !== undefined && { fastCache: fastCache.toString() }),
    });

    const data: any = await fetchFromSolanaTracker(`/chart/${token}?${params}`);
    const items = normalizeOhlcvItems(data);

    res.json({
      ...data,
      success: true,
      source: 'solana-tracker',
      interval,
      data: { ...(data?.data || {}), items, source: 'solana-tracker' },
      items,
      ohlcv: items,
      oclhv: items,
    });
  } catch (error) {
    console.error("Error fetching Solana Tracker chart data:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chart data", data: { items: [] }, items: [] });
  }
});

// Get ownership/intel chart data (snipers, bundlers, insiders, holders)
router.get("/ownership-chart/:metric/:tokenAddress", async (req, res) => {
  const metric = req.params.metric as OwnershipChartMetric;
  const { tokenAddress } = req.params;

  if (!(metric in OWNERSHIP_CHART_ENDPOINTS)) {
    return res.status(400).json({ error: "Unsupported ownership chart metric" });
  }

  try {
    const params = forwardQueryParams(req.query as Record<string, unknown>);
    const endpoint = `${OWNERSHIP_CHART_ENDPOINTS[metric]}/${tokenAddress}${params ? `?${params}` : ''}`;
    const data = await fetchFromSolanaTracker(endpoint);
    const items = normalizeOwnershipSeries(metric, data);

    res.json({
      success: true,
      metric,
      tokenAddress,
      data,
      items,
    });
  } catch (error) {
    console.error("Error fetching ownership chart data:", error);
    const seriesKey = metric === 'holders' ? 'holders' : metric;
    res.json({
      success: false,
      metric,
      tokenAddress,
      upstreamUnavailable: true,
      upstreamError: error instanceof Error ? error.message : String(error),
      data: { [seriesKey]: [] },
      items: [],
    });
  }
});

// Search tokens with advanced filtering
router.get("/search", async (req, res) => {
  try {
    const params = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (value !== undefined) {
        params.append(key, value.toString());
      }
    });

    const data = await fetchFromSolanaTracker(`/search?${params}`);
    res.json(data);
  } catch (error) {
    console.error("Error searching tokens:", error);
    res.status(500).json({ error: "Failed to search tokens" });
  }
});

// Get wallet token holdings
router.get("/wallet/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/wallet/${walletAddress}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching wallet tokens:", error);
    res.status(500).json({ error: "Failed to fetch wallet tokens" });
  }
});

// Get token price
router.get("/price", async (req, res) => {
  try {
    const params = forwardQueryParams(req.query as Record<string, unknown>);
    const data = await fetchFromSolanaTracker(`/price${params ? `?${params}` : ''}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token price:", error);
    res.status(500).json({ error: "Failed to fetch token price" });
  }
});

// Get prices for multiple tokens
router.get("/price/multi", async (req, res) => {
  try {
    const params = forwardQueryParams(req.query as Record<string, unknown>);
    const data = await fetchFromSolanaTracker(`/price/multi${params ? `?${params}` : ''}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token prices:", error);
    res.status(500).json({ error: "Failed to fetch token prices" });
  }
});

// Get latest indexed tokens
router.get("/latest", async (req, res) => {
  try {
    const params = forwardQueryParams(req.query as Record<string, unknown>);
    const data = await fetchFromSolanaTracker(`/tokens/latest${params ? `?${params}` : ''}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching latest tokens:", error);
    res.status(500).json({ error: "Failed to fetch latest tokens" });
  }
});

// Get data for multiple tokens
router.post("/tokens/multi", async (req, res) => {
  try {
    const data = await fetchFromSolanaTracker('/tokens/multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    res.json(data);
  } catch (error) {
    console.error("Error fetching multi token data:", error);
    res.status(500).json({ error: "Failed to fetch multi token data" });
  }
});

// Get token holders
router.get("/holders/:tokenAddress", async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/tokens/${tokenAddress}/holders`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token holders:", error);
    res.status(500).json({ error: "Failed to fetch token holders" });
  }
});

// Get bundler wallet snapshot
router.get("/bundlers/:tokenAddress", async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/tokens/${tokenAddress}/bundlers`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token bundlers:", error);
    res.status(500).json({ error: "Failed to fetch token bundlers" });
  }
});

// Get token all time high
router.get("/ath/:tokenAddress", async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/tokens/${tokenAddress}/ath`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching token ATH:", error);
    res.status(500).json({ error: "Failed to fetch token all time high" });
  }
});

// Get tokens created by a specific wallet (deployer)
router.get("/deployer/:walletAddress", async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const data = await fetchFromSolanaTracker(`/deployer/${walletAddress}`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching deployer tokens:", error);
    res.status(500).json({ error: "Failed to fetch deployer tokens" });
  }
});

// Server-side bridge for Solana Tracker sniper + bundler datastream events.
router.get("/stream/:tokenAddress", (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: "Solana Tracker API key is missing" });
  }

  const { tokenAddress } = req.params;
  if (!TOKEN_ADDRESS_PATTERN.test(tokenAddress)) {
    return res.status(400).json({ error: "Invalid token address" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("retry: 5000\n\n");

  const upstream = new WebSocket(`${DATASTREAM_BASE_URL}/${API_KEY}`);
  const rooms = {
    bundler: `bundlers:${tokenAddress}`,
    sniper: `sniper:${tokenAddress}`,
  } as const;

  let closed = false;

  const sendEvent = (event: string, payload: Record<string, unknown>) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(`: keepalive ${Date.now()}\n\n`);
    }
  }, 15_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    try {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(JSON.stringify({ type: 'leave', room: rooms.sniper }));
        upstream.send(JSON.stringify({ type: 'leave', room: rooms.bundler }));
      }
    } catch {
      // Ignore cleanup send failures.
    }
    try { upstream.close(); } catch {}
    try { res.end(); } catch {}
  };

  upstream.on('open', () => {
    sendEvent('ready', {
      tokenAddress,
      subscriptions: ['sniper', 'bundler'],
      connectedAt: new Date().toISOString(),
    });

    upstream.send(JSON.stringify({ type: 'join', room: rooms.sniper }));
    upstream.send(JSON.stringify({ type: 'join', room: rooms.bundler }));
  });

  upstream.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      const room = String(message?.room || '');
      const channel = room.startsWith('sniper:')
        ? 'sniper'
        : room.startsWith('bundlers:')
          ? 'bundler'
          : 'unknown';

      if (message?.type === 'joined') {
        sendEvent('joined', { channel, room });
        return;
      }

      if (message?.type === 'message') {
        sendEvent(channel, {
          room,
          channel,
          ...(message?.data && typeof message.data === 'object' ? message.data : { data: message?.data }),
        });
        return;
      }

      sendEvent('message', { channel, room, payload: message });
    } catch (error) {
      sendEvent('error', {
        message: error instanceof Error ? error.message : 'Failed to parse upstream stream message',
      });
    }
  });

  upstream.on('error', (error) => {
    sendEvent('error', {
      message: error instanceof Error ? error.message : 'Upstream datastream error',
    });
  });

  upstream.on('close', (code, reason) => {
    sendEvent('closed', {
      code,
      reason: reason.toString(),
    });
    cleanup();
  });

  req.on('close', cleanup);
});

// API health check
router.get("/health", async (req, res) => {
  try {
    const data = await fetchFromSolanaTracker(`/api/health`);
    res.json(data);
  } catch (error) {
    console.error("Error checking API health:", error);
    res.json({
      status: "offline",
      degraded: true,
      error: "Failed to check API health",
    });
  }
});

export default router;
