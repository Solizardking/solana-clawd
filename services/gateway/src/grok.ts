/**
 * gateway/src/grok.ts — xAI Grok client (OpenAI-compatible API).
 *
 * Env vars:
 *   XAI_API_KEY    — required; if absent all calls short-circuit to null
 *   GROK_MODEL     — override model (default: grok-4.3)
 */

const BASE_URL = 'https://api.x.ai/v1';
const MODEL = process.env.GROK_MODEL ?? 'grok-4.3';

export type GrokMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface GrokOptions {
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  max_tokens?: number;
  temperature?: number;
}

function apiKey(): string | null {
  return process.env.XAI_API_KEY ?? null;
}

/**
 * Send a chat completion request to xAI Grok.
 * Returns the assistant text, or null if XAI_API_KEY is unset.
 * Throws on network / API errors.
 */
export async function chat(
  messages: GrokMessage[],
  opts: GrokOptions = {},
): Promise<string | null> {
  const key = apiKey();
  if (!key) return null;

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: opts.max_tokens ?? 1024,
  };
  if (opts.reasoning_effort) body.reasoning_effort = opts.reasoning_effort;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`xAI API ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  return json.choices?.[0]?.message?.content ?? null;
}

/** Convenience: single user turn with optional system prompt. */
export async function ask(
  userMessage: string,
  systemPrompt?: string,
  opts: GrokOptions = {},
): Promise<string | null> {
  const messages: GrokMessage[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });
  return chat(messages, opts);
}

export const grokEnabled = (): boolean => Boolean(apiKey());
