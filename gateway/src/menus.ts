/**
 * gateway/src/menus.ts — Inline keyboard layouts for the CLAWD bot.
 *
 * All callback_data values follow the pattern:  <namespace>:<payload>
 * Registered in index.ts via bot.onCallback('<namespace>', handler).
 */

import type { InlineKeyboard } from './telegram.js';

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

export function mainMenu(): InlineKeyboard {
  return [
    [
      { text: '💰 Portfolio',   callback_data: 'menu:portfolio' },
      { text: '📈 Trade',       callback_data: 'menu:trade' },
    ],
    [
      { text: '🔔 Alerts',      callback_data: 'menu:alerts' },
      { text: '🔍 Price',       callback_data: 'menu:price' },
    ],
    [
      { text: '🌊 x402.wtf',    callback_data: 'menu:x402' },
      { text: '⚙️ Settings',    callback_data: 'menu:settings' },
    ],
    [
      { text: '📖 Help',        callback_data: 'menu:help' },
    ],
  ];
}

export function mainMenuText(): string {
  return [
    '🦞 *CLAWD — Sovereign AI on Solana*',
    '',
    'Choose an action below, or just type naturally.',
    '`"buy 0.05 SOL of <mint>"`  `"what\'s my balance?"`',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export function portfolioMenu(): InlineKeyboard {
  return [
    [
      { text: '💵 SOL Balance',    callback_data: 'portfolio:balance' },
      { text: '🪙 Tokens',         callback_data: 'portfolio:tokens' },
    ],
    [
      { text: '📜 Recent TXs',     callback_data: 'portfolio:txs' },
      { text: '🗂 DAS Assets',     callback_data: 'portfolio:assets' },
    ],
    [
      { text: '⚖️ Risk Check',     callback_data: 'portfolio:risk' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// Trade menu
// ---------------------------------------------------------------------------

export function tradeMenu(): InlineKeyboard {
  return [
    [
      { text: '🟢 Buy Token',      callback_data: 'trade:buy_prompt' },
      { text: '⚖️ Balance SOL',    callback_data: 'trade:balance' },
    ],
    [
      { text: '🔁 Wrap SOL',       callback_data: 'trade:wrap_prompt' },
      { text: '🔄 Unwrap WSOL',    callback_data: 'trade:unwrap' },
    ],
    [
      { text: '🗑 Close Accounts', callback_data: 'trade:close' },
      { text: '🔍 Track Tokens',   callback_data: 'trade:check_tokens' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// Alerts menu
// ---------------------------------------------------------------------------

export function alertsMenu(active: boolean): InlineKeyboard {
  return [
    [
      {
        text: active ? '🔕 Disable Alerts' : '🔔 Enable Alerts',
        callback_data: active ? 'alerts:off' : 'alerts:on',
      },
    ],
    [
      { text: '👀 Watch Token',        callback_data: 'alerts:watch_prompt' },
      { text: '🐋 Whale Trades',       callback_data: 'alerts:whales' },
    ],
    [
      { text: '🔗 New Pairs',          callback_data: 'alerts:newpairs' },
      { text: '🆕 New Listings',       callback_data: 'alerts:newlistings' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// Price lookup
// ---------------------------------------------------------------------------

export function priceMenu(): InlineKeyboard {
  return [
    [
      { text: '◎ SOL',   callback_data: 'price:So11111111111111111111111111111111111111112' },
      { text: '🦞 $CLAWD', callback_data: 'price:8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump' },
    ],
    [
      { text: '🔍 Search Token', callback_data: 'price:search_prompt' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// x402.wtf menu
// ---------------------------------------------------------------------------

export function x402Menu(): InlineKeyboard {
  return [
    [
      { text: '🌐 Open x402.wtf',  url: 'https://x402.wtf' },
      { text: '🦞 $CLAWD Chart',   url: 'https://x402.wtf/token' },
    ],
    [
      { text: '🤖 Agent Registry', url: 'https://x402.wtf/agents' },
      { text: '🎯 Skill Hub',      url: 'https://x402.wtf/skills' },
    ],
    [
      { text: '💸 Check Tier',     callback_data: 'x402:tier' },
      { text: '🔑 Link Wallet',    callback_data: 'x402:link_wallet' },
    ],
    [
      { text: '📊 CLAWD Price',    callback_data: 'x402:clawd_price' },
      { text: '💎 Buy $CLAWD',     url: 'https://pump.fun/coin/8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// Settings menu
// ---------------------------------------------------------------------------

export function settingsMenu(): InlineKeyboard {
  return [
    [
      { text: '🤖 Bot Status',       callback_data: 'settings:status' },
      { text: '🔐 My Access',        callback_data: 'settings:access' },
    ],
    [
      { text: '🧠 Clear Memory',     callback_data: 'settings:clear_memory' },
      { text: '📋 My Facts',         callback_data: 'settings:facts' },
    ],
    [backButton('menu:back')],
  ];
}

// ---------------------------------------------------------------------------
// Confirm dialogs
// ---------------------------------------------------------------------------

export function confirmMenu(action: string, label: string): InlineKeyboard {
  return [
    [
      { text: `✅ Confirm ${label}`,  callback_data: `confirm:${action}` },
      { text: '❌ Cancel',            callback_data: 'menu:back' },
    ],
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backButton(data: string): InlineKeyboardButton {
  return { text: '◀️ Back', callback_data: data };
}

type InlineKeyboardButton = { text: string; callback_data: string } | { text: string; url: string };
