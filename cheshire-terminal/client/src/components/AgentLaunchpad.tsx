import React, { useState, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket, MessageType } from "../hooks/useWebSocket";
import { useAgentDNA, formatDNA } from "../hooks/useAgentDNA";

// Define agent types with descriptions
const AGENT_TYPES = {
  oracle: {
    name: "Oracle",
    description: "Price prediction and market analysis",
    icon: "📊"
  },
  creator: {
    name: "Creator",
    description: "Content and meme creation",
    icon: "🎨"
  },
  analyst: {
    name: "Analyst",
    description: "Technical and fundamental analysis",
    icon: "🔍"
  },
  community: {
    name: "Community",
    description: "Community management and moderation",
    icon: "👥"
  },
  trader: {
    name: "Trader",
    description: "Trading strategies and execution",
    icon: "📈"
  }
};

// Define personality types with descriptions
const PERSONALITY_TYPES = {
  professional: {
    name: "Professional",
    description: "Formal, precise, and sophisticated",
    icon: "👔"
  },
  friendly: {
    name: "Friendly",
    description: "Warm, approachable, and helpful",
    icon: "😊"
  },
  witty: {
    name: "Witty",
    description: "Clever, humorous, and entertaining",
    icon: "😏"
  },
  technical: {
    name: "Technical",
    description: "Detailed, precise, and data-driven",
    icon: "🔧"
  },
  creative: {
    name: "Creative",
    description: "Imaginative, expressive, and innovative",
    icon: "🎭"
  }
};

