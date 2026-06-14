// @ts-nocheck
/**
 * AI-powered command handlers for the Telegram bot.
 * Direct API calls to all services available in the terminal.
 */

import OpenAI from 'openai';

// ── API clients ──────────────────────────────────────────────────────────────

function xaiClient() {
  return new OpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: process.env.XAI_API_KEY || '' });
}

function openaiClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
}

// OpenRouter has been replaced by DeepSeek (see deepseekClient below).

const BIRDEYE_KEY = () => process.env.BIRDEYE_API_KEY || '';
const FAL_KEY    = () => process.env.FAL_API_KEY || '';
const EXA_KEY    = () => process.env.EXA_API_KEY || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function truncate(text: string, max = 3800) {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export function fmt(n: number, decimals = 6) {
  if (n === undefined || n === null) return 'N/A';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(decimals);
}

export function pct(n: number) {
  if (n === undefined || n === null) return 'N/A';
  const sign = n >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(n).toFixed(2)}%`;
}

// ── Grok / xAI ───────────────────────────────────────────────────────────────

export async function askGrok(prompt: string, system?: string): Promise<string> {
  try {
    const client = xaiClient();
    const res = await client.chat.completions.create({
      model: process.env.TELEGRAM_GROK_MODEL || process.env.XAI_GROK_MODEL || 'grok-4.3',
      messages: [
        { role: 'system', content: system || 'You are CLAWD, a sharp crypto AI assistant embedded in a Telegram bot. Be concise, current, insightful, and a little snarky. Keep answers under 400 words.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.8,
    });
    return res.choices[0]?.message?.content?.trim() || 'No response.';
  } catch (err: any) {
    throw new Error(`Grok error: ${err.message}`);
  }
}

export async function askGrokLive(
  prompt: string,
  mode: 'web' | 'x' | 'both' = 'both',
  system?: string,
): Promise<{ content: string; citations?: unknown[] }> {
  try {
    const client = xaiClient();
    const tools: any[] = [];
    if (mode === 'web' || mode === 'both') {
      tools.push({ type: 'web_search', enable_image_understanding: true });
    }
    if (mode === 'x' || mode === 'both') {
      tools.push({ type: 'x_search', enable_image_understanding: true, enable_video_understanding: true });
    }
    const res = await client.chat.completions.create({
      model: process.env.TELEGRAM_GROK_LIVE_MODEL || process.env.TELEGRAM_GROK_MODEL || 'grok-4.3',
      messages: [
        {
          role: 'system',
          content: system ||
            'You are CLAWD running Grok live search from Telegram. Use X and web search when provided. Cite concrete sources or X handles when useful. Keep the final answer under 700 words.',
        },
        { role: 'user', content: prompt },
      ],
      tools,
      reasoning_effort: 'medium',
      max_tokens: 1200,
      temperature: 0.4,
    } as any);
    return {
      content: res.choices[0]?.message?.content?.trim() || 'No response.',
      citations: (res as any).citations,
    };
  } catch (err: any) {
    throw new Error(`Grok live search error: ${err.message}`);
  }
}

// ── DeepSeek direct API (deepseek-v4-pro with thinking) ──────────────────────

function deepseekClient() {
  return new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
  });
}

export async function askDeepSeek(
  prompt: string,
  useThinking = true,
  systemOverride?: string,
): Promise<string> {
  const system = systemOverride ||
    'You are CLAWD — a sharp crypto AI lobster embedded in a Telegram bot. ' +
    'Be concise, insightful, and a little piratical. Keep responses under 600 words. Use bullet points for clarity.';
  try {
    const client = deepseekClient();
    // deepseek-reasoner = DeepSeek-R1 (full chain-of-thought), deepseek-chat = V3 (fast)
    const model = useThinking ? 'deepseek-reasoner' : 'deepseek-chat';
    const res = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: useThinking ? 1500 : 900,
    });
    const content = res.choices[0]?.message?.content?.trim() || 'No response.';
    // R1 exposes chain-of-thought in reasoning_content — surface it briefly
    const msg = res.choices[0]?.message as Record<string, unknown>;
    const reasoning = typeof msg?.reasoning_content === 'string' ? msg.reasoning_content : undefined;
    if (useThinking && reasoning && reasoning.length > 80) {
      return `🧠 <i>Reasoned for ${Math.round(reasoning.length / 5)} tokens</i>\n\n${content}`;
    }
    return content;
  } catch (err: unknown) {
    // Fallback: V3 chat if R1 unavailable
    try {
      const res = await deepseekClient().chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        max_tokens: 900,
      });
      return res.choices[0]?.message?.content?.trim() || 'No response.';
    } catch {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`DeepSeek error: ${msg}`);
    }
  }
}

// ── /claude alias → DeepSeek-chat for back-compat ────────────────────────────

export async function askClaude(prompt: string): Promise<string> {
  try {
    const res = await deepseekClient().chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a knowledgeable crypto and tech assistant. Be helpful, precise, and concise. Keep responses under 400 words.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
    });
    return res.choices[0]?.message?.content?.trim() || 'No response.';
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DeepSeek error: ${msg}`);
  }
}

