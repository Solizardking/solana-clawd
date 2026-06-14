/**
 * gateway/src/telegram.ts — Full-featured Telegram Bot API client.
 *
 * Supports:
 *  - Inline keyboard buttons + callback_query routing
 *  - editMessageText / editMessageReplyMarkup for in-place menu updates
 *  - answerCallbackQuery for loading spinners / toasts
 *  - sendPhoto / sendDocument
 *  - Webhook mode (recommended on Fly) or long-polling fallback
 *  - Graceful exponential-backoff reconnect
 *  - Per-message typing action
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN   — required
 *   TELEGRAM_ALLOW_FROM  — comma-separated user IDs allowed (empty = allow all)
 *   TELEGRAM_WEBHOOK_URL — if set, registers webhook instead of polling
 *                          e.g. https://clawd-gateway.fly.dev/telegram/webhook
 */

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ALLOW_FROM = (process.env.TELEGRAM_ALLOW_FROM ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  is_bot?: boolean;
}

export interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
}

export interface TgMessage {
  message_id: number;
  from: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  date: number;
  reply_to_message?: TgMessage;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
  chat_instance: string;
}

export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type InlineKeyboard = InlineKeyboardButton[][];

export interface SendOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  reply_to_message_id?: number;
  reply_markup?: { inline_keyboard: InlineKeyboard } | { remove_keyboard: true };
  disable_web_page_preview?: boolean;
}

export type CommandHandler = (msg: TgMessage, args: string) => Promise<void>;
export type CallbackHandler = (cb: TgCallbackQuery) => Promise<void>;

// ---------------------------------------------------------------------------
// Raw API call
// ---------------------------------------------------------------------------

async function tgCall<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const resp = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  const json = (await resp.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) {
    const err = new Error(`Telegram ${method}: ${json.description ?? 'unknown error'}`);
    (err as NodeJS.ErrnoException).code = String(json.error_code);
    throw err;
  }
  return json.result as T;
}

// ---------------------------------------------------------------------------
// Public API helpers
// ---------------------------------------------------------------------------

