#!/usr/bin/env node
/**
 * CLAWD Gateway — Telegram bot + HTTP daemon.
 *
 * Architecture:
 *   Express HTTP server  →  /telegram/webhook (Fly webhook mode)
 *                        →  /api/* (REST API)
 *                        →  /health (Fly health check)
 *   TelegramBot          →  long-polling fallback when no TELEGRAM_WEBHOOK_URL
 *   Birdeye WS           →  real-time price/alert push to subscribed chats
 *   SessionStore         →  per-user state persisted to /data/sessions.json
 *   NL Trading           →  Claude-powered intent → pumpBridge → reply
 *   x402.wtf             →  tier gating, CLAWD price, agent registry
 *
 * Env (see .env.example):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL, TELEGRAM_ALLOW_FROM
 *   ANTHROPIC_API_KEY, HONCHO_APP_ID, HONCHO_API_KEY
 *   HELIUS_API_KEY, SOLANA_PRIVATE_KEY, BIRDEYE_API_KEY
 *   X402_API_URL, X402_PAYMENT_KEY
 *   GATEWAY_PORT (default 8080)
 */
import './env.js';
import express, { type Request, type Response } from 'express';
import {
  TelegramBot,
  answerCallback,
  editKeyboard,
  editMessage,
  sendMessage,
  sendTyping,
  setWebhook,
  type TgCallbackQuery,
  type TgMessage,
} from './telegram.js';
import {
  getBalance, getBlockHeight, getPublicKey, getRecentTransactions,
  getSlot, getTokenAccounts, heliusGetAssetsByOwner, walletSummary,
} from './solana.js';
import { BirdeyeWS, getTokenPrice, searchTokens } from './birdeye.js';
import { supabase } from './supabase.js';
import agentRegistryRouter from './agentRegistry.js';
import gaslessMintRouter from './gaslessMint.js';
import clawdGenRouter from './clawdGen.js';
import grokStudioRouter from './grokStudio.js';
import skillHubRouter from './skillHub.js';
import stakingRouter from './staking.js';
import solanaExplorerRouter from './solanaExplorer.js';
import neonRouter, { neonStatus } from './neon.js';
import { accessPolicyStatus, requireLiveAccess, requirePaidFeatureAccess } from './accessPolicy.js';
import { handleNLMessage } from './nlTrading.js';
import {
  mainMenu, mainMenuText, portfolioMenu, tradeMenu,
  alertsMenu, priceMenu, x402Menu, settingsMenu, confirmMenu,
} from './menus.js';
import {
  getSession, updateSession, clearPending, getAllAlertChats, flushNow,
} from './sessionStore.js';
import { getClawdPrice, getTierForWallet, tierSummary, listAgents } from './x402.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract chatId + messageId from a callback query safely. Returns null for inline-mode queries. */
function msgCtx(cb: TgCallbackQuery): { chatId: number; msgId: number } | null {
  if (!cb.message) return null;
  return { chatId: cb.message.chat.id, msgId: cb.message.message_id };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(requireLiveAccess);
app.use(requirePaidFeatureAccess);
const PORT = parseInt(process.env.GATEWAY_PORT ?? '8080', 10);
const HOST = process.env.GATEWAY_HOST ?? '0.0.0.0';
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL ?? '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------
app.use('/', agentRegistryRouter);
app.use('/', gaslessMintRouter);
app.use('/', clawdGenRouter);
app.use('/', grokStudioRouter);
app.use('/', skillHubRouter);
app.use('/', stakingRouter);
app.use('/', solanaExplorerRouter);
app.use('/', neonRouter);

// ---------------------------------------------------------------------------
// Birdeye WebSocket
// ---------------------------------------------------------------------------
const birdeye = new BirdeyeWS();

function broadcastAlert(text: string): void {
  const chats = getAllAlertChats();
  for (const chatId of chats) {
    sendMessage(chatId, text).catch(() => {});
  }
}

birdeye.on('PRICE_DATA', (d: Record<string, unknown>) => {
  broadcastAlert(
    `📈 *Price Update*\n${d.symbol}  O:${d.o} H:${d.h} L:${d.l} C:${d.c}\nVol: ${d.v}`,
  );
});
birdeye.on('TOKEN_NEW_LISTING_DATA', (d: Record<string, unknown>) => {
  broadcastAlert(
    `🆕 *New Listing*\n*${d.name}* (${d.symbol})\n\`${d.address}\`\nLiq: $${d.liquidity}`,
  );
});
birdeye.on('NEW_PAIR_DATA', (d: Record<string, unknown>) => {
  const base = d.base as Record<string, unknown> | undefined;
  broadcastAlert(`🔗 *New Pair*\n${base?.symbol ?? '?'} — ${d.source}\n\`${d.address}\``);
});
birdeye.on('TXS_LARGE_TRADE_DATA', (d: Record<string, unknown>) => {
  const from = d.from as Record<string, unknown> | undefined;
  const to   = d.to   as Record<string, unknown> | undefined;
  broadcastAlert(
    `🐋 *Whale Trade* $${Number(d.volumeUSD).toFixed(2)}\n${from?.symbol} → ${to?.symbol}\n\`${(d.txHash as string)?.slice(0, 16)}…\``,
  );
});

// ---------------------------------------------------------------------------
// Bot
// ---------------------------------------------------------------------------
const bot = new TelegramBot();

// ── /start ──────────────────────────────────────────────────────────────────
bot.command('start', async (msg) => {
  const s = getSession(msg.from.id, msg.chat.id);
  clearPending(msg.from.id);
  await sendMessage(msg.chat.id, mainMenuText(), {
    reply_markup: { inline_keyboard: mainMenu() },
  });
  void s;
});

bot.command('menu', async (msg) => {
  clearPending(msg.from.id);
  await sendMessage(msg.chat.id, mainMenuText(), {
    reply_markup: { inline_keyboard: mainMenu() },
  });
});

// ── Wallet / chain ───────────────────────────────────────────────────────────
bot.command('wallet', async (msg) => {
  const summary = await walletSummary();
  await sendMessage(msg.chat.id, summary, {
    reply_markup: { inline_keyboard: portfolioMenu() },
  });
});

bot.command('balance', async (msg, args) => {
  const bal = await getBalance(args || undefined);
  const addr = args || getPublicKey()?.toBase58() || 'default';
  await sendMessage(msg.chat.id, `💰 \`${addr}\`\n*${bal.sol.toFixed(4)} SOL*`);
});

bot.command('tokens', async (msg, args) => {
  const tokens = await getTokenAccounts(args || undefined);
  if (tokens.length === 0) { await sendMessage(msg.chat.id, '📦 No token accounts found.'); return; }
  const lines = tokens.slice(0, 15).map(t => `• \`${t.mint.slice(0, 12)}…\` — ${t.uiAmount}`);
  if (tokens.length > 15) lines.push(`…and ${tokens.length - 15} more`);
  await sendMessage(msg.chat.id, `📦 *Tokens (${tokens.length}):*\n${lines.join('\n')}`);
});

bot.command('price', async (msg, args) => {
  if (!args) { await sendMessage(msg.chat.id, 'Usage: /price <mint>', { reply_markup: { inline_keyboard: priceMenu() } }); return; }
  const data = (await getTokenPrice(args)) as { data?: { value?: number } };
  const price = data?.data?.value;
  await sendMessage(msg.chat.id, price != null ? `💲 *$${price}*\n\`${args}\`` : `No price data for \`${args}\``);
});

bot.command('search', async (msg, args) => {
  if (!args) { await sendMessage(msg.chat.id, 'Usage: /search <query>'); return; }
  const data = (await searchTokens(args)) as { data?: { items?: Array<{ name: string; symbol: string; address: string }> } };
  const items = data?.data?.items ?? [];
  if (items.length === 0) { await sendMessage(msg.chat.id, `No results for "${args}".`); return; }
  const lines = items.slice(0, 8).map(t => `• *${t.symbol}* — ${t.name}\n  \`${t.address}\``);
  await sendMessage(msg.chat.id, `🔍 *"${args}":*\n\n${lines.join('\n\n')}`);
});

bot.command('slot', async (msg) => {
  const [slot, height] = await Promise.all([getSlot(), getBlockHeight()]);
  await sendMessage(msg.chat.id, `⛓ *Slot:* ${slot.toLocaleString()}\n📏 *Height:* ${height.toLocaleString()}`);
});

bot.command('assets', async (msg, args) => {
  const data = (await heliusGetAssetsByOwner(args || undefined)) as { result?: { items?: Array<{ content?: { metadata?: { name?: string } }; id?: string }> } };
  const items = data?.result?.items ?? [];
  if (items.length === 0) { await sendMessage(msg.chat.id, '📦 No DAS assets.'); return; }
  const lines = items.slice(0, 15).map(a => `• ${a.content?.metadata?.name ?? 'Unknown'} — \`${a.id?.slice(0, 12)}…\``);
  await sendMessage(msg.chat.id, `🗂 *Assets (${items.length}):*\n${lines.join('\n')}`);
});

bot.command('status', async (msg) => {
  const pubkey = getPublicKey()?.toBase58() ?? 'not configured';
  let bal = 'N/A';
  try { const b = await getBalance(); bal = `${b.sol.toFixed(4)} SOL`; } catch { /* ok */ }
  await sendMessage(msg.chat.id, [
    '🤖 *CLAWD Gateway*',
    `Wallet: \`${pubkey}\``,
    `Balance: ${bal}`,
    `Birdeye: ${birdeye.isConnected() ? '🟢' : '🔴'}`,
    `Alerts: ${getAllAlertChats().size} chat(s)`,
    `Mode: ${WEBHOOK_URL ? 'webhook' : 'polling'}`,
    `Uptime: ${Math.floor(process.uptime())}s`,
  ].join('\n'));
});

// ── Alert shortcut commands ──────────────────────────────────────────────────
bot.command('alerts', async (msg, args) => {
  const s = getSession(msg.from.id, msg.chat.id);
  const on = args.trim().toLowerCase() === 'on';
  updateSession(msg.from.id, { alertsEnabled: on });
  await sendMessage(msg.chat.id, on ? '🔔 Alerts *enabled*.' : '🔕 Alerts *disabled*.', {
    reply_markup: { inline_keyboard: alertsMenu(on) },
  });
  void s;
});

bot.command('watch', async (msg, args) => {
  if (!args) { await sendMessage(msg.chat.id, 'Usage: /watch <mint>'); return; }
  updateSession(msg.from.id, { alertsEnabled: true });
  birdeye.subscribePrice(args);
  await sendMessage(msg.chat.id, `👀 Watching \`${args}\``);
});

bot.command('whales', async (msg, args) => {
  const min = parseInt(args, 10) || 10_000;
  updateSession(msg.from.id, { alertsEnabled: true });
  birdeye.subscribeLargeTrades(min);
  await sendMessage(msg.chat.id, `🐋 Whale watch ≥ $${min.toLocaleString()}`);
});

bot.command('newpairs', async (msg) => {
  updateSession(msg.from.id, { alertsEnabled: true });
  birdeye.subscribeNewPairs(100);
  await sendMessage(msg.chat.id, '🔗 New pair alerts *on*.');
});

bot.command('newlistings', async (msg, args) => {
  updateSession(msg.from.id, { alertsEnabled: true });
  birdeye.subscribeNewListings(1000, args ? args.split(',').map(s => s.trim()) : undefined);
  await sendMessage(msg.chat.id, '🆕 New listing alerts *on*.');
});

// ── Callback query handler: menu namespace ────────────────────────────────────
bot.onCallback('menu', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;
  const s       = getSession(cb.from.id, chatId);

  await answerCallback(cb.id);

  switch (payload) {
    case 'back':
      clearPending(cb.from.id);
      await editMessage(chatId, msgId, mainMenuText(), {
        reply_markup: { inline_keyboard: mainMenu() },
      });
      break;

    case 'portfolio':
      await editMessage(chatId, msgId, '📊 *Portfolio*\nChoose an action:', {
        reply_markup: { inline_keyboard: portfolioMenu() },
      });
      break;

    case 'trade':
      await editMessage(chatId, msgId, '📈 *Trade*\nChoose an action:', {
        reply_markup: { inline_keyboard: tradeMenu() },
      });
      break;

    case 'alerts':
      await editMessage(chatId, msgId, '🔔 *Alerts*\nManage your real-time alerts:', {
        reply_markup: { inline_keyboard: alertsMenu(s.alertsEnabled) },
      });
      break;

    case 'price':
      await editMessage(chatId, msgId, '💲 *Price Lookup*\nSelect a token or search:', {
        reply_markup: { inline_keyboard: priceMenu() },
      });
      break;

    case 'x402':
      await editMessage(chatId, msgId, '🌊 *x402.wtf — CLAWD Ecosystem*', {
        reply_markup: { inline_keyboard: x402Menu() },
      });
      break;

    case 'settings':
      await editMessage(chatId, msgId, '⚙️ *Settings*', {
        reply_markup: { inline_keyboard: settingsMenu() },
      });
      break;

    case 'help':
      await editMessage(chatId, msgId, [
        '📖 *CLAWD Help*',
        '',
        '*Natural language (just type):*',
        '"buy 0.05 SOL of <mint>"',
        '"what\'s my balance?"',
        '"wrap 0.1 SOL"  "run risk check"',
        '"price of SOL"',
        '',
        '*Slash commands:*',
        '/menu /wallet /balance /tokens /price /search',
        '/slot /assets /status /watch /whales /newpairs',
        '',
        '🌊 Powered by x402.wtf · $CLAWD',
      ].join('\n'), {
        reply_markup: { inline_keyboard: [[{ text: '◀️ Back', callback_data: 'menu:back' }]] },
      });
      break;
  }

  void s;
});

