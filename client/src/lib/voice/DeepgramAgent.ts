import { VoiceSynthesis } from './VoiceSynthesis';
import { createClient, AgentEvents } from '@deepgram/sdk';
import { PumpFunSDK } from '../pumpFunSdk';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

// Initialize Deepgram client
const deepgramApiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
const heliusRpcUrl = import.meta.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

export class DeepgramAgent {
  private connection: Connection;
  private pumpFunSdk: PumpFunSDK;
  private deepgramClient: any;

  constructor() {
    this.connection = new Connection(heliusRpcUrl, "confirmed");
    this.pumpFunSdk = new PumpFunSDK(this.connection);
    this.deepgramClient = deepgramApiKey ? createClient(deepgramApiKey) : null;
  }

  private tokenFunctionDefinitions = [
    {
      name: 'create_token',
      description: 'Creates a new meme token on Solana using PumpFun',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Token name'
          },
          symbol: {
            type: 'string',
            description: 'Token symbol'
          },
          description: {
            type: 'string',
            description: 'Token description'
          },
          initialBuyAmount: {
            type: 'string',
            description: 'Initial buy amount in SOL'
          }
        },
        required: ['name', 'symbol', 'description']
      }
    },
    {
      name: 'buy_token',
      description: 'Buy a specific token using PumpFun',
      parameters: {
        type: 'object',
        properties: {
          mintAddress: {
            type: 'string',
            description: 'Token mint address'
          },
          amount: {
            type: 'string',
            description: 'Amount of SOL to spend'
          },
          slippage: {
            type: 'string',
            description: 'Slippage tolerance in basis points (default: 500)'
          }
        },
        required: ['mintAddress', 'amount']
      }
    }
  ];

  async configure() {
    if (!this.deepgramClient) {
      console.warn("Deepgram API key not configured; voice agent disabled.");
      return;
    }

    const agent = this.deepgramClient.agent();
    
    agent.on(AgentEvents.Open, async () => {
      await agent.configure({
        audio: {
          input: {
            encoding: "linear16",
            sampleRate: 44100,
          },
          output: {
            encoding: "linear16",
            sampleRate: 16000,
            container: "wav",
          },
        },
        agent: {
          listen: {
            model: "nova-2",
          },
          speak: {
            model: "aura-asteria-en",
          },
          think: {
            provider: {
              type: "anthropic",
            },
            model: "claude-3-haiku-20240307",
            functions: this.tokenFunctionDefinitions
          },
        },
      });
    });

    // Handle function calls
    agent.on('FunctionCallRequest', async (data: any) => {
      const { function_name, input } = data;
      
      try {
        switch (function_name) {
          case 'create_token':
            const mint = Keypair.generate();
            const creator = Keypair.generate(); // Replace with actual wallet

            const metadata = {
              name: input.name,
              symbol: input.symbol,
              description: input.description,
              file: await this.generateTokenImage(input.description)
            };

            const result = await this.pumpFunSdk.createAndBuy(
              creator,
              mint,
              metadata,
              BigInt(input.initialBuyAmount || '1000000000'), // Default 1 SOL
              500n // Default slippage
            );

            VoiceSynthesis.speak(`Created token ${input.name} with symbol ${input.symbol}`);
            return result;

          case 'buy_token':
            // Implementation for buy_token
            break;
        }
      } catch (error) {
        console.error('Function call error:', error);
        VoiceSynthesis.speak('Sorry, there was an error processing your request');
      }
    });

    // Keep connection alive
    setInterval(() => {
      agent.keepAlive();
    }, 5000);
  }

  private async generateTokenImage(description: string): Promise<Blob> {
    // TODO: Implement image generation
    // For now return a placeholder
    return new Blob([''], { type: 'image/png' });
  }
}

export const deepgramAgent = new DeepgramAgent();
