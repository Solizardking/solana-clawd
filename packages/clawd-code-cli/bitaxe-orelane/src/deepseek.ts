import type { BotIntent } from './bot-types.js';
import type { OrelaneAppConfig } from './config.js';

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekToolCall {
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: DeepSeekToolCall[];
    };
  }>;
}

type RouterProvider = 'deepseek' | 'openrouter';

const INTENT_TOOL = {
  type: 'function',
  function: {
    name: 'route_orelane_request',
    description: 'Route a Telegram natural language request to one safe Bitaxe ORELANE operator action.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'help',
            'status',
            'optimize',
            'bitaxe_pause',
            'bitaxe_resume',
            'bitaxe_reboot',
            'bitaxe_freq_get',
            'bitaxe_freq_set',
            'bitaxe_hashrate',
            'bitaxe_efficiency',
            'ore_decision',
            'ore_checkpoint',
            'ore_claim',
            'ore_deploy_preview',
            'perps_status',
            'perps_paper_trade',
            'perps_live_preview',
            'vulcan_ticker',
            'vulcan_ta',
            'vulcan_candles',
            'vulcan_positions',
            'vulcan_portfolio',
            'vulcan_margin',
            'wallet_assets',
            'payments_status',
            'agents_status',
            'dashboards_status',
          ],
        },
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['long', 'short'] },
        notionalUsd: { type: 'number' },
        amountSol: { type: 'number' },
        squares: { type: 'array', items: { type: 'number' } },
        frequencyMhz: { type: 'number' },
        timeframe: { type: 'string' },
        rawText: { type: 'string' },
      },
      required: ['action'],
    },
  },
};

function systemPrompt(): string {
  return [
    'You route Telegram messages for Bitaxe Orelane — a Bitcoin ASIC miner + ORE Solana controller with Phoenix perp trading via Vulcan CLI.',
    '',
    'Routing rules:',
    'status — broad rig, miner, ORE, or health questions',
    'optimize — Bitcoin lottery chance, latency, stale share, ORE round, or yield optimization',
    'bitaxe_hashrate — hashrate trend, speed, GH/s questions',
    'bitaxe_efficiency — efficiency, W/GH, power per hashrate questions',
    'bitaxe_freq_get — current frequency questions',
    'bitaxe_freq_set — set/change frequency (include frequencyMhz)',
    'bitaxe_pause / bitaxe_resume — explicit pause or resume of the Bitcoin miner',
    'bitaxe_reboot / bitaxe_restart — reboot or restart the miner',
    'ore_checkpoint — explicit ORE checkpoint request',
    'ore_claim — explicit ORE claim request',
    'ore_deploy_preview — explicit ORE deploy request',
    'vulcan_ticker — price, ticker, current price of a symbol (include symbol)',
    'vulcan_ta — RSI, MACD, TA analysis, technical indicators (include symbol, optionally timeframe)',
    'vulcan_candles — candles or OHLCV data (include symbol)',
    'vulcan_positions — current open positions, position list',
    'vulcan_portfolio — portfolio overview, equity, full account snapshot',
    'vulcan_margin — margin health, available collateral, leverage',
    'perps_paper_trade — paper long or short trade (include symbol, notionalUsd, side)',
    'perps_live_preview — live long or short (include symbol, notionalUsd, side); routes through safety gates',
    'wallet_assets — wallet token balances, NFTs, DAS assets',
    'payments_status — x402, payments, billing questions',
    'agents_status — Clawd, agents, registry, orchestration questions',
    'dashboards_status — UI, dashboard, endpoint, firmware surfaces',
    '',
    'Return exactly one tool call.',
  ].join('\n');
}

function parseContent(content: string | undefined): BotIntent | null {
  if (!content) return null;
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed) as BotIntent;
  } catch {
    return null;
  }
}

