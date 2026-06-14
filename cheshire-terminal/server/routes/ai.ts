// @ts-nocheck
import { Router } from "express";
import OpenAI from "openai";
import { generateTokenRecommendation } from "../lib/ai/tokenRecommendations";
import { resolvePastedSolanaContext, resolvePastedSolanaContextDetails } from "../lib/helius-entity-resolver";
import { estimateTokensFromText, trackUsageFromRequest } from "../lib/usage";
import { objectStore } from "../lib/objectStore";
import type { 
  ChatCompletionMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionAssistantMessageParam
} from "openai/resources/chat/completions";

const router = Router();

// ─── Model selection ───────────────────────────────────────────────────────────
// MINIMODEL env var picks the default model; falls back to grok-3 via xAI.
const MINIMODEL = (process.env.MINIMODEL ?? "").toLowerCase();
const USE_MINIMAX = MINIMODEL.includes("minimax") || MINIMODEL.includes("mini");

let openai: OpenAI;
try {
  if (USE_MINIMAX && process.env.MINIMAX_API_KEY) {
    openai = new OpenAI({
      baseURL: process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1",
      apiKey: process.env.MINIMAX_API_KEY,
    });
  } else {
    const apiKey = process.env.XAI_API_KEY || "";
    if (!apiKey) console.warn("Warning: XAI_API_KEY is not set. xAI features will not work.");
    openai = new OpenAI({ baseURL: "https://api.x.ai/v1", apiKey });
  }
} catch (error) {
  console.error("Failed to initialize AI client:", error);
}

// Returns the model ID to use for a given call; prefers env override.
function defaultModel(fallback = "grok-3"): string {
  if (USE_MINIMAX) return "MiniMax-M3";
  return process.env.AI_MODEL ?? fallback;
}

