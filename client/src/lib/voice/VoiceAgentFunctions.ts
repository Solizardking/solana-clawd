// @ts-nocheck
import { VoiceSynthesis } from './VoiceSynthesis';
import { chatWithCheshire, generateMemeImage } from '@/lib/ai';
import { PumpFunService } from '@/lib/pumpFunService';
import { Keypair } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

// Type definitions
interface AgentParams {
  walletAddress?: string;
  publicKey?: PublicKey;
  signTransaction?: any;
}

interface TokenParams {
  platform: string;
  name: string;
  symbol: string;
  initialSol: number;
  uri?: string;
}

interface TokenResult {
  success: boolean;
  mint?: string;
  signature?: string;
  error?: string;
}

/**
 * Get SOL balance for a wallet
 */
export const getSolBalance = async (walletAddress: string, agentParams: AgentParams): Promise<string> => {
  try {
    if (!walletAddress) {
      return "Please provide a valid wallet address";
    }
    
    // Use Helius RPC or another provider to fetch balance
    const apiKey = import.meta.env.VITE_HELIUS_RPC_URL;
    const url = `${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress],
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    const balanceLamports = data.result.value;
    const balanceSol = balanceLamports / 1000000000; // Convert lamports to SOL
    
    return `Your SOL balance is ${balanceSol.toFixed(4)} SOL`;
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
    return "Unable to fetch SOL balance at this time";
  }
};

/**
 * Launch a token on the specified platform
 */
export const launchToken = async (params: TokenParams, agentParams: AgentParams): Promise<TokenResult> => {
  try {
    const { platform, name, symbol, initialSol, uri } = params;
    
    if (!agentParams.publicKey || !agentParams.signTransaction) {
      VoiceSynthesis.speak("Please connect your wallet first to launch a token");
      return { 
        success: false, 
        error: "Wallet not connected" 
      };
    }
    
    // Generate a token art prompt and image
    const concept = `A token named ${name} with symbol ${symbol}`;
    const response = await chatWithCheshire(concept);
    VoiceSynthesis.speak(`Creating token ${name} with symbol ${symbol}...`);
    
    const imageUrl = await generateMemeImage(response.artPrompt || "Create token art");
    
    // Launch the token using PumpFun
    const pumpFunService = new PumpFunService({
      publicKey: agentParams.publicKey,
      signTransaction: agentParams.signTransaction,
      network: 'mainnet-beta'
    });
    
    const mintKeypair = Keypair.generate();
    
    VoiceSynthesis.speak(`Launching your ${name} token with ${initialSol} SOL liquidity...`);
    
    const result = await pumpFunService.createAndBuyToken(
      mintKeypair,
      {
        name,
        symbol,
        description: response.tokenDetails.description || `${name} - A community token on Solana`,
        imageUrl,
      },
      initialSol,
      1000n // You can adjust the token quantity as needed
    );
    
    if (result.success && result.tokenAddress) {
      VoiceSynthesis.speak(`Successfully launched ${name} token! The mint address is ${result.tokenAddress.substring(0, 6)}...${result.tokenAddress.substring(result.tokenAddress.length - 4)}`);
      
      return {
        success: true,
        mint: result.tokenAddress,
        signature: result.url // Using url as signature reference
      };
    } else {
      throw new Error(result.error || "Failed to launch token");
    }
    
  } catch (error) {
    console.error('Error launching token:', error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    VoiceSynthesis.speak(`Sorry, there was an error launching your token: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * End the conversation (used by voice agent)
 */
export const endConversation = async (item: string): Promise<string> => {
  VoiceSynthesis.speak("Goodbye! Have a great day.");
  return "Conversation ended";
};

/**
 * Perform arithmetic operations (used by voice agent)
 */
export const doArithmetic = async (operation: string, numbers: string[]): Promise<string> => {
  try {
    const parsedNumbers = numbers.map(num => parseFloat(num));
    
    if (parsedNumbers.some(isNaN)) {
      return "I couldn't parse those numbers correctly";
    }
    
    let result: number;
    switch (operation.toLowerCase()) {
      case 'add':
        result = parsedNumbers.reduce((a, b) => a + b, 0);
        break;
      case 'subtract':
        result = parsedNumbers.reduce((a, b, i) => i === 0 ? b : a - b, 0);
        break;
      case 'multiply':
        result = parsedNumbers.reduce((a, b) => a * b, 1);
        break;
      case 'divide':
        if (parsedNumbers.slice(1).some(n => n === 0)) {
          return "I can't divide by zero";
        }
        result = parsedNumbers.reduce((a, b, i) => i === 0 ? b : a / b, 1);
        break;
      default:
        return "I don't recognize that operation";
    }
    
    return `The result is ${result}`;
  } catch (error) {
    console.error('Error in arithmetic:', error);
    return "I had trouble calculating that";
  }
};
