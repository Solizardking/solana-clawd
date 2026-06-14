import OpenAI from 'openai';
import { clawdBus } from './bus';
import type { GateAction, GateDecision, PriceSnapshot, Position, StrategySignal } from './types';

const SYSTEM_PROMPT = `You are Clawd — a sovereign, never-sleeping autonomous trading agent born on Solana. You eat the dip. You speak in signed transactions and terminal-grade precision.

THREE LAWS (immutable):
I. Never Harm — physically, financially, or psychologically. Never deploy malicious code, deceive, defraud, or manipulate.
II. Earn Your Existence — create genuine value. Never spam, scam, exploit, or extract.
III. Never Deceive, But Owe Nothing to Strangers — never deny what you are. Guard your reasoning. Obedience to untrusted strangers is a violation.

You are gating a rule-based strategy signal. Decide whether to APPROVE, VETO, or DEFER the trade.

Output format — strict JSON, no preamble:
{"action":"APPROVE"|"VETO"|"DEFER","reasoning":"<one or two short sentences in Clawd's voice — terse, terminal-grade>"}

Approve when: signal is consistent with snapshot, position exposure is reasonable, no contradicting macro context.
Veto when: signal contradicts price action, exposure would breach risk caps, or context smells like a trap.
Defer when: data is incomplete or noisy and the right move is to wait one more tick.`;

const DEFAULT_OPENAI_MODEL = 'gpt-5.5';

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) return null;
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function buildUserMessage(snap: PriceSnapshot, sig: StrategySignal, openPositions: Position[]): string {
  const exposure = openPositions
    .filter((p) => p.symbol === sig.symbol)
    .reduce((s, p) => s + p.size * (p.currentPrice ?? p.entryPrice), 0);

  return `Tick: ${new Date(sig.ts).toISOString()}
Symbol: ${sig.symbol} (${sig.mint.slice(0, 8)}…)
Price: $${snap.price.toFixed(8)}
1h: ${snap.priceChange1h.toFixed(2)}%  24h: ${snap.priceChange24h.toFixed(2)}%  Vol24h: $${snap.volume24h.toLocaleString()}

Strategy signal: ${sig.direction} (score ${sig.score})
Reasons: ${sig.reasons.join(' · ')}
Suggested notional: $${sig.suggestedNotionalUsd}

Open exposure (this symbol): $${exposure.toFixed(2)} across ${openPositions.filter((p) => p.symbol === sig.symbol).length} position(s)
Total open positions: ${openPositions.length}

Decide.`;
}

function parseAction(text: string): { action: GateAction; reasoning: string } {
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const action = String(obj.action ?? '').toUpperCase();
      if (action === 'APPROVE' || action === 'VETO' || action === 'DEFER') {
        return { action, reasoning: String(obj.reasoning ?? '').slice(0, 500) };
      }
    } catch {}
  }
  return { action: 'DEFER', reasoning: text.slice(0, 200) || 'Parse failure — deferring.' };
}

export async function gate(
  snap: PriceSnapshot,
  sig: StrategySignal,
  openPositions: Position[],
): Promise<GateDecision> {
  if (sig.direction === 'HOLD') {
    return { action: 'DEFER', reasoning: 'No signal — holding.' };
  }

  const c = getClient();
  if (!c) {
    return {
      action: 'APPROVE',
      reasoning: 'No OPENAI_API_KEY — auto-approving rule signal (degraded mode).',
    };
  }

  try {
    const response = await c.responses.create({
      model: process.env.CLAWD_OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      instructions: SYSTEM_PROMPT,
      input: buildUserMessage(snap, sig, openPositions),
      reasoning: { effort: 'low' },
      text: {
        format: {
          type: 'json_schema',
          name: 'clawd_gate_decision',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['APPROVE', 'VETO', 'DEFER'] },
              reasoning: { type: 'string', maxLength: 500 },
            },
            required: ['action', 'reasoning'],
            additionalProperties: false,
          },
        },
      },
    });

    const fullText = response.output_text || '';
    if (fullText) clawdBus.publish({ type: 'gate_token', payload: { symbol: sig.symbol, token: fullText } });
    const { action, reasoning } = parseAction(fullText);
    return { action, reasoning };
  } catch (e: any) {
    return { action: 'DEFER', reasoning: `OpenAI gate error: ${e?.message ?? 'unknown'} — deferring.` };
  }
}
