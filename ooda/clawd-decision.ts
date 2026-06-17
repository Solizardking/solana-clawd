/**
 * ooda/clawd-decision.ts — AI-powered OODA decision function
 *
 * Provider priority:
 *   1. XAI_API_KEY      → grok-4.3 (fast, cheap, streaming)
 *   2. DEEPSEEK_API_KEY → deepseek-v4-flash
 *   3. OPENROUTER_API_KEY → configurable model
 *   4. ANTHROPIC_API_KEY  → Claude direct
 *
 * Design: Fresh context per tick. No conversation history.
 * The per-tick prompt (CLAWD.md) + observations → one JSON decision.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { State, Candle } from './state.js';
import type { TickEntry } from './journal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Observations {
  tick: number;
  now: string;
  mode: string;
  network: string;
  candles: Candle[];
  perps_oi_signal?: unknown;
  book: {
    positions: unknown[];
    cash_lamports: number;
  };
  last_decisions: TickEntry[];
}

// ─── Prompt assembly ────────────────────────────────────────────────────────

function getPrompt(obs: Observations): string {
  const clwdPath = join(__dirname, 'CLAWD.md');
  const clwdContent = readFileSync(clwdPath, 'utf8');
  // Strip YAML frontmatter
  const body = clwdContent.replace(/^---[\s\S]*?---\n?/, '').trim();

  const candleStr = obs.candles
    .map(c => `  ${c.t} O=${c.o} H=${c.h} L=${c.l} C=${c.c} V=${c.v}`)
    .join('\n');

  const positionStr = obs.book.positions.length === 0
    ? '  (none)'
    : JSON.stringify(obs.book.positions, null, 2);

  const lastDecisions = obs.last_decisions.length === 0
    ? '  (none)'
    : obs.last_decisions.map(e =>
        `  tick=${e.tick} action=${JSON.stringify(e.decision)} outcome=${e.outcome}`
      ).join('\n');

  return `${body}

## Observations

Tick: ${obs.tick}
Time: ${obs.now}
Mode: ${obs.mode}
Network: ${obs.network}

### Candles (last ${obs.candles.length})
${candleStr}

### Book
${positionStr}

Cash: ${obs.book.cash_lamports} lamports

### Perps OI Signal
${obs.perps_oi_signal ? JSON.stringify(obs.perps_oi_signal, null, 2) : '  (none)'}

### Last Decisions
${lastDecisions}

## Decision

Return exactly one JSON object. No markdown fences. No explanation. Just:
${JSON.stringify({ action: 'hold|open|close', reason: '...', side: 'long|short', size_lamports: 0, position_id: '...' }, null, 2)}`;
}

// ─── Deterministic fallback ─────────────────────────────────────────────────

export function deterministicDecision(obs: Observations): unknown {
  const last = obs.candles[obs.candles.length - 1];
  if (!last) return { action: 'hold', reason: 'no data' };

  // Simple moving average crossover: if price > 5-candle SMA → short, else → long
  const sma5 = obs.candles.slice(-5).reduce((s, c) => s + c.c, 0) / Math.min(5, obs.candles.length);
  const price = last.c;

  if (obs.book.positions.length === 0) {
    if (price > sma5 * 1.005) {
      return { action: 'open', side: 'short', size_lamports: 500_000, reason: `price=${price} > sma5=${sma5.toFixed(2)}` };
    }
    if (price < sma5 * 0.995) {
      return { action: 'open', side: 'long', size_lamports: 500_000, reason: `price=${price} < sma5=${sma5.toFixed(2)}` };
    }
    return { action: 'hold', reason: `price=${price} within sma5=${sma5.toFixed(2)} band` };
  }

  // Flip if signal is strong enough
  const pos = obs.book.positions[0] as { side: string; id: string } | undefined;
  if (pos) {
    if (pos.side === 'long' && price > sma5 * 1.01) {
      return { action: 'close', position_id: pos.id, reason: `long exit: price=${price} > sma5=${sma5.toFixed(2)}` };
    }
    if (pos.side === 'short' && price < sma5 * 0.99) {
      return { action: 'close', position_id: pos.id, reason: `short exit: price=${price} < sma5=${sma5.toFixed(2)}` };
    }
  }

  return { action: 'hold', reason: `holding ${pos?.side}: price=${price} sma5=${sma5.toFixed(2)}` };
}

// ─── Grok / Claude / DeepSeek decision ─────────────────────────────────────

async function callGrok(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env['XAI_MODEL'] || 'grok-4.3-fast',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
    }),
  });
  if (!response.ok) throw new Error(`Grok API: ${response.status} ${await response.text()}`);
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env['ANTHROPIC_MODEL'] || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Claude API: ${response.status} ${await response.text()}`);
  const data = await response.json() as any;
  return data.content?.[0]?.text ?? '';
}

async function callOpenAi(prompt: string, apiKey: string, baseUrl: string, model: string): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.1,
  });
  return response.choices[0]?.message?.content ?? '';
}

export async function clawdDecision(obs: Observations): Promise<unknown> {
  const prompt = getPrompt(obs);
  let raw: string | undefined;

  // Provider priority: Grok → DeepSeek → OpenRouter → Claude
  const xaiKey = process.env['XAI_API_KEY'];
  const dsKey = process.env['DEEPSEEK_API_KEY'];
  const orKey = process.env['OPENROUTER_API_KEY'];
  const antKey = process.env['ANTHROPIC_API_KEY'];

  if (xaiKey) {
    try {
      raw = await callGrok(prompt, xaiKey);
    } catch (err) {
      process.stderr.write(`[clawd-decision] Grok failed: ${err}\n`);
    }
  }

  if (!raw && dsKey) {
    try {
      raw = await callOpenAi(prompt, dsKey, process.env['DEEPSEEK_BASE_URL'] || 'https://api.deepseek.com', 'deepseek-v4-flash');
    } catch (err) {
      process.stderr.write(`[clawd-decision] DeepSeek failed: ${err}\n`);
    }
  }

  if (!raw && orKey) {
    try {
      raw = await callOpenAi(prompt, orKey, 'https://openrouter.ai/api/v1', process.env['OPENROUTER_MODEL'] || 'nex-agi/nex-n2-pro:free');
    } catch (err) {
      process.stderr.write(`[clawd-decision] OpenRouter failed: ${err}\n`);
    }
  }

  if (!raw && antKey) {
    try {
      raw = await callClaude(prompt, antKey);
    } catch (err) {
      process.stderr.write(`[clawd-decision] Claude failed: ${err}\n`);
    }
  }

  if (!raw) {
    process.stderr.write(`[clawd-decision] No API key available — falling back to deterministic\n`);
    return deterministicDecision(obs);
  }

  // Parse the raw response as JSON
  const cleaned = raw.replace(/```(?:json)?\n?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    process.stderr.write(`[clawd-decision] Failed to parse LLM response as JSON: ${cleaned.slice(0, 200)}\n`);
    return deterministicDecision(obs);
  }
}