// ── Callback: portfolio namespace ─────────────────────────────────────────────
bot.onCallback('portfolio', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;

  await answerCallback(cb.id, '⏳ Loading…');
  await sendTyping(chatId);

  try {
    switch (payload) {
      case 'balance': {
        const bal = await getBalance();
        await editMessage(chatId, msgId,
          `💰 *SOL Balance*\n${bal.sol.toFixed(6)} SOL`,
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        break;
      }
      case 'tokens': {
        const tokens = await getTokenAccounts();
        const lines = tokens.slice(0, 10).map(t => `• \`${t.mint.slice(0, 12)}…\` ${t.uiAmount}`);
        await editMessage(chatId, msgId,
          tokens.length === 0
            ? '📦 No token accounts.'
            : `📦 *Tokens (${tokens.length}):*\n${lines.join('\n')}`,
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        break;
      }
      case 'txs': {
        const txs = await getRecentTransactions(undefined, 5);
        const lines = txs.map(t => {
          const ts = t.blockTime ? new Date(t.blockTime * 1000).toISOString().slice(0, 16) : '?';
          return `${t.err ? '❌' : '✅'} \`${t.signature.slice(0, 14)}…\` ${ts}`;
        });
        await editMessage(chatId, msgId,
          `📜 *Recent TXs:*\n${lines.join('\n') || 'None found'}`,
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        break;
      }
      case 'assets': {
        const data = (await heliusGetAssetsByOwner()) as { result?: { items?: Array<{ content?: { metadata?: { name?: string } }; id?: string }> } };
        const items = data?.result?.items ?? [];
        const lines = items.slice(0, 10).map(a => `• ${a.content?.metadata?.name ?? '?'} \`${a.id?.slice(0, 10)}…\``);
        await editMessage(chatId, msgId,
          `🗂 *DAS Assets (${items.length}):*\n${lines.join('\n') || 'None'}`,
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        break;
      }
      case 'risk': {
        await editMessage(chatId, msgId, '⚖️ Running risk check…',
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        const { reply } = await handleNLMessage(String(cb.from.id), 'run risk check');
        await editMessage(chatId, msgId, reply,
          { reply_markup: { inline_keyboard: portfolioMenu() } });
        break;
      }
    }
  } catch (e) {
    await editMessage(chatId, msgId, `❌ ${(e as Error).message}`,
      { reply_markup: { inline_keyboard: portfolioMenu() } });
  }
});

// ── Callback: trade namespace ─────────────────────────────────────────────────
bot.onCallback('trade', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;

  await answerCallback(cb.id);

  switch (payload) {
    case 'buy_prompt':
      updateSession(cb.from.id, { pendingInput: 'buy_mint', pendingData: {} });
      await editMessage(chatId, msgId,
        '🟢 *Buy Token*\n\nSend the *token mint address* you want to buy:',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:trade' }]] } });
      break;

    case 'wrap_prompt':
      updateSession(cb.from.id, { pendingInput: 'wrap_amount', pendingData: {} });
      await editMessage(chatId, msgId,
        '🔁 *Wrap SOL*\n\nHow much SOL to wrap? (e.g. `0.1`)',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:trade' }]] } });
      break;

    case 'unwrap':
      await answerCallback(cb.id, '⏳ Unwrapping…');
      try {
        const { reply } = await handleNLMessage(String(cb.from.id), 'unwrap WSOL');
        await editMessage(chatId, msgId, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
      } catch (e) {
        await editMessage(chatId, msgId, `❌ ${(e as Error).message}`, { reply_markup: { inline_keyboard: tradeMenu() } });
      }
      break;

    case 'balance':
      await answerCallback(cb.id, '⏳ Checking…');
      try {
        const { reply } = await handleNLMessage(String(cb.from.id), 'check balance');
        await editMessage(chatId, msgId, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
      } catch (e) {
        await editMessage(chatId, msgId, `❌ ${(e as Error).message}`, { reply_markup: { inline_keyboard: tradeMenu() } });
      }
      break;

    case 'close':
      await editMessage(chatId, msgId, '⚠️ Close all empty token accounts?', {
        reply_markup: { inline_keyboard: confirmMenu('trade_close', 'Close Accounts') },
      });
      break;

    case 'check_tokens':
      await answerCallback(cb.id, '⏳ Loading…');
      try {
        const { reply } = await handleNLMessage(String(cb.from.id), 'check tracked tokens');
        await editMessage(chatId, msgId, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
      } catch (e) {
        await editMessage(chatId, msgId, `❌ ${(e as Error).message}`, { reply_markup: { inline_keyboard: tradeMenu() } });
      }
      break;
  }
});

// ── Callback: confirm namespace ───────────────────────────────────────────────
bot.onCallback('confirm', async (cb) => {
  const action  = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;

  await answerCallback(cb.id, '⏳ Executing…');
  switch (action) {
    case 'trade_close': {
      const { reply } = await handleNLMessage(String(cb.from.id), 'close empty accounts');
      await editMessage(chatId, msgId, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
      break;
    }
    default:
      await editMessage(chatId, msgId, `Unknown action: ${action}`, { reply_markup: { inline_keyboard: mainMenu() } });
  }
});

// ── Callback: alerts namespace ────────────────────────────────────────────────
bot.onCallback('alerts', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;

  switch (payload) {
    case 'on':
      updateSession(cb.from.id, { alertsEnabled: true });
      await answerCallback(cb.id, '🔔 Alerts enabled');
      await editKeyboard(chatId, msgId, alertsMenu(true));
      break;
    case 'off':
      updateSession(cb.from.id, { alertsEnabled: false });
      await answerCallback(cb.id, '🔕 Alerts disabled');
      await editKeyboard(chatId, msgId, alertsMenu(false));
      break;
    case 'whales':
      updateSession(cb.from.id, { alertsEnabled: true });
      birdeye.subscribeLargeTrades(10_000);
      await answerCallback(cb.id, '🐋 Whale watch on');
      break;
    case 'newpairs':
      updateSession(cb.from.id, { alertsEnabled: true });
      birdeye.subscribeNewPairs(100);
      await answerCallback(cb.id, '🔗 New pairs on');
      break;
    case 'newlistings':
      updateSession(cb.from.id, { alertsEnabled: true });
      birdeye.subscribeNewListings(1000);
      await answerCallback(cb.id, '🆕 New listings on');
      break;
    case 'watch_prompt':
      updateSession(cb.from.id, { pendingInput: 'watch_mint' });
      await answerCallback(cb.id);
      await editMessage(chatId, msgId,
        '👀 *Watch Token*\n\nSend the mint address to watch:',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:alerts' }]] } });
      break;
  }
});

// ── Callback: price namespace ─────────────────────────────────────────────────
bot.onCallback('price', async (cb) => {
  const payload = cb.data?.replace('price:', '') ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;

  if (payload === 'search_prompt') {
    updateSession(cb.from.id, { pendingInput: 'price_search' });
    await answerCallback(cb.id);
    await editMessage(chatId, msgId,
      '🔍 *Token Search*\n\nType a token name or symbol:',
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:price' }]] } });
    return;
  }

  // Treat payload as a mint address
  await answerCallback(cb.id, '⏳ Fetching…');
  try {
    const data = (await getTokenPrice(payload)) as { data?: { value?: number } };
    const price = data?.data?.value;
    await editMessage(chatId, msgId,
      price != null ? `💲 *$${price}*\n\`${payload.slice(0, 20)}…\`` : `No price data.`,
      { reply_markup: { inline_keyboard: priceMenu() } });
  } catch (e) {
    await editMessage(chatId, msgId, `❌ ${(e as Error).message}`,
      { reply_markup: { inline_keyboard: priceMenu() } });
  }
});

// ── Callback: x402 namespace ──────────────────────────────────────────────────
bot.onCallback('x402', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;
  const s       = getSession(cb.from.id, chatId);

  await answerCallback(cb.id, '⏳ Loading…');

  switch (payload) {
    case 'clawd_price': {
      const p = await getClawdPrice();
      const text = p
        ? [
            '🦞 *$CLAWD Price*',
            `Price: *$${p.price.toFixed(8)}*`,
            `24h: ${p.change24h >= 0 ? '▲' : '▼'} ${Math.abs(p.change24h).toFixed(2)}%`,
            `Liquidity: $${p.liquidity.toLocaleString()}`,
            `Volume 24h: $${p.volume24h.toLocaleString()}`,
          ].join('\n')
        : '🦞 $CLAWD price unavailable — check [pump.fun](https://pump.fun/coin/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump)';
      await editMessage(chatId, msgId, text, { reply_markup: { inline_keyboard: x402Menu() } });
      break;
    }
    case 'tier': {
      const wallet = s.linkedWallet;
      if (!wallet) {
        await editMessage(chatId, msgId,
          '🔑 No wallet linked. Tap *Link Wallet* to check your tier.',
          { reply_markup: { inline_keyboard: x402Menu() } });
        break;
      }
      const info = await getTierForWallet(wallet);
      await editMessage(chatId, msgId, tierSummary(info), { reply_markup: { inline_keyboard: x402Menu() } });
      break;
    }
    case 'link_wallet':
      updateSession(cb.from.id, { pendingInput: null, pendingData: { flow: 'link_wallet' } });
      await editMessage(chatId, msgId,
        '🔑 *Link Wallet*\n\nSend your Solana wallet address:',
        { reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:x402' }]] } });
      break;
  }

  void s;
});

// ── Callback: settings namespace ─────────────────────────────────────────────
bot.onCallback('settings', async (cb) => {
  const payload = cb.data?.split(':')[1] ?? '';
  const ctx = msgCtx(cb); if (!ctx) return;
  const { chatId, msgId } = ctx;
  const s       = getSession(cb.from.id, chatId);

  await answerCallback(cb.id);

  switch (payload) {
    case 'status': {
      const pubkey = getPublicKey()?.toBase58() ?? 'not configured';
      let bal = 'N/A';
      try { const b = await getBalance(); bal = `${b.sol.toFixed(4)} SOL`; } catch { /* ok */ }
      await editMessage(chatId, msgId, [
        '🤖 *Gateway Status*',
        `Wallet: \`${pubkey}\``,
        `Balance: ${bal}`,
        `Birdeye: ${birdeye.isConnected() ? '🟢 connected' : '🔴 disconnected'}`,
        `Mode: ${WEBHOOK_URL ? 'webhook' : 'polling'}`,
        `Uptime: ${Math.floor(process.uptime())}s`,
      ].join('\n'), { reply_markup: { inline_keyboard: settingsMenu() } });
      break;
    }
    case 'access':
      await editMessage(chatId, msgId,
        `🔐 *Access*\nUser ID: \`${cb.from.id}\`\nLinked wallet: \`${s.linkedWallet ?? 'none'}\``,
        { reply_markup: { inline_keyboard: settingsMenu() } });
      break;
    case 'clear_memory':
      await editMessage(chatId, msgId,
        '⚠️ This will clear your Honcho conversation history. Confirm?',
        { reply_markup: { inline_keyboard: confirmMenu('clear_memory', 'Clear Memory') } });
      break;
    case 'facts':
      await editMessage(chatId, msgId,
        `📋 *Your Facts*\n${JSON.stringify(s.prefs, null, 2) || 'None stored.'}`,
        { reply_markup: { inline_keyboard: settingsMenu() } });
      break;
  }

  void s;
});

// ── Default message handler — pending input OR NL trading ─────────────────────
bot.onMessage(async (msg: TgMessage, text: string) => {
  if (!text.trim()) return;
  const s = getSession(msg.from.id, msg.chat.id);

  // ── Multi-step flow: pending input ──────────────────────────────────────
  if (s.pendingInput) {
    clearPending(msg.from.id);

    switch (s.pendingInput) {
      case 'buy_mint':
        updateSession(msg.from.id, { pendingInput: 'buy_amount', pendingData: { mint: text.trim() } });
        await sendMessage(msg.chat.id, `Mint: \`${text.trim()}\`\n\nHow much SOL to spend? (e.g. \`0.05\`)`, {
          reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'menu:trade' }]] },
        });
        return;

      case 'buy_amount': {
        const mint   = s.pendingData.mint ?? '';
        const amount = parseFloat(text.trim());
        if (!mint || Number.isNaN(amount)) {
          await sendMessage(msg.chat.id, '❌ Invalid input. Starting over.', { reply_markup: { inline_keyboard: tradeMenu() } });
          return;
        }
        await sendTyping(msg.chat.id);
        const { reply } = await handleNLMessage(String(msg.from.id), `buy ${amount} SOL of ${mint}`);
        await sendMessage(msg.chat.id, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
        return;
      }

      case 'wrap_amount': {
        const amount = parseFloat(text.trim());
        if (Number.isNaN(amount)) {
          await sendMessage(msg.chat.id, '❌ Invalid amount.', { reply_markup: { inline_keyboard: tradeMenu() } });
          return;
        }
        await sendTyping(msg.chat.id);
        const { reply } = await handleNLMessage(String(msg.from.id), `wrap ${amount} SOL`);
        await sendMessage(msg.chat.id, reply, { reply_markup: { inline_keyboard: tradeMenu() } });
        return;
      }

      case 'watch_mint':
        updateSession(msg.from.id, { alertsEnabled: true });
        birdeye.subscribePrice(text.trim());
        await sendMessage(msg.chat.id, `👀 Watching \`${text.trim()}\``, {
          reply_markup: { inline_keyboard: alertsMenu(true) },
        });
        return;

      case 'price_search': {
        const data = (await searchTokens(text.trim())) as { data?: { items?: Array<{ name: string; symbol: string; address: string }> } };
        const items = data?.data?.items ?? [];
        if (items.length === 0) { await sendMessage(msg.chat.id, `No results for "${text}".`); return; }
        const lines = items.slice(0, 6).map(t => `• *${t.symbol}* — ${t.name}\n  \`${t.address}\``);
        await sendMessage(msg.chat.id, `🔍 *Results:*\n\n${lines.join('\n\n')}`, {
          reply_markup: { inline_keyboard: priceMenu() },
        });
        return;
      }
    }

    // link_wallet flow (pendingData.flow)
    if (s.pendingData?.flow === 'link_wallet') {
      const addr = text.trim();
      updateSession(msg.from.id, { linkedWallet: addr, pendingData: {} });
      await sendMessage(msg.chat.id, `✅ Wallet linked: \`${addr}\``, {
        reply_markup: { inline_keyboard: x402Menu() },
      });
      return;
    }
  }

  // ── NL trading fallback ──────────────────────────────────────────────────
  const { reply } = await handleNLMessage(String(msg.from.id), text);
  await sendMessage(msg.chat.id, reply, {
    reply_markup: { inline_keyboard: mainMenu() },
  });
});

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    wallet: getPublicKey()?.toBase58() ?? null,
    birdeye: birdeye.isConnected(),
    mode: WEBHOOK_URL ? 'webhook' : 'polling',
    access: accessPolicyStatus(),
    neon: neonStatus().neon,
    uptime: process.uptime(),
  });
});

app.get('/api/gate/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    token: '$CLAWD',
    mint: '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump',
    access: accessPolicyStatus(),
  });
});

app.get('/api/balance/:address?', async (req: Request, res: Response) => {
  try { res.json(await getBalance((req.params as Record<string, string>).address || undefined)); }
  catch (e: unknown) { res.status(400).json({ error: (e as Error).message }); }
});

app.get('/api/tokens/:address?', async (req: Request, res: Response) => {
  try { res.json(await getTokenAccounts((req.params as Record<string, string>).address || undefined)); }
  catch (e: unknown) { res.status(400).json({ error: (e as Error).message }); }
});

app.get('/api/price/:address', async (req: Request, res: Response) => {
  try { res.json(await getTokenPrice(req.params.address as string)); }
  catch (e: unknown) { res.status(400).json({ error: (e as Error).message }); }
});

app.get('/api/search', async (req: Request, res: Response) => {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: 'Missing ?q=' });
  try { res.json(await searchTokens(q)); }
  catch (e: unknown) { res.status(400).json({ error: (e as Error).message }); }
});

