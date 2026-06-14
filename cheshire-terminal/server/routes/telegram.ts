import type { ChatRoom } from "@shared/schema";
import { Router } from "express";
import { telegramBot } from "../lib/telegram/bot";
import { storage } from "../storage";
import {
  getPublicAppUrl,
  getTelegramBotToken,
  getTelegramClientId,
  getTelegramClientSecret,
  verifyTelegramMiniAppInitData,
} from "../lib/telegram/auth";

interface TelegramUser {
  id: string;
  walletAddress: string;
  username: string;
  lastActive: Date;
  baseAddress?: string; // Base blockchain wallet address
  agentAddress?: string; // AI Agent wallet address
  agentEnabled?: boolean; // Whether user has enabled AI agent
}

// In-memory user storage for Telegram Mini App users
const telegramUsers = new Map<string, TelegramUser>();
let cachedBotUsername: string | null = null;

const router = Router();

async function resolveBotUsername() {
  const configured = (process.env.TELEGRAM_VERIFY_BOT || process.env.TELEGRAM_LOGIN_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  if (configured) return configured;
  if (cachedBotUsername) return cachedBotUsername;

  const token = getTelegramBotToken();
  if (!token) return "";

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    cachedBotUsername = data?.result?.username || "";
    return cachedBotUsername;
  } catch (error) {
    console.warn("[telegram] Failed to resolve bot username:", error);
    return "";
  }
}

router.get('/config', async (_req, res) => {
  const botUsername = await resolveBotUsername();
  res.json({
    status: 'ok',
    appUrl: getPublicAppUrl(),
    botUsername,
    loginConfigured: !!getTelegramBotToken(),
    oidcConfigured: !!(getTelegramClientId() && getTelegramClientSecret()),
    tradingEnabled: true,
  });
});

router.post('/session', (req, res) => {
  const { initData } = req.body as { initData?: string };
  const { isValid, user } = verifyTelegramMiniAppInitData(initData || '');
  res.json({
    status: isValid ? 'ok' : 'invalid',
    isValid,
    user,
    trading: {
      arenaPath: '/arena',
      swapPath: '/swap',
      dexPath: '/dex',
    },
  });
});

// Webhook endpoint for Telegram updates
router.post('/webhook', async (req, res) => {
  try {
    // Get the bot instance
    const bot = telegramBot.getBot();
    
    // Process the update
    await bot.handleUpdate(req.body);
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing Telegram webhook:', error);
    res.sendStatus(500);
  }
});

