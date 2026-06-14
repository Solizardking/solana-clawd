import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { MessageType, WebSocketManager } from '../websocket';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { objectStore } from '../lib/objectStore';
import { honchoLogAgent } from '../lib/honcho';
import { estimateTokensFromText, trackUsageFromRequest } from '../lib/usage';
import { db } from '../db';
import { monetizedAgents, userAgents } from '@shared/schema';

// Import XAI API for Grok integration
import OpenAI from 'openai';

const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

const router = Router();

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function loadDeployedPaidAgent(slug: string) {
  if (!db) return null;
  const [agent] = await db
    .select()
    .from(userAgents)
    .where(eq(userAgents.slug, slug.toLowerCase()))
    .limit(1);
  if (!agent || agent.status !== "active") return null;

  const [service] = await db
    .select()
    .from(monetizedAgents)
    .where(eq(monetizedAgents.slug, agent.slug))
    .limit(1);

  return { agent, service: service ?? null };
}

function paymentChallenge(service: typeof monetizedAgents.$inferSelect | null, slug: string) {
  return {
    error: "Payment required",
    protocol: "x402",
    paymentRequired: true,
    requirements: {
      slug,
      network: service?.network ?? "solana-mainnet",
      mint: USDC_MINT,
      amountAtomic: service?.pricePerCallAtomic ?? 0,
      recipientWallet: service?.recipientWallet ?? null,
      target: service?.target ?? "agent",
      commissionBps: service?.commissionBps ?? 1000,
      headers: ["authorization", "x-payment"],
    },
    agentAuth: {
      protocol: "CAAP/1.0",
      discovery: "/caap/discovery",
      attestation: "/caap/attest",
    },
  };
}

// Agent types mapped to their capabilities
const AGENT_CAPABILITIES = {
  oracle: [
    "Real-time market data analysis",
    "Price prediction",
    "Trading volume analysis",
    "Market sentiment tracking",
    "Volatility measurement"
  ],
  creator: [
    "Content generation",
    "Meme creation",
    "Social media strategy",
    "Marketing campaigns",
    "Community engagement"
  ],
  analyst: [
    "Technical analysis",
    "Fundamental research",
    "Risk assessment",
    "Report generation",
    "Trend identification"
  ],
  community: [
    "Community management",
    "User onboarding",
    "Discord/Telegram moderation",
    "FAQ answering",
    "Event organization"
  ],
  trader: [
    "Automated trading strategies",
    "Limit order management",
    "Portfolio balancing",
    "Arbitrage detection",
    "Risk management"
  ],
  custom: []
};

// Personality traits and their prompting styles
const PERSONALITY_STYLES = {
  professional: {
    tone: "formal and precise",
    vocabulary: "technical and sophisticated",
    style: "structured and analytical"
  },
  friendly: {
    tone: "warm and approachable",
    vocabulary: "conversational and simple",
    style: "helpful and supportive"
  },
  witty: {
    tone: "clever and humorous",
    vocabulary: "playful with puns and jokes",
    style: "entertaining and engaging"
  },
  technical: {
    tone: "detailed and precise",
    vocabulary: "industry-specific terminology",
    style: "data-driven and logical"
  },
  creative: {
    tone: "imaginative and expressive",
    vocabulary: "vivid and descriptive",
    style: "innovative and unconventional"
  }
};

