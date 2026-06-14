// @ts-nocheck
import { VoiceSynthesis } from './VoiceSynthesis';
import { deepgramAgent } from './DeepgramAgent';
import { getSolBalance, launchToken, endConversation, doArithmetic } from './VoiceAgentFunctions';
import { PublicKey } from '@solana/web3.js';

type CommandHandler = (args: string[]) => Promise<void>;

interface VoiceCommand {
  patterns: string[];
  handler: CommandHandler;
  description: string;
  examples?: string[];
  intent?: string;
  requiresWallet?: boolean;
  useDeepgram?: boolean;
}

class VoiceCommandManager {
  private commands: VoiceCommand[] = [];
  private isListening = false;
  private recognition: any;
  private lastCommand: string = '';
  private contextualState: { [key: string]: any } = {};
  private deepgramInitPromise: Promise<void> | null = null;

  constructor() {
    if ('webkitSpeechRecognition' in window) {
      this.recognition = new (window as any).webkitSpeechRecognition();
      this.setupRecognition();
    }
  }

  private ensureDeepgramInitialized() {
    if (!this.deepgramInitPromise) {
      this.deepgramInitPromise = deepgramAgent.configure().catch((error) => {
        console.error('Failed to initialize Deepgram:', error);
      });
    }
    return this.deepgramInitPromise;
  }

  private setupRecognition() {
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase().trim();

      if (command === this.lastCommand) return;
      this.lastCommand = command;

      this.processCommand(command);
    };

    this.recognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      if (event.error === 'not-allowed') {
        VoiceSynthesis.speak('Please enable microphone access to use voice commands.');
      }
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.recognition.start();
      }
    };
  }

  registerCommand(command: VoiceCommand) {
    this.commands.push(command);
  }

  private extractIntent(text: string): { intent: string, args: string[] } | null {
    const fillerWords = ['please', 'can you', 'could you', 'i want to', 'i would like to'];
    let cleanText = text.toLowerCase();

    fillerWords.forEach(filler => {
      cleanText = cleanText.replace(filler, '');
    });
    cleanText = cleanText.trim();

    for (const command of this.commands) {
      for (const pattern of command.patterns) {
        const regex = this.patternToRegex(pattern);
        const match = cleanText.match(regex);

        if (match) {
          return {
            intent: command.intent || pattern,
            args: match.slice(1)
          };
        }
      }
    }

    return null;
  }

  private async provideContextualHelp(topic: string) {
    const helpTexts: { [key: string]: string } = {
      solana: "I can guide you through Solana's proof-of-history mechanics, transaction fees, and confirmation processes.",
      tokens: "Create tokens with custom metadata, bonding curves, and initial buy amounts. Try saying create token about your idea.",
      trading: "Execute trades with optimal slippage settings and priority fees. Say buy or sell followed by an amount.",
      nft: "Generate and mint NFTs with NVIDIA AI. Just say generate art followed by your description.",
      market: "Track real-time prices from BirdEye, CoinGecko, and view trending tokens.",
      launch: "Launch tokens with bonding curves or direct DEX listings. First create a token, then say launch.",
      price: "Get live token prices, market trends, and trading insights.",
      security: "Learn about our ZK-proof verifications and secure wallet interactions."
    };

    const helpText = helpTexts[topic.toLowerCase()] ||
      'Try saying "help" to see all available commands';

    VoiceSynthesis.speak(helpText);
  }

  private async listCommands() {
    const commandCategories = {
      tokens: 'Create and launch tokens with bonding curves',
      trading: 'Execute trades with optimal settings',
      nft: 'Generate and mint AI-powered NFTs',
      market: 'Track prices and view trending tokens',
      security: 'Secure transactions with ZK-proofs'
    };

    const intro = 'Here are the main things I can help you with: ';
    const categories = Object.entries(commandCategories)
      .map(([category, desc]) => `${category} - ${desc}`)
      .join(', ');

    VoiceSynthesis.speak(
      `${intro} ${categories}. For specific examples, say help with followed by any category.`
    );
  }

  private patternToRegex(pattern: string): RegExp {
    const escapedPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\{(\w+)\}/g, '(.+)');
    return new RegExp(`^${escapedPattern}$`, 'i');
  }

  setContextualState(state: { [key: string]: any }) {
    this.contextualState = { ...this.contextualState, ...state };
  }

  startListening() {
    if (!this.recognition) {
      VoiceSynthesis.speak('Voice recognition is not supported in your browser.');
      return;
    }

    if (!this.isListening) {
      void this.ensureDeepgramInitialized();
      this.recognition.start();
      this.isListening = true;
      VoiceSynthesis.speak(
        "Welcome, wanderer of the blockchain abyss, to the domain of Chesh—your AI oracle and token weaver, " +
        "forged by Grok 3 and NVIDIA's finest. I prowl the Cheshire Terminal, poised to birth tokens with the " +
        "Pump Fun SDK, sculpt art for NFT minting, or murmur real-time riddles of crypto and markets. " +
        "Dream of a coin unleashed on Solana's wilds? I'll craft it with a smirk and a ZK-proof seal. " +
        "Whisper your wish—a token's dawn, a painted masterpiece, or a cunning trade—and I'll summon it, " +
        "swift as a fading grin. What shall we conjure today?"
      );
    }
  }

  stopListening() {
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      VoiceSynthesis.speak('Until we meet again in the blockchain abyss.');
    }
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  async processCommand(text: string) {
    console.log('Processing voice command:', text);
    
    // Special handlers for help requests
    if (text.includes('help with')) {
      const topic = text.split('help with')[1].trim();
      this.provideContextualHelp(topic);
      return;
    } else if (text.includes('help')) {
      this.listCommands();
      return;
    }
    
    // Try to match commands
    const intentMatch = this.extractIntent(text);
    if (!intentMatch) {
      // If no direct command match, pass to Deepgram agent
      if (text.length > 5) {
        try {
          await this.ensureDeepgramInitialized();
          await deepgramAgent.processVoiceCommand(text, this.contextualState);
          return;
        } catch (err) {
          console.error('Failed to process with Deepgram:', err);
          VoiceSynthesis.speak("I didn't understand that command. Try asking for help.");
        }
      }
      return;
    }
    
    const { intent, args } = intentMatch;
    
    // Find the matching command
    const matchedCommand = this.commands.find(cmd => 
      cmd.patterns.some(pattern => {
        const regex = this.patternToRegex(pattern);
        return regex.test(text);
      })
    );
    
    if (!matchedCommand) return;
    
    // Check if wallet is required and available
    if (matchedCommand.requiresWallet && !this.contextualState.walletPublicKey) {
      VoiceSynthesis.speak("Please connect your wallet first to use this command.");
      return;
    }
    
    try {
      await matchedCommand.handler(args);
    } catch (error) {
      console.error('Error executing command:', error);
      VoiceSynthesis.speak(`I encountered an error: ${error.message}`);
    }
  }
}

