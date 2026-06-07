/**
 * gateway/src/honcho.ts — Persistent user memory via Honcho.
 *
 * Honcho stores per-user conversation history and derived facts so the
 * CLAWD Gateway can personalise NL trading responses across sessions.
 *
 * Docs: https://honcho.dev
 * SDK:  honcho-ai
 *
 * Env vars:
 *   HONCHO_APP_ID   — your Honcho application id (create at app.honcho.dev)
 *   HONCHO_API_KEY  — optional if using the cloud-hosted tier
 */

import Honcho from 'honcho-ai';

const APP_ID = process.env.HONCHO_APP_ID ?? 'solana-clawd';
const API_KEY = process.env.HONCHO_API_KEY;

let _client: Honcho | null = null;

function client(): Honcho {
  if (!_client) {
    _client = new Honcho({
      appId: APP_ID,
      ...(API_KEY ? { apiKey: API_KEY } : {}),
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Add a user message + assistant reply to Honcho for a given user id. */
export async function storeExchange(
  userId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  try {
    const h = client();
    const session = await h.apps.users.sessions.getOrCreate(APP_ID, userId, {
      metadata: { source: 'clawd-gateway' },
    });
    await h.apps.users.sessions.messages.create(APP_ID, userId, session.id, [
      { is_user: true, content: userMessage },
      { is_user: false, content: assistantReply },
    ]);
  } catch (err) {
    // Non-fatal — memory failure should not block trading
    console.warn('[Honcho] storeExchange failed:', (err as Error).message);
  }
}

/** Retrieve the last N messages for a user to build conversation context. */
export async function getHistory(
  userId: string,
  limit = 10,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const h = client();
    const session = await h.apps.users.sessions.getOrCreate(APP_ID, userId, {});
    const page = await h.apps.users.sessions.messages.list(APP_ID, userId, session.id, {
      size: limit,
      reverse: true,
    });
    return (page.items ?? [])
      .reverse()
      .map((m: { is_user: boolean; content: string }) => ({
        role: m.is_user ? 'user' : 'assistant',
        content: m.content,
      }));
  } catch (err) {
    console.warn('[Honcho] getHistory failed:', (err as Error).message);
    return [];
  }
}

/** Store a derived user fact (preference, wallet alias, risk tolerance, etc.). */
export async function storeFact(userId: string, key: string, value: string): Promise<void> {
  try {
    const h = client();
    await h.apps.users.getOrCreate(APP_ID, userId, {
      metadata: { [key]: value },
    });
  } catch (err) {
    console.warn('[Honcho] storeFact failed:', (err as Error).message);
  }
}

/** Retrieve all stored facts (metadata) for a user. */
export async function getFacts(userId: string): Promise<Record<string, string>> {
  try {
    const h = client();
    const user = await h.apps.users.getOrCreate(APP_ID, userId, {});
    return (user.metadata ?? {}) as Record<string, string>;
  } catch (err) {
    console.warn('[Honcho] getFacts failed:', (err as Error).message);
    return {};
  }
}
