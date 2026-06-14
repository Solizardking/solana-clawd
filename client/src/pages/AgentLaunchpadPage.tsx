import React from 'react';
import AgentLaunchpad from '../components/AgentLaunchpad';
import { useLocalStorage } from '../hooks/useLocalStorage';

export default function AgentLaunchpadPage() {
  // In a real implementation, this would come from wallet connection
  // For now, we'll use a mock wallet address from localStorage
  const [walletAddress] = useLocalStorage<string>("connectedWallet", "");
  
  return (
    <div className="container py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">AI Agent Launchpad</h1>
        <p className="text-xl">Create and deploy your own AI-powered tokens</p>
      </div>
      
      <AgentLaunchpad wallet={walletAddress} />
      
      <div className="mt-12 p-6 bg-secondary/20 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">How It Works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground mb-4">1</div>
            <h3 className="text-lg font-medium mb-2">Create Your Agent</h3>
            <p className="text-center text-muted-foreground">Define your AI agent's personality, capabilities, and complexity level.</p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground mb-4">2</div>
            <h3 className="text-lg font-medium mb-2">Configure Token</h3>
            <p className="text-center text-muted-foreground">Set your token's name, symbol, and initial pricing parameters.</p>
          </div>
          
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground mb-4">3</div>
            <h3 className="text-lg font-medium mb-2">Launch & Control</h3>
            <p className="text-center text-muted-foreground">Deploy your token with AI-powered capabilities baked into the smart contract.</p>
          </div>
        </div>
      </div>
      
      <div className="mt-12 text-center text-sm text-muted-foreground">
        <p>Powered by xAI Grok API and Solana blockchain</p>
      </div>
    </div>
  );
}