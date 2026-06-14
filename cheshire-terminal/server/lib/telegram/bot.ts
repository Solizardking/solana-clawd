import { Telegraf, Context } from 'telegraf';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  askGrok, askGrokLive, askDeepSeek, askClaude,
  generateImage, generateImageGPT, generateGoblinImage, generateArt,
  submitFalVideo, pollFalVideo,
  getTokenPrice, getTokenOverview, getTrendingTokens,
  getWalletNetWorth, exaSearch, analyzeToken,
  generateMemeIdea, formatTrending, truncate, fmt, pct,
  verifyClawd,
} from './aiCommands';
import { getPublicAppUrl } from './auth';
import {
  buildTelegramTradingPlan,
  getLinkedTelegramWallet,
  looksLikeTradingRequest,
  type TelegramTradingPlan,
} from './tradingIntent';
import {
  buildComputerUsePlan,
  buildTelegramAgentSpawnPlan,
  looksLikeAgentSpawnRequest,
  looksLikeComputerUseRequest,
  type TelegramAgentSpawnPlan,
} from './agentSpawner';
import {
  canHandleDocumentInline,
  getProviderStatus,
  getTelegramProviderCatalog,
  normalizeTelegramSelection,
  providerLabel,
  runTelegramText,
  runTelegramVision,
  type TelegramMediaInput,
  type TelegramModelSelection,
  type TelegramProviderId,
} from './modelProviders';
import { objectStore } from '../objectStore';
import { publishGalleryItem } from '../galleryRealtime';
import {
  honchoInsight,
  honchoLogEvent,
  honchoPeerId,
  honchoSessionId,
} from '../honcho';

// Define event types for chat messages
interface ChatEvent {
  type: 'chat_message' | 'user_joined' | 'user_left' | 'room_created' | 'system_notification' 
      | 'base_transaction_sent' | 'base_wallet_connected' | 'agent_wallet_connected' | 'agent_transaction_complete';
  roomId?: number;
  roomName?: string;
  message?: string;
  tokenAddress?: string;
  tokenName?: string;
  symbol?: string;
  walletAddress?: string;
  displayName?: string;
  timestamp: Date;
  // Base blockchain specific fields
  txHash?: string;
  amount?: string;
  to?: string;
  from?: string;
  baseAddress?: string;
  telegramId?: string;
  // AI Agent specific fields
  agentAddress?: string;
  walletType?: string;
  agentEnabled?: boolean;
  toAddress?: string;
  fromAddress?: string;
  status?: string;
}

interface BotInfo {
  mode: 'webhook' | 'polling' | 'stopped';
  webhook?: {
    domain: string;
    path: string;
  };
  startTime: number;
  status: 'running' | 'starting' | 'stopped' | 'error';
  errorCount: number;
  lastError?: string;
  lastRestart?: number;
  connectedToWebSocket: boolean;
  reconnectAttempts?: number;
}

const noLinkPreview = {
  link_preview_options: { is_disabled: true },
} as const;

const MAX_TELEGRAM_MEDIA_BYTES = 20 * 1024 * 1024;

