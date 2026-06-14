import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GithubIcon, BookOpen, Code, MessageSquare, ImageIcon } from 'lucide-react';

// Contract features for the gallery
const contractFeatures = [
  {
    title: "Automated Price Discovery",
    description: "Dynamic bonding curve mechanism for token price discovery",
    icon: "📈"
  },
  {
    title: "Secure Trading",
    description: "Built-in slippage protection and price impact calculations",
    icon: "🔒"
  },
  {
    title: "Fee Distribution",
    description: "Automated fee collection and distribution to stakeholders",
    icon: "💰"
  }
];

export function ContractExplorer() {
  const [selectedTab, setSelectedTab] = useState("code");
  const [aiResponse, setAiResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [contractCode, setContractCode] = useState("");

  useEffect(() => {
    fetchContractCode();
  }, []);

  const fetchContractCode = async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/8bitsats/FunPump-Contract/main/programs/token_launcher/src/lib.rs');
      const code = await response.text();
      setContractCode(code);
    } catch (error) {
      console.error('Error fetching contract code:', error);
      setContractCode('// Error loading contract code. Please try again later.');
    }
  };

  const handleAskAi = async (question: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/explain-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      const data = await response.json();
      setAiResponse(data.response);
    } catch (error) {
      console.error('Error asking AI:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
          FunPump Smart Contract Explorer
        </h1>
        <a 
          href="https://github.com/8bitsats/FunPump-Contract" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-purple-400 hover:text-purple-300"
        >
          <GithubIcon size={20} />
          View on GitHub
        </a>
      </div>

      <Tabs defaultValue="code" className="w-full" onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="code" className="flex items-center gap-2">
            <Code size={16} />
            Contract Code
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <BookOpen size={16} />
            Documentation
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare size={16} />
            AI Assistant
          </TabsTrigger>
          <TabsTrigger value="gallery" className="flex items-center gap-2">
            <ImageIcon size={16} />
            Features
          </TabsTrigger>
        </TabsList>

        <TabsContent value="code">
          <Card className="bg-black/40 border border-purple-500/30">
            <ScrollArea className="h-[600px] w-full p-4">
              <pre className="language-rust">
                <code>{contractCode}</code>
              </pre>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card className="bg-black/40 border border-purple-500/30 p-6">
            <div className="prose prose-invert max-w-none">
              <h2 className="text-2xl font-bold text-purple-400 mb-4">
                FunPump Contract Documentation
              </h2>
              <div className="space-y-4">
                <section>
                  <h3 className="text-xl font-semibold text-purple-300">Overview</h3>
                  <p className="text-gray-300">
                    FunPump is an innovative token launch platform utilizing bonding curves
                    for efficient price discovery and automated market making.
                  </p>
                </section>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="chat">
          <Card className="bg-black/40 border border-purple-500/30 p-6">
            <div className="space-y-4">
              <div className="flex flex-col gap-4">
                <Button 
                  onClick={() => handleAskAi("How does the bonding curve work?")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  How does the bonding curve work?
                </Button>
                <Button 
                  onClick={() => handleAskAi("Explain the fee distribution system")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  Explain the fee distribution system
                </Button>
                <Button 
                  onClick={() => handleAskAi("What security features are implemented?")}
                  disabled={isLoading}
                  variant="outline"
                  className="w-full"
                >
                  What security features are implemented?
                </Button>
              </div>
              {aiResponse && (
                <div className="mt-6 p-4 rounded-lg bg-purple-950/20 border border-purple-500/30">
                  <p className="text-purple-200">{aiResponse}</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="gallery">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {contractFeatures.map((feature, index) => (
              <Card key={index} className="bg-black/40 border border-purple-500/30 p-6">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-purple-400 mb-2">
                  {feature.title}
                </h3>
                <p className="text-purple-200/60">{feature.description}</p>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}