// ── Image generation helpers ──────────────────────────────────────────────────

type ImageResult = { url?: string; b64?: string; revisedPrompt?: string };

// Generates via gpt-image-2 (returns base64) with DALL-E 3 URL fallback
export async function generateImageGPT(prompt: string, size: '1024x1024' | '1536x1024' | '1024x1536' = '1024x1024'): Promise<ImageResult> {
  const client = openaiClient();
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  try {
    // gpt-image-2 — returns base64 JSON, JPEG output for speed
    const res = await (client.images.generate as any)({
      model: 'gpt-image-2',
      prompt,
      n: 1,
      size,
      quality: 'medium',
      output_format: 'jpeg',
      output_compression: 85,
    });
    const b64 = res.data?.[0]?.b64_json as string | undefined;
    if (b64) return { b64 };
  } catch {
    // fall through to DALL-E 3
  }

  // DALL-E 3 fallback — returns a URL
  const res = await (client.images.generate as any)({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  });
  const img = res.data?.[0] as any;
  return { url: img?.url || '', revisedPrompt: img?.revised_prompt };
}

// Legacy DALL-E 3 URL path (used by /imagine)
export async function generateImage(prompt: string): Promise<{ url: string; revisedPrompt?: string }> {
  try {
    const client = openaiClient();
    const res = await (client.images.generate as any)({
      model: 'dall-e-3',
      prompt: `${prompt} — vibrant, high quality, crypto/web3 aesthetic`,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    const img = res.data[0] as any;
    return { url: img.url || '', revisedPrompt: img.revised_prompt };
  } catch (err: any) {
    throw new Error(`Image gen error: ${err.message}`);
  }
}

// /goblin — generates a CLAWD goblin character
export async function generateGoblinImage(theme = ''): Promise<ImageResult> {
  const base =
    'A highly detailed fantasy illustration of a mischievous crypto goblin holding a glowing $CLAWD coin, ' +
    'dark dungeon background with Solana purple and green neon accents, digital art, dramatic lighting';
  const prompt = theme ? `${base}. Theme: ${theme}.` : base;
  return generateImageGPT(prompt, '1024x1024');
}

// /art — high-quality custom art generation
export async function generateArt(prompt: string): Promise<ImageResult> {
  const enriched =
    `Create a stunning, highly detailed digital artwork: ${prompt}. ` +
    'Style: cinematic, ultra HD, professional concept art, rich colours, dramatic composition.';
  return generateImageGPT(enriched, '1024x1024');
}

// ── FAL video generation ──────────────────────────────────────────────────────

export async function submitFalVideo(prompt: string): Promise<string> {
  const key = FAL_KEY();
  if (!key) throw new Error('FAL_API_KEY not configured');
  const model = 'bytedance/seedance-2.0/fast/text-to-video';
  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { prompt, duration: '5', resolution: '720p', aspect_ratio: '16:9' } }),
  });
  if (!r.ok) throw new Error(`FAL submit error ${r.status}`);
  const data = await r.json();
  return data.request_id;
}

export async function pollFalVideo(requestId: string, model = 'bytedance/seedance-2.0/fast/text-to-video'): Promise<string | null> {
  const key = FAL_KEY();
  const r = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${key}` },
  });
  if (!r.ok) return null;
  const s = await r.json();
  if (s.status === 'COMPLETED') {
    const result = await (await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
      headers: { Authorization: `Key ${key}` },
    })).json();
    return result?.video?.url || result?.videos?.[0]?.url || null;
  }
  if (s.status === 'FAILED') throw new Error('FAL video generation failed');
  return null; // still pending
}

// ── Birdeye token price ───────────────────────────────────────────────────────

export async function getTokenPrice(address: string): Promise<any> {
  const key = BIRDEYE_KEY();
  if (!key) throw new Error('BIRDEYE_API_KEY not configured');
  const r = await fetch(`https://public-api.birdeye.so/defi/price?address=${address}`, {
    headers: { 'X-API-KEY': key, 'x-chain': 'solana' },
  });
  if (!r.ok) throw new Error(`Birdeye error ${r.status}`);
  return (await r.json()).data;
}

export async function getTokenOverview(address: string): Promise<any> {
  const key = BIRDEYE_KEY();
  if (!key) throw new Error('BIRDEYE_API_KEY not configured');
  const r = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${address}`, {
    headers: { 'X-API-KEY': key, 'x-chain': 'solana' },
  });
  if (!r.ok) throw new Error(`Birdeye error ${r.status}`);
  return (await r.json()).data;
}

export async function getTrendingTokens(limit = 10): Promise<any[]> {
  const key = BIRDEYE_KEY();
  if (!key) throw new Error('BIRDEYE_API_KEY not configured');
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const r = await fetch(`https://public-api.birdeye.so/defi/token_trending?sort_by=volume24hUSD&interval=24h&sort_type=desc&offset=0&limit=${safeLimit}&ui_amount_mode=scaled`, {
    headers: { 'x-api-key': key, 'x-chain': 'solana', accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`Birdeye error ${r.status}`);
  const d: any = await r.json();
  return d.data?.tokens || d.data?.items || [];
}