export default function AgentLaunchpad({ wallet = "" }) {
  // State for form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("");
  const [personality, setPersonality] = useState("");
  const [complexity, setComplexity] = useState(5);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<any>(null);
  
  // Launch-related state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [initialPrice, setInitialPrice] = useState("0.0001");
  const [launchType, setLaunchType] = useState("1"); // Default to PumpFun
  const [isLaunching, setIsLaunching] = useState(false);
  
  // Hooks
  const { toast } = useToast();
  const { sendMessage, registerMessageHandler, isConnected, clientId } = useWebSocket();
  const { generateDNA, dnaHash, isGenerating } = useAgentDNA();

  // Form validation
  const isCreateFormValid = name && agentType && personality && complexity >= 1 && complexity <= 10 && wallet;
  const isLaunchFormValid = createdAgent && tokenName && tokenSymbol && initialPrice && !isNaN(parseFloat(initialPrice)) && parseFloat(initialPrice) > 0;

  // Register WebSocket handlers
  useEffect(() => {
    if (!isConnected) return;
    
    const unregisterAgentCreated = registerMessageHandler(MessageType.AGENT_CREATED, (data) => {
      console.log("Agent created:", data);
      setCreatedAgent(data.data);
      setIsCreating(false);
      
      toast({
        title: "Agent Created Successfully",
        description: `Your agent ${data.data.name} has been created with DNA: ${formatDNA(data.data.dnaHash)}`,
      });
    });
    
    const unregisterLaunchEvents = registerMessageHandler(MessageType.AGENT_LAUNCH_COMPLETE, (data) => {
      console.log("Agent launch complete:", data);
      setIsLaunching(false);
      
      toast({
        title: "Token Launch Complete",
        description: `Your token ${data.data?.tokenName} (${data.data?.tokenSymbol}) has been launched successfully.`,
      });
    });
    
    const unregisterLaunchFailed = registerMessageHandler(MessageType.AGENT_LAUNCH_FAILED, (data) => {
      console.log("Agent launch failed:", data);
      setIsLaunching(false);
      
      toast({
        title: "Token Launch Failed",
        description: data.error || "There was an error launching your token.",
        variant: "destructive"
      });
    });
    
    return () => {
      unregisterAgentCreated();
      unregisterLaunchEvents();
      unregisterLaunchFailed();
    };
  }, [isConnected, registerMessageHandler, toast]);

  // Handle agent creation
  const handleCreateAgent = useCallback(async () => {
    if (!isCreateFormValid || !isConnected) return;
    
    try {
      setIsCreating(true);
      
      // First, generate DNA on the client side
      const dna = await generateDNA({
        name,
        type: agentType,
        personality,
        capabilities,
        complexity
      });
      
      console.log("Generated DNA:", dna);
      
      // Then send creation request to the server
      const success = sendMessage("create_agent", {
        name,
        type: agentType,
        personality,
        capabilities,
        complexity,
        description,
        wallet
      });
      
      if (!success) {
        throw new Error("Failed to send agent creation message");
      }
      
      // Note: The actual agent creation result will be handled by the WebSocket event handler
    } catch (error) {
      console.error("Error creating agent:", error);
      setIsCreating(false);
      
      toast({
        title: "Agent Creation Failed",
        description: error instanceof Error ? error.message : "There was an error creating your agent.",
        variant: "destructive"
      });
    }
  }, [isCreateFormValid, isConnected, generateDNA, name, agentType, personality, capabilities, complexity, description, wallet, sendMessage, toast]);

  // Handle token launch
  const handleLaunchToken = useCallback(() => {
    if (!isLaunchFormValid || !isConnected || !createdAgent) return;
    
    try {
      setIsLaunching(true);
      
      // Send launch request to the server
      const success = sendMessage("launch_token", {
        agentId: createdAgent.id,
        tokenName,
        tokenSymbol: tokenSymbol.toUpperCase(),
        wallet,
        initialPrice: parseFloat(initialPrice),
        launchType: parseInt(launchType, 10)
      });
      
      if (!success) {
        throw new Error("Failed to send token launch message");
      }
      
      toast({
        title: "Token Launch Initiated",
        description: `Launch process started for ${tokenName} (${tokenSymbol.toUpperCase()})`,
      });
      
      // The actual launch result will be handled by the WebSocket event handlers
    } catch (error) {
      console.error("Error launching token:", error);
      setIsLaunching(false);
      
      toast({
        title: "Token Launch Failed",
        description: error instanceof Error ? error.message : "There was an error launching your token.",
        variant: "destructive"
      });
    }
  }, [isLaunchFormValid, isConnected, createdAgent, tokenName, tokenSymbol, wallet, initialPrice, launchType, sendMessage, toast]);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">AI Agent Launchpad</CardTitle>
        <CardDescription>Create and launch AI-powered tokens</CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="create">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Agent</TabsTrigger>
            <TabsTrigger value="launch" disabled={!createdAgent}>Launch Token</TabsTrigger>
          </TabsList>
          
          {/* Create Agent Tab */}
          <TabsContent value="create">
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter a name for your agent"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="wallet">Creator Wallet</Label>
                  <Input
                    id="wallet"
                    value={wallet || "Connect wallet to continue"}
                    disabled
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-type">Agent Type</Label>
                  <Select value={agentType} onValueChange={setAgentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(AGENT_TYPES).map(([key, { name, description, icon }]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center">
                            <span className="mr-2">{icon}</span>
                            <span>{name} - {description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="personality">Personality</Label>
                  <Select value={personality} onValueChange={setPersonality}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select personality" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERSONALITY_TYPES).map(([key, { name, description, icon }]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center">
                            <span className="mr-2">{icon}</span>
                            <span>{name} - {description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="complexity">Complexity Level: {complexity}</Label>
                <Slider
                  id="complexity"
                  min={1}
                  max={10}
                  step={1}
                  value={[complexity]}
                  onValueChange={(values) => setComplexity(values[0])}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Simple</span>
                  <span>Advanced</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Optional description for your agent"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              
              {dnaHash && (
                <div className="p-3 bg-secondary/30 rounded-md">
                  <p className="text-sm font-medium">Agent DNA: <span className="font-mono">{formatDNA(dnaHash)}</span></p>
                </div>
              )}
            </div>
            
            <div className="mt-6">
              <Button 
                onClick={handleCreateAgent} 
                disabled={!isCreateFormValid || isCreating || !isConnected}
                className="w-full"
              >
                {isCreating ? "Creating Agent..." : "Create Agent"}
              </Button>
            </div>
          </TabsContent>
          
          {/* Launch Token Tab */}
          <TabsContent value="launch">
            {createdAgent ? (
              <div className="space-y-4 mt-4">
                <div className="p-3 bg-secondary/30 rounded-md mb-4">
                  <h3 className="font-medium">Selected Agent</h3>
                  <p className="text-sm">
                    <span className="font-medium">{createdAgent.name}</span> - {createdAgent.type} agent with {createdAgent.personality} personality
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground">DNA: {formatDNA(createdAgent.dnaHash)}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="token-name">Token Name</Label>
                    <Input
                      id="token-name"
                      placeholder="Enter token name"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="token-symbol">Token Symbol</Label>
                    <Input
                      id="token-symbol"
                      placeholder="Enter token symbol (e.g., BTC)"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                      maxLength={5}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="initial-price">Initial Price (SOL)</Label>
                    <Input
                      id="initial-price"
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      placeholder="0.0001"
                      value={initialPrice}
                      onChange={(e) => setInitialPrice(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="launch-type">Launch Type</Label>
                    <Select value={launchType} onValueChange={setLaunchType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select launch type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Bonding Curve</SelectItem>
                        <SelectItem value="1">PumpFun AMM</SelectItem>
                        <SelectItem value="2">FunPump Platform</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="mt-6">
                  <Button 
                    onClick={handleLaunchToken} 
                    disabled={!isLaunchFormValid || isLaunching || !isConnected}
                    className="w-full"
                  >
                    {isLaunching ? "Launching Token..." : "Launch Token with Agent"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p>Please create an agent first before launching a token.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Connection Status: {isConnected ? `Connected (ID: ${clientId?.substring(0, 6)}...)` : "Disconnected"}
        </p>
        <p className="text-xs text-muted-foreground">
          Powered by xAI Grok API
        </p>
      </CardFooter>
    </Card>
  );
}