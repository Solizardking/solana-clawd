/**
 * telegram barrel — bot types and exports for the Telegram gateway.
 *
 * Also serves as a standalone entry point:  npx tsx src/telegram/index.ts
 */
export type {
  TelegramBotConfig,
  BotState,
  TelegramSession,
  CommandContext,
  TradingSignal,
  ReplyOptions,
  BotMode,
} from './types.js';

export { startTelegramBot } from './bot.js';
export type { Command } from './commands.js';

// Direct entry-point runner
if (process.argv[1]?.endsWith('/telegram/index.js') || process.argv[1]?.endsWith('/telegram/index.ts')) {
  import('./bot.js').then(m => {
    console.log('🔱 solana-claude Telegram Gateway');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return m.startTelegramBot();
  }).catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}