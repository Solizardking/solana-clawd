import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { storage } from '../storage';

const router = Router();

// Initialize xAI client
const xAIClient = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
});

// Get contract code by name
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const contractPath = path.join(process.cwd(), 'shared', 'contracts', `${name}.rs`);
    
    if (fs.existsSync(contractPath)) {
      const contractCode = fs.readFileSync(contractPath, 'utf8');
      res.send(contractCode);
    } else {
      res.status(404).json({ error: 'Contract not found' });
    }
  } catch (error) {
    console.error('Error getting contract:', error);
    res.status(500).json({ error: 'Failed to get contract' });
  }
});

// Analyze contract with AI
router.post('/analyze', async (req, res) => {
  try {
    const { question, code } = req.body;
    
    if (!question || !code) {
      return res.status(400).json({ error: 'Question and code are required' });
    }
    
    // Use xAI for analysis
    const completion = await xAIClient.chat.completions.create({
      model: "grok-3",
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

export default router;