export function routeWithKeywords(text: string): BotIntent {
  const lower = text.toLowerCase();
  const side = lower.includes('short') || lower.includes('sell') ? 'short' : 'long';
  const symbol = lower.match(/\b(sol|btc|eth|jup|bonk|wif)\b/i)?.[1]?.toUpperCase();
  const notional = lower.match(/\$?(\d+(?:\.\d+)?)\s*(?:usd|usdc|notional)?/i)?.[1];
  const freqMatch = lower.match(/(\d+(?:\.\d+)?)\s*mhz/i);

  if (lower.includes('reboot') || lower.includes('restart')) {
    return { action: 'bitaxe_reboot', rawText: text };
  }
  if (lower.includes('pause')) {
    return { action: 'bitaxe_pause', rawText: text };
  }
  if (lower.includes('resume') || lower.includes('unpause')) {
    return { action: 'bitaxe_resume', rawText: text };
  }
  if (lower.includes('efficiency') || (lower.includes('w/gh') || lower.includes('watt'))) {
    return { action: 'bitaxe_efficiency', rawText: text };
  }
  if (lower.includes('hashrate') || lower.includes('gh/s') || lower.includes('hash rate')) {
    return { action: 'bitaxe_hashrate', rawText: text };
  }
  if (freqMatch && (lower.includes('freq') || lower.includes('mhz') || lower.includes('clock'))) {
    return { action: 'bitaxe_freq_set', frequencyMhz: Number(freqMatch[1]), rawText: text };
  }
  if (lower.includes('freq') || lower.includes('clock speed')) {
    return { action: 'bitaxe_freq_get', rawText: text };
  }
  if (lower.includes('optimize') || lower.includes('latency') || lower.includes('lottery') || lower.includes('stale')) {
    return { action: 'optimize', rawText: text };
  }
  if (lower.includes('wallet') || lower.includes('assets') || lower.includes('token balance') || lower.includes('nft')) {
    return { action: 'wallet_assets', rawText: text };
  }
  if (lower.includes('payment') || lower.includes('x402') || lower.includes('pay')) {
    return { action: 'payments_status', rawText: text };
  }
  if (lower.includes('agent') || lower.includes('clawd') || lower.includes('orchestrat')) {
    return { action: 'agents_status', rawText: text };
  }
  if (lower.includes('dashboard') || lower.includes('surface') || lower.includes('firmware')) {
    return { action: 'dashboards_status', rawText: text };
  }
  if (lower.includes('margin') || lower.includes('collateral') || lower.includes('leverage')) {
    return { action: 'vulcan_margin', rawText: text };
  }
  if (lower.includes('position') || lower.includes('open order')) {
    return { action: 'vulcan_positions', rawText: text };
  }
  if (lower.includes('portfolio') || lower.includes('equity') || lower.includes('account balance')) {
    return { action: 'vulcan_portfolio', rawText: text };
  }
  if (lower.includes('rsi') || lower.includes('macd') || lower.includes('bollinger') || lower.includes('atr') || lower.includes('technical analysis') || lower.includes(' ta ') || lower.includes('indicator')) {
    return { action: 'vulcan_ta', symbol, rawText: text };
  }
  if (lower.includes('candle') || lower.includes('ohlcv') || lower.includes('chart')) {
    return { action: 'vulcan_candles', symbol, rawText: text };
  }
  if ((lower.includes('price') || lower.includes('ticker') || lower.includes('how much')) && symbol) {
    return { action: 'vulcan_ticker', symbol, rawText: text };
  }
  if (lower.includes('checkpoint')) {
    return { action: 'ore_checkpoint', rawText: text };
  }
  if (lower.includes('claim')) {
    return { action: 'ore_claim', rawText: text };
  }
  if (lower.includes('deploy')) {
    return { action: 'ore_deploy_preview', rawText: text };
  }
  if (lower.includes('perp') || lower.includes('trade') || lower.includes('long') || lower.includes('short') || lower.includes('buy') || lower.includes('sell')) {
    return {
      action: lower.includes('live') ? 'perps_live_preview' : 'perps_paper_trade',
      side,
      symbol,
      notionalUsd: notional ? Number(notional) : undefined,
      rawText: text,
    };
  }
  return { action: 'status', rawText: text };
}

async function routeWithProvider(
  provider: RouterProvider,
  apiKey: string,
  model: string,
  text: string,
): Promise<BotIntent | null> {
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: text },
  ];

  const res = await fetch(
    provider === 'deepseek'
      ? 'https://api.deepseek.com/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions',
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'openrouter'
        ? {
            'HTTP-Referer': 'https://x402.wtf/ore',
            'X-Title': 'Bitaxe Orelane',
          }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      tools: [INTENT_TOOL],
      tool_choice: { type: 'function', function: { name: 'route_orelane_request' } },
      ...(provider === 'deepseek'
        ? {
            thinking: { type: 'enabled' },
            reasoning_effort: 'high',
          }
        : {
            reasoning: { enabled: true },
          }),
      stream: false,
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as DeepSeekChatResponse;
  const message = data.choices?.[0]?.message;
  const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
  return parseContent(toolArgs) ?? parseContent(message?.content);
}

export async function routeWithDeepSeek(config: OrelaneAppConfig, text: string): Promise<BotIntent> {
  if (config.deepseekApiKey) {
    try {
      const routed = await routeWithProvider('deepseek', config.deepseekApiKey, config.deepseekModel, text);
      if (routed) {
        return routed;
      }
    } catch {
      // Fall through to OpenRouter or keyword routing.
    }
  }

  if (config.openrouterApiKey) {
    try {
      const routed = await routeWithProvider('openrouter', config.openrouterApiKey, config.openrouterModel, text);
      if (routed) {
        return routed;
      }
    } catch {
      // Fall through to keyword routing.
    }
  }

  return routeWithKeywords(text);
}