function html(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class TelegramBot {
  private bot: Telegraf;
  private static instance: TelegramBot;
  private botInfo: BotInfo = {
    mode: 'stopped',
    startTime: Date.now(),
    status: 'stopped',
    errorCount: 0,
    connectedToWebSocket: false,
    reconnectAttempts: 0
  };
  private ws: WebSocket | null = null;
  private clientId: string = uuidv4();
  private subscribedRooms: Map<number, string> = new Map(); // roomId -> channelId
  private agentNameCache: Map<string, string> = new Map(); // telegramId -> agentName
  private modelSelections: Map<number, TelegramModelSelection> = new Map(); // chatId -> provider/model

  private constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.setupCommands();
    this.setupWebApp();
  }

  public static getInstance(): TelegramBot {
    if (!TelegramBot.instance) {
      TelegramBot.instance = new TelegramBot();
    }
    return TelegramBot.instance;
  }

  // ── Main keyboard ────────────────────────────────────────────────────────────
  private mainKeyboard() {
    return {
      keyboard: [
        [{ text: '🤖 Ask Grok' },    { text: '🧠 DeepSeek' },   { text: '🎭 Ask Claude' }],
        [{ text: '🧭 AI Model' },    { text: '👁 Vision' }],
        [{ text: '🎨 Imagine' },      { text: '🎬 Video Gen' },   { text: '🔍 Web Search' }],
        [{ text: '🛰 Grok Live' },     { text: '𝕏 X Search' },     { text: '🧬 Spawn Agent' }],
        [{ text: '🔥 Trending' },     { text: '💰 Token Price' }, { text: '🏦 Scan Wallet' }],
        [{ text: '🪙 Meme Idea' },    { text: '🤖 AI Agents',
           web_app: { url: `${this.getAppUrl()}/agents` } },
          { text: '🖼 Gallery',
           web_app: { url: `${this.getAppUrl()}/gallery` } }],
        [{ text: '⚡ Trade',
           web_app: { url: `${this.getAppUrl()}/telegram` } },
          { text: '🔁 Swap',
           web_app: { url: `${this.getAppUrl()}/swap` } }],
        [{ text: '🚀 Launch Token',
           web_app: { url: `${this.getAppUrl()}/launch?source=telegram` } },
          { text: '📱 Open Terminal',
           web_app: { url: `${this.getAppUrl()}/terminal?source=telegram&tab=ai&prompt=Help%20me%20control%20Cheshire%20Terminal%20from%20Telegram.` } },
          { text: '👤 Account',
           web_app: { url: `${this.getAppUrl()}/account` } }],
      ],
      resize_keyboard: true,
    };
  }

  private aiMenu() {
    return {
      inline_keyboard: [
        [
          { text: '🧭 Switch AI Model', callback_data: 'provider_menu' },
          { text: '👁 Vision Uploads', callback_data: 'vision_help' },
        ],
        [
          { text: '🤖 Grok',    callback_data: 'ai_grok' },
          { text: '🧠 DeepSeek', callback_data: 'ai_deep' },
          { text: '🎭 Claude',  callback_data: 'ai_claude' },
        ],
        [
          { text: '🎨 Image Gen',   callback_data: 'ai_image' },
          { text: '🎬 Video Gen',   callback_data: 'ai_video' },
          { text: '🔍 Web Search',  callback_data: 'ai_search' },
        ],
        [
          { text: '🔥 Trending',    callback_data: 'market_trending' },
          { text: '💰 Token Price', callback_data: 'market_price' },
          { text: '🏦 Wallet Scan', callback_data: 'market_wallet' },
        ],
        [
          { text: '🪙 Meme Idea',  callback_data: 'meme_idea' },
          { text: '🚀 Launch Token', web_app: { url: `${this.getAppUrl()}/launch?source=telegram` } },
        ],
        [
          { text: '⚡ Trade', web_app: { url: `${this.getAppUrl()}/telegram` } },
          { text: '🔁 Swap', web_app: { url: `${this.getAppUrl()}/swap` } },
          { text: '📈 DEX', web_app: { url: `${this.getAppUrl()}/dex` } },
        ],
        [
          { text: '🛰 Grok Live', callback_data: 'ai_grok_live' },
          { text: '𝕏 X Search', callback_data: 'ai_x_search' },
          { text: '🧬 Spawn Agent', callback_data: 'agent_spawn' },
        ],
        [
          { text: '📱 Open Terminal', web_app: { url: `${this.getAppUrl()}/terminal?source=telegram&tab=ai&prompt=Help%20me%20control%20Cheshire%20Terminal%20from%20Telegram.` } },
          { text: '🖼 Gallery', web_app: { url: `${this.getAppUrl()}/gallery` } },
          { text: '👤 Account', web_app: { url: `${this.getAppUrl()}/account` } },
        ],
      ],
    };
  }

  // ── Convex HTTP helpers (wallet-persistent user data) ────────────────────────

  private convexUrl(): string {
    return (process.env.CONVEX_SITE_URL ?? '').replace(/\/$/, '');
  }

  private async convexPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const base = this.convexUrl();
    if (!base) return null;
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return await res.json() as Record<string, unknown>;
    } catch { return null; }
  }

  private async convexGet(path: string): Promise<Record<string, unknown> | null> {
    const base = this.convexUrl();
    if (!base) return null;
    try {
      const res = await fetch(`${base}${path}`);
      return await res.json() as Record<string, unknown>;
    } catch { return null; }
  }

  // Helper to send a "typing" action before slow AI calls
  private async thinking(ctx: Context): Promise<void> {
    try { await ctx.sendChatAction('typing'); } catch {}
  }

  private getChatModelSelection(ctx: Context): TelegramModelSelection {
    const chatId = ctx.chat?.id;
    const saved = typeof chatId === 'number' ? this.modelSelections.get(chatId) : undefined;
    return normalizeTelegramSelection(saved);
  }

  private setChatModelSelection(chatId: number | undefined, selection: TelegramModelSelection): TelegramModelSelection {
    const normalized = normalizeTelegramSelection(selection);
    if (typeof chatId === 'number') {
      this.modelSelections.set(chatId, normalized);
    }
    return normalized;
  }

  private providerMenuMarkup(selection: TelegramModelSelection) {
    const rows = getTelegramProviderCatalog().map((provider) => [{
      text: `${selection.provider === provider.id ? '✓ ' : ''}${provider.label}${provider.configured ? '' : ' (no key)'}`,
      callback_data: `provider:${provider.id}`,
    }]);
    rows.push([{ text: '👁 Vision upload help', callback_data: 'vision_help' }]);
    return { inline_keyboard: rows };
  }

  private modelMenuMarkup(providerId: TelegramProviderId, selection: TelegramModelSelection) {
    const provider = getProviderStatus(providerId);
    const rows = (provider?.models || []).map((model, index) => [{
      text: `${selection.provider === providerId && selection.model === model.id ? '✓ ' : ''}${model.label}${model.documents ? ' + docs' : model.vision ? ' + vision' : ''}`,
      callback_data: `model:${providerId}:${index}`,
    }]);
    rows.push([{ text: '← Providers', callback_data: 'provider_menu' }]);
    return { inline_keyboard: rows };
  }

  private providerMenuText(selection: TelegramModelSelection): string {
    const current = getProviderStatus(selection.provider);
    const lines = getTelegramProviderCatalog()
      .map((provider) => {
        const status = provider.configured ? '✅' : '⚠️';
        const suffix = provider.id === selection.provider
          ? ` — current <code>${html(selection.model)}</code>`
          : '';
        return `${status} <b>${html(provider.label)}</b>${suffix}`;
      })
      .join('\n');

    return `🧭 <b>AI Model</b>\n\n` +
      `Current: <b>${html(current?.label || selection.provider)}</b> <code>${html(selection.model)}</code>\n\n` +
      `${lines}\n\n` +
      `Tap a provider to switch. Send any plain text to chat with the selected model. Send a photo, chart screenshot, PDF, CSV, JSON, or text file for vision/document understanding.`;
  }

  private visionHelpText(): string {
    return `👁 <b>Vision &amp; Documents</b>\n\n` +
      `Send a photo, chart screenshot, PDF, CSV, JSON, or text document with an optional caption. ` +
      `The selected vision model will analyze it. If the selected provider cannot read documents, the bot automatically uses Gemini when configured.\n\n` +
      `Use <code>/models</code> or tap <b>Switch AI Model</b> to choose Google Gemini, OpenRouter, xAI, OpenAI, or DeepSeek.`;
  }

  private async replyProviderMenu(ctx: Context): Promise<void> {
    const selection = this.getChatModelSelection(ctx);
    await ctx.reply(this.providerMenuText(selection), {
      parse_mode: 'HTML',
      reply_markup: this.providerMenuMarkup(selection),
    });
  }

  private async replyModelMenu(ctx: Context, providerId: TelegramProviderId): Promise<void> {
    const provider = getProviderStatus(providerId);
    const selection = this.getChatModelSelection(ctx);
    if (!provider) {
      await ctx.reply('Unknown provider.');
      return;
    }
    await ctx.reply(
      `🧭 <b>${html(provider.label)}</b>\n\n` +
      `${provider.configured ? '✅ Configured' : '⚠️ API key not configured'}\n` +
      `Choose the model for this chat:`,
      {
        parse_mode: 'HTML',
        reply_markup: this.modelMenuMarkup(providerId, selection),
      },
    );
  }

  private providerAnswerText(icon: string, result: { providerLabel: string; model: string; text: string; usedFallback?: boolean }): string {
    const fallback = result.usedFallback
      ? '\n<i>Switched automatically for this upload because the selected model cannot handle that media type.</i>\n'
      : '';
    return `${icon} <b>${html(result.providerLabel)}</b> <code>${html(result.model)}</code>${fallback}\n\n${html(truncate(result.text))}`;
  }

  private async downloadTelegramFile(ctx: Context, fileId: string): Promise<Buffer> {
    const link = await ctx.telegram.getFileLink(fileId);
    const res = await fetch(link.href);
    if (!res.ok) throw new Error(`Telegram file download failed (${res.status})`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private guessMimeType(fileName?: string, fallback?: string): string {
    if (fallback && fallback !== 'application/octet-stream') return fallback;
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
    return 'application/octet-stream';
  }

  private async analyzeTelegramMedia(
    ctx: Context,
    params: {
      fileId: string;
      mimeType: string;
      prompt: string;
      fileName?: string;
      fileSize?: number;
    },
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    if (params.fileSize && params.fileSize > MAX_TELEGRAM_MEDIA_BYTES) {
      await ctx.reply(`❌ File is too large for Telegram AI analysis. Max: ${Math.round(MAX_TELEGRAM_MEDIA_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    if (!canHandleDocumentInline(params.mimeType)) {
      await ctx.reply(`❌ Unsupported file type: <code>${html(params.mimeType)}</code>\n\nSend an image, PDF, CSV, JSON, or text file.`, {
        parse_mode: 'HTML',
      });
      return;
    }

    await this.thinking(ctx);
    const selection = this.getChatModelSelection(ctx);
    const msg = await ctx.reply(
      `👁 <i>Analyzing with ${html(providerLabel(selection.provider))}…</i>`,
      { parse_mode: 'HTML' },
    );

    try {
      const data = await this.downloadTelegramFile(ctx, params.fileId);
      if (data.length > MAX_TELEGRAM_MEDIA_BYTES) {
        throw new Error(`File is too large after download. Max: ${Math.round(MAX_TELEGRAM_MEDIA_BYTES / 1024 / 1024)} MB.`);
      }

      const media: TelegramMediaInput = {
        data,
        mimeType: params.mimeType,
        fileName: params.fileName,
      };
      const result = await runTelegramVision(selection, params.prompt, media);
      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        this.providerAnswerText('👁', result),
        { parse_mode: 'HTML' },
      );
    } catch (e: unknown) {
      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        `❌ ${html(e instanceof Error ? e.message : String(e))}`,
        { parse_mode: 'HTML' },
      );
    }
  }

  private saveTelegramImageToGallery(
    ctx: Context,
    params: {
      prompt: string;
      title: string;
      model: string;
      command: string;
      sourceUrl?: string;
      b64?: string;
      revisedPrompt?: string;
    },
  ): void {
    const sourceUrl = params.sourceUrl || (params.b64 ? `data:image/jpeg;base64,${params.b64}` : '');
    if (!sourceUrl) return;

    const creator = ctx.from?.username
      ? `telegram:@${ctx.from.username}`
      : ctx.from?.id
        ? `telegram:${ctx.from.id}`
        : 'telegram';
    const item = objectStore.makeItem({
      type: 'image',
      title: params.title,
      prompt: params.prompt,
      sourceUrl,
      model: params.model,
      creator,
      metadata: {
        source: 'telegram',
        command: params.command,
        revisedPrompt: params.revisedPrompt,
      },
    });

    objectStore
      .saveGalleryItem(item)
      .then((saved) => {
        publishGalleryItem(saved);
      })
      .catch((err) => {
        console.warn('[TelegramBot] Could not save generated image to gallery storage:', err);
      });
  }

  private async sendTradingPlan(ctx: Context, request: string): Promise<boolean> {
    const telegramId = String(ctx.from?.id ?? '');
    const chatId = ctx.chat?.id;
    if (!chatId) return false;
    const peerId = honchoPeerId({ telegramId });
    const sessionId = honchoSessionId('telegram-trading', telegramId);

    await this.thinking(ctx);
    const msg = await ctx.reply('⚡ <i>Preparing live trading route…</i>', { parse_mode: 'HTML' });
    try {
      honchoLogEvent({
        peerId,
        sessionId,
        content: `Telegram trading request: ${request}`,
        metadata: { type: 'telegram_trading_request', telegramId, chatId },
      }).catch(() => {});
      const plan: TelegramTradingPlan = await buildTelegramTradingPlan(request, telegramId);
      if (!plan.handled) {
        await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        return false;
      }
      honchoLogEvent({
        peerId,
        sessionId,
        role: 'assistant',
        content: `Trading plan prepared: ${plan.text}`,
        metadata: { type: 'telegram_trading_plan', telegramId, chatId },
      }).catch(() => {});
      await ctx.telegram.editMessageText(chatId, msg.message_id, undefined, truncate(plan.text), {
        parse_mode: 'HTML',
        ...noLinkPreview,
        reply_markup: plan.buttons ? { inline_keyboard: plan.buttons } : undefined,
      });
      return true;
    } catch (e: unknown) {
      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        `❌ ${e instanceof Error ? e.message : String(e)}`,
      );
      return true;
    }
  }

  private async sendAgentSpawnPlan(ctx: Context, request: string): Promise<boolean> {
    const telegramId = String(ctx.from?.id ?? '');
    const chatId = ctx.chat?.id;
    if (!chatId) return false;
    const peerId = honchoPeerId({ telegramId });
    const sessionId = honchoSessionId('telegram-agents', telegramId);

    await this.thinking(ctx);
    const msg = await ctx.reply('🧬 <i>Designing CLAWD Grok agent…</i>', { parse_mode: 'HTML' });
    try {
      honchoLogEvent({
        peerId,
        sessionId,
        content: `Telegram agent request: ${request}`,
        metadata: { type: 'telegram_agent_request', telegramId, chatId },
      }).catch(() => {});
      const plan: TelegramAgentSpawnPlan = await buildTelegramAgentSpawnPlan(request, telegramId);
      if (!plan.handled) {
        await ctx.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        return false;
      }
      honchoLogEvent({
        peerId,
        sessionId,
        role: 'assistant',
        content: `Agent plan prepared: ${plan.text}`,
        metadata: { type: 'telegram_agent_plan', telegramId, chatId },
      }).catch(() => {});
      await ctx.telegram.editMessageText(chatId, msg.message_id, undefined, truncate(plan.text), {
        parse_mode: 'HTML',
        ...noLinkPreview,
        reply_markup: plan.buttons ? { inline_keyboard: plan.buttons } : undefined,
      });
      return true;
    } catch (e: unknown) {
      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        `❌ ${e instanceof Error ? e.message : String(e)}`,
      );
      return true;
    }
  }

  private async sendComputerUsePlan(ctx: Context, request: string): Promise<boolean> {
    const plan = buildComputerUsePlan(request);
    await ctx.reply(truncate(plan.text), {
      parse_mode: 'HTML',
      ...noLinkPreview,
      reply_markup: plan.buttons ? { inline_keyboard: plan.buttons } : undefined,
    });
    return true;
  }

  private async sendGrokLive(ctx: Context, query: string, mode: 'web' | 'x' | 'both'): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    await this.thinking(ctx);
    const label = mode === 'x' ? '𝕏 Search' : mode === 'web' ? 'Web Search' : 'Grok Live';
    const msg = await ctx.reply(`🛰 <i>${label} running…</i>`, { parse_mode: 'HTML' });
    try {
      const result = await askGrokLive(query, mode);
      const citations = Array.isArray(result.citations) && result.citations.length
        ? `\n\n<b>Sources:</b> ${result.citations.slice(0, 4).map((c: unknown) => {
            const url = typeof c === 'string' ? c : (c as Record<string, unknown>)?.url;
            return url ? `<a href="${String(url)}">${String(url).slice(0, 48)}</a>` : '';
          }).filter(Boolean).join(' · ')}`
        : '';
      await ctx.telegram.editMessageText(
        chatId,
        msg.message_id,
        undefined,
        truncate(`🛰 <b>${label}</b>\n\n${result.content}${citations}`),
        { parse_mode: 'HTML', ...noLinkPreview },
      );
    } catch (e: unknown) {
      await ctx.telegram.editMessageText(chatId, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private setupCommands() {
    // ── /start ─────────────────────────────────────────────────────────────────
    this.bot.command('start', async (ctx) => {
      const telegramId = String(ctx.from?.id ?? '');
      const firstName = ctx.from?.first_name ?? 'anon';
      const username = ctx.from?.username;
      const chatId = String(ctx.chat?.id ?? '');

      // Register/upsert user in Convex — creates persistent record keyed to Telegram ID
      const reg = await this.convexPost('/api/telegram/register', {
        telegramId,
        telegramUsername: username,
        firstName,
        chatId,
      });

      const agentName = reg?.agentName as string | null | undefined;
      if (agentName && telegramId) this.agentNameCache.set(telegramId, agentName);
      const isNew = reg?.isNew === true;
      honchoLogEvent({
        peerId: honchoPeerId({ telegramId }),
        sessionId: honchoSessionId('telegram-chat', telegramId),
        content: `Telegram user started bot: username=${username ?? ''} firstName=${firstName} chatId=${chatId}`,
        metadata: { type: 'telegram_start', telegramId, username, firstName, chatId, isNew },
      }).catch(() => {});

      const displayName = agentName
        ? `<b>${agentName}</b>`
        : username ? `@${username}` : `<b>${firstName}</b>`;

      const greeting = agentName
        ? `Welcome back, ${displayName}! 🐱`
        : isNew
        ? `👋 Welcome, ${displayName}!`
        : `👋 Welcome back, ${displayName}!`;

      const namePrompt = agentName
        ? ''
        : `\n\n💡 Set your agent name: <code>/setname YourAgentName</code>`;

      await ctx.reply(
        `${greeting}\n\n` +
        `<b>CLAWD Terminal</b> — your AI-powered Solana command center.\n\n` +
        `🤖 Chat with <b>Gemini</b>, <b>OpenRouter</b>, <b>Grok</b>, <b>OpenAI</b> &amp; <b>DeepSeek</b>\n` +
        `🧭 <b>/models</b> — switch AI providers and models inline\n` +
        `👁 Send <b>photos, charts, PDFs, CSVs, JSON, or text files</b> for vision/document analysis\n` +
        `🛰 <b>/grok</b>, <b>/web</b>, <b>/xsearch</b> — Grok 4.3 live search\n` +
        `🎨 Generate <b>images</b> with GPT-Image-1 &amp; DALL-E 3\n` +
        `👺 <b>/goblin</b> — summon the CLAWD goblin\n` +
        `🖌️ <b>/art</b> &lt;prompt&gt; — custom AI artwork\n` +
        `🎬 Create <b>videos</b> with FAL AI\n` +
        `💰 Live <b>token prices</b> &amp; trending\n` +
        `🏦 <b>Wallet analysis</b> on Solana\n` +
        `⚡ <b>/trade</b> — natural language live trading prep\n` +
        `🧬 <b>/agent</b> — spawn a CLAWD Grok agent from natural language\n` +
        `🖥️ <b>/computer</b> — hand off a task to Computer Use\n` +
        `📈 <b>/perps</b> — natural language Phoenix perpetuals\n` +
        `🚀 <b>Launch tokens</b> from the terminal\n` +
        `👤 <b>/account</b> — create or manage your Cheshire account${namePrompt}\n\n` +
        `Type any message to chat with AI, or use the menu below:`,
        {
          parse_mode: 'HTML',
          reply_markup: this.mainKeyboard(),
        },
      );
    });

    // ── /menu ──────────────────────────────────────────────────────────────────
    this.bot.command('menu', async (ctx) => {
      await ctx.reply('🐱 <b>CLAWD Terminal — Main Menu</b>', {
        parse_mode: 'HTML',
        reply_markup: this.aiMenu(),
      });
    });

    // ── /models and /provider — inline provider/model switcher ───────────────
    this.bot.command(['models', 'provider'], async (ctx) => {
      await this.replyProviderMenu(ctx);
    });

    this.bot.command('vision', async (ctx) => {
      await ctx.reply(this.visionHelpText(), { parse_mode: 'HTML' });
    });

    this.bot.command('gemini', async (ctx) => {
      const text = ctx.message.text.replace(/^\/gemini\s*/i, '').trim();
      if (!text) {
        return ctx.reply(
          'Usage: /gemini <question>\n\nSend photos, charts, PDFs, CSVs, JSON, or text files directly for Gemini-backed vision/document analysis.',
        );
      }
      const provider = getProviderStatus('google');
      const selection: TelegramModelSelection = {
        provider: 'google',
        model: provider?.defaultTextModel || process.env.TELEGRAM_GEMINI_MODEL || 'gemini-2.5-flash',
      };
      await this.thinking(ctx);
      const msg = await ctx.reply('💎 <i>Gemini is thinking…</i>', { parse_mode: 'HTML' });
      try {
        const result = await runTelegramText(selection, text);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          undefined,
          this.providerAnswerText('💎', result),
          { parse_mode: 'HTML' },
        );
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          undefined,
          `❌ ${html(e instanceof Error ? e.message : String(e))}`,
          { parse_mode: 'HTML' },
        );
      }
    });

    // ── /account — hosted Clerk Account Portal ────────────────────────────────
    this.bot.command('account', async (ctx) => {
      await ctx.reply(
        '👤 <b>Cheshire Account</b>\n\nCreate or manage your account through Clerk.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Create account', url: this.getAccountPortalUrl('/sign-up') },
                { text: 'Sign in', url: this.getAccountPortalUrl('/sign-in') },
              ],
              [{ text: 'Manage profile', url: this.getAccountPortalUrl('/user') }],
              [{ text: 'Open account page', web_app: { url: `${this.getAppUrl()}/account` } }],
            ],
          },
        },
      );
    });

    // ── /setname — set persistent agent name saved to Convex ──────────────────
    this.bot.command('setname', async (ctx) => {
      const name = ctx.message.text.replace(/^\/setname\s*/i, '').trim().slice(0, 64);
      if (!name) {
        return ctx.reply(
          '👤 <b>Set your agent name</b>\n\n' +
          'Usage: <code>/setname YourAgentName</code>\n' +
          'Example: <code>/setname Goblin King</code>\n\n' +
          'Your name is saved to Convex and used to greet you on every visit.',
          { parse_mode: 'HTML' },
        );
      }

      const telegramId = String(ctx.from?.id ?? '');
      const result = await this.convexPost('/api/telegram/setname', { telegramId, agentName: name });

      if (result?.ok) {
        this.agentNameCache.set(telegramId, name);
        honchoLogEvent({
          peerId: honchoPeerId({ telegramId }),
          sessionId: honchoSessionId('telegram-profile', telegramId),
          content: `Telegram user set persistent agent name: ${name}`,
          metadata: { type: 'telegram_agent_name', telegramId, agentName: name },
        }).catch(() => {});
        await ctx.reply(
          `✅ <b>Agent name set!</b>\n\n` +
          `You are now known as: <b>${name}</b>\n\n` +
          `We'll greet you as <b>${name}</b> every time you return. 🐱\n\n` +
          `Use <code>/setname</code> again anytime to change it.`,
          { parse_mode: 'HTML' },
        );
      } else {
        const err = typeof result?.error === 'string' ? result.error : '';
        await ctx.reply(
          err.includes('not found')
            ? '⚠️ Please send /start first to register your account.'
            : `✅ Agent name saved: <b>${name}</b>`,
          { parse_mode: 'HTML' },
        );
      }
    });

    // ── /profile — show Convex-persisted user data ────────────────────────────
    this.bot.command('profile', async (ctx) => {
      const telegramId = String(ctx.from?.id ?? '');
      const msg = await ctx.reply('🔍 <i>Loading your profile…</i>', { parse_mode: 'HTML' });
      const data = await this.convexGet(`/api/telegram/profile?telegramId=${telegramId}`);

      if (!data?.found) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          '👤 No profile yet — send /start to register.',
          { parse_mode: 'HTML' });
        return;
      }

      const name = (data.agentName as string | null) || (data.displayName as string | null) || (data.telegramUsername as string | null) || 'unnamed';
      const wallet = (data.walletAddress as string | null) ?? (data.primaryWalletAddress as string | null);
      const balance = typeof data.clawdBalance === 'number' ? data.clawdBalance : 0;
      const holder = data.isTokenGated ? '✅ CLAWD Holder' : '❌ Not a holder';

      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
        `👤 <b>Your Profile</b>\n\n` +
        `<b>Agent name:</b> ${name}\n` +
        (wallet ? `<b>Wallet:</b> <code>${wallet.slice(0, 6)}…${wallet.slice(-4)}</code>\n` : '') +
        `<b>CLAWD balance:</b> ${balance.toLocaleString()}\n` +
        `<b>Status:</b> ${holder}\n\n` +
        `Use <code>/setname</code> to change your agent name.\n` +
        `Use <code>/verify</code> to link your wallet.`,
        { parse_mode: 'HTML' });
    });

    // ── /help ──────────────────────────────────────────────────────────────────
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '<b>🐱 CLAWD Terminal Bot — Commands</b>\n\n' +
        '<b>AI Commands</b>\n' +
        '/models — Switch provider/model inline\n' +
        '/provider — Alias for /models\n' +
        '/gemini &lt;question&gt; — Chat directly with Google Gemini\n' +
        '/vision — How to analyze images, charts, PDFs, CSVs, JSON, and text files\n' +
        '/ask &lt;question&gt; — Chat with Grok AI\n' +
        '/grok &lt;question&gt; — Grok 4.3 with web + X search\n' +
        '/web &lt;query&gt; — Grok 4.3 web search\n' +
        '/xsearch &lt;query&gt; — Grok 4.3 X search\n' +
        '/deep &lt;question&gt; — DeepSeek reasoning\n' +
        '/claude &lt;question&gt; — Ask Claude AI\n' +
        '/imagine &lt;prompt&gt; — Generate image (DALL-E 3)\n' +
        '/goblin [theme] — CLAWD goblin art (GPT-Image-1)\n' +
        '/art &lt;prompt&gt; — Custom AI artwork (GPT-Image-1)\n' +
        '/video &lt;prompt&gt; — Generate a video (FAL AI)\n\n' +
        '<b>Market Commands</b>\n' +
        '/price &lt;token_address&gt; — Token price &amp; stats\n' +
        '/token &lt;address&gt; — Full AI token analysis\n' +
        '/trend — Top trending Solana tokens\n' +
        '/scan &lt;wallet&gt; — Scan a Solana wallet\n\n' +
        '<b>Natural Language Trading</b>\n' +
        '/trade &lt;intent&gt; — Prepare live trading route\n' +
        '  e.g. <code>/trade buy 0.1 SOL of CLAWD</code>\n' +
        '  e.g. <code>/trade sell 5000 CLAWD</code>\n' +
        '  e.g. <code>/trade long SOL 0.1</code>\n' +
        '  e.g. <code>/trade search election prediction markets</code>\n\n' +
        '<b>CLAWD Grok Agents</b>\n' +
        '/agent &lt;brief&gt; — Spawn a persistent Telegram-hosted agent\n' +
        '/spawn &lt;brief&gt; — Alias for /agent\n' +
        '  e.g. <code>/agent create an X sentiment trader with web search, computer use, Jupiter and DFlow routing</code>\n' +
        '  e.g. <code>/agent make a Helius wallet watcher that can prepare CLAWD trades</code>\n' +
        '/agents — Open the agent hub\n' +
        '/computer &lt;task&gt; — Open Computer Use with the task prefilled\n\n' +
        '<b>Perps Trading</b>\n' +
        '/perps &lt;intent&gt; — Natural language Phoenix perps\n' +
        '  e.g. <code>/perps list markets</code>\n' +
        '  e.g. <code>/perps long SOL 0.1</code>\n' +
        '  e.g. <code>/perps show my positions</code>\n\n' +
        '<b>Fun Commands</b>\n' +
        '/meme &lt;theme&gt; — Generate meme coin idea\n' +
        '/search &lt;query&gt; — Web search via Exa\n\n' +
        '<b>CLAWD Holder</b>\n' +
        '/clawd — Check your $CLAWD balance\n' +
        '/verify — Link wallet &amp; verify holdings\n\n' +
        '<b>Account</b>\n' +
        '/account — Create or manage your Cheshire account\n' +
        '/setname &lt;name&gt; — Set your persistent agent name\n' +
        '/profile — View your profile &amp; CLAWD balance\n\n' +
        '<b>Terminal Commands</b>\n' +
        '/trade — Open trading hub\n' +
        '/launch — Launch a new token\n' +
        '/rooms — List chat rooms\n' +
        '/subscribe &lt;roomId&gt; — Subscribe to a room\n' +
        '/unsubscribe &lt;roomId&gt; — Unsubscribe from a room\n' +
        '/status — Bot status\n' +
        '/menu — Show interactive menu\n\n' +
        '💡 <i>Tip: Use /models to choose the default AI. Then type any message, or send an image/document for analysis.</i>',
        { parse_mode: 'HTML' }
      );
    });

    // ── /ask (Grok) ────────────────────────────────────────────────────────────
    this.bot.command('ask', async (ctx) => {
      const text = ctx.message.text.replace(/^\/ask\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /ask <your question>\nExample: /ask What is CLAWD token?');
      await this.thinking(ctx);
      const msg = await ctx.reply('🤖 <i>Grok is thinking…</i>', { parse_mode: 'HTML' });
      try {
        const answer = await askGrok(text);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🤖 <b>Grok</b>\n\n${truncate(answer)}`, { parse_mode: 'HTML' });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /grok — Grok 4.3 with live web + X search ────────────────────────────
    this.bot.command('grok', async (ctx) => {
      const text = ctx.message.text.replace(/^\/grok\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /grok <question>\nExample: /grok what is X saying about Solana today?');
      await this.sendGrokLive(ctx, text, 'both');
    });

    this.bot.command('web', async (ctx) => {
      const text = ctx.message.text.replace(/^\/web\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /web <query>\nExample: /web latest Jupiter Ultra routing docs');
      await this.sendGrokLive(ctx, text, 'web');
    });

    this.bot.command('grokweb', async (ctx) => {
      const text = ctx.message.text.replace(/^\/grokweb\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /grokweb <query>');
      await this.sendGrokLive(ctx, text, 'web');
    });

    this.bot.command('xsearch', async (ctx) => {
      const text = ctx.message.text.replace(/^\/xsearch\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /xsearch <query>\nExample: /xsearch what are traders saying about $CLAWD?');
      await this.sendGrokLive(ctx, text, 'x');
    });

    // ── /deep (DeepSeek) ───────────────────────────────────────────────────────
    this.bot.command('deep', async (ctx) => {
      const text = ctx.message.text.replace(/^\/deep\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /deep <question>\nExample: /deep Explain bonding curves');
      await this.thinking(ctx);
      const msg = await ctx.reply('🧠 <i>DeepSeek is reasoning…</i>', { parse_mode: 'HTML' });
      try {
        const answer = await askDeepSeek(text);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🧠 <b>DeepSeek</b>\n\n${truncate(answer)}`, { parse_mode: 'HTML' });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /claude ────────────────────────────────────────────────────────────────
    this.bot.command('claude', async (ctx) => {
      const text = ctx.message.text.replace(/^\/claude\s*/i, '').trim();
      if (!text) return ctx.reply('Usage: /claude <question>');
      await this.thinking(ctx);
      const msg = await ctx.reply('🎭 <i>Claude is thinking…</i>', { parse_mode: 'HTML' });
      try {
        const answer = await askClaude(text);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🎭 <b>Claude</b>\n\n${truncate(answer)}`, { parse_mode: 'HTML' });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /imagine ───────────────────────────────────────────────────────────────
    this.bot.command('imagine', async (ctx) => {
      const prompt = ctx.message.text.replace(/^\/imagine\s*/i, '').trim();
      if (!prompt) return ctx.reply('Usage: /imagine <prompt>\nExample: /imagine A crab astronaut on the moon, pixel art');
      await this.thinking(ctx);
      const msg = await ctx.reply('🎨 <i>Generating image…</i>', { parse_mode: 'HTML' });
      try {
        const { url, revisedPrompt } = await generateImage(prompt);
        this.saveTelegramImageToGallery(ctx, {
          prompt,
          title: prompt.slice(0, 70) || 'Telegram image',
          model: 'dall-e-3',
          command: '/imagine',
          sourceUrl: url,
          revisedPrompt,
        });
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        await ctx.replyWithPhoto(url, {
          caption: `🎨 <b>DALL-E 3</b>\n<i>${(revisedPrompt || prompt).slice(0, 800)}</i>`,
          parse_mode: 'HTML',
        });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /goblin — crypto goblin art via gpt-image-1 / DALL-E 3 ──────────────────
    this.bot.command('goblin', async (ctx) => {
      const theme = ctx.message.text.replace(/^\/goblin\s*/i, '').trim();
      await this.thinking(ctx);
      const msg = await ctx.reply('👺 <i>Summoning the $CLAWD goblin…</i>', { parse_mode: 'HTML' });
      try {
        const result = await generateGoblinImage(theme || undefined);
        this.saveTelegramImageToGallery(ctx, {
          prompt: theme || 'CLAWD goblin',
          title: theme ? `CLAWD Goblin: ${theme.slice(0, 48)}` : 'CLAWD Goblin',
          model: result.b64 ? 'gpt-image-2' : 'dall-e-3',
          command: '/goblin',
          sourceUrl: result.url,
          b64: result.b64,
          revisedPrompt: result.revisedPrompt,
        });
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        const caption = `👺 <b>CLAWD Goblin</b>${theme ? `\n<i>${theme.slice(0, 200)}</i>` : ''}`;
        if (result.b64) {
          await ctx.replyWithPhoto(
            { source: Buffer.from(result.b64, 'base64') },
            { caption, parse_mode: 'HTML' },
          );
        } else if (result.url) {
          await ctx.replyWithPhoto(result.url, { caption, parse_mode: 'HTML' });
        } else {
          await ctx.reply('❌ No image returned — check OPENAI_API_KEY.');
        }
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /art — high-quality custom art via gpt-image-1 / DALL-E 3 ─────────────
    this.bot.command('art', async (ctx) => {
      const prompt = ctx.message.text.replace(/^\/art\s*/i, '').trim();
      if (!prompt) return ctx.reply(
        'Usage: /art <description>\nExample: /art a neon lobster surfing a wave of $SOL coins at sunset',
      );
      await this.thinking(ctx);
      const msg = await ctx.reply('🖌️ <i>Creating artwork…</i>', { parse_mode: 'HTML' });
      try {
        const result = await generateArt(prompt);
        this.saveTelegramImageToGallery(ctx, {
          prompt,
          title: prompt.slice(0, 70) || 'Telegram artwork',
          model: result.b64 ? 'gpt-image-2' : 'dall-e-3',
          command: '/art',
          sourceUrl: result.url,
          b64: result.b64,
          revisedPrompt: result.revisedPrompt,
        });
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        const caption = `🖌️ <b>Art</b>\n<i>${prompt.slice(0, 800)}</i>`;
        if (result.b64) {
          await ctx.replyWithPhoto(
            { source: Buffer.from(result.b64, 'base64') },
            { caption, parse_mode: 'HTML' },
          );
        } else if (result.url) {
          await ctx.replyWithPhoto(result.url, { caption, parse_mode: 'HTML' });
        } else {
          await ctx.reply('❌ No image returned — check OPENAI_API_KEY.');
        }
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /video ─────────────────────────────────────────────────────────────────
    this.bot.command('video', async (ctx) => {
      const prompt = ctx.message.text.replace(/^\/video\s*/i, '').trim();
      if (!prompt) return ctx.reply('Usage: /video <prompt>\nExample: /video A crab surfing a wave of coins');
      await this.thinking(ctx);
      const msg = await ctx.reply('🎬 <i>Submitting to FAL… this takes ~2 minutes</i>', { parse_mode: 'HTML' });
      try {
        const requestId = await submitFalVideo(prompt);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🎬 <i>Video queued (ID: <code>${requestId.slice(0, 12)}</code>). Polling for result…</i>`,
          { parse_mode: 'HTML' });
        // Poll up to 24 times (2 min max at 5s intervals)
        let videoUrl: string | null = null;
        for (let i = 0; i < 24; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try { videoUrl = await pollFalVideo(requestId); } catch (pe: unknown) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ Video failed: ${pe instanceof Error ? pe.message : String(pe)}`);
            return;
          }
          if (videoUrl) break;
          if (i % 4 === 3) {
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
              `🎬 <i>Still rendering… (${Math.round((i + 1) * 5)}s elapsed)</i>`, { parse_mode: 'HTML' });
          }
        }
        await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
        if (videoUrl) {
          await ctx.replyWithVideo(videoUrl, {
            caption: `🎬 <b>FAL AI Video</b>\n<i>${prompt.slice(0, 500)}</i>`,
            parse_mode: 'HTML',
          });
        } else {
          await ctx.reply('⏳ Video is still rendering. Check the gallery in the terminal!', {
            reply_markup: { inline_keyboard: [[{ text: '🖼 Open Gallery', web_app: { url: `${this.getAppUrl()}/gallery` } }]] },
          });
        }
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /price ─────────────────────────────────────────────────────────────────
    this.bot.command('price', async (ctx) => {
      const address = ctx.message.text.replace(/^\/price\s*/i, '').trim();
      if (!address) return ctx.reply('Usage: /price <token_address>\nExample: /price 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump');
      await this.thinking(ctx);
      const msg = await ctx.reply('💰 <i>Fetching price data…</i>', { parse_mode: 'HTML' });
      try {
        const d = await getTokenOverview(address);
        const text = d
          ? `💰 <b>${d.name || 'Unknown'}</b> <code>$${d.symbol || '?'}</code>\n\n` +
            `<b>Price:</b> $${d.price < 0.001 ? d.price?.toExponential(4) : d.price?.toFixed(8)}\n` +
            `<b>24h:</b> ${pct(d.priceChange24hPercent)}\n` +
            `<b>Market Cap:</b> $${fmt(d.mc, 0)}\n` +
            `<b>Volume 24h:</b> $${fmt(d.v24hUSD, 0)}\n` +
            `<b>Liquidity:</b> $${fmt(d.liquidity, 0)}\n` +
            `<b>Holders:</b> ${fmt(d.holder, 0)}\n\n` +
            `<a href="https://birdeye.so/token/${address}">View on Birdeye</a> | ` +
            `<a href="https://solscan.io/token/${address}">Solscan</a>`
          : `No data found for <code>${address}</code>`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, text,
          { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /token (full AI analysis) ──────────────────────────────────────────────
    this.bot.command('token', async (ctx) => {
      const address = ctx.message.text.replace(/^\/token\s*/i, '').trim();
      if (!address) return ctx.reply('Usage: /token <address>\nExample: /token 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump');
      await this.thinking(ctx);
      const msg = await ctx.reply('🔎 <i>Fetching data + running AI analysis…</i>', { parse_mode: 'HTML' });
      try {
        const analysis = await analyzeToken(address);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🔎 <b>Token Analysis</b>\n<code>${address.slice(0, 8)}…${address.slice(-6)}</code>\n\n${truncate(analysis)}\n\n` +
          `<a href="https://birdeye.so/token/${address}">Birdeye</a> | <a href="https://solscan.io/token/${address}">Solscan</a>`,
          { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /trend ─────────────────────────────────────────────────────────────────
    this.bot.command('trend', async (ctx) => {
      await this.thinking(ctx);
      const msg = await ctx.reply('🔥 <i>Fetching trending tokens…</i>', { parse_mode: 'HTML' });
      try {
        const tokens = await getTrendingTokens(10);
        const text = `🔥 <b>Trending Solana Tokens</b>\n\n${formatTrending(tokens)}\n\n` +
          `<a href="${this.getAppUrl()}/terminal?source=telegram&tab=chat">View in Terminal</a>`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          truncate(text), { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /trade ────────────────────────────────────────────────────────────────
    this.bot.command('trade', async (ctx) => {
      const request = ctx.message.text.replace(/^\/trade\s*/i, '').trim();
      if (request) {
        const handled = await this.sendTradingPlan(ctx, request);
        if (handled) return;
      }

      await ctx.reply('⚡ <b>Trading Hub</b>', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Trading Hub', web_app: { url: `${this.getAppUrl()}/telegram` } }],
            [
              { text: 'CLAWD Arena', web_app: { url: `${this.getAppUrl()}/arena` } },
              { text: 'Swap', web_app: { url: `${this.getAppUrl()}/swap` } },
            ],
            [
              { text: 'DEX', web_app: { url: `${this.getAppUrl()}/dex` } },
              { text: 'Portfolio', web_app: { url: `${this.getAppUrl()}/portfolio` } },
            ],
          ],
        },
      });
    });

    // ── /agent and /spawn — natural-language CLAWD Grok agent creation ───────
    this.bot.command('agent', async (ctx) => {
      const request = ctx.message.text.replace(/^\/agent\s*/i, '').trim();
      if (!request) {
        return ctx.reply(
          '🧬 <b>Create a CLAWD Grok agent</b>\n\n' +
          'Example:\n' +
          '<code>/agent create an X sentiment trader with web search, computer use, Helius RPC, Jupiter and DFlow routing</code>\n\n' +
          'The agent is persisted to your linked wallet and can prepare live trading routes for wallet review.',
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: 'Open Agent Builder', web_app: { url: `${this.getAppUrl()}/agents/builder` } }]],
            },
          },
        );
      }
      const handled = await this.sendAgentSpawnPlan(ctx, `create agent ${request}`);
      if (!handled) await ctx.reply('I could not map that to an agent brief. Try /agent create a Solana research agent with X search.');
    });

    this.bot.command('spawn', async (ctx) => {
      const request = ctx.message.text.replace(/^\/spawn\s*/i, '').trim();
      if (!request) return ctx.reply('Usage: /spawn <agent brief>');
      const handled = await this.sendAgentSpawnPlan(ctx, `spawn agent ${request}`);
      if (!handled) await ctx.reply('I could not map that to an agent brief. Try /spawn X sentiment trading agent with web search.');
    });

    this.bot.command('agents', async (ctx) => {
      await ctx.reply('🤖 <b>CLAWD Agents</b>', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Agent Hub', web_app: { url: `${this.getAppUrl()}/agents` } }],
            [{ text: 'Create Agent', web_app: { url: `${this.getAppUrl()}/agents/builder` } }],
          ],
        },
      });
    });

    this.bot.command('computer', async (ctx) => {
      const request = ctx.message.text.replace(/^\/computer\s*/i, '').trim();
      if (!request) return ctx.reply('Usage: /computer <browser task>\nExample: /computer inspect jup.ag and summarize the swap flow');
      await this.sendComputerUsePlan(ctx, request);
    });

    this.bot.command('browse', async (ctx) => {
      const request = ctx.message.text.replace(/^\/browse\s*/i, '').trim();
      if (!request) return ctx.reply('Usage: /browse <browser task>');
      await this.sendComputerUsePlan(ctx, request);
    });

    // ── /scan ──────────────────────────────────────────────────────────────────
    this.bot.command('scan', async (ctx) => {
      const wallet = ctx.message.text.replace(/^\/scan\s*/i, '').trim();
      if (!wallet) return ctx.reply('Usage: /scan <wallet_address>');
      await this.thinking(ctx);
      const msg = await ctx.reply('🏦 <i>Scanning wallet…</i>', { parse_mode: 'HTML' });
      try {
        const data = await getWalletNetWorth(wallet);
        const items: Record<string, unknown>[] = data?.items || data?.tokens || [];
        const total = data?.totalUsd || items.reduce((s: number, t: Record<string, unknown>) => s + ((t.valueUsd as number) || 0), 0);
        const topTokens = items
          .sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b.valueUsd as number) || 0) - ((a.valueUsd as number) || 0))
          .slice(0, 8)
          .map((t: Record<string, unknown>) => `  • <b>${String(t.symbol || t.name || '?')}</b>: $${fmt((t.valueUsd as number) || 0, 2)}`)
          .join('\n');
        const text = `🏦 <b>Wallet Scan</b>\n<code>${wallet.slice(0, 8)}…${wallet.slice(-6)}</code>\n\n` +
          `<b>Net Worth:</b> $${fmt(total, 2)}\n` +
          `<b>Tokens:</b> ${items.length}\n\n` +
          `<b>Top Holdings</b>\n${topTokens || 'No significant holdings'}\n\n` +
          `<a href="https://birdeye.so/profile/${wallet}">View on Birdeye</a>`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          truncate(text), { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /meme ──────────────────────────────────────────────────────────────────
    this.bot.command('meme', async (ctx) => {
      const theme = ctx.message.text.replace(/^\/meme\s*/i, '').trim();
      if (!theme) return ctx.reply('Usage: /meme <theme>\nExample: /meme crab rave on the moon');
      await this.thinking(ctx);
      const msg = await ctx.reply('🪙 <i>Generating meme coin idea…</i>', { parse_mode: 'HTML' });
      try {
        const idea = await generateMemeIdea(theme);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🪙 <b>Meme Coin Idea</b>\n\n${truncate(idea)}\n\n` +
          `<a href="${this.getAppUrl()}/launch?source=telegram">🚀 Launch it now!</a>`,
          { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── /search ────────────────────────────────────────────────────────────────
    this.bot.command('search', async (ctx) => {
      const query = ctx.message.text.replace(/^\/search\s*/i, '').trim();
      if (!query) return ctx.reply('Usage: /search <query>\nExample: /search Solana DeFi trends 2025');
      await this.thinking(ctx);
      const msg = await ctx.reply('🔍 <i>Searching the web…</i>', { parse_mode: 'HTML' });
      try {
        const results = await exaSearch(query, 5);
        if (!results.length) {
          await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, 'No results found.');
          return;
        }
        const lines = (results as Record<string, unknown>[]).map((r: Record<string, unknown>, i: number) => {
          const url = String(r.url ?? '');
          const title = String(r.title || r.url || '').slice(0, 80);
          const snippet = String(r.text || r.snippet || '').slice(0, 150).replace(/\n/g, ' ');
          return `${i + 1}. <a href="${url}">${title}</a>\n   ${snippet}…`;
        }).join('\n\n');
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🔍 <b>Search: ${query}</b>\n\n${truncate(lines)}`,
          { parse_mode: 'HTML', ...noLinkPreview });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── Keyboard button hears ──────────────────────────────────────────────────
    this.bot.hears('🤖 Ask Grok', async (ctx) => {
      await ctx.reply('🤖 <b>Ask Grok anything!</b>\n\nType: <code>/ask your question here</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🧠 DeepSeek', async (ctx) => {
      await ctx.reply('🧠 <b>DeepSeek Reasoning</b>\n\nType: <code>/deep your question here</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🎭 Ask Claude', async (ctx) => {
      await ctx.reply('🎭 <b>Ask Claude</b>\n\nType: <code>/claude your question here</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🧭 AI Model', async (ctx) => {
      await this.replyProviderMenu(ctx);
    });
    this.bot.hears('👁 Vision', async (ctx) => {
      await ctx.reply(this.visionHelpText(), { parse_mode: 'HTML' });
    });
    this.bot.hears('🎨 Imagine', async (ctx) => {
      await ctx.reply('🎨 <b>Image Generation</b>\n\nType: <code>/imagine your prompt here</code>\n\nExample: <code>/imagine a crab king on a crypto throne</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🎬 Video Gen', async (ctx) => {
      await ctx.reply('🎬 <b>AI Video Generation</b>\n\nType: <code>/video your prompt here</code>\n\nExample: <code>/video crabs launching a rocket</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🔍 Web Search', async (ctx) => {
      await ctx.reply('🔍 <b>Web Search</b>\n\nType: <code>/web your query</code> for Grok 4.3 live search, or <code>/search your query</code> for Exa search.', { parse_mode: 'HTML' });
    });
    this.bot.hears('🛰 Grok Live', async (ctx) => {
      await ctx.reply('🛰 <b>Grok 4.3 Live</b>\n\nType: <code>/grok your question</code>\n\nExample: <code>/grok compare the latest Solana DEX routing chatter on X and the web</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('𝕏 X Search', async (ctx) => {
      await ctx.reply('𝕏 <b>X Search</b>\n\nType: <code>/xsearch your query</code>\n\nExample: <code>/xsearch what are traders saying about $CLAWD today?</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🧬 Spawn Agent', async (ctx) => {
      await ctx.reply('🧬 <b>Spawn a CLAWD Grok agent</b>\n\nType a natural brief:\n<code>/agent create an X sentiment trader with web search, computer use, Helius RPC, Jupiter and DFlow routing</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🔥 Trending', async (ctx) => {
      await this.thinking(ctx);
      const msg = await ctx.reply('🔥 <i>Fetching trending tokens…</i>', { parse_mode: 'HTML' });
      try {
        const tokens = await getTrendingTokens(10);
        const text = `🔥 <b>Trending Solana Tokens</b>\n\n${formatTrending(tokens)}`;
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          truncate(text), { parse_mode: 'HTML' });
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    this.bot.hears('💰 Token Price', async (ctx) => {
      await ctx.reply('💰 <b>Token Price Lookup</b>\n\nType: <code>/price TOKEN_ADDRESS</code>\n\nExample:\n<code>/price 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🏦 Scan Wallet', async (ctx) => {
      await ctx.reply('🏦 <b>Wallet Scanner</b>\n\nType: <code>/scan WALLET_ADDRESS</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('🪙 Meme Idea', async (ctx) => {
      await ctx.reply('🪙 <b>Meme Coin Idea Generator</b>\n\nType: <code>/meme your theme</code>\n\nExample: <code>/meme a lazy cat who only eats pizza</code>', { parse_mode: 'HTML' });
    });
    this.bot.hears('⚡ Trade', async (ctx) => {
      await ctx.reply('⚡ <b>Trading Hub</b>\n\nTry: <code>/trade buy 0.1 SOL of CLAWD</code>', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Trading Hub', web_app: { url: `${this.getAppUrl()}/telegram` } }],
            [
              { text: 'CLAWD Arena', web_app: { url: `${this.getAppUrl()}/arena` } },
              { text: 'Swap', web_app: { url: `${this.getAppUrl()}/swap` } },
            ],
            [{ text: 'DEX', web_app: { url: `${this.getAppUrl()}/dex` } }],
          ],
        },
      });
    });

    // ── Inline callback queries ────────────────────────────────────────────────
    this.bot.action('provider_menu', async (ctx) => {
      await ctx.answerCbQuery();
      await this.replyProviderMenu(ctx);
    });

    this.bot.action('vision_help', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(this.visionHelpText(), { parse_mode: 'HTML' });
    });

    this.bot.action(/^provider:([a-z]+)$/i, async (ctx) => {
      const providerId = ctx.match[1] as TelegramProviderId;
      const provider = getProviderStatus(providerId);
      if (!provider) {
        await ctx.answerCbQuery('Unknown provider');
        return;
      }
      if (!provider.configured) {
        await ctx.answerCbQuery(`${provider.label} is missing an API key`, { show_alert: true });
        await ctx.reply(
          `⚠️ <b>${html(provider.label)}</b> is not configured.\n\nSet one of: <code>${html(provider.keyNames.join(' or '))}</code>`,
          { parse_mode: 'HTML' },
        );
        return;
      }
      const selection = this.setChatModelSelection(ctx.chat?.id, {
        provider: provider.id,
        model: provider.defaultTextModel,
      });
      await ctx.answerCbQuery(`Using ${provider.label}`);
      await ctx.reply(
        `✅ Switched to <b>${html(provider.label)}</b> <code>${html(selection.model)}</code>\n\nChoose a different model or send a message now.`,
        {
          parse_mode: 'HTML',
          reply_markup: this.modelMenuMarkup(provider.id, selection),
        },
      );
    });

    this.bot.action(/^model:([a-z]+):(\d+)$/i, async (ctx) => {
      const providerId = ctx.match[1] as TelegramProviderId;
      const modelIndex = Number(ctx.match[2]);
      const provider = getProviderStatus(providerId);
      const model = provider?.models[modelIndex];
      if (!provider || !model) {
        await ctx.answerCbQuery('Unknown model');
        return;
      }
      if (!provider.configured) {
        await ctx.answerCbQuery(`${provider.label} is missing an API key`, { show_alert: true });
        return;
      }
      const selection = this.setChatModelSelection(ctx.chat?.id, {
        provider: provider.id,
        model: model.id,
      });
      await ctx.answerCbQuery(`Using ${model.label}`);
      await ctx.reply(this.providerMenuText(selection), {
        parse_mode: 'HTML',
        reply_markup: this.providerMenuMarkup(selection),
      });
    });

    this.bot.action('ai_grok', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🤖 <b>Grok AI</b> — Ask me anything!\n\nType: <code>/ask your question</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_deep', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🧠 <b>DeepSeek</b> — Deep reasoning mode\n\nType: <code>/deep your question</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_claude', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🎭 <b>Claude</b>\n\nType: <code>/claude your question</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_image', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🎨 <b>Image Generator</b>\n\nType: <code>/imagine your prompt</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_video', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🎬 <b>Video Generator</b>\n\nType: <code>/video your prompt</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_search', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🔍 <b>Web Search</b>\n\nType: <code>/web your query</code> for Grok 4.3 live search, or <code>/search your query</code> for Exa.', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_grok_live', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🛰 <b>Grok 4.3 Live</b>\n\nType: <code>/grok your question</code>. I will use web and X search when useful.', { parse_mode: 'HTML' });
    });
    this.bot.action('ai_x_search', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('𝕏 <b>X Search</b>\n\nType: <code>/xsearch your query</code>.', { parse_mode: 'HTML' });
    });
    this.bot.action('agent_spawn', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🧬 <b>Spawn Agent</b>\n\nType: <code>/agent create a Solana research agent with X search, web search, computer use, and DFlow/Jupiter trade routing</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('market_trending', async (ctx) => {
      await ctx.answerCbQuery('Fetching trending…');
      await this.thinking(ctx);
      try {
        const tokens = await getTrendingTokens(10);
        await ctx.reply(truncate(`🔥 <b>Trending Solana Tokens</b>\n\n${formatTrending(tokens)}`),
          { parse_mode: 'HTML' });
      } catch (e: unknown) { await ctx.reply(`❌ ${e instanceof Error ? e.message : String(e)}`); }
    });
    this.bot.action('market_price', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('💰 <b>Token Price</b>\n\nSend: <code>/price TOKEN_ADDRESS</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('market_wallet', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🏦 <b>Wallet Scanner</b>\n\nSend: <code>/scan WALLET_ADDRESS</code>', { parse_mode: 'HTML' });
    });
    this.bot.action('meme_idea', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply('🪙 <b>Meme Coin Idea Generator</b>\n\nSend: <code>/meme your theme here</code>', { parse_mode: 'HTML' });
    });

    // ── /verify — send link to web CLAWD gate ─────────────────────────────────
    this.bot.command('verify', async (ctx) => {
      const url = `${this.getAppUrl()}/telegram`;
      await ctx.reply(
        `🔐 <b>Verify $CLAWD Holdings</b>\n\n` +
        `To unlock holder benefits:\n` +
        `1️⃣ Visit the link below\n` +
        `2️⃣ Log in with this Telegram account\n` +
        `3️⃣ Connect your Solana wallet\n` +
        `4️⃣ Confirm your $CLAWD balance\n\n` +
        `You need <b>100,000+ $CLAWD</b> to earn the holder role.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🐱 Verify on Cheshire Terminal', web_app: { url } }]],
          },
        }
      );
    });

    // ── /clawd — check $CLAWD balance for linked wallet ───────────────────────
    this.bot.command('clawd', async (ctx) => {
      const telegramId = String(ctx.from?.id || '');
      if (!telegramId) return ctx.reply('Could not identify your Telegram account.');

      await this.thinking(ctx);
      const msg = await ctx.reply('🦞 <i>Looking up your linked wallet…</i>', { parse_mode: 'HTML' });

      try {
        const wallet = await getLinkedTelegramWallet(telegramId);

        if (!wallet) {
          await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `🔗 <b>No wallet linked yet</b>\n\nUse /verify to link your Solana wallet and confirm $CLAWD holdings.`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        const result = await verifyClawd(wallet);

        if (!result.ok) {
          await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `⚠️ RPC error: ${result.error ?? 'Could not check balance. Try again.'}`
          );
          return;
        }

        const bal = result.balance.toLocaleString(undefined, { maximumFractionDigits: 0 });
        const status = result.isHolder
          ? `✅ <b>CLAWD Holder</b> — you're verified!\nBalance: <b>${bal} $CLAWD</b>`
          : `❌ <b>Not a holder</b>\nBalance: <b>${bal} $CLAWD</b>\nYou need 100,000+ $CLAWD to unlock holder features.`;

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `🦞 <b>$CLAWD Status</b>\n\n` +
          `Wallet: <code>${wallet.slice(0, 6)}…${wallet.slice(-4)}</code>\n\n${status}`,
          {
            parse_mode: 'HTML',
            reply_markup: result.isHolder ? undefined : {
              inline_keyboard: [[{
                text: '🚀 Buy $CLAWD on Jupiter',
                url: `https://jup.ag/swap/SOL-8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump`,
              }]],
            },
          }
        );
      } catch (e: unknown) {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    // ── Status ─────────────────────────────────────────────────────────────────
    this.bot.command('status', async (ctx) => {
      const info = this.getInfo();
      await ctx.reply(
        `🤖 <b>CLAWD Terminal Bot Status</b>\n\n` +
        `Status: <b>${info.status}</b>\n` +
        `Mode: ${info.mode}\n` +
        `Uptime: ${Math.floor((Date.now() - info.startTime) / 60000)} min\n` +
        `Errors: ${info.errorCount}\n` +
        `WebSocket: ${info.connectedToWebSocket ? '✅ Connected' : '❌ Disconnected'}`,
        { parse_mode: 'HTML' }
      );
    });

    // ── /perps — Phoenix perpetuals via Vulcan CLI + DeepSeek NL ─────────────
    this.bot.command('perps', async (ctx) => {
      const input = ctx.message.text.replace(/^\/perps\s*/i, '').trim();
      const rpcUrl = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const vulcanBin = process.env.VULCAN_BIN || `${process.env.HOME}/.local/bin/vulcan`;

      if (!input || input === 'help') {
        return ctx.reply(
          '📈 <b>Phoenix Perps</b> — Natural language perpetuals trading\n\n' +
          '<b>Examples:</b>\n' +
          '<code>/perps list markets</code>\n' +
          '<code>/perps show my positions</code>\n' +
          '<code>/perps long SOL 0.1</code>\n' +
          '<code>/perps close all positions</code>\n' +
          '<code>/perps what is my PnL</code>\n\n' +
          '💡 <i>Type any natural language — DeepSeek will translate it to a Vulcan command.</i>',
          { parse_mode: 'HTML' }
        );
      }

      await this.thinking(ctx);
      const msg = await ctx.reply('📈 <i>Processing perps request…</i>', { parse_mode: 'HTML' });

      try {
        // Let DeepSeek parse intent and emit a Vulcan CLI command
        const systemPrompt =
          `You are a Solana perpetuals trading assistant using the Vulcan CLI for Phoenix protocol.\n` +
          `Given a natural language request, emit ONLY the single vulcan CLI command to run (no explanation, no markdown fences).\n` +
          `Available vulcan subcommands: markets, positions, open, close, cancel, balance.\n` +
          `Always include --output json and --rpc-url <RPC>.\n` +
          `Use RPC URL: ${rpcUrl}\n` +
          `Examples:\n` +
          `  "list markets" → vulcan markets --output json --rpc-url ${rpcUrl}\n` +
          `  "show positions" → vulcan positions --output json --rpc-url ${rpcUrl}\n` +
          `  "long SOL 0.1" → vulcan open --market SOL-PERP --side long --size 0.1 --output json --rpc-url ${rpcUrl}\n` +
          `  "close SOL" → vulcan close --market SOL-PERP --output json --rpc-url ${rpcUrl}\n` +
          `If the request cannot map to a vulcan command, respond with: UNSUPPORTED`;

        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const cmdLine = await askDeepSeek(`${systemPrompt}\n\nRequest: ${input}`, false);
        const cleanCmd = cmdLine.trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

        if (cleanCmd.startsWith('UNSUPPORTED') || !cleanCmd.startsWith('vulcan')) {
          await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `⚠️ <b>Unsupported command</b>\n\nCould not map "<i>${input}</i>" to a Vulcan operation.\n\nTry: <code>/perps help</code>`,
            { parse_mode: 'HTML' });
          return;
        }

        // Replace "vulcan" with the actual binary path
        const finalCmd = cleanCmd.replace(/^vulcan\b/, vulcanBin);
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `📈 <i>Running: <code>${cleanCmd.slice(0, 120)}</code>…</i>`,
          { parse_mode: 'HTML' });

        const { stdout, stderr } = await execAsync(finalCmd, { timeout: 30000 });
        const raw = stdout.trim() || stderr.trim();

        let display: string;
        try {
          const parsed = JSON.parse(raw);
          // Let DeepSeek format the JSON into human-readable text
          const formatted = await askDeepSeek(
            `Format this Vulcan CLI JSON output as a concise, readable Telegram message (HTML tags ok, no markdown fences). Context: user asked "${input}".\n\nJSON:\n${JSON.stringify(parsed, null, 2).slice(0, 3000)}`,
            false,
          );
          display = formatted;
        } catch {
          display = `<pre>${raw.slice(0, 2000)}</pre>`;
        }

        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          `📈 <b>Perps</b> — ${input.slice(0, 60)}\n\n${truncate(display)}`,
          { parse_mode: 'HTML' });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const isNotFound = errMsg.includes('ENOENT') || errMsg.includes('not found');
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          isNotFound
            ? `❌ <b>Vulcan CLI not found</b>\n\nInstall it: <code>curl -sSf https://raw.githubusercontent.com/Squads-Protocol/vulcan/main/install.sh | sh</code>\n\nOr set <code>VULCAN_BIN</code> env var.`
            : `❌ ${errMsg.slice(0, 400)}`,
        { parse_mode: 'HTML' });
      }
    });

    // ── Photo / document uploads → selected vision model ─────────────────────
    this.bot.on('photo', async (ctx) => {
      const photos = (ctx.message as any).photo as Array<{ file_id: string; file_size?: number }> | undefined;
      const photo = photos?.[photos.length - 1];
      if (!photo?.file_id) return;
      const caption = ((ctx.message as any).caption as string | undefined)?.trim();
      await this.analyzeTelegramMedia(ctx, {
        fileId: photo.file_id,
        mimeType: 'image/jpeg',
        fileSize: photo.file_size,
        prompt: caption || 'Analyze this image. If it is a chart or trading screenshot, extract the key numbers, trend, and caveats.',
      });
    });

    this.bot.on('document', async (ctx) => {
      const doc = (ctx.message as any).document as
        | { file_id: string; file_name?: string; mime_type?: string; file_size?: number }
        | undefined;
      if (!doc?.file_id) return;

      const mimeType = this.guessMimeType(doc.file_name, doc.mime_type);
      const caption = ((ctx.message as any).caption as string | undefined)?.trim();
      await this.analyzeTelegramMedia(ctx, {
        fileId: doc.file_id,
        mimeType,
        fileName: doc.file_name,
        fileSize: doc.file_size,
        prompt: caption || 'Analyze this file. If it is a document, summarize the main points and extract action items. If it is a chart or table, extract the values, trend, and caveats.',
      });
    });

    // ── Free-text → selected AI provider (with DeepSeek/Grok fallback) ───────
    this.bot.on('text', async (ctx) => {
      const text = (ctx.message as any).text?.trim() as string | undefined;
      // Ignore commands and all keyboard-button emoji prefixes
      if (!text || text.startsWith('/') ||
          /^[\u{1F300}-\u{1FFFF}]/u.test(text) ||
          text.startsWith('🤖') || text.startsWith('🧠') || text.startsWith('🎭') ||
          text.startsWith('🎨') || text.startsWith('🎬') || text.startsWith('🔍') ||
          text.startsWith('🔥') || text.startsWith('💰') || text.startsWith('🏦') ||
          text.startsWith('🪙') || text.startsWith('🚀') || text.startsWith('📱') ||
          text.startsWith('🖼') || text.startsWith('⚡') || text.startsWith('👺') ||
          text.startsWith('🖌') || text.startsWith('📈') || text.startsWith('🔁') ||
          text.startsWith('🛰') || text.startsWith('🧬') || text.startsWith('🖥') ||
          text.startsWith('🧭') || text.startsWith('👁') || text.startsWith('𝕏')) return;

      const telegramId = String(ctx.from?.id ?? '');
      const agentName = this.agentNameCache.get(telegramId);
      const peerId = honchoPeerId({ telegramId });
      const sessionId = honchoSessionId('telegram-chat', telegramId);
      honchoLogEvent({
        peerId,
        sessionId,
        content: text,
        metadata: { type: 'telegram_text', telegramId, chatId: ctx.chat?.id },
      }).catch(() => {});

      if (looksLikeAgentSpawnRequest(text)) {
        const handled = await this.sendAgentSpawnPlan(ctx, text);
        if (handled) return;
      }

      if (looksLikeTradingRequest(text)) {
        const handled = await this.sendTradingPlan(ctx, text);
        if (handled) return;
      }

      if (looksLikeComputerUseRequest(text)) {
        const handled = await this.sendComputerUsePlan(ctx, text);
        if (handled) return;
      }

      if (/\b(x search|search x|twitter search|search twitter|on x|tweets about)\b/i.test(text)) {
        await this.sendGrokLive(ctx, text, 'x');
        return;
      }

      if (/\b(web search|search the web|look up|latest news|current news)\b/i.test(text)) {
        await this.sendGrokLive(ctx, text, 'web');
        return;
      }

      const memory = await honchoInsight(
        peerId,
        'What should the assistant remember about this Telegram user, their wallet preferences, agents, trading interests, and prior sessions?',
      );

      const system = agentName
        ? `You are CLAWD — a sharp crypto AI lobster. You are speaking with ${agentName}. ` +
          'Be concise, insightful, and a little piratical. Keep responses under 600 words. Use bullet points for clarity.' +
          (memory ? `\n\nPersistent Honcho memory:\n${memory}` : '')
        : memory
          ? `Persistent Honcho memory:\n${memory}`
          : undefined;

      await this.thinking(ctx);
      const selection = this.getChatModelSelection(ctx);
      const msg = await ctx.reply(
        `🤖 <i>${html(providerLabel(selection.provider))} is thinking…</i>`,
        { parse_mode: 'HTML' },
      );
      try {
        const result = await runTelegramText(selection, text, system);
        honchoLogEvent({
          peerId,
          sessionId,
          role: 'assistant',
          content: result.text,
          metadata: { type: 'telegram_ai_response', provider: selection.provider, model: selection.model },
        }).catch(() => {});
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
          this.providerAnswerText('🤖', result), { parse_mode: 'HTML' });
      } catch (primaryError: unknown) {
        try {
          const answer = await askDeepSeek(text, false, system);
          honchoLogEvent({
            peerId,
            sessionId,
            role: 'assistant',
            content: answer,
            metadata: { type: 'telegram_ai_response', provider: 'deepseek-fallback' },
          }).catch(() => {});
          await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
            `🧠 <b>DeepSeek fallback</b>\n\n${html(truncate(answer))}`, { parse_mode: 'HTML' });
        } catch {
          try {
            const answer = await askGrok(text);
            honchoLogEvent({
              peerId,
              sessionId,
              role: 'assistant',
              content: answer,
              metadata: { type: 'telegram_ai_response', provider: 'grok-fallback' },
            }).catch(() => {});
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined,
              `🤖 <b>Grok fallback</b>\n\n${html(truncate(answer))}`, { parse_mode: 'HTML' });
          } catch (e: unknown) {
            const errMsg = primaryError instanceof Error
              ? primaryError.message
              : e instanceof Error ? e.message : String(e);
            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, `❌ ${html(errMsg)}`, { parse_mode: 'HTML' });
          }
        }
      }
    });

    // Handle errors
    this.bot.catch((err: unknown, ctx) => {
      this.botInfo.errorCount++;
      this.botInfo.lastError = err instanceof Error ? err.message : 'Unknown error';
      console.error('Telegram bot error:', err);
      try { ctx.reply('Sorry, something went wrong. Please try again.'); } catch {}
    });

    // ── Subscribe to a chat room ───────────────────────────────────────────────
    this.bot.command('subscribe', async (ctx) => {
      try {
        const params = ctx.message.text.split(' ');
        if (params.length < 2) return ctx.reply('Usage: /subscribe <roomId>');
        const roomId = parseInt(params[1], 10);
        if (Number.isNaN(roomId)) return ctx.reply('Invalid room ID.');
        this.subscribeToRoom(roomId, ctx.chat.id.toString());
        await ctx.reply(`✅ Subscribed to room ${roomId}.`);
      } catch {
        await ctx.reply('Failed to subscribe. Try again later.');
      }
    });

    // ── Unsubscribe ────────────────────────────────────────────────────────────
    this.bot.command('unsubscribe', async (ctx) => {
      try {
        const params = ctx.message.text.split(' ');
        if (params.length < 2) return ctx.reply('Usage: /unsubscribe <roomId>');
        const roomId = parseInt(params[1], 10);
        if (Number.isNaN(roomId)) return ctx.reply('Invalid room ID.');
        this.unsubscribeFromRoom(roomId);
        await ctx.reply(`✅ Unsubscribed from room ${roomId}.`);
      } catch {
        await ctx.reply('Failed to unsubscribe. Try again later.');
      }
    });

    // ── Rooms ──────────────────────────────────────────────────────────────────
    this.bot.command('rooms', async (ctx) => {
      try {
        const res = await fetch(`${this.getAppUrl()}/api/telegram/rooms`);
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        const rooms = data.rooms || [];
        if (!rooms.length) return ctx.reply('No chat rooms available yet.');
        const list = (rooms as Record<string, unknown>[]).map((r: Record<string, unknown>) =>
          `🏠 <b>Room #${r.id}</b>: ${r.name}\n   Members: ${r.memberCount || 0}`
        ).join('\n\n');
        await ctx.reply(`<b>Chat Rooms</b>\n\n${list}\n\nUse /subscribe &lt;roomId&gt;`, { parse_mode: 'HTML' });
      } catch (err) {
        await ctx.reply('Failed to fetch rooms. Try again later.');
      }
    });
  }

  private setupWebApp() {
    // Handle web app data
    this.bot.on('web_app_data', async (ctx) => {
      try {
        const data = ctx.webAppData?.data;
        if (!data) return;

        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        await this.handleWebAppData(ctx, parsedData);
      } catch (error) {
        console.error('Error handling web app data:', error);
        await ctx.reply('Sorry, there was an error processing your request.');
      }
    });
  }

  private async handleWebAppData(ctx: Context, data: Record<string, unknown>) {
    console.log('Received web app data:', data);
    
    switch (data.action) {
      case 'token_launched':
        await ctx.reply(`🚀 Congratulations! Your token ${data.symbol} has been launched successfully!\n\nView on Solscan: ${data.url}`);
        break;
        
      case 'portfolio_update':
        await ctx.reply(`📊 Portfolio Update:\n${data.message}`);
        break;
      
      case 'base_transaction_sent': {
        const { txHash, amount, to } = data as { txHash?: string; amount?: string; to?: string };
        if (txHash && amount && to) {
          await ctx.reply(
            `✅ <b>Base Transaction Sent</b>\n\n` +
            `Amount: ${amount} ETH\n` +
            `To: <code>${to.slice(0, 8)}...${to.slice(-6)}</code>\n` +
            `Transaction Hash: <code>${txHash.slice(0, 8)}...${txHash.slice(-6)}</code>\n\n` +
            `View on Block Explorer: https://basescan.org/tx/${txHash}`,
            { parse_mode: 'HTML' }
          );
        } else {
          await ctx.reply('Received Base transaction notification with incomplete data.');
        }
        break;
      }

      case 'base_wallet_connected': {
        const { baseAddress } = data as { baseAddress?: string };
        if (baseAddress) {
          await ctx.reply(
            `🔗 <b>Base Wallet Connected</b>\n\n` +
            `Address: <code>${baseAddress.slice(0, 8)}...${baseAddress.slice(-6)}</code>\n\n` +
            `You can now send and receive transactions on the Base blockchain.`,
            { parse_mode: 'HTML' }
          );
          await ctx.reply('What would you like to do on Base?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💸 Send Base Transaction', web_app: { url: `${this.getAppUrl()}/terminal?source=telegram&tab=ops&prompt=Prepare%20a%20Base%20transaction%20handoff.%20Show%20the%20wallet%20requirements%20before%20anything%20is%20signed.` } }],
                [{ text: '📊 View Base Balance', web_app: { url: `${this.getAppUrl()}/account?source=telegram&panel=base` } }],
              ],
            },
          });
        } else {
          await ctx.reply('Received Base wallet connection notification with incomplete data.');
        }
        break;
      }

      case 'register': {
        const { walletAddress, username } = data as { walletAddress?: string; username?: string };
        if (walletAddress && username) {
          try {
            const telegramId = String(ctx.from?.id ?? '');
            await this.convexPost('/api/telegram/register', { telegramId, telegramUsername: username, chatId: String(ctx.chat?.id ?? '') });
            await ctx.reply(`✅ Registered as @${username}!\n\nWallet: <code>${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}</code> linked.`, { parse_mode: 'HTML' });
            await ctx.reply('What would you like to do next?', {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Launch Token', web_app: { url: `${this.getAppUrl()}/launch?source=telegram` } }],
                  [{ text: '📊 View Portfolio', web_app: { url: `${this.getAppUrl()}/portfolio` } }],
                ],
              },
            });
          } catch {
            await ctx.reply('Sorry, there was an error processing your registration. Please try again later.');
          }
        } else {
          await ctx.reply('Invalid registration data. Please provide both wallet address and username.');
        }
        break;
      }

      case 'join_room': {
        const { roomId } = data as { roomId?: number };
        if (roomId) {
          this.subscribeToRoom(roomId, ctx.chat?.id.toString() ?? '');
          await ctx.reply(`✅ You have joined chat room #${roomId}. You will now receive messages from this room.`);
        } else {
          await ctx.reply('Invalid room ID. Please provide a valid room ID to join.');
        }
        break;
      }

      case 'agent_wallet_connected': {
        const { agentAddress, walletType } = data as { agentAddress?: string; walletType?: string };
        if (agentAddress) {
          await ctx.reply(
            `🤖 <b>AI Agent Wallet Connected</b>\n\n` +
            `Address: <code>${agentAddress.slice(0, 8)}...${agentAddress.slice(-6)}</code>\n` +
            `Type: ${walletType ?? 'Phantom'}\n\n` +
            `Your AI Agent is now ready to use.`,
            { parse_mode: 'HTML' }
          );
          await ctx.reply('What would you like to do with your AI Agent?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🧠 Create New Agent', web_app: { url: `${this.getAppUrl()}/agents/builder?source=telegram` } }],
                [{ text: '🚀 Launch Agent Token', web_app: { url: `${this.getAppUrl()}/agent-launchpad?source=telegram` } }],
              ],
            },
          });
        } else {
          await ctx.reply('Invalid AI Agent wallet data. Please provide a valid wallet address.');
        }
        break;
      }

      case 'agent_transaction_complete': {
        const { txHash: agentTxHash, amount: agentAmount, toAddress, fromAddress, status } =
          data as { txHash?: string; amount?: string; toAddress?: string; fromAddress?: string; status?: string };
        if (agentTxHash && agentAmount && toAddress && fromAddress) {
          await ctx.reply(
            `🤖 <b>AI Agent Transaction</b>\n\n` +
            `Amount: ${agentAmount} SOL\n` +
            `From: <code>${fromAddress.slice(0, 8)}...${fromAddress.slice(-6)}</code>\n` +
            `To: <code>${toAddress.slice(0, 8)}...${toAddress.slice(-6)}</code>\n` +
            `Status: ${status ?? 'Confirmed'}\n` +
            `Transaction Hash: <code>${agentTxHash.slice(0, 8)}...${agentTxHash.slice(-6)}</code>\n\n` +
            `View on Solscan: https://solscan.io/tx/${agentTxHash}`,
            { parse_mode: 'HTML' }
          );
        } else {
          await ctx.reply('Received AI Agent transaction notification with incomplete data.');
        }
        break;
      }
        
      default:
        await ctx.reply('Received your data! 👍');
    }
  }

  private getAppUrl(): string {
    return getPublicAppUrl();
  }

  private getAccountPortalUrl(path: string): string {
    const base = (
      process.env.CLERK_ACCOUNT_PORTAL_URL ||
      process.env.VITE_CLERK_ACCOUNT_PORTAL_URL ||
      'https://accounts.cheshireterminal.ai'
    ).replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  public start() {
    try {
      this.botInfo.status = 'starting';
      this.botInfo.startTime = Date.now();
      
      // Always use polling — this is a VM (always-on single instance) deployment,
      // so polling is reliable and avoids the port-conflict that webhook mode
      // causes when Telegraf tries to bind its own HTTP server on port 5000
      // while Express is already listening there.
      console.log(`Starting Telegram bot in ${process.env.NODE_ENV === 'production' ? 'production' : 'development'} mode (polling)...`);
      this.startPolling();

      // Enable graceful stop
      process.once('SIGINT', () => {
        this.bot.stop('SIGINT');
        this.botInfo.status = 'stopped';
        if (this.ws) {
          this.ws.close();
        }
      });
      
      process.once('SIGTERM', () => {
        this.bot.stop('SIGTERM');
        this.botInfo.status = 'stopped';
        if (this.ws) {
          this.ws.close();
        }
      });

    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
      this.botInfo.status = 'error';
      this.botInfo.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.botInfo.errorCount++;
      
      // 401 = bad token — stop immediately, don't retry
      const isAuthError =
        error instanceof Error && (
          error.message.includes('401') ||
          error.message.toLowerCase().includes('unauthorized')
        );

      if (isAuthError || this.botInfo.errorCount > 5) {
        console.error('[Telegram] Giving up after repeated failures. Set a valid TELEGRAM_BOT_TOKEN to re-enable.');
        this.botInfo.mode = 'stopped';
        return;
      }

      const restartDelay = Math.min(30000, 5000 * (2 ** Math.min(4, this.botInfo.errorCount - 1)));
      this.botInfo.lastRestart = Date.now();
      setTimeout(() => this.start(), restartDelay);
    }
  }

  private startPolling() {
    console.log('Starting Telegram bot in polling mode...');
    this.botInfo.mode = 'polling';
    this.botInfo.status = 'starting';
    
    // Stop any existing bot before trying to launch a new one
    try {
      this.bot.stop();
    } catch {
      // Ignore errors on stop — bot may not be running
    }
    
    // Add a longer delay before launching to ensure cleanup of any competing processes
    setTimeout(() => {
      (async () => {
        try {
          await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
          const pollingLoop = (this.bot as unknown as {
            startPolling: (allowedUpdates?: string[]) => Promise<void>;
          }).startPolling([]);

          console.log('Telegram bot started in polling mode');
          this.botInfo.status = 'running';
          this.botInfo.errorCount = 0; // Reset error count on success
          // Connect to WebSocket after successful launch
          this.connectToWebSocket();

          await pollingLoop;
        } catch (error: any) {
          this.botInfo.status = 'error';
          this.botInfo.lastError = error?.message || String(error);
          this.botInfo.errorCount++;

          // 401 = invalid token — no point retrying, log once and stop
          const isAuthError =
            error?.response?.error_code === 401 ||
            String(error?.message).includes('401') ||
            String(error?.message).toLowerCase().includes('unauthorized');

          if (isAuthError) {
            console.error('[Telegram] Bot token invalid (401). Set a valid TELEGRAM_BOT_TOKEN to enable the bot. Polling disabled.');
            this.botInfo.mode = 'stopped';
            return;
          }

          const isConflictError =
            error?.response?.error_code === 409 ||
            String(error?.message).includes('409') ||
            String(error?.message).toLowerCase().includes('conflict');

          if (isConflictError) {
            console.error('[Telegram] Polling conflict (409). Another process or deployment is already polling this bot token. Stopping local polling; set TELEGRAM_BOT_ENABLED=false for dev-only web runs, or stop the other bot instance.');
            this.botInfo.mode = 'stopped';
            return;
          }

          // Cap retries at 5 for other errors
          if (this.botInfo.errorCount > 5) {
            console.error(`[Telegram] Max retries reached (${this.botInfo.errorCount}). Giving up.`);
            this.botInfo.mode = 'stopped';
            return;
          }

          const backoffTime = Math.min(30000, 5000 * (2 ** (this.botInfo.errorCount % 5)));
          console.error(`Failed to start polling: ${error?.message || String(error)}`);
          setTimeout(() => {
            this.startPolling();
          }, backoffTime);
        }
      })().catch((error) => {
        this.botInfo.status = 'error';
        this.botInfo.lastError = error instanceof Error ? error.message : String(error);
        this.botInfo.errorCount++;
        console.error('Failed to start polling:', this.botInfo.lastError);
      });
    }, 3000);
  }

  public getBot() {
    return this.bot;
  }
  
  public getInfo(): BotInfo {
    return { ...this.botInfo };
  }
  
  // WebSocket integration
  public connectToWebSocket(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log("WebSocket connection already open");
      // Reset reconnect attempts on successful connection
      this.botInfo.reconnectAttempts = 0;
      return;
    }
    
    try {
      const wsUrl = process.env.TELEGRAM_WS_URL || `ws://127.0.0.1:${process.env.PORT || '5000'}/ws`;
      
      // Add timestamp to prevent caching issues
      const wsUrlWithTimestamp = `${wsUrl}?t=${Date.now()}`;
      
      console.log(`Connecting Telegram bot to WebSocket at ${wsUrlWithTimestamp}`);
      this.ws = new WebSocket(wsUrlWithTimestamp);
      
      this.ws.on('open', () => {
        console.log('Telegram bot connected to WebSocket server');
        this.botInfo.connectedToWebSocket = true;
        // Reset reconnect attempts on successful connection
        this.botInfo.reconnectAttempts = 0;
        
        // Set up a ping interval to keep the connection alive
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send a ping message to keep the connection alive
            this.sendToWebSocket({ type: 'ping', timestamp: new Date().toISOString() });
            console.log('Sent ping to keep WebSocket connection alive');
          } else {
            // If connection is not open, clear the interval
            clearInterval(pingInterval);
          }
        }, 30000); // Send a ping every 30 seconds
        
        // Register as a special client type
        this.sendToWebSocket({
          type: 'register',
          clientId: this.clientId,
          clientType: 'telegram_bot'
        });
      });
      
      this.ws.on('message', (raw) => {
        try {
          const data = raw.toString();
          if (!data.trim()) {
            console.error('WebSocket received empty message');
            return;
          }
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(data) as Record<string, unknown>;
          } catch (parseError) {
            console.error('Error parsing WebSocket message as JSON:', parseError, 'Raw:', data);
            return;
          }
          this.handleWebSocketMessage(message);
        } catch (error) {
          console.error('Unexpected error processing WebSocket message:', error);
        }
      });
      
      this.ws.on('close', (code) => {
        console.log(`WebSocket connection closed with code ${code}. Reconnecting with backoff strategy...`);
        this.botInfo.connectedToWebSocket = false;
        
        // Implement exponential backoff for reconnection
        const reconnectAttempts = this.botInfo.reconnectAttempts || 0;
        const backoffTime = Math.min(30000, 1000 * (2 ** Math.min(5, reconnectAttempts)));
        this.botInfo.reconnectAttempts = reconnectAttempts + 1;
        
        console.log(`WebSocket reconnect attempt ${this.botInfo.reconnectAttempts} in ${backoffTime/1000}s`);
        setTimeout(() => this.connectToWebSocket(), backoffTime);
      });
      
      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.botInfo.connectedToWebSocket = false;
        
        // If the connection is not already closed, attempt to close it
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
          try {
            this.ws.close();
          } catch (closeErr) {
            console.error('Error closing WebSocket after error:', closeErr);
          }
        }
        
        // Attempt to reconnect with backoff (the close event will handle reconnection)
      });
      
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.botInfo.connectedToWebSocket = false;
      
      // Implement exponential backoff for reconnection
      const reconnectAttempts = this.botInfo.reconnectAttempts || 0;
      const backoffTime = Math.min(30000, 1000 * 2 ** Math.min(5, reconnectAttempts));
      this.botInfo.reconnectAttempts = reconnectAttempts + 1;
      
      console.log(`WebSocket initial connection failed. Reconnect attempt ${this.botInfo.reconnectAttempts} in ${backoffTime/1000}s`);
      setTimeout(() => this.connectToWebSocket(), backoffTime);
    }
  }
  
  private sendToWebSocket(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  private handleWebSocketMessage(message: Record<string, unknown>): void {
    // Add more robust null checks
    if (!message) {
      console.log('Received empty message from WebSocket');
      return;
    }
    
    if (typeof message !== 'object' || !message.type) {
      console.log('Received invalid message format from WebSocket:', message);
      return;
    }
    
    switch (message.type) {
      case 'chat_message':
        this.handleChatMessage(message as unknown as ChatEvent);
        break;
      case 'user_joined':
        this.handleUserJoined(message as unknown as ChatEvent);
        break;
      case 'user_left':
        this.handleUserLeft(message as unknown as ChatEvent);
        break;
      case 'room_created':
        this.handleRoomCreated(message as unknown as ChatEvent);
        break;
      case 'token_launched':
        this.handleTokenLaunched(message as unknown as ChatEvent);
        break;
      case 'base_transaction_sent':
        this.handleBaseTransaction(message as unknown as ChatEvent);
        break;
      case 'base_wallet_connected':
        this.handleBaseWalletConnected(message as unknown as ChatEvent);
        break;
      case 'agent_wallet_connected':
        this.handleAgentWalletConnected(message as unknown as ChatEvent);
        break;
      case 'agent_transaction_complete':
        this.handleAgentTransaction(message as unknown as ChatEvent);
        break;
      case 'pong':
        // Handle pong responses (can be used for connection health monitoring)
        console.log('Received pong response from server');
        break;
      default:
        // Log unhandled message types for debugging
        console.log(`Received unhandled message type: ${message.type}`);
        break;
    }
  }
  
  private async handleChatMessage(event: ChatEvent): Promise<void> {
    // Only forward messages from token rooms
    if (!event.roomId || !event.tokenAddress || !event.message) return;
    
    const channelId = this.subscribedRooms.get(event.roomId);
    if (!channelId) return;
    
    try {
      await this.bot.telegram.sendMessage(
        channelId,
        `💬 <b>${event.displayName || 'Anonymous'}</b>: ${event.message}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error(`Error sending message to Telegram channel ${channelId}:`, error);
    }
  }
  
  private async handleUserJoined(event: ChatEvent): Promise<void> {
    if (!event.roomId || !event.tokenAddress) return;
    
    const channelId = this.subscribedRooms.get(event.roomId);
    if (!channelId) return;
    
    try {
      await this.bot.telegram.sendMessage(
        channelId,
        `👋 <b>${event.displayName || 'Someone'}</b> joined the chat room`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error(`Error sending join notification to Telegram channel ${channelId}:`, error);
    }
  }
  
  private async handleUserLeft(event: ChatEvent): Promise<void> {
    if (!event.roomId || !event.tokenAddress) return;
    
    const channelId = this.subscribedRooms.get(event.roomId);
    if (!channelId) return;
    
    try {
      await this.bot.telegram.sendMessage(
        channelId,
        `👋 <b>${event.displayName || 'Someone'}</b> left the chat room`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error(`Error sending leave notification to Telegram channel ${channelId}:`, error);
    }
  }
  
  private async handleRoomCreated(event: ChatEvent): Promise<void> {
    if (!event.roomId || !event.tokenAddress) return;
    
    // For now, just log that a new room was created
    console.log(`New token chat room created: ${event.roomName} for token ${event.tokenAddress}`);
  }
  
  private async handleTokenLaunched(event: ChatEvent): Promise<void> {
    if (!event.tokenAddress || !event.tokenName || !event.symbol) return;
    
    try {
      // Send a broadcast message to announce the new token
      await this.bot.telegram.sendMessage(
        '@CheshireTokenAnnouncements', // Replace with your announcement channel username
        `🚀 New token launched!\n\n` +
        `<b>${event.tokenName} (${event.symbol})</b>\n` +
        `Address: <code>${event.tokenAddress}</code>\n\n` +
        `<a href="https://solscan.io/token/${event.tokenAddress}">View on Solscan</a>`,
        { 
          parse_mode: 'HTML'
        }
      );
    } catch (error) {
      console.error('Error sending token launch announcement:', error);
    }
  }
  
  // Subscribe to updates from a specific token chat room
  public subscribeToRoom(roomId: number, telegramChatId: string): void {
    this.subscribedRooms.set(roomId, telegramChatId);
    console.log(`Subscribed Telegram chat ${telegramChatId} to room ${roomId}`);
  }
  
  // Unsubscribe from a token chat room
  public unsubscribeFromRoom(roomId: number): void {
    this.subscribedRooms.delete(roomId);
    console.log(`Unsubscribed from room ${roomId}`);
  }
  
  private async handleBaseTransaction(event: ChatEvent): Promise<void> {
    if (!event.txHash || !event.amount || !event.to || !event.from || !event.telegramId) return;
    
    try {
      // Send a message to the user who made the transaction
      await this.bot.telegram.sendMessage(
        event.telegramId,
        `✅ <b>Base Transaction Sent</b>\n\n` +
        `Amount: ${event.amount} ETH\n` +
        `From: <code>${event.from.slice(0, 8)}...${event.from.slice(-6)}</code>\n` +
        `To: <code>${event.to.slice(0, 8)}...${event.to.slice(-6)}</code>\n` +
        `Transaction Hash: <code>${event.txHash.slice(0, 8)}...${event.txHash.slice(-6)}</code>\n\n` +
        `<a href="https://basescan.org/tx/${event.txHash}">View on BaseScan</a>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error sending Base transaction notification:', error);
    }
  }
  
  private async handleBaseWalletConnected(event: ChatEvent): Promise<void> {
    if (!event.baseAddress || !event.telegramId) return;
    
    try {
      // Send a message to the user who connected their Base wallet
      await this.bot.telegram.sendMessage(
        event.telegramId,
        `🔗 <b>Base Wallet Connected</b>\n\n` +
        `Address: <code>${event.baseAddress.slice(0, 8)}...${event.baseAddress.slice(-6)}</code>\n\n` +
        `You can now send and receive transactions on the Base blockchain using Cheshire Terminal.`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💸 Send Base Transaction', web_app: { url: `${this.getAppUrl()}/terminal?source=telegram&tab=ops&prompt=Prepare%20a%20Base%20transaction%20handoff.%20Show%20the%20wallet%20requirements%20before%20anything%20is%20signed.` } }],
              [{ text: '📊 View Base Balance', web_app: { url: `${this.getAppUrl()}/account?source=telegram&panel=base` } }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error sending Base wallet connection notification:', error);
    }
  }
  
  private async handleAgentWalletConnected(event: ChatEvent): Promise<void> {
    if (!event.agentAddress || !event.telegramId) return;
    
    try {
      // Send a message to the user who connected their AI Agent wallet
      await this.bot.telegram.sendMessage(
        event.telegramId,
        `🤖 <b>AI Agent Wallet Connected</b>\n\n` +
        `Address: <code>${event.agentAddress.slice(0, 8)}...${event.agentAddress.slice(-6)}</code>\n` +
        `Type: ${event.walletType || 'Phantom'}\n\n` +
        `Your AI Agent is now ready to use.`,
        { 
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🧠 Create New Agent', web_app: { url: `${this.getAppUrl()}/agents/builder?source=telegram` } }],
              [{ text: '🚀 Launch Agent Token', web_app: { url: `${this.getAppUrl()}/agent-launchpad?source=telegram` } }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error sending AI Agent wallet connection notification:', error);
    }
  }
  
  private async handleAgentTransaction(event: ChatEvent): Promise<void> {
    if (!event.txHash || !event.amount || !event.toAddress || !event.fromAddress || !event.telegramId) return;
    
    try {
      // Send a message to the user whose agent made the transaction
      await this.bot.telegram.sendMessage(
        event.telegramId,
        `🤖 <b>AI Agent Transaction</b>\n\n` +
        `Amount: ${event.amount} SOL\n` +
        `From: <code>${event.fromAddress.slice(0, 8)}...${event.fromAddress.slice(-6)}</code>\n` +
        `To: <code>${event.toAddress.slice(0, 8)}...${event.toAddress.slice(-6)}</code>\n` +
        `Status: ${event.status || 'Confirmed'}\n` +
        `Transaction Hash: <code>${event.txHash.slice(0, 8)}...${event.txHash.slice(-6)}</code>\n\n` +
        `<a href="https://solscan.io/tx/${event.txHash}">View on Solscan</a>`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('Error sending AI Agent transaction notification:', error);
    }
  }
}

// Lazy singleton — callers must check getBot() !== null before use
export const telegramBot = process.env.TELEGRAM_BOT_TOKEN
  ? TelegramBot.getInstance()
  : ({
      getBot: () => null,
      getInfo: () => ({ mode: 'stopped', startTime: Date.now(), status: 'stopped', errorCount: 0, connectedToWebSocket: false }),
      start: () => { console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled.'); },
      subscribeToRoom: () => {},
      unsubscribeFromRoom: () => {},
      connectToWebSocket: () => {},
    } as unknown as TelegramBot);
