#!/usr/bin/env node
import chalk from 'chalk';
import { loadOrelaneAppConfig } from './config.js';
import { loadEnvFiles } from './env.js';
import { handleOperatorText } from './operator.js';

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

loadEnvFiles();

function telegramUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

function isAllowed(allowedChats: string[], chatId: number): boolean {
  return allowedChats.length === 0 || allowedChats.includes(String(chatId));
}

function splitTelegramText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3900) {
    chunks.push(text.slice(i, i + 3900));
  }
  return chunks.length > 0 ? chunks : [''];
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  for (const chunk of splitTelegramText(text)) {
    try {
      await fetch(telegramUrl(token, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      });
    } catch {
      // best-effort; don't crash the bot on send failure
    }
  }
}

async function getUpdates(token: string, offset: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
  const url = new URL(telegramUrl(token, 'getUpdates'));
  url.searchParams.set('timeout', '25');
  url.searchParams.set('offset', String(offset));
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Telegram getUpdates ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TelegramUpdatesResponse;
  return data.ok ? data.result : [];
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(delay, 30_000)));
      }
    }
  }
  throw lastError;
}

async function runTestMessage(text: string): Promise<void> {
  const config = loadOrelaneAppConfig();
  const response = await handleOperatorText(config, text);
  console.log(response.text);
}

async function runBot(): Promise<void> {
  const config = loadOrelaneAppConfig();
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to run the bot');
  }

  const token = config.telegramBotToken;

  console.log(chalk.cyan('Bitaxe Orelane Telegram bot started.'));
  console.log(`allowedChats=${config.telegramAllowedChats.length > 0 ? config.telegramAllowedChats.join(',') : 'any'}`);
  console.log(`deepseek=${config.deepseekApiKey ? 'configured' : 'keyword fallback'}`);
  console.log(`helius=${config.heliusApiKey ? 'configured' : 'not set'}`);
  console.log(`vulcan=${config.vulcanBin}`);

  let offset = 0;
  let running = true;

  const shutdown = (): void => {
    console.log(chalk.yellow('\nShutdown signal received — stopping bot.'));
    running = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (running) {
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => abortController.abort(), 35_000);

    let updates: TelegramUpdate[] = [];
    try {
      updates = await withRetry(
        () => getUpdates(token, offset, abortController.signal),
        3,
        2_000,
      );
    } catch (err) {
      if (!running) break;
      console.error(chalk.red(`getUpdates failed: ${err instanceof Error ? err.message : String(err)}`));
      await new Promise((r) => setTimeout(r, 5_000));
      continue;
    } finally {
      clearTimeout(abortTimer);
    }

    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
      const message = update.message;
      if (!message?.text) continue;

      if (!isAllowed(config.telegramAllowedChats, message.chat.id)) {
        await sendMessage(token, message.chat.id, 'Unauthorized chat.');
        continue;
      }

      try {
        const response = await handleOperatorText(config, message.text);
        await sendMessage(token, message.chat.id, response.text);
      } catch (error) {
        await sendMessage(
          token,
          message.chat.id,
          `Operator error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  process.off('SIGINT', shutdown);
  process.off('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const testIndex = args.indexOf('--test');
  if (testIndex >= 0) {
    await runTestMessage(args.slice(testIndex + 1).join(' ') || '/help');
    return;
  }
  await runBot();
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