export async function getWalletNetWorth(wallet: string): Promise<any> {
  const key = BIRDEYE_KEY();
  if (!key) throw new Error('BIRDEYE_API_KEY not configured');
  const url = `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${wallet}&include_low_liquidity=false`;
  const r = await fetch(url, { headers: { 'X-API-KEY': key, 'x-chain': 'solana' } });
  if (!r.ok) throw new Error(`Birdeye wallet error ${r.status}`);
  return (await r.json()).data;
}

// ── Exa web search ────────────────────────────────────────────────────────────

export async function exaSearch(query: string, numResults = 5): Promise<any[]> {
  const key = EXA_KEY();
  if (!key) throw new Error('EXA_API_KEY not configured');
  const r = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, numResults, type: 'neural', useAutoprompt: true }),
  });
  if (!r.ok) throw new Error(`Exa search error ${r.status}`);
  const d = await r.json();
  return d.results || [];
}

// ── Market analysis via Grok ──────────────────────────────────────────────────

export async function analyzeToken(address: string): Promise<string> {
  let tokenData = '';
  try {
    const overview = await getTokenOverview(address);
    if (overview) {
      tokenData = `Token: ${overview.name || 'Unknown'} (${overview.symbol || '?'})
Price: $${overview.price?.toFixed(8) || 'N/A'}
24h Change: ${pct(overview.priceChange24hPercent)}
Volume 24h: $${fmt(overview.v24hUSD, 0)}
Market Cap: $${fmt(overview.mc, 0)}
Liquidity: $${fmt(overview.liquidity, 0)}
Holders: ${fmt(overview.holder, 0)}
Address: ${address.slice(0, 8)}...${address.slice(-6)}`;
    }
  } catch {}

  const prompt = tokenData
    ? `Analyze this Solana token for a crypto trader:\n\n${tokenData}\n\nGive a brief, honest analysis: sentiment, red/green flags, and a one-line verdict.`
    : `Analyze Solana token with address ${address}. Note that live data was unavailable, so use your knowledge. Keep it brief.`;

  return askGrok(prompt);
}

// ── Meme coin idea generator ──────────────────────────────────────────────────

export async function generateMemeIdea(theme: string): Promise<string> {
  return askGrok(
    `Generate a meme coin concept for Solana based on: "${theme}". 
Include: name, ticker (3-5 chars), one-line description, total supply (e.g. 1B), and 3 marketing angles. 
Make it fun and degen. Format with emojis.`
  );
}

// ── CLAWD balance via Helius DAS ──────────────────────────────────────────────

const CLAWD_MINT = process.env.CLAWD_TOKEN_ADDRESS || '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump';
const CLAWD_MIN  = Number(process.env.CLAWD_MIN_BALANCE ?? '100000');

export async function verifyClawd(walletAddress: string): Promise<{
  ok: boolean; balance: number; isHolder: boolean; error?: string
}> {
  const rpcUrl = process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : '') ||
    'https://api.mainnet-beta.solana.com';
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'clawd-tg', method: 'getTokenAccountsByOwner',
        params: [walletAddress, { mint: CLAWD_MINT }, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    if (data?.error) return { ok: false, balance: 0, isHolder: false, error: data.error.message };
    const accounts = data?.result?.value ?? [];
    let balance = 0;
    for (const acct of accounts) {
      const ui = acct?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof ui === 'number') balance += ui;
    }
    return { ok: true, balance, isHolder: balance >= CLAWD_MIN };
  } catch (err: any) {
    return { ok: false, balance: 0, isHolder: false, error: err.message };
  }
}

// ── Format trending tokens for Telegram ──────────────────────────────────────

export function formatTrending(tokens: any[]): string {
  if (!tokens.length) return 'No trending data available.';
  const lines = tokens.slice(0, 10).map((t, i) => {
    const name = t.name || t.symbol || 'Unknown';
    const sym  = t.symbol ? `$${t.symbol}` : '';
    const price = t.price ? `$${t.price < 0.001 ? t.price.toExponential(2) : t.price.toFixed(6)}` : '';
    const chg   = t.priceChange24hPercent != null ? pct(t.priceChange24hPercent) : '';
    const vol   = t.v24hUSD ? `Vol: $${fmt(t.v24hUSD, 0)}` : '';
    return `${i + 1}. <b>${name}</b> ${sym}\n   ${price} ${chg} ${vol}`.trim();
  });
  return lines.join('\n\n');
}
