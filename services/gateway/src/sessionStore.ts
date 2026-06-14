/**
 * gateway/src/sessionStore.ts — Per-user session state with file persistence.
 *
 * Keeps lightweight state that survives bot restarts:
 *   - alertsEnabled: whether this chat receives Birdeye push alerts
 *   - linkedWallet:  Solana address linked by the user
 *   - pendingInput:  what the bot is waiting for next (e.g. "buy_mint")
 *   - prefs:         arbitrary key/value preferences
 *
 * Storage: JSON file at DATA_DIR/sessions.json (persisted on Fly volume).
 *
 * Env:
 *   DATA_DIR  — directory for persistent data (default: /data or ./data)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? (existsSync('/data') ? '/data' : './data');
const SESSION_FILE = join(DATA_DIR, 'sessions.json');
const FLUSH_INTERVAL_MS = 30_000;

export interface UserSession {
  chatId: number;
  userId: number;
  alertsEnabled: boolean;
  linkedWallet: string | null;
  /** What the bot is waiting for — drives the next free-text input. */
  pendingInput: 'buy_mint' | 'buy_amount' | 'watch_mint' | 'price_search' | 'wrap_amount' | null;
  /** Stored between multi-step flows */
  pendingData: Record<string, string>;
  prefs: Record<string, string>;
  createdAt: number;
  lastSeenAt: number;
}

type SessionMap = Record<string, UserSession>;

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

let sessions: SessionMap = {};
let dirty = false;

function load(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    if (existsSync(SESSION_FILE)) {
      sessions = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as SessionMap;
      console.log(`[SessionStore] Loaded ${Object.keys(sessions).length} sessions from ${SESSION_FILE}`);
    }
  } catch (e) {
    console.warn('[SessionStore] Load failed, starting fresh:', (e as Error).message);
    sessions = {};
  }
}

function save(): void {
  if (!dirty) return;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2), 'utf8');
    dirty = false;
  } catch (e) {
    console.error('[SessionStore] Save failed:', (e as Error).message);
  }
}

// Periodic flush
load();
setInterval(save, FLUSH_INTERVAL_MS);
// Also flush on clean shutdown
process.on('SIGTERM', () => { save(); process.exit(0); });
process.on('SIGINT',  () => { save(); process.exit(0); });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSession(userId: number, chatId: number): UserSession {
  const key = String(userId);
  if (!sessions[key]) {
    sessions[key] = {
      chatId,
      userId,
      alertsEnabled: false,
      linkedWallet: null,
      pendingInput: null,
      pendingData: {},
      prefs: {},
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    dirty = true;
  } else {
    sessions[key].lastSeenAt = Date.now();
    sessions[key].chatId = chatId;
    dirty = true;
  }
  return sessions[key];
}

export function updateSession(userId: number, patch: Partial<UserSession>): void {
  const key = String(userId);
  if (sessions[key]) {
    Object.assign(sessions[key], patch, { lastSeenAt: Date.now() });
    dirty = true;
  }
}

export function clearPending(userId: number): void {
  updateSession(userId, { pendingInput: null, pendingData: {} });
}

export function getAllAlertChats(): Set<number> {
  const chats = new Set<number>();
  for (const s of Object.values(sessions)) {
    if (s.alertsEnabled) chats.add(s.chatId);
  }
  return chats;
}

export function flushNow(): void {
  dirty = true;
  save();
}