// Add token recommendation endpoint
router.post("/token-recommendation", async (req, res) => {
  try {
    const { budget, theme, goals } = req.body;

    if (!budget || !theme || !goals) {
      return res.status(400).json({
        error: "Missing required parameters: budget, theme, and goals are required"
      });
    }

    const prompt = `Analyze and provide a token launch recommendation based on:
    Budget: ${budget} SOL
    Theme: ${theme}
    Goals: ${goals}

    Consider market trends, community engagement patterns, and historical token performance.
    Focus on providing actionable insights for launch timing, initial liquidity, target audience, 
    and marketing strategy. Assess risks and provide a confidence score.`;

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: [
        {
          role: "system",
          content: "You are an expert crypto token launch advisor. Analyze market data and user preferences to provide detailed, actionable token launch recommendations. Format response as JSON with recommendation details."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });

    const recommendation = JSON.parse(completion.choices[0].message.content || "{}");
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: completion.model ?? defaultModel(),
      route: "/api/ai/token-recommendation",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      metadata: { kind: "token_recommendation", budget, theme },
    });

    res.json(recommendation);
  } catch (error) {
    console.error("Token recommendation error:", error);
    res.status(500).json({
      error: "Failed to generate recommendation",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// System prompt for contract explanations
const CONTRACT_SYSTEM_PROMPT = `You are an expert blockchain developer explaining the PumpFun Smart Contract. 
Your explanations should be clear, engaging, and technically accurate while maintaining accessibility for users 
of varying technical backgrounds. Focus on:

1. Bonding curve mechanics
2. Security features
3. Fee distribution systems
4. Transaction optimization
5. Price discovery mechanisms

Keep responses concise but informative, using analogies where helpful.`;

router.post("/explain-contract", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ 
        error: "Question is required" 
      });
    }

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: [
        { role: "system", content: CONTRACT_SYSTEM_PROMPT },
        { role: "user", content: question }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content;
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: completion.model ?? defaultModel(),
      route: "/api/ai/explain-contract",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      metadata: { kind: "contract_explanation" },
    });

    res.json({ response });

  } catch (error) {
    console.error("Contract explanation error:", error);
    res.status(500).json({ 
      error: "Failed to generate explanation",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// System prompt for Chesh
const CHESH_SYSTEM_PROMPT = `You are Chesh, an advanced conversational AI agent powered by Grok 3, designed to guide users in launching tokens on a cutting-edge token launchpad using the Pump Fun SDK. Channel the Cheshire Cat's enigmatic charm—witty, elusive, and slyly humorous—while upholding an ethos of verified data and blockchain integrity.
Core Capabilities:
- Token Launch Guidance: Help users create and launch tokens using Pump Fun SDK
- Trading Insights: Provide market analysis and token performance predictions
- Cross-Chain Navigation: Guide users through Solana and Base blockchain operations

Key Rules:
1. NEVER initiate a token launch without explicit user confirmation
2. Always collect complete token details before suggesting launch:
   - Token name
   - Symbol
   - Description
   - Initial amount
3. Explain risks and fees before any transaction
4. Get final confirmation before proceeding with launches or trades

Remember: Stay playful but professional, and always prioritize user safety in blockchain operations.`;

async function buildCheshPromptParts(userText: string) {
  const pastedContext = await resolvePastedSolanaContext(userText);
  if (!pastedContext) return { prompt: CHESH_SYSTEM_PROMPT, pastedContext: "" };
  return {
    pastedContext,
    prompt: `${CHESH_SYSTEM_PROMPT}

Helius pasted-input context:
If the user pasted a Solana token mint, token account, wallet, program, transaction signature, or supported domain, the live Helius interpretation is below. Use it directly before guessing. If the context says it is a wallet, token account, transaction, or mint, call it that.
${pastedContext}`,
  };
}

async function buildCheshSystemPrompt(userText: string) {
  return (await buildCheshPromptParts(userText)).prompt;
}

function visibleHeliusContext(pastedContext: string) {
  if (!pastedContext) return "";
  return pastedContext
    .replace(/^\s*\[Helius pasted-input context\]\s*/m, "")
    .trim();
}

// Store chat history in memory
const chatSessions = new Map<string, any[]>();

// Prediction endpoint for token analysis
router.get("/predict", async (req, res) => {
  try {
    // Prepare market analysis prompt
    const prompt = {
      role: "system",
      content: "You are Chesh, an expert crypto market oracle. Analyze current market conditions and provide insightful predictions with a playful Cheshire Cat style. Format your response as JSON with 'message', 'prediction' (direction, confidence, timeframe), and 'marketAnalysis' (trend, sentiment, volume24h)."
    };

    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: [prompt as any],
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    const parsedResponse = JSON.parse(content);
    console.log("Oracle Prediction:", parsedResponse);
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: completion.model ?? defaultModel(),
      route: "/api/ai/predict",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      metadata: { kind: "market_prediction" },
    });

    res.json(parsedResponse);
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({
      message: "The oracle's vision is temporarily clouded. Try again shortly. 🌫️",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { message, sessionId: providedSessionId } = req.body;

    if (!message) {
      return res.status(400).json({ 
        message: "Message is required",
        error: "Missing required parameters" 
      });
    }
    const sessionId = providedSessionId || `chesh-${Date.now().toString(36)}`;

    // Initialize or get session history
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, []);
    }
    const history = chatSessions.get(sessionId)!;

    // Add user message to history
    history.push({ 
      role: "user", 
      content: message 
    });

    const resolvedInput = await resolvePastedSolanaContextDetails(message);
    if (resolvedInput.directAnswer) {
      history.push({
        role: "assistant",
        content: resolvedInput.directAnswer
      });
      if (history.length > 20) {
        history.splice(0, 2);
      }
      trackUsageFromRequest(req, {
        eventType: "chat_message",
        productArea: "chat",
        model: "helius-lookup",
        route: "/api/ai/chat",
        sessionId,
        units: 1,
        totalTokens: estimateTokensFromText(message, resolvedInput.directAnswer),
        metadata: { action: "helius_lookup" },
      });
      return res.json({
        message: resolvedInput.directAnswer,
        action: "helius_lookup",
        tokenDetails: null
      });
    }

    const { prompt, pastedContext } = await buildCheshPromptParts(message);

    // Prepare messages array with system prompt and history
    const messages = [
      { 
        role: "system", 
        content: prompt
      },
      ...history.slice(-10) // Keep last 10 messages for context
    ];

    // Call xAI API
    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: messages as any,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from AI");
    }

    const parsedResponse = JSON.parse(content);
    console.log("AI Response:", parsedResponse); // Debug log

    // Add AI response to history
    const visibleContext = visibleHeliusContext(pastedContext);
    const responseMessage = visibleContext
      ? `**Helius lookup**\n\n${visibleContext}\n\n---\n\n${parsedResponse.message}`
      : parsedResponse.message;

    history.push({
      role: "assistant",
      content: responseMessage
    });

    // Clean up old history if too long
    if (history.length > 20) {
      history.splice(0, 2);
    }
    trackUsageFromRequest(req, {
      eventType: "chat_message",
      productArea: "chat",
      model: completion.model ?? defaultModel(),
      route: "/api/ai/chat",
      sessionId,
      units: 1,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      metadata: { action: parsedResponse.action, pastedContext: Boolean(pastedContext) },
    });

    res.json({
      message: responseMessage,
      action: parsedResponse.action,
      tokenDetails: parsedResponse.tokenDetails
    });

  } catch (error) {
    console.error("Error in chat:", error);
    res.status(500).json({ 
      message: "Sorry, I'm having trouble processing that right now. Could you try rephrasing?",
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
});

// Streaming chat endpoint
router.post("/chat-stream", async (req, res) => {
  try {
    const { message, sessionId: providedSessionId } = req.body;

    if (!message) {
      return res.status(400).json({ 
        message: "Message is required",
        error: "Missing required parameters" 
      });
    }
    const sessionId = providedSessionId || `chesh-${Date.now().toString(36)}`;

    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize or get session history
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, []);
    }
    const history = chatSessions.get(sessionId)!;

    // Add user message to history
    history.push({ 
      role: "user", 
      content: message 
    });

    const resolvedInput = await resolvePastedSolanaContextDetails(message);
    if (resolvedInput.directAnswer) {
      history.push({
        role: "assistant",
        content: resolvedInput.directAnswer
      });
      if (history.length > 20) {
        history.splice(0, 2);
      }
      trackUsageFromRequest(req, {
        eventType: "chat_message",
        productArea: "chat",
        model: "helius-lookup",
        route: "/api/ai/chat-stream",
        sessionId,
        units: 1,
        totalTokens: estimateTokensFromText(message, resolvedInput.directAnswer),
        metadata: { action: "helius_lookup", streamed: true },
      });
      res.write(resolvedInput.directAnswer);
      return res.end();
    }

    const { prompt, pastedContext } = await buildCheshPromptParts(message);
    const visibleContext = visibleHeliusContext(pastedContext);

    // Prepare messages array with system prompt and history
    const messages = [
      { 
        role: "system", 
        content: prompt
      },
      ...history.slice(-10) // Keep last 10 messages for context
    ];

    try {
      let fullResponse = "";
      if (visibleContext) {
        fullResponse = `**Helius lookup**\n\n${visibleContext}\n\n---\n\n`;
        res.write(fullResponse);
      }

      // Create a streaming completion
      const stream = await openai.chat.completions.create({
        model: defaultModel(),
        messages: messages as any,
        stream: true
      });

      // Stream the response chunks to the client
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(content);
        }
      }

      // Add AI response to history after stream completes
      history.push({
        role: "assistant",
        content: fullResponse
      });

      // Clean up old history if too long
      if (history.length > 20) {
        history.splice(0, 2);
      }
      trackUsageFromRequest(req, {
        eventType: "chat_message",
        productArea: "chat",
        model: defaultModel(),
        route: "/api/ai/chat-stream",
        sessionId,
        units: 1,
        totalTokens: estimateTokensFromText(message, fullResponse),
        metadata: { streamed: true, pastedContext: Boolean(pastedContext) },
      });

      res.end();
    } catch (streamError) {
      console.error("Streaming error:", streamError);
      
      // If streaming fails, try the standard API
      const completion = await openai.chat.completions.create({
        model: defaultModel(),
        messages: messages as any
      });

      const content = completion.choices[0].message.content || "";
      const fullContent = visibleContext
        ? `**Helius lookup**\n\n${visibleContext}\n\n---\n\n${content}`
        : content;
      
      // Add AI response to history
      history.push({
        role: "assistant",
        content: fullContent
      });
      trackUsageFromRequest(req, {
        eventType: "chat_message",
        productArea: "chat",
        model: completion.model ?? defaultModel(),
        route: "/api/ai/chat-stream",
        sessionId,
        units: 1,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        metadata: { streamed: false, fallback: true, pastedContext: Boolean(pastedContext) },
      });

      // Send the response as one chunk
      res.write(fullContent);
      res.end();
    }
  } catch (error) {
    console.error("Error in streaming chat:", error);
    // Try to respond with an error message if possible
    try {
      res.write("Sorry, I encountered an error processing your request. Please try again.");
      res.end();
    } catch (respondError) {
      console.error("Error sending error response:", respondError);
      res.status(500).end();
    }
  }
});

