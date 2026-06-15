/**
 * gateway/src/nlTrading.ts — Natural-language trading interface.
 *
 * Flow:
 *   1. Retrieve user's Honcho conversation history for context.
 *   2. Use Claude (claude-haiku-4-5) to classify the intent and extract params.
 *   3. Execute the matching pumpBridge action.
 *   4. Generate a natural-language response summarising the result.
 *   5. Persist the exchange to Honcho for next-turn context.
 *
 * Env vars:
 *   ANTHROPIC_API_KEY   — required for intent classification + response gen
 *   CLAWD_NL_MODEL      — override model (default: claude-haiku-4-5-20251001)
 */

import Anthropic from '@anthropic-ai/sdk';
import { getHistory, storeFact, storeExchange } from './honcho.js';
import * as pump from './pumpBridge.js';
import { chat as grokChat, grokEnabled } from './grok.js';

const MODEL = process.env.CLAWD_NL_MODEL ?? 'claude-haiku-4-5-20251001';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({
    baseURL: "https://api.inference.net",
    apiKey: null,
    authToken: process.env.INFERENCE_API_KEY,
    defaultHeaders: {
      "x-inference-provider": "anthropic",
      "x-inference-provider-api-key": process.env.ANTHROPIC_API_KEY,
      "x-inference-environment": "production",
    },
  });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Intent schema
// ---------------------------------------------------------------------------

type Intent =
  | { action: 'buy'; mint: string; sol: number }
  | { action: 'balance' }
  | { action: 'wrap'; sol?: number }
  | { action: 'unwrap' }
  | { action: 'close_accounts' }
  | { action: 'check_tokens' }
  | { action: 'risk_check' }
  | { action: 'price'; token: string }
  | { action: 'unknown'; userMessage: string };

const INTENT_TOOL: Anthropic.Tool = {
  name: 'classify_trading_intent',
  description: 'Classify the user\'s message into a structured trading action.',
  input_schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['buy', 'balance', 'wrap', 'unwrap', 'close_accounts', 'check_tokens', 'risk_check', 'price', 'unknown'],
        description: 'The trading action the user wants to perform.',
      },
      mint: {
        type: 'string',
        description: 'Token mint address (required for buy).',
      },
      sol: {
        type: 'number',
        description: 'SOL amount (required for buy/wrap).',
      },
      token: {
        type: 'string',
        description: 'Token name or mint for price lookup.',
      },
      userMessage: {
        type: 'string',
        description: 'Original user message (required for unknown).',
      },
    },
    required: ['action'],
  },
};

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

async function classifyIntent(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<Intent> {
  const systemPrompt = `You are a Solana trading assistant for CLAWD. Your job is to parse the user's
natural-language request into a structured trading action.

Supported actions:
- buy       : buy <amount> SOL of <token mint or name>
- balance   : check or show wallet balance
- wrap      : wrap SOL to WSOL
- unwrap    : unwrap WSOL to SOL
- close_accounts : close empty token accounts
- check_tokens   : show tracked tokens
- risk_check     : run risk management check
- price     : get the current price of a token
- unknown   : anything else

Always call the classify_trading_intent tool.`;

  const msgs: Anthropic.MessageParam[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: message },
  ];

  const resp = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 256,
    system: systemPrompt,
    tools: [INTENT_TOOL],
    tool_choice: { type: 'auto' },
    messages: msgs,
  }, {
    headers: { 'x-inference-task-id': 'classify-trading-intent' },
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    return { action: 'unknown', userMessage: message };
  }

  return toolUse.input as Intent;
}

// ---------------------------------------------------------------------------
// Response generation
// ---------------------------------------------------------------------------

async function generateResponse(
  intent: Intent,
  result: { success: boolean; output: string; error?: string } | null,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  userFacts: Record<string, string>,
): Promise<string> {
  const factsStr = Object.entries(userFacts)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n') || 'No stored facts.';

  const systemPrompt = `You are CLAWD, a sovereign AI lobster trading bot on Solana.
You respond in a concise, slightly snarky but helpful tone. Use markdown sparingly.

User facts from memory:
${factsStr}

You just executed: ${JSON.stringify(intent)}
Result: ${result ? JSON.stringify(result) : 'N/A (informational only)'}

Keep responses under 3 sentences unless showing data. Never show raw JSON to the user.`;

  // Prefer Grok when XAI_API_KEY is configured
  if (grokEnabled()) {
    const grokMsgs = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map(h => ({ role: h.role as 'system' | 'user' | 'assistant', content: h.content })),
      { role: 'user' as const, content: userMessage },
    ];
    const grokReply = await grokChat(grokMsgs, { max_tokens: 512, reasoning_effort: 'low' });
    if (grokReply) return grokReply;
  }

  // Fallback to Claude
  const msgs: Anthropic.MessageParam[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const resp = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: msgs,
  }, {
    headers: { 'x-inference-task-id': 'generate-trading-response' },
  });

  const textBlock = resp.content.find(b => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : 'Done.';
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface NLTradingResponse {
  reply: string;
  intent: Intent;
  executed: boolean;
}

/**
 * Process a natural-language trading message for a given user.
 * Returns the reply text and execution metadata.
 */
export async function handleNLMessage(
  userId: string,
  message: string,
): Promise<NLTradingResponse> {
  if (!process.env.ANTHROPIC_API_KEY && !grokEnabled()) {
    return {
      reply: 'No LLM configured (set ANTHROPIC_API_KEY or XAI_API_KEY) — NL trading disabled.',
      intent: { action: 'unknown', userMessage: message },
      executed: false,
    };
  }

  const [history, userFacts] = await Promise.all([
    getHistory(userId, 8),
    import('./honcho.js').then(h => h.getFacts(userId)),
  ]);

  const intent = await classifyIntent(message, history);

  let result: { success: boolean; output: string; error?: string } | null = null;
  let executed = false;

  switch (intent.action) {
    case 'buy':
      result = await pump.buy(intent.mint, intent.sol);
      executed = true;
      break;
    case 'balance':
      result = await pump.balance();
      executed = true;
      break;
    case 'wrap':
      result = await pump.wrapSol(intent.sol);
      executed = true;
      break;
    case 'unwrap':
      result = await pump.unwrapSol();
      executed = true;
      break;
    case 'close_accounts':
      result = await pump.closeEmptyAccounts();
      executed = true;
      break;
    case 'check_tokens':
      result = await pump.checkTokens();
      executed = true;
      break;
    case 'risk_check':
      result = await pump.riskCheck();
      executed = true;
      break;
    case 'price':
    case 'unknown':
    default:
      // No execution — just respond conversationally
      break;
  }

  const reply = await generateResponse(intent, result, history, message, userFacts);

  // Persist to Honcho (non-blocking)
  storeExchange(userId, message, reply).catch(() => {});

  // Remember wallet alias from buy confirmations
  if (intent.action === 'buy' && result?.success) {
    storeFact(userId, 'last_bought_mint', intent.mint).catch(() => {});
  }

  return { reply, intent, executed };
}