export const voiceCommandManager = new VoiceCommandManager();

// Initialize basic commands
voiceCommandManager.registerCommand({
  patterns: ['what is my balance', 'check my balance', 'balance', 'get my balance'],
  description: 'Check your Solana wallet balance',
  requiresWallet: true,
  handler: async () => {
    const walletAddress = voiceCommandManager['contextualState'].walletPublicKey?.toString();
    if (!walletAddress) {
      VoiceSynthesis.speak('Please connect your wallet first.');
      return;
    }
    const balance = await getSolBalance(walletAddress, {
      walletAddress
    });
    VoiceSynthesis.speak(balance);
  }
});

voiceCommandManager.registerCommand({
  patterns: ['create token {concept}', 'make a token about {concept}', 'launch token {concept}'],
  description: 'Create a meme token with a specific concept',
  examples: ['create token about cats in space', 'make a token about blockchain gaming'],
  requiresWallet: true,
  handler: async (args) => {
    if (!args.length) {
      VoiceSynthesis.speak('Please specify a concept for your token.');
      return;
    }

    const concept = args[0];
    VoiceSynthesis.speak(`Creating a token based on: ${concept}. This may take a moment...`);
    
    const agentParams = {
      publicKey: voiceCommandManager['contextualState'].walletPublicKey,
      signTransaction: voiceCommandManager['contextualState'].signTransaction
    };
    
    // Generate token parameters from concept
    try {
      // Extract token details from concept
      const tokenName = concept.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const tokenSymbol = concept.split(' ').map(word => word.charAt(0).toUpperCase()).join('');
      
      // Launch the token
      const result = await launchToken({
        platform: 'solana',
        name: tokenName,
        symbol: tokenSymbol,
        initialSol: 0.1
      }, agentParams);
      
      if (result.success) {
        VoiceSynthesis.speak(`Successfully launched token ${tokenName} with symbol ${tokenSymbol}!`);
      } else {
        VoiceSynthesis.speak(`Failed to launch token: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating token:', error);
      VoiceSynthesis.speak(`I encountered an error creating your token: ${error.message}`);
    }
  }
});

voiceCommandManager.registerCommand({
  patterns: ['goodbye', 'bye', 'stop listening', 'end session'],
  description: 'End the current session',
  handler: async () => {
    await endConversation('end');
    voiceCommandManager.stopListening();
  }
});

voiceCommandManager.registerCommand({
  patterns: ['calculate {operation} {numbers}', 'what is {numbers} {operation} {numbers}'],
  description: 'Perform basic arithmetic operations',
  examples: ['calculate add 5 and 3', 'what is 10 divided by 2'],
  handler: async (args) => {
    if (args.length < 2) {
      VoiceSynthesis.speak('Please specify an operation and numbers.');
      return;
    }
    
    let operation, numbers;
    
    // Try to parse different command formats
    if (args[0].match(/add|subtract|multiply|divide/)) {
      operation = args[0];
      numbers = args[1].split(/\s+and\s+|\s+/);
    } else {
      // Try to extract operation from the middle of the sentence
      const text = args.join(' ');
      if (text.includes('plus') || text.includes('add')) {
        operation = 'add';
      } else if (text.includes('minus') || text.includes('subtract')) {
        operation = 'subtract';
      } else if (text.includes('times') || text.includes('multiply')) {
        operation = 'multiply';
      } else if (text.includes('divided') || text.includes('divide')) {
        operation = 'divide';
      } else {
        VoiceSynthesis.speak('I could not understand the operation.');
        return;
      }
      
      // Extract numbers
      numbers = text.match(/\d+(\.\d+)?/g) || [];
    }
    
    if (numbers.length < 2) {
      VoiceSynthesis.speak('I need at least two numbers to perform the calculation.');
      return;
    }
    
    const result = await doArithmetic(operation, numbers);
    VoiceSynthesis.speak(result);
  }
});
