/**
 * gateway/src/honcho.ts — Persistent user memory via Honcho.
 *
 * Env vars:
 *   HONCHO_APP_NAME  — app name to create/resolve (default: "solana-clawd")
 *   HONCHO_API_KEY   — optional for cloud-hosted tier
 */

import Honcho from 'honcho-ai';

const APP_NAME = process.env.HONCHO_APP_NAME ?? 'solana-clawd';
const API_KEY = process.env.HONCHO_API_KEY;

let _client: Honcho | null = null;
let _appId: string | null = null;

function client(): Honcho {
  if (!_client) {
    _client = new Honcho({ ...(API_KEY ? { apiKey: API_KEY } : {}) });
  }
  return _client;
}

async function appId(): Promise<string> {
  if (_appId) return _appId;
  const app = await client().apps.getOrCreate(APP_NAME);
  _appId = app.id;
  return _appId;
}

async function getOrCreateSession(aid: string, userId: string): Promise<string> {
  const h = client();
  const user = await h.apps.users.getOrCreate(aid, userId);
  const page = await h.apps.users.sessions.list(aid, user.id, { size: 1, page: 1 });
  if (page.items && page.items.length > 0) {
    return page.items[0].id;
  }
  const session = await h.apps.users.sessions.create(aid, user.id, { metadata: { source: 'clawd-gateway' } });
  return session.id;
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
    const aid = await appId();
    const h = client();
    const user = await h.apps.users.getOrCreate(aid, userId);
    const sessionId = await getOrCreateSession(aid, userId);
    await h.apps.users.sessions.messages.create(aid, user.id, sessionId, { content: userMessage, is_user: true });
    await h.apps.users.sessions.messages.create(aid, user.id, sessionId, { content: assistantReply, is_user: false });
  } catch (err) {
    console.warn('[Honcho] storeExchange failed:', (err as Error).message);
  }
}

/** Retrieve the last N messages for a user to build conversation context. */
export async function getHistory(
  userId: string,
  limit = 10,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const aid = await appId();
    const h = client();
    const user = await h.apps.users.getOrCreate(aid, userId);
    const sessionId = await getOrCreateSession(aid, userId);
    const page = await h.apps.users.sessions.messages.list(aid, user.id, sessionId, {
      size: limit,
      page: 1,
    });
    return (page.items ?? [])
      .map((m: { is_user: boolean; content: string }) => ({
        role: m.is_user ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
  } catch (err) {
    console.warn('[Honcho] getHistory failed:', (err as Error).message);
    return [];
  }
}

/** Store a derived user fact in user metadata. */
export async function storeFact(userId: string, key: string, value: string): Promise<void> {
  try {
    const aid = await appId();
    const h = client();
    const user = await h.apps.users.getOrCreate(aid, userId);
    await h.apps.users.update(aid, user.id, { metadata: { ...((user.metadata ?? {}) as object), [key]: value } });
  } catch (err) {
    console.warn('[Honcho] storeFact failed:', (err as Error).message);
  }
}

/** Retrieve all stored facts (metadata) for a user. */
export async function getFacts(userId: string): Promise<Record<string, string>> {
  try {
    const aid = await appId();
    const h = client();
    const user = await h.apps.users.getOrCreate(aid, userId);
    return (user.metadata ?? {}) as Record<string, string>;
  } catch (err) {
    console.warn('[Honcho] getFacts failed:', (err as Error).message);
    return {};
  }
}