export async function sendMessage(
  chatId: number,
  text: string,
  opts?: SendOptions,
): Promise<TgMessage> {
  return tgCall<TgMessage>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: opts?.parse_mode ?? 'Markdown',
    disable_web_page_preview: opts?.disable_web_page_preview ?? true,
    ...(opts?.reply_to_message_id ? { reply_to_message_id: opts.reply_to_message_id } : {}),
    ...(opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  opts?: Pick<SendOptions, 'parse_mode' | 'reply_markup' | 'disable_web_page_preview'>,
): Promise<TgMessage | true> {
  return tgCall('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: opts?.parse_mode ?? 'Markdown',
    disable_web_page_preview: opts?.disable_web_page_preview ?? true,
    ...(opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function editKeyboard(
  chatId: number,
  messageId: number,
  keyboard: InlineKeyboard,
): Promise<void> {
  await tgCall('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function answerCallback(
  callbackId: string,
  text?: string,
  showAlert?: boolean,
): Promise<void> {
  await tgCall('answerCallbackQuery', {
    callback_query_id: callbackId,
    ...(text ? { text } : {}),
    show_alert: showAlert ?? false,
  });
}

export async function sendTyping(chatId: number): Promise<void> {
  await tgCall('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
}

export async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption?: string,
  opts?: SendOptions,
): Promise<TgMessage> {
  return tgCall<TgMessage>('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    ...(caption ? { caption, parse_mode: opts?.parse_mode ?? 'Markdown' } : {}),
    ...(opts?.reply_markup ? { reply_markup: opts.reply_markup } : {}),
  });
}

export async function deleteMessage(chatId: number, messageId: number): Promise<void> {
  await tgCall('deleteMessage', { chat_id: chatId, message_id: messageId }).catch(() => {});
}

export async function getMe(): Promise<TgUser & { username: string }> {
  return tgCall('getMe');
}

export async function setWebhook(url: string): Promise<void> {
  await tgCall('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 40,
  });
  console.log(`[Telegram] Webhook set → ${url}`);
}

export async function deleteWebhook(): Promise<void> {
  await tgCall('deleteWebhook', { drop_pending_updates: false });
}

// ---------------------------------------------------------------------------
// Bot class
// ---------------------------------------------------------------------------

interface Update {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export class TelegramBot {
  private commands = new Map<string, CommandHandler>();
  private callbackPrefixes = new Map<string, CallbackHandler>();
  private defaultHandler: CommandHandler | null = null;
  private offset = 0;
  private running = false;
  private backoff = 1000;

  command(cmd: string, handler: CommandHandler): this {
    this.commands.set(cmd.toLowerCase(), handler);
    return this;
  }

  /** Register a handler for callback_data starting with `prefix`. */
  onCallback(prefix: string, handler: CallbackHandler): this {
    this.callbackPrefixes.set(prefix, handler);
    return this;
  }

  onMessage(handler: CommandHandler): this {
    this.defaultHandler = handler;
    return this;
  }

  /** Handle a single Update object (used by webhook endpoint). */
  async handleUpdate(update: Update): Promise<void> {
    if (update.callback_query) {
      await this.dispatchCallback(update.callback_query);
    } else if (update.message) {
      await this.dispatchMessage(update.message);
    }
  }

  /** Start long-polling loop (used when no webhook URL is configured). */
  async startPolling(): Promise<void> {
    if (!BOT_TOKEN) {
      console.error('[TelegramBot] No TELEGRAM_BOT_TOKEN — bot disabled');
      return;
    }
    await deleteWebhook();
    const me = await getMe();
    console.log(`[TelegramBot] Polling as @${me.username} (${me.id})`);
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
  }

  // ---- private ----

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const updates = await tgCall<Update[]>('getUpdates', {
          offset: this.offset,
          timeout: 30,
          allowed_updates: ['message', 'callback_query'],
        });
        this.backoff = 1000;
        for (const u of updates) {
          this.offset = u.update_id + 1;
          this.handleUpdate(u).catch(e => console.error('[TelegramBot] handler error:', e.message));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[TelegramBot] Poll error (retry in ${this.backoff}ms):`, msg);
        await new Promise(r => setTimeout(r, this.backoff));
        this.backoff = Math.min(this.backoff * 2, 60_000);
      }
    }
  }

  private isAllowed(userId: number): boolean {
    return ALLOW_FROM.length === 0 || ALLOW_FROM.includes(String(userId));
  }

  private async dispatchMessage(msg: TgMessage): Promise<void> {
    if (!this.isAllowed(msg.from.id)) {
      await sendMessage(msg.chat.id, '⛔ Unauthorized.').catch(() => {});
      return;
    }
    const text = msg.text?.trim() ?? msg.caption?.trim() ?? '';

    if (text.startsWith('/')) {
      const [rawCmd, ...rest] = text.split(/\s+/);
      const cmd = rawCmd.replace(/^\//, '').replace(/@.*$/, '').toLowerCase();
      const args = rest.join(' ');
      const handler = this.commands.get(cmd);
      if (handler) {
        await sendTyping(msg.chat.id);
        await handler(msg, args).catch(e => {
          console.error(`[TelegramBot] /${cmd} error:`, e.message);
          return sendMessage(msg.chat.id, `❌ ${e.message}`);
        });
        return;
      }
    }

    if (this.defaultHandler) {
      await sendTyping(msg.chat.id);
      await this.defaultHandler(msg, text).catch(e => {
        console.error('[TelegramBot] default handler error:', e.message);
        return sendMessage(msg.chat.id, `❌ ${e.message}`);
      });
    }
  }

  private async dispatchCallback(cb: TgCallbackQuery): Promise<void> {
    if (!this.isAllowed(cb.from.id)) {
      await answerCallback(cb.id, '⛔ Unauthorized', true);
      return;
    }
    const data = cb.data ?? '';
    for (const [prefix, handler] of this.callbackPrefixes) {
      if (data === prefix || data.startsWith(`${prefix}:`) || data.startsWith(`${prefix}_`)) {
        await handler(cb).catch(async e => {
          console.error(`[TelegramBot] callback "${prefix}" error:`, e.message);
          await answerCallback(cb.id, `❌ ${e.message}`, true);
        });
        return;
      }
    }
    // No handler — dismiss silently
    await answerCallback(cb.id).catch(() => {});
  }
}