// Health check endpoint with detailed status
router.get('/status', (_req, res) => {
  try {
    const bot = telegramBot.getBot();
    const info = telegramBot.getInfo();
    
    res.json({ 
      status: 'ok',
      isRunning: !!bot,
      mode: info.mode,
      botStatus: info.status,
      webhook: info.webhook || null,
      startTime: info.startTime,
      uptime: Date.now() - info.startTime,
      errorCount: info.errorCount,
      lastError: info.lastError || null,
      connectedToWebSocket: info.connectedToWebSocket,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasBirdeyeKey: !!process.env.BIRDEYE_API_KEY,
        hasHonchoKey: !!process.env.HONCHO_API_KEY,
        honchoWorkspaceId: process.env.HONCHO_WORKSPACE_ID || 'cheshireterminal',
        appUrl: getPublicAppUrl(),
        replDomain: process.env.REPLIT_DOMAINS || null
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual startup endpoint (admin only)
router.post('/start', (_req, res) => {
  try {
    telegramBot.start();
    res.json({ 
      status: 'ok',
      message: 'Telegram bot started',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get chat rooms for Telegram bot integration
router.get('/rooms', async (_req, res) => {
  try {
    // Get all chat rooms from storage
    const rooms = await storage.getChatRooms();
    
    // Format for easier display in Telegram
    const roomsFormatted = rooms.map((room: ChatRoom) => ({
      id: room.id,
      name: room.name,
      tokenAddress: room.tokenAddress,
      memberCount: room.memberCount || 0,
      created: room.createdAt
    }));
    
    res.json({
      status: 'ok',
      rooms: roomsFormatted,
      count: roomsFormatted.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[telegram] room list unavailable:', error instanceof Error ? error.message : error);
    res.json({
      status: 'ok',
      degraded: true,
      rooms: [],
      count: 0,
      timestamp: new Date().toISOString(),
      warning: 'Chat rooms are temporarily unavailable',
    });
  }
});

// Register Telegram Mini App user
router.post('/register', (req, res) => {
  try {
    const { walletAddress, username, telegramId, baseAddress } = req.body;
    
    if (!walletAddress || !username || !telegramId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: walletAddress, username, telegramId'
      });
    }
    
    // Create or update the user record
    telegramUsers.set(walletAddress, {
      id: telegramId,
      walletAddress,
      username,
      baseAddress, // Optional Base blockchain wallet address
      lastActive: new Date()
    });
    
    const addressInfo = baseAddress 
      ? `Solana: ${walletAddress.slice(0, 6)}..., Base: ${baseAddress.slice(0, 6)}...`
      : `${walletAddress.slice(0, 6)}...`;
    
    console.log(`Registered Telegram user: ${username} (${addressInfo})`);
    
    res.json({
      status: 'ok',
      message: 'Registration successful',
      user: {
        id: telegramId,
        walletAddress,
        username,
        baseAddress
      }
    });
  } catch (error) {
    console.error('Error registering Telegram user:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get registered Telegram user by wallet address
router.get('/users/:walletAddress', (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = telegramUsers.get(walletAddress);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }
    
    // Update last active timestamp
    user.lastActive = new Date();
    telegramUsers.set(walletAddress, user);
    
    res.json({
      status: 'ok',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        baseAddress: user.baseAddress,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Error fetching Telegram user:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Telegram user by Base address
router.get('/base-users/:baseAddress', (req, res) => {
  try {
    const { baseAddress } = req.params;
    const user = Array.from(telegramUsers.values()).find(u => u.baseAddress === baseAddress);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found with the specified Base address'
      });
    }
    
    // Update last active timestamp
    user.lastActive = new Date();
    telegramUsers.set(user.walletAddress, user);
    
    res.json({
      status: 'ok',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        baseAddress: user.baseAddress,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Error fetching Telegram user by Base address:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all registered Telegram users
router.get('/users', (_req, res) => {
  try {
    const users = Array.from(telegramUsers.values()).map(user => ({
      id: user.id,
      walletAddress: user.walletAddress,
      username: user.username,
      baseAddress: user.baseAddress,
      lastActive: user.lastActive
    }));
    
    res.json({
      status: 'ok',
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching Telegram users:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Validate Telegram Mini App init data via HMAC-SHA256
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
router.post('/validate', (req, res) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameter: initData'
      });
    }

    const token = getTelegramBotToken();
    if (!token) {
      return res.status(503).json({ status: 'error', message: 'Bot not configured' });
    }

    const { isValid, user } = verifyTelegramMiniAppInitData(initData as string, token);
    res.json({ status: 'ok', isValid, user });
  } catch (error) {
    console.error('Error validating Telegram data:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Connect Base wallet to Telegram user
router.post('/connect-base', (req, res) => {
  try {
    const { baseAddress, telegramId, solanaWalletAddress } = req.body;
    
    if (!baseAddress || !telegramId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: baseAddress, telegramId'
      });
    }
    
    // Find the user by Solana wallet if provided, or by Telegram ID
    let user: TelegramUser | undefined;
    
    if (solanaWalletAddress) {
      user = telegramUsers.get(solanaWalletAddress);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found with the provided Solana wallet address'
        });
      }
      
      // Update the user with Base address
      user.baseAddress = baseAddress;
      user.lastActive = new Date();
      telegramUsers.set(solanaWalletAddress, user);
    } else {
      // Find user by Telegram ID
      const foundUser = Array.from(telegramUsers.values()).find(u => u.id === telegramId);
      
      if (!foundUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found with the provided Telegram ID'
        });
      }
      
      // Update the user with Base address
      foundUser.baseAddress = baseAddress;
      foundUser.lastActive = new Date();
      telegramUsers.set(foundUser.walletAddress, foundUser);
      user = foundUser;
    }
    
    console.log(`Connected Base wallet (${baseAddress.slice(0, 6)}...) to user ${user.username}`);
    
    // Send notification to Telegram bot
    const bot = telegramBot.getBot();
    if (bot) {
      // Send notification using web app data handler
      bot.telegram.sendMessage(
        telegramId,
        `✅ Your Base wallet has been connected! You can now send and receive transactions on the Base network.`
      );
    }
    
    res.json({
      status: 'ok',
      message: 'Base wallet connected successfully',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        baseAddress: user.baseAddress,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error connecting Base wallet:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Notify Telegram about Base transaction
router.post('/base-transaction', (req, res) => {
  try {
    const { txHash, amount, to, from, telegramId } = req.body;
    
    if (!txHash || !amount || !to || !from || !telegramId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: txHash, amount, to, from, telegramId'
      });
    }
    
    // Find the user by Telegram ID
    const user = Array.from(telegramUsers.values()).find(u => u.id === telegramId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found with the provided Telegram ID'
      });
    }
    
    // Update last active timestamp
    user.lastActive = new Date();
    telegramUsers.set(user.walletAddress, user);
    
    // Send notification to Telegram bot
    const bot = telegramBot.getBot();
    if (bot) {
      bot.telegram.sendMessage(
        telegramId,
        `✅ Transaction sent: ${amount} ETH to ${to.slice(0, 6)}...${to.slice(-4)}\n\nView on BaseScan: https://basescan.org/tx/${txHash}`
      );
    }
    
    res.json({
      status: 'ok',
      message: 'Transaction notification sent',
      transaction: {
        txHash,
        amount,
        to,
        from
      }
    });
  } catch (error) {
    console.error('Error sending Base transaction notification:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Connect AI Agent wallet to Telegram user
router.post('/connect-agent', (req, res) => {
  try {
    const { agentAddress, telegramId, agentEnabled } = req.body;
    
    if (!agentAddress || !telegramId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: agentAddress, telegramId'
      });
    }
    
    // Find user by Telegram ID
    const user = Array.from(telegramUsers.values()).find(u => u.id === telegramId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found with the provided Telegram ID'
      });
    }
    
    // Update the user with Agent address
    user.agentAddress = agentAddress;
    user.agentEnabled = agentEnabled ?? true;
    user.lastActive = new Date();
    telegramUsers.set(user.walletAddress, user);
    
    console.log(`Connected AI Agent wallet (${agentAddress.slice(0, 6)}...) to user ${user.username}`);
    
    // Send notification to Telegram bot
    const bot = telegramBot.getBot();
    if (bot) {
      // Send notification using web app data handler
      bot.telegram.sendMessage(
        telegramId,
        `🤖 Your AI Agent wallet has been connected! You can now use AI-powered features.`
      );
    }
    
    res.json({
      status: 'ok',
      message: 'AI Agent wallet connected successfully',
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        agentAddress,
        agentEnabled: user.agentEnabled
      }
    });
  } catch (error) {
    console.error('Error connecting AI Agent wallet:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Notify Telegram about AI Agent transaction
router.post('/agent-transaction', (req, res) => {
  try {
    const { txHash, amount, toAddress, fromAddress, telegramId, status } = req.body;
    
    if (!txHash || !amount || !toAddress || !fromAddress || !telegramId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: txHash, amount, toAddress, fromAddress, telegramId'
      });
    }
    
    // Find the user by Telegram ID
    const user = Array.from(telegramUsers.values()).find(u => u.id === telegramId);
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found with the provided Telegram ID'
      });
    }
    
    // Update last active timestamp
    user.lastActive = new Date();
    telegramUsers.set(user.walletAddress, user);
    
    // Send notification to Telegram bot
    const bot = telegramBot.getBot();
    if (bot) {
      bot.telegram.sendMessage(
        telegramId,
        `🤖 AI Agent Transaction: ${amount} SOL sent to ${toAddress.slice(0, 6)}...${toAddress.slice(-4)}\n\nView on Solscan: https://solscan.io/tx/${txHash}`
      );
    }
    
    res.json({
      status: 'ok',
      message: 'AI Agent transaction notification sent',
      transaction: {
        txHash,
        amount,
        toAddress,
        fromAddress,
        status: status || 'confirmed'
      }
    });
  } catch (error) {
    console.error('Error sending AI Agent transaction notification:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