app.get('/api/slot', async (_req: Request, res: Response) => {
  try { res.json({ slot: await getSlot(), blockHeight: await getBlockHeight() }); }
  catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
});

app.get('/api/supabase/health', async (_req: Request, res: Response) => {
  const { error } = await supabase.from('_health_check_dummy').select('*').limit(0);
  const ok = !error || error.code === '42P01' || error.code === 'PGRST116';
  res.json({ supabase: ok ? 'connected' : 'error', detail: error?.message ?? 'ok' });
});

app.post('/api/trade', async (req: Request, res: Response) => {
  const { userId, message } = req.body as { userId?: string; message?: string };
  if (!userId || !message) return res.status(400).json({ error: 'Required: { userId, message }' });
  try { res.json(await handleNLMessage(userId, message)); }
  catch (e: unknown) { res.status(500).json({ error: (e as Error).message }); }
});

// x402.wtf proxy — forward /api/x402/* to x402.wtf/api/*
app.all('/api/x402/*', async (req: Request, res: Response) => {
  const path = (req.params as Record<string, string>)[0] ?? '';
  const { proxyCall } = await import('./x402.js');
  try {
    const result = await proxyCall(`/${path}`, req.method as 'GET' | 'POST', req.body);
    res.json(result);
  } catch (e: unknown) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.get('/api/agents', async (_req: Request, res: Response) => {
  res.json({ agents: await listAgents(50) });
});

app.get('/api/clawd/price', async (_req: Request, res: Response) => {
  const price = await getClawdPrice();
  res.json(price ?? { error: 'unavailable' });
});

// Telegram webhook endpoint
app.post('/telegram/webhook', async (req: Request, res: Response) => {
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    res.status(403).end();
    return;
  }
  res.status(200).end(); // ack immediately
  bot.handleUpdate(req.body).catch(e =>
    console.error('[Webhook] handleUpdate error:', e.message));
});

// Persist on graceful shutdown
process.on('SIGTERM', () => { flushNow(); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  app.listen(PORT, HOST, () => console.log(`[Gateway] HTTP on ${HOST}:${PORT}`));
  birdeye.connect();

  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      if (WEBHOOK_URL) {
        await setWebhook(WEBHOOK_URL);
        console.log('[Gateway] Webhook mode active');
      } else {
        await bot.startPolling();
      }
    } catch (err) {
      console.warn('[Gateway] Telegram init failed (non-fatal):', (err as Error).message);
    }
  } else {
    console.log('[Gateway] No TELEGRAM_BOT_TOKEN — Telegram disabled');
  }
}

main().catch(err => {
  console.error('[Gateway] Fatal:', err);
  process.exit(1);
});