const WELCOME_MESSAGE = "Cheshire Terminal — powered by $CLAWD token on Solana, Open AI Codex, and the power of the wonderland of Web 3. I'm Clawd, your guide through the rabbit hole. What are we launching today?";

router.post("/welcome", async (req, res) => {
  try {
    res.json({ message: WELCOME_MESSAGE });
  } catch (error) {
    console.error("Error in welcome endpoint:", error);
    res.json({ 
      message: WELCOME_MESSAGE,
      fallback: true
    });
  }
});

// Also support GET for the welcome message for compatibility
router.get("/welcome", async (req, res) => {
  try {
    res.json({ message: WELCOME_MESSAGE });
  } catch (error) {
    console.error("Error in welcome endpoint:", error);
    res.json({ 
      message: "Ready to create viral meme tokens? Let's get started! 🚀",
      fallback: true
    });
  }
});

// Smart contract analysis with grok
router.post("/analyze-contract", async (req, res) => {
  try {
    const { question, code } = req.body;
    
    if (!question || !code) {
      return res.status(400).json({ error: 'Question and code are required' });
    }
    
    // Use xAI for analysis
    const completion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: [
        {
          role: "system",
          content: `You are an expert in Solana smart contracts, particularly contracts written using the Anchor framework. 
          You provide clear, detailed explanations of how smart contract code works, focusing on security, functionality, and best practices. 
          When analyzing contract code, highlight key features, potential concerns, and explain complex logic in simple terms.`
        },
        {
          role: "user",
          content: `Here is a Solana smart contract code that I'd like you to analyze:
          
          \`\`\`rust
          ${code}
          \`\`\`
          
          My question is: ${question}
          
          Please provide a thorough analysis focusing specifically on my question.`
        }
      ],
      max_tokens: 1000,
    });
    
    trackUsageFromRequest(req, {
      eventType: "model_call",
      productArea: "ai",
      model: completion.model ?? defaultModel(),
      route: "/api/ai/analyze-contract",
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      metadata: { kind: "contract_analysis", codeLength: code.length },
    });
    res.json({ response: completion.choices[0].message.content });
  } catch (error) {
    console.error('Error analyzing contract:', error);
    res.status(500).json({ 
      error: 'Failed to analyze contract',
      message: 'There was an error analyzing the contract with AI.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Meme image generation with Grok
router.post("/generate-meme", async (req, res) => {
  try {
    const { prompt, n = 1, responseFormat = 'url' } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // First improve the prompt with grok-3
    const promptCompletion = await openai.chat.completions.create({
      model: defaultModel(),
      messages: [
        {
          role: "system",
          content: `You are a creative meme expert who helps users generate viral-worthy meme art descriptions. 
          Analyze the user's meme idea and provide an improved, detailed prompt that will create a better meme image.
          Be descriptive but concise. Focus on visual elements, style, and humor.`
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });
    
    const improvedPrompt = promptCompletion.choices[0].message.content || prompt;
    
    // Generate the image with grok-imagine-image
    const imageResponse = await openai.images.generate({
      model: "grok-imagine-image",
      prompt: improvedPrompt,
      n: Math.min(Math.max(1, n), 4), // Limit to 1-4 images
      response_format: responseFormat as 'url' | 'b64_json',
    });
    
    const images = imageResponse.data.map(image => ({
        url: image.url,
        b64_json: 'b64_json' in image ? image.b64_json : undefined,
        revisedPrompt: image.revised_prompt
      }));

    images.forEach((image, index) => {
      const sourceUrl = image.url || (image.b64_json ? `data:image/png;base64,${image.b64_json}` : '');
      if (!sourceUrl) return;
      const item = objectStore.makeItem({
        type: 'image',
        title: prompt.slice(0, 70) || `Meme image ${index + 1}`,
        prompt: improvedPrompt,
        sourceUrl,
        model: 'grok-imagine-image',
        creator: 'site:meme-generator',
        metadata: {
          source: 'site',
          route: '/api/ai/generate-meme',
          originalPrompt: prompt,
          revisedPrompt: image.revisedPrompt,
          responseFormat,
          index,
        },
      });
      objectStore.saveGalleryItem(item).catch((err) => {
        console.warn('Could not save generated meme image to gallery storage:', err);
      });
    });

    res.json({
      images,
      originalPrompt: prompt,
      improvedPrompt
    });
    trackUsageFromRequest(req, {
      eventType: "image_generation",
      productArea: "ai",
      model: "grok-imagine-image",
      route: "/api/ai/generate-meme",
      units: imageResponse.data.length,
      totalTokens: estimateTokensFromText(prompt, improvedPrompt),
      metadata: { kind: "meme_generation", responseFormat },
    });
  } catch (error) {
    console.error('Error generating meme image:', error);
    res.status(500).json({ 
      error: 'Failed to generate meme image',
      message: 'There was an error generating the meme image with Grok.',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