// Helper to generate DNA hash for agent
function generateAgentDNA(
  name: string, 
  type: keyof typeof AGENT_CAPABILITIES, 
  personality: keyof typeof PERSONALITY_STYLES, 
  capabilities: string[],
  complexity: number
): string {
  const dataString = `${name}|${type}|${personality}|${capabilities.join(',')}|${complexity}|${Date.now()}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

// POST /api/agents/create - Create a new AI agent
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { 
      name,
      type,
      personality,
      capabilities = [],
      complexity,
      description,
      wallet
    } = req.body;

    if (!name || !type || !personality || !complexity || !wallet) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate inputs
    if (complexity < 1 || complexity > 10) {
      return res.status(400).json({ error: 'Complexity must be between 1 and 10' });
    }

    // Validate agent type
    if (!Object.keys(AGENT_CAPABILITIES).includes(type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    // Validate personality
    if (!Object.keys(PERSONALITY_STYLES).includes(personality)) {
      return res.status(400).json({ error: 'Invalid personality type' });
    }

    // Generate DNA with proper type assertion
    const validType = type as keyof typeof AGENT_CAPABILITIES;
    const validPersonality = personality as keyof typeof PERSONALITY_STYLES;
    
    const dnaHash = generateAgentDNA(
      name,
      validType,
      validPersonality,
      [...AGENT_CAPABILITIES[validType], ...capabilities],
      complexity
    );

    // Get system prompt from Grok
    let systemPrompt = "";
    try {
      const prompt = `
        Create a system prompt for an AI agent with the following characteristics:
        - Name: ${name}
        - Type: ${validType} (${AGENT_CAPABILITIES[validType].join(', ')})
        - Personality: ${validPersonality} (${PERSONALITY_STYLES[validPersonality].tone}, ${PERSONALITY_STYLES[validPersonality].vocabulary})
        - Complexity level: ${complexity}/10
        - Description: ${description || 'Not provided'}
        
        The system prompt should define the agent's identity, capabilities, and response style.
        Format the response as a string without quotation marks, ready to be used as a system prompt.
      `;

      const response = await xai.chat.completions.create({
        model: "grok-3",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
      });

      systemPrompt = response.choices[0].message.content?.trim() || "";
    } catch (error) {
      console.error("Error generating system prompt:", error);
      // Create a basic system prompt if Grok API fails
      systemPrompt = `You are ${name}, a ${validPersonality} ${validType} AI assistant specialized in ${AGENT_CAPABILITIES[validType].join(', ')}.`;
    }

    // Create agent record
    const agent = {
      id: dnaHash.substring(0, 16),
      name,
      type: validType,
      personality: validPersonality,
      capabilities: [...AGENT_CAPABILITIES[validType], ...capabilities],
      complexity,
      description: description || '',
      creator: wallet,
      systemPrompt,
      dnaHash,
      createdAt: new Date().toISOString(),
      status: 'created',
    };

    // Notify via WebSocket if available
    try {
      const wsManager = req.app.locals.websocketManager as WebSocketManager;
      if (wsManager) {
        wsManager.broadcastToUser(wallet, {
          type: MessageType.AGENT_CREATED,
          data: agent
        });
      }
    } catch (wsError) {
      console.error("WebSocket notification error:", wsError);
    }

    // Persist agent creation to Honcho (fire-and-forget)
    honchoLogAgent(wallet, agent).catch(() => {});
    trackUsageFromRequest(req, {
      walletAddress: wallet,
      eventType: "agent_deployment",
      productArea: "agents",
      model: "grok-3",
      route: "/api/agents/create",
      deploymentId: agent.id,
      agentId: agent.id,
      units: 1,
      totalTokens: estimateTokensFromText(systemPrompt, description),
      metadata: {
        type: agent.type,
        personality: agent.personality,
        complexity: agent.complexity,
      },
    });

    // Save agent to gallery object store
    try {
      const galleryItem = objectStore.makeItem({
        id: agent.id,
        type: 'agent',
        title: agent.name,
        prompt: agent.description,
        sourceUrl: '',
        creator: wallet,
        model: `${agent.type}/${agent.personality}`,
        metadata: { type: agent.type, personality: agent.personality, complexity: agent.complexity, dnaHash: agent.dnaHash },
      });
      objectStore.saveGalleryItem(galleryItem).then(saved => {
        const broadcast = req.app.locals.broadcastGalleryItem as Function | undefined;
        broadcast?.(saved);
      }).catch(() => {});
    } catch {}

    res.status(201).json(agent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// POST /api/agents/:slug/run - Public paid service boundary for deployed agents.
router.post('/:slug/run', async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const deployed = await loadDeployedPaidAgent(slug);
    if (!deployed) return res.status(404).json({ error: "Agent not found" });

    const { agent, service } = deployed;
    if (!service?.active) {
      return res.status(402).json(paymentChallenge(service, slug));
    }

    const authGrant = req.header("authorization") || req.header("x-agent-auth") || "";
    const paymentProof = req.header("x-payment") || "";
    if (!authGrant || !paymentProof) {
      return res.status(402).json(paymentChallenge(service, slug));
    }

    const input =
      typeof req.body?.input === "string"
        ? req.body.input
        : typeof req.body?.message === "string"
          ? req.body.message
          : "";
    const callerWallet = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;

    trackUsageFromRequest(req, {
      walletAddress: callerWallet ?? agent.ownerWallet,
      eventType: "paid_agent_call",
      productArea: "agents",
      model: agent.model,
      route: `/api/agents/${slug}/run`,
      deploymentId: String(agent.id),
      agentId: slug,
      units: 1,
      totalTokens: estimateTokensFromText(input, agent.persona),
      metadata: {
        monetizedAgentId: service.id,
        pricePerCallAtomic: service.pricePerCallAtomic,
        paymentHeaderPresent: true,
        authHeaderPresent: true,
      },
    });

    return res.json({
      success: true,
      agent: {
        slug: agent.slug,
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
      },
      monetization: {
        id: service.id,
        amountAtomic: service.pricePerCallAtomic,
        recipientWallet: service.recipientWallet,
        network: service.network,
      },
      result: {
        status: "accepted",
        message: agent.greeting || `${agent.name} accepted the paid request.`,
        input,
        next: "Route this request to the configured Cloudflare Worker or Google ADK Agent Runtime executor.",
      },
    });
  } catch (error) {
    console.error('Error running paid agent:', error);
    res.status(500).json({ error: 'Failed to run paid agent' });
  }
});

// GET /api/agents/:wallet - Get agents for a specific wallet
router.get('/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;

    res.json({
      success: true,
      wallet,
      agents: []
    });
  } catch (error) {
    console.error('Error getting agents:', error);
    res.status(500).json({ error: 'Failed to retrieve agents' });
  }
});

// POST /api/agents/launch - Launch a token with an agent
router.post('/launch', async (req: Request, res: Response) => {
  try {
    const {
      agentId,
      tokenName,
      tokenSymbol,
      wallet,
      initialPrice,
      launchType // 0 = Bonding Curve, 1 = PumpFun, 2 = FunPump
    } = req.body;

    if (!agentId || !tokenName || !tokenSymbol || !wallet || !initialPrice) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    res.status(501).json({
      success: false,
      error: 'Agent-powered token launch is disabled until the real on-chain launcher is configured.',
      required: ['AGENT_LAUNCH_PROGRAM_ID', 'HELIUS_RPC_URL', 'TREASURY_WALLET'],
      launchType: launchType || 0,
      tokenName,
      tokenSymbol,
      agentId,
    });
    trackUsageFromRequest(req, {
      walletAddress: wallet,
      eventType: "token_deployment_attempt",
      productArea: "tokens",
      route: "/api/agents/launch",
      agentId,
      units: 1,
      metadata: { tokenName, tokenSymbol, launchType: launchType || 0, status: "disabled" },
    });
  } catch (error) {
    console.error('Error launching agent token:', error);
    res.status(500).json({ error: 'Failed to launch token with agent' });
  }
});

export default router;
