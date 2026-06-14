import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Book, Code, Cpu, Lightbulb, Mic, Rocket, Zap } from 'lucide-react';

export function Contract() {
  const [contractCode, setContractCode] = useState<string>('');
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiResponse, setAiResponse] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  // Fetch the contract code
  useEffect(() => {
    const fetchContract = async () => {
      try {
        const response = await fetch('/api/contracts/token-launcher');
        const text = await response.text();
        setContractCode(text);
      } catch (error) {
        console.error('Error fetching contract:', error);
        // Fallback to local contract file
        try {
          const response = await fetch('/shared/contracts/token-launcher.rs');
          const text = await response.text();
          setContractCode(text);
        } catch (e) {
          console.error('Error fetching local contract:', e);
        }
      }
    };

    fetchContract();
  }, []);

  // Handle AI analysis
  const analyzeWithAI = async () => {
    if (!aiQuestion.trim()) return;
    
    setLoading(true);
    try {
      // Use xAI/Grok to analyze the contract code
      const response = await fetch('/api/ai/analyze-contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: aiQuestion,
          code: contractCode,
        }),
      });
      
      const data = await response.json();
      setAiResponse(data.response);
    } catch (error) {
      console.error('Error analyzing with AI:', error);
      setAiResponse("Sorry, there was an error analyzing the contract. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Features of the token launcher
  const features = [
    {
      id: 'voice',
      title: 'Voice Launch Technology',
      description: 'Launch and manage tokens using voice commands with secure voice verification.',
      icon: <Mic className="h-8 w-8 text-primary" />,
      details: 'Our voice launch technology allows you to create, deploy, and manage tokens using just your voice. Voice signatures are securely verified to ensure only authorized users can perform critical operations. The contract includes voice_authorize function with voice signature verification.'
    },
    {
      id: 'vesting',
      title: 'Vested Market Cap Locks',
      description: 'Built-in token vesting with time-locked release mechanisms for responsible growth.',
      icon: <Zap className="h-8 w-8 text-primary" />,
      details: 'Our vesting mechanism locks 50% of the token supply at launch, with gradual unlocks over time to ensure healthy price discovery and prevent market manipulation. The contract includes unlock_tokens function that releases 25% of locked tokens per period based on the configured vesting schedule.'
    },
    {
      id: 'streamflow',
      title: 'StreamFlow Integration',
      description: 'Native support for token streaming payments and continuous distributions.',
      icon: <Rocket className="h-8 w-8 text-primary" />,
      details: 'Our contract integrates with the StreamFlow protocol to enable continuous token streaming for salaries, subscriptions, and rewards. The configure_stream_flow function allows projects to set up streams with customizable start times, durations, and amounts.'
    },
    {
      id: 'agentic',
      title: 'Agentic Launches',
      description: 'AI agents for autonomous token management and strategy execution.',
      icon: <Cpu className="h-8 w-8 text-primary" />,
      details: 'Our contract supports AI-powered autonomous token management through configurable agents. The configure_agent function allows you to set up agents with specific parameters for automated tasks like liquidity management, buybacks, and marketing campaigns.'
    }
  ];

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-8">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">FunPump.ai Smart Contract</h1>
        <p className="text-muted-foreground">
          Explore the advanced smart contract powering our token launcher platform with AI integration.
        </p>
      </div>

      <Tabs defaultValue="code" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="code">Contract Code</TabsTrigger>
          <TabsTrigger value="features">Advanced Features</TabsTrigger>
          <TabsTrigger value="ai-analysis">AI Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="code" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Code className="mr-2 h-5 w-5" /> FunPump.ai Smart Contract
              </CardTitle>
              <CardDescription>
                The advanced FunPump.ai smart contract that powers our token launcher platform, written in Rust using the Anchor framework.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <pre className="overflow-auto p-4 rounded-md bg-zinc-900 text-zinc-100 text-sm font-mono">
                  {contractCode}
                </pre>
              </ScrollArea>
            </CardContent>
            <CardFooter>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Solana</Badge>
                <Badge variant="outline">Anchor</Badge>
                <Badge variant="outline">Rust</Badge>
                <Badge variant="outline">SPL Token</Badge>
                <Badge variant="outline">Voice Launch</Badge>
                <Badge variant="outline">Vesting</Badge>
                <Badge variant="outline">AI Integration</Badge>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="features" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map(feature => (
              <Card 
                key={feature.id} 
                className={`cursor-pointer transition-all ${selectedFeature === feature.id ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setSelectedFeature(feature.id === selectedFeature ? null : feature.id)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center">
                    {feature.icon}
                    <span className="ml-2">{feature.title}</span>
                  </CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                {selectedFeature === feature.id && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.details}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Contract Address</AlertTitle>
            <AlertDescription>
              FunPumPAiMeme5X6AcZLGKVhZB1a5teRL1a9e9M
            </AlertDescription>
          </Alert>
        </TabsContent>
        
        <TabsContent value="ai-analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="mr-2 h-5 w-5" /> AI Contract Analysis
              </CardTitle>
              <CardDescription>
                Ask questions about the contract code and get AI-powered insights using xAI and Grok.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input 
                  placeholder="Ask a question about the contract..." 
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={analyzeWithAI} disabled={loading}>
                  {loading ? 'Analyzing...' : 'Ask AI'}
                </Button>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="text-lg font-medium">AI Response</h3>
                <ScrollArea className="h-[300px] w-full rounded-md border p-4 bg-muted/30">
                  {aiResponse ? (
                    <div className="space-y-4">
                      <p className="whitespace-pre-wrap">{aiResponse}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Ask a question to see AI analysis</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
              
              <div className="pt-2">
                <h3 className="text-sm font-medium mb-2">Example questions:</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAiQuestion("Explain how the voice verification feature works in this contract.")}>
                    Voice verification
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAiQuestion("How does the vesting mechanism work for token unlocking?")}>
                    Vesting mechanism
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAiQuestion("Explain the StreamFlow integration in this contract.")}>
                    StreamFlow integration
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAiQuestion("How does the AI agent configuration work?")}>
                    AI agent system
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Contract;