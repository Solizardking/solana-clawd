import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { db, hasDatabase } from "../../db";
import { walletTelegramLinks } from "@shared/schema";
import { getPublicAppUrl } from "./auth";

type TradingVenue =
  | "auto"
  | "meteora_swap"
  | "jupiter_ultra"
  | "dflow_intent"
  | "phoenix_perps"
  | "dflow_prediction"
  | "clawd_arena"
  | "portfolio"
  | "unknown";

type TradingAction =
  | "quote"
  | "swap"
  | "buy"
  | "sell"
  | "long"
  | "short"
  | "close"
  | "positions"
  | "markets"
  | "search"
  | "liquidity"
  | "status"
  | "unknown";

type TradingIntent = {
  isTrading: boolean;
  venue: TradingVenue;
  action: TradingAction;
  fromToken?: string | null;
  toToken?: string | null;
  amount?: number | null;
  slippageBps?: number | null;
  market?: string | null;
  side?: "long" | "short" | "buy" | "sell" | null;
  orderType?: "market" | "limit" | null;
  limitPrice?: number | null;
  query?: string | null;
  needsClarification?: boolean;
  clarification?: string | null;
  confidence?: number;
};

type TokenInfo = {
  symbol: string;
  mint: string;
  decimals: number;
};

type TelegramButton =
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export type TelegramTradingPlan = {
  handled: boolean;
  text: string;
  buttons?: TelegramButton[][];
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const KNOWN_TOKENS: Record<string, TokenInfo> = {
  SOL: { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  WSOL: { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  CLAWD: { symbol: "CLAWD", mint: CLAWD_MINT, decimals: 6 },
  USDC: { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
  USDT: { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  BONK: { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", decimals: 5 },
  JUP: { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6 },
  RAY: { symbol: "RAY", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", decimals: 6 },
  WIF: { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", decimals: 6 },
};

const TRADING_KEYWORDS =
  /\b(trade|swap|buy|sell|ape|long|short|perp|perps|position|positions|close|order|market order|limit order|jupiter|meteora|dflow|phoenix|prediction market|liquidity|quote)\b/i;

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appUrl() {
  return getPublicAppUrl().replace(/\/$/, "");
}

function appPath(path: string, params?: Record<string, string | number | undefined | null>) {
  const url = new URL(`${appUrl()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function toBaseUnits(amount: number, decimals: number) {
  const scaled = Math.round(amount * 10 ** decimals);
  return String(Math.max(0, scaled));
}

function formatNumber(value: unknown, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  if (Math.abs(n) >= 1_000_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^\$/, "").toUpperCase();
  return cleaned || null;
}

function resolveToken(value: unknown): TokenInfo | null {
  const symbol = normalizeSymbol(value);
  if (!symbol) return null;
  return KNOWN_TOKENS[symbol] ?? null;
}

function isClawdSolPair(input: TokenInfo | null, output: TokenInfo | null) {
  if (!input || !output) return false;
  const mints = new Set([input.mint, output.mint]);
  return mints.has(SOL_MINT) && mints.has(CLAWD_MINT);
}

function normalizeVenue(intent: TradingIntent, input: TokenInfo | null, output: TokenInfo | null): TradingVenue {
  if (intent.venue && intent.venue !== "auto" && intent.venue !== "unknown") return intent.venue;
  if (intent.action === "long" || intent.action === "short" || intent.action === "close" || intent.action === "positions") {
    return "phoenix_perps";
  }
  if (intent.query && /prediction|market|event|odds|yes|no/i.test(intent.query)) return "dflow_prediction";
  if (isClawdSolPair(input, output)) return "meteora_swap";
  if (input && output) return "dflow_intent";
  return "unknown";
}

function normalizeIntent(raw: Partial<TradingIntent>, original: string): TradingIntent {
  const action = String(raw.action ?? "unknown").toLowerCase() as TradingAction;
  const venue = String(raw.venue ?? "auto").toLowerCase() as TradingVenue;
  const amount = typeof raw.amount === "number" ? raw.amount : Number(raw.amount);
  const slippage = typeof raw.slippageBps === "number" ? raw.slippageBps : Number(raw.slippageBps);

  return {
    isTrading: raw.isTrading !== false,
    venue,
    action,
    fromToken: normalizeSymbol(raw.fromToken) ?? null,
    toToken: normalizeSymbol(raw.toToken) ?? null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    slippageBps: Number.isFinite(slippage) && slippage > 0 ? Math.min(slippage, 5_000) : null,
    market: typeof raw.market === "string" && raw.market.trim() ? raw.market.trim().toUpperCase() : null,
    side: raw.side ?? null,
    orderType: raw.orderType ?? null,
    limitPrice: typeof raw.limitPrice === "number" ? raw.limitPrice : null,
    query: typeof raw.query === "string" && raw.query.trim() ? raw.query.trim() : original,
    needsClarification: Boolean(raw.needsClarification),
    clarification: typeof raw.clarification === "string" ? raw.clarification : null,
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
  };
}

function regexFallbackIntent(text: string): TradingIntent {
  const lower = text.toLowerCase();
  const amount = Number(text.match(/(?:^|\s)(\d+(?:\.\d+)?)/)?.[1]);
  const knownSymbols = Object.keys(KNOWN_TOKENS).join("|");
  const symbols = Array.from(text.matchAll(new RegExp(`\\b(${knownSymbols})\\b`, "gi"))).map((m) => normalizeSymbol(m[1])).filter(Boolean) as string[];

  if (/\b(perp|perps|long|short|position|positions|close)\b/i.test(text)) {
    const market = normalizeSymbol(symbols.find((s) => s !== "USDC") ?? text.match(/\b(SOL|BTC|ETH)\b/i)?.[1]) ?? "SOL";
    return normalizeIntent({
      isTrading: true,
      venue: "phoenix_perps",
      action: lower.includes("short") ? "short" : lower.includes("long") ? "long" : lower.includes("close") ? "close" : "positions",
      market,
      amount: Number.isFinite(amount) ? amount : null,
      orderType: lower.includes("limit") ? "limit" : "market",
    }, text);
  }

  if (/\b(prediction|odds|yes|no)\b/i.test(text)) {
    return normalizeIntent({ isTrading: true, venue: "dflow_prediction", action: "search", query: text }, text);
  }

  const sellToken = normalizeSymbol(text.match(/\b(?:sell|dump|exit)\s+(?:\d+(?:\.\d+)?\s+)?([A-Za-z$]{2,10})\b/i)?.[1]);
  const buyToken = normalizeSymbol(text.match(/\b(?:buy|ape|long)\b.*?\b([A-Za-z$]{2,10})\b/i)?.[1]);
  const fromToken = sellToken ?? (symbols.includes("SOL") ? "SOL" : symbols[0] ?? null);
  const toToken = sellToken ? "SOL" : (buyToken && buyToken !== fromToken ? buyToken : symbols.find((s) => s !== fromToken) ?? "CLAWD");

  return normalizeIntent({
    isTrading: true,
    venue: "auto",
    action: sellToken ? "sell" : "buy",
    fromToken,
    toToken,
    amount: Number.isFinite(amount) ? amount : null,
  }, text);
}

async function parseTradingIntent(text: string): Promise<TradingIntent> {
  if (!process.env.DEEPSEEK_API_KEY) return regexFallbackIntent(text);

  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });

  const system = [
    "You parse Telegram messages into live trading intents for Cheshire Terminal.",
    "Return only JSON. Do not include markdown.",
    "Supported venues: meteora_swap, jupiter_ultra, dflow_intent, phoenix_perps, dflow_prediction, clawd_arena, portfolio, unknown.",
    "Supported actions: quote, swap, buy, sell, long, short, close, positions, markets, search, liquidity, status, unknown.",
    "Rules:",
    "- SOL/CLAWD spot swaps should prefer meteora_swap.",
    "- Generic Solana token swaps should prefer dflow_intent unless the user explicitly says Jupiter.",
    "- Perpetuals, leverage, long, short, close, and positions should use phoenix_perps.",
    "- Prediction market, yes/no odds, sports/election/event markets should use dflow_prediction.",
    "- Never mark a request as executed or confirmed.",
    "JSON shape:",
    "{\"isTrading\":true,\"venue\":\"auto\",\"action\":\"buy\",\"fromToken\":\"SOL\",\"toToken\":\"CLAWD\",\"amount\":0.1,\"slippageBps\":100,\"market\":\"SOL\",\"side\":\"long\",\"orderType\":\"market\",\"limitPrice\":null,\"query\":\"...\",\"needsClarification\":false,\"clarification\":null,\"confidence\":0.9}",
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: process.env.TELEGRAM_TRADING_DEEPSEEK_MODEL || process.env.DEEPSEEK_TRADING_MODEL || "deepseek-v4-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<TradingIntent>;
    return normalizeIntent(parsed, text);
  } catch {
    return regexFallbackIntent(text);
  }
}

async function getLinkedWallet(telegramId?: string): Promise<string | null> {
  if (!telegramId || !hasDatabase) return null;
  try {
    const [row] = await db
      .select()
      .from(walletTelegramLinks)
      .where(eq(walletTelegramLinks.telegramId, telegramId));
    return row?.walletAddress ?? null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8_000) });
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

async function getMeteoraQuote(input: TokenInfo, output: TokenInfo, amount: number, slippageBps: number) {
  const url = appPath("/api/meteora-swap/quote", {
    inputMint: input.mint,
    outputMint: output.mint,
    amount,
    slippage: slippageBps / 100,
  });
  return fetchJson<{
    meteora?: {
      outputAmount?: number;
      minOutputAmount?: number;
      priceImpactPct?: number;
      feePct?: string;
      poolAddress?: string;
    };
    jupiter?: { outAmount?: number; priceImpactPct?: number } | null;
    comparison?: { message?: string; savingsPct?: number | null; meteoraIsBetter?: boolean | null };
  }>(url);
}

async function getJupiterQuote(input: TokenInfo, output: TokenInfo, amount: number, slippageBps: number) {
  const params = new URLSearchParams({
    inputMint: input.mint,
    outputMint: output.mint,
    amount: toBaseUnits(amount, input.decimals),
    slippageBps: String(slippageBps),
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
  return fetchJson<{ outAmount?: string; priceImpactPct?: string; routePlan?: unknown[] }>(
    `https://api.jup.ag/swap/v1/quote?${params}`,
    { headers },
  );
}

async function getDFlowIntentQuote(input: TokenInfo, output: TokenInfo, amount: number, slippageBps: number, wallet?: string | null) {
  const base = (process.env.DFLOW_QUOTE_API_BASE || "https://d.quote-api.dflow.net").replace(/\/$/, "");
  const params = new URLSearchParams({
    inputMint: input.mint,
    outputMint: output.mint,
    amount: toBaseUnits(amount, input.decimals),
    slippageBps: String(slippageBps),
  });
  if (wallet) params.set("userPublicKey", wallet);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.DFLOW_API_KEY) headers["x-api-key"] = process.env.DFLOW_API_KEY;
  return fetchJson<{ outAmount?: string; minOutAmount?: string; priceImpactPct?: string; slippageBps?: number }>(
    `${base}/intent?${params}`,
    { headers },
  );
}

async function getPhoenixMarkets() {
  return fetchJson<Array<{ symbol: string; marketStatus?: string; takerFee?: number; makerFee?: number; baseLotsDecimals?: number }>>(
    "https://perp-api.phoenix.trade/exchange/markets",
    { headers: { Accept: "application/json" } },
  );
}

async function getDFlowPredictionPreview(query: string) {
  const base = (process.env.DFLOW_PREDICTION_MARKETS_API_BASE || "https://d.prediction-markets-api.dflow.net").replace(/\/$/, "");
  const params = new URLSearchParams({
    q: query,
    limit: "3",
    withNestedMarkets: "true",
    withMarketAccounts: "true",
    status: "active",
  });
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.DFLOW_API_KEY) headers["x-api-key"] = process.env.DFLOW_API_KEY;
  return fetchJson<{ events?: Array<{ title?: string; ticker?: string; markets?: Array<{ ticker?: string; title?: string; yesBid?: number; yesAsk?: number }> }> }>(
    `${base}/api/v1/search?${params}`,
    { headers },
  );
}

function tradingHubButtons() {
  return [
    [{ text: "Open Trading Hub", web_app: { url: appPath("/telegram") } }],
    [
      { text: "Swap", web_app: { url: appPath("/swap") } },
      { text: "Perps", web_app: { url: appPath("/perps") } },
    ],
    [
      { text: "DFlow OODA", web_app: { url: appPath("/ooda") } },
      { text: "Portfolio", web_app: { url: appPath("/portfolio") } },
    ],
  ] satisfies TelegramButton[][];
}

function buildSwapUrl(path: "/swap" | "/ooda", input: TokenInfo, output: TokenInfo, amount: number | null, slippageBps: number) {
  return appPath(path, {
    from: input.symbol,
    to: output.symbol,
    inputMint: input.mint,
    outputMint: output.mint,
    amount: amount ?? undefined,
    slippageBps,
    slippage: slippageBps / 100,
    source: "telegram",
  });
}

async function buildSwapPlan(intent: TradingIntent, wallet: string | null): Promise<TelegramTradingPlan> {
  const input = resolveToken(intent.fromToken);
  const output = resolveToken(intent.toToken);
  const slippageBps = intent.slippageBps ?? 100;

  if (!input || !output || !intent.amount) {
    return {
      handled: true,
      text:
        "⚡ <b>Trade request needs details</b>\n\n" +
        `I understood: <i>${html(intent.query)}</i>\n\n` +
        "Please include the input token, output token, and amount.\n" +
        "Example: <code>/trade buy 0.1 SOL of CLAWD</code>",
      buttons: tradingHubButtons(),
    };
  }

  const venue = normalizeVenue(intent, input, output);
  const isMeteora = venue === "meteora_swap";
  const signingUrl = buildSwapUrl(isMeteora ? "/swap" : "/ooda", input, output, intent.amount, slippageBps);
  const title = isMeteora ? "Meteora CLAWD/SOL" : venue === "jupiter_ultra" ? "Jupiter Ultra" : "DFlow Intent";
  const executionPath = isMeteora
    ? "Meteora build + wallet signature + Helius-backed submit"
    : venue === "jupiter_ultra"
      ? "Jupiter Ultra quote/execute after wallet signature"
      : "DFlow signed intent route with wallet confirmation";

  let quoteText = "Live quote unavailable right now. You can still open the signer to refresh it.";
  try {
    if (isMeteora) {
      const quote = await getMeteoraQuote(input, output, intent.amount, slippageBps);
      quoteText =
        `<b>Quote:</b> ${formatNumber(intent.amount, 6)} ${input.symbol} → ` +
        `<b>${formatNumber(quote.meteora?.outputAmount, output.symbol === "SOL" ? 6 : 2)} ${output.symbol}</b>\n` +
        `<b>Min received:</b> ${formatNumber(quote.meteora?.minOutputAmount, output.symbol === "SOL" ? 6 : 2)} ${output.symbol}\n` +
        `<b>Impact:</b> ${formatNumber(quote.meteora?.priceImpactPct, 3)}% · <b>Fee:</b> ${html(quote.meteora?.feePct ?? "n/a")}\n` +
        `<b>Route check:</b> ${html(quote.comparison?.message ?? "Meteora route checked")}`;
    } else if (venue === "jupiter_ultra") {
      const quote = await getJupiterQuote(input, output, intent.amount, slippageBps);
      const out = Number(quote.outAmount ?? 0) / 10 ** output.decimals;
      quoteText =
        `<b>Quote:</b> ${formatNumber(intent.amount, 6)} ${input.symbol} → ` +
        `<b>${formatNumber(out, output.symbol === "SOL" ? 6 : 2)} ${output.symbol}</b>\n` +
        `<b>Impact:</b> ${formatNumber(quote.priceImpactPct, 3)}% · ` +
        `<b>Route legs:</b> ${Array.isArray(quote.routePlan) ? quote.routePlan.length : "n/a"}`;
    } else {
      const quote = await getDFlowIntentQuote(input, output, intent.amount, slippageBps, wallet);
      const out = Number(quote.outAmount ?? 0) / 10 ** output.decimals;
      const minOut = Number(quote.minOutAmount ?? 0) / 10 ** output.decimals;
      quoteText =
        `<b>Intent quote:</b> ${formatNumber(intent.amount, 6)} ${input.symbol} → ` +
        `<b>${formatNumber(out, output.symbol === "SOL" ? 6 : 2)} ${output.symbol}</b>\n` +
        `<b>Min received:</b> ${formatNumber(minOut, output.symbol === "SOL" ? 6 : 2)} ${output.symbol}\n` +
        `<b>Impact:</b> ${formatNumber(quote.priceImpactPct, 3)}% · <b>Slippage:</b> ${quote.slippageBps ?? slippageBps} bps`;
    }
  } catch (error) {
    quoteText = `<b>Quote:</b> unavailable (${html(error instanceof Error ? error.message : String(error))}).`;
  }

  return {
    handled: true,
    text:
      `⚡ <b>${html(title)} trading request</b>\n\n` +
      `<b>Action:</b> ${html(intent.action)} ${formatNumber(intent.amount, 6)} ${input.symbol} → ${output.symbol}\n` +
      (wallet ? `<b>Linked wallet:</b> <code>${shortWallet(wallet)}</code>\n` : "<b>Linked wallet:</b> not linked yet\n") +
      `<b>Slippage:</b> ${slippageBps} bps\n\n` +
      `<b>Execution:</b> ${html(executionPath)}\n\n` +
      `${quoteText}\n\n` +
      "Review the route, connect your wallet, and sign in the app. Telegram will not submit this trade for you.",
    buttons: [
      [{ text: "Review and Sign", web_app: { url: signingUrl } }],
      [
        { text: "DEX", web_app: { url: appPath("/dex") } },
        { text: "Portfolio", web_app: { url: appPath("/portfolio") } },
      ],
    ],
  };
}

async function buildPhoenixPlan(intent: TradingIntent, wallet: string | null): Promise<TelegramTradingPlan> {
  const market = normalizeSymbol(intent.market) ?? normalizeSymbol(intent.fromToken) ?? "SOL";
  const action = intent.action === "short" ? "short" : intent.action === "long" ? "long" : intent.action;
  const orderType = intent.orderType ?? "market";
  const perpsUrl = appPath("/perps", {
    symbol: market,
    side: action === "short" ? "short" : "long",
    size: intent.amount ?? undefined,
    orderType,
    limitPrice: intent.limitPrice ?? undefined,
    source: "telegram",
  });

  let marketText = "Phoenix market metadata unavailable right now.";
  try {
    const markets = await getPhoenixMarkets();
    const active = markets.find((m) => m.symbol?.toUpperCase() === market);
    if (active) {
      marketText =
        `<b>Market:</b> ${html(active.symbol)}-PERP · ${html(active.marketStatus ?? "unknown")}\n` +
        `<b>Fees:</b> maker ${formatNumber(active.makerFee, 4)} · taker ${formatNumber(active.takerFee, 4)}\n` +
        `<b>Base decimals:</b> ${active.baseLotsDecimals ?? "n/a"}`;
    } else {
      marketText = `<b>Market:</b> ${html(market)}-PERP not found in active Phoenix metadata.`;
    }
  } catch (error) {
    marketText = `<b>Market:</b> unavailable (${html(error instanceof Error ? error.message : String(error))}).`;
  }

  return {
    handled: true,
    text:
      "📈 <b>Phoenix perpetuals request</b>\n\n" +
      `<b>Action:</b> ${html(action)} ${intent.amount ? `${formatNumber(intent.amount, 6)} ` : ""}${html(market)}-PERP\n` +
      `<b>Order:</b> ${html(orderType)}${intent.limitPrice ? ` @ ${formatNumber(intent.limitPrice, 4)}` : ""}\n` +
      (wallet ? `<b>Linked wallet:</b> <code>${shortWallet(wallet)}</code>\n` : "<b>Linked wallet:</b> not linked yet\n") +
      "<b>Execution:</b> Phoenix transaction build + wallet signature + Helius RPC submission\n" +
      `${marketText}\n\n` +
      "Open Phoenix to review leverage, margin, and liquidation risk before signing.",
    buttons: [
      [{ text: "Open Phoenix", web_app: { url: perpsUrl } }],
      [
        { text: "Positions", web_app: { url: appPath("/perps", { tab: "positions", source: "telegram" }) } },
        { text: "Trading Hub", web_app: { url: appPath("/telegram") } },
      ],
    ],
  };
}

async function buildPredictionPlan(intent: TradingIntent): Promise<TelegramTradingPlan> {
  const query = intent.query || intent.market || "active prediction markets";
  const predictionUrl = appPath("/prediction", { q: query, source: "telegram" });

  let preview = "DFlow market search is unavailable right now.";
  try {
    const data = await getDFlowPredictionPreview(query);
    const events = data.events ?? [];
    if (events.length) {
      preview = events.slice(0, 3).map((event, index) => {
        const market = event.markets?.[0];
        const odds = market ? ` · yes ${formatNumber(market.yesBid, 3)}/${formatNumber(market.yesAsk, 3)}` : "";
        return `${index + 1}. <b>${html(event.title ?? market?.title ?? event.ticker ?? "Market")}</b>${odds}`;
      }).join("\n");
    } else {
      preview = "No active DFlow prediction markets matched that search.";
    }
  } catch (error) {
    preview = `DFlow search unavailable (${html(error instanceof Error ? error.message : String(error))}).`;
  }

  return {
    handled: true,
    text:
      "🎯 <b>DFlow prediction market request</b>\n\n" +
      `<b>Search:</b> ${html(query)}\n\n` +
      `${preview}\n\n` +
      "Open the market desk to inspect books, liquidity, and settlement details before trading.",
    buttons: [
      [{ text: "Open Prediction Markets", web_app: { url: predictionUrl } }],
      [{ text: "DFlow OODA", web_app: { url: appPath("/ooda", { source: "telegram" }) } }],
    ],
  };
}

export function looksLikeTradingRequest(text: string) {
  return TRADING_KEYWORDS.test(text);
}

export async function buildTelegramTradingPlan(text: string, telegramId?: string): Promise<TelegramTradingPlan> {
  if (!looksLikeTradingRequest(text)) return { handled: false, text: "" };

  const [intent, wallet] = await Promise.all([
    parseTradingIntent(text),
    getLinkedWallet(telegramId),
  ]);

  if (!intent.isTrading || intent.needsClarification) {
    return {
      handled: true,
      text:
        "⚡ <b>Trading request</b>\n\n" +
        `${html(intent.clarification || "I need a bit more detail before preparing a live trading route.")}\n\n` +
        "Try: <code>/trade buy 0.1 SOL of CLAWD</code> or <code>/trade long SOL 0.1</code>.",
      buttons: tradingHubButtons(),
    };
  }

  const input = resolveToken(intent.fromToken);
  const output = resolveToken(intent.toToken);
  const venue = normalizeVenue(intent, input, output);

  if (venue === "phoenix_perps") return buildPhoenixPlan(intent, wallet);
  if (venue === "dflow_prediction") return buildPredictionPlan(intent);
  if (venue === "meteora_swap" || venue === "dflow_intent" || venue === "jupiter_ultra") {
    return buildSwapPlan({ ...intent, venue }, wallet);
  }

  return {
    handled: true,
    text:
      "⚡ <b>Live trading hub</b>\n\n" +
      `I could not map <i>${html(text)}</i> to a specific trading action.\n\n` +
      "You can ask for spot swaps, DFlow intent swaps, Phoenix perps, prediction markets, positions, or portfolio checks.",
    buttons: tradingHubButtons(),
  };
}

export async function getLinkedTelegramWallet(telegramId?: string) {
  return getLinkedWallet(telegramId);
}
