import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Send, BrainCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { nvidiaAI, NvidiaModelInfo } from '../lib/nvidia';
import AnimatedGradientText from '../components/AnimatedGradientText';

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  context_window: number;
}

const NvidiaTestPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const { toast } = useToast();

  // Fetch available models
  const { data: modelsData, isLoading: isLoadingModels, error: modelsError } = useQuery({
    queryKey: ['/api/nvidia/models'],
    queryFn: async () => {
      const models = await nvidiaAI.getAvailableModels();
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0].id);
      }
      return { models };
    },
  });

  // Safe access to models data
  const safeModelsData = modelsData || { models: [] };

  useEffect(() => {
    if (modelsError) {
      toast({
        title: "Error loading models",
        description: "Could not load NVIDIA AI models. Please try again later.",
        variant: "destructive"
      });
    }
  }, [modelsError, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userInput.trim() || isProcessing) return;
    
    const userMessage = userInput.trim();
    setUserInput('');
    
    // Add user message to chat history
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    
    try {
      setIsProcessing(true);
      
      // Call NVIDIA AI
      const messages = [
        { role: 'user' as const, content: userMessage }
      ];
      
      // Use streaming response
      setIsStreaming(true);
      setStreamingResponse('');
      
      // Add empty assistant message to chat history
      setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);
      
      await nvidiaAI.streamChat(
        messages,
        (chunk) => {
          setStreamingResponse(prev => prev + chunk);
          // Also update the chat history
          setChatHistory(prev => {
            const newHistory = [...prev];
            if (newHistory.length > 0) {
              const lastMessage = newHistory[newHistory.length - 1];
              if (lastMessage.role === 'assistant') {
                lastMessage.content += chunk;
              }
            }
            return newHistory;
          });
        },
        selectedModel
      );
      
      setIsStreaming(false);
    } catch (error) {
      console.error('NVIDIA AI error:', error);
      toast({
        title: "Error",
        description: `Failed to get response from NVIDIA AI: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      
      // Remove the empty assistant message if there was an error
      setChatHistory(prev => {
        const newHistory = [...prev];
        if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'assistant') {
          newHistory.pop();
        }
        return newHistory;
      });
    } finally {
      setIsProcessing(false);
      setIsStreaming(false);
    }
  };

  const handleTokenAnalysis = async () => {
    if (!tokenAddress.trim() || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      // Add request to chat history
      setChatHistory(prev => [...prev, { 
        role: 'user', 
        content: `Please analyze this token: ${tokenAddress}` 
      }]);
      
      // Add empty assistant message to chat history
      setChatHistory(prev => [...prev, { role: 'assistant', content: '' }]);
      
      // Start streaming response
      setIsStreaming(true);
      setStreamingResponse('');
      
      await nvidiaAI.streamChat(
        [
          { 
            role: 'system', 
            content: `You are a cryptocurrency expert specializing in token security analysis.
                     Analyze the provided token address from Solana network and provide a detailed security assessment.
                     Focus on potential red flags and overall safety for investors.` 
          },
          { 
            role: 'user', 
            content: `Please analyze this Solana token address: ${tokenAddress}
                     Provide a comprehensive security analysis with these sections:
                     1. Overview
                     2. Security Score (0-100)
                     3. Risk Factors
                     4. Recommendations` 
          }
        ],
        (chunk) => {
          setStreamingResponse(prev => prev + chunk);
          // Also update the chat history
          setChatHistory(prev => {
            const newHistory = [...prev];
            if (newHistory.length > 0) {
              const lastMessage = newHistory[newHistory.length - 1];
              if (lastMessage.role === 'assistant') {
                lastMessage.content += chunk;
              }
            }
            return newHistory;
          });
        },
        selectedModel
      );
      
      setIsStreaming(false);
    } catch (error) {
      console.error('Token analysis error:', error);
      toast({
        title: "Analysis Error",
        description: `Failed to analyze token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
      
      // Remove the empty assistant message if there was an error
      setChatHistory(prev => {
        const newHistory = [...prev];
        if (newHistory.length > 0 && newHistory[newHistory.length - 1].role === 'assistant') {
          newHistory.pop();
        }
        return newHistory;
      });
    } finally {
      setIsProcessing(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <div className="mb-8 text-center">
        <AnimatedGradientText size="3xl" className="font-bold" as="h1">
          NVIDIA AI Integration
        </AnimatedGradientText>
        <p className="text-gray-400 mt-2">Test NVIDIA's advanced AI models for deep reasoning and analysis</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="chat">Chat Completion</TabsTrigger>
          <TabsTrigger value="token-analysis">Token Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="chat">
          <Card>
            <CardHeader>
              <CardTitle>NVIDIA Chat Completion</CardTitle>
              <CardDescription>
                Test completions with NVIDIA AI models like DeepSeek, Qwen, Mistral, and Llama
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div>
                  <label className="block mb-2 text-sm font-medium">Model</label>
                  <Select 
                    value={selectedModel} 
                    onValueChange={setSelectedModel}
                    disabled={isLoadingModels || isProcessing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {safeModelsData?.models?.map((model: ModelInfo) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="border rounded-md p-4 max-h-[400px] overflow-y-auto bg-black/30">
                  {chatHistory.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <BrainCog className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Start a conversation with NVIDIA AI</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                      >
                        <div 
                          className={`inline-block px-4 py-2 rounded-lg ${
                            msg.role === 'user' 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-gray-800 text-gray-100'
                          }`}
                        >
                          <div className="text-xs opacity-70 mb-1">
                            {msg.role === 'user' ? 'You' : 'NVIDIA AI'}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))
                  )}
                  {isStreaming && (
                    <div className="flex justify-center my-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
                
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Textarea 
                    placeholder="Type your message..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    disabled={isProcessing}
                    className="resize-none"
                    rows={3}
                  />
                  <Button 
                    type="submit" 
                    disabled={isProcessing || !userInput.trim()}
                    className="self-end"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="token-analysis">
          <Card>
            <CardHeader>
              <CardTitle>Token Security Analysis</CardTitle>
              <CardDescription>
                Analyze Solana tokens for security risks and investment safety
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div>
                  <label className="block mb-2 text-sm font-medium">Model</label>
                  <Select 
                    value={selectedModel} 
                    onValueChange={setSelectedModel}
                    disabled={isLoadingModels || isProcessing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {safeModelsData?.models?.map((model: ModelInfo) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Solana token address..."
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    disabled={isProcessing}
                  />
                  <Button 
                    onClick={handleTokenAnalysis}
                    disabled={isProcessing || !tokenAddress.trim()}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <BrainCog className="h-4 w-4 mr-2" />
                    )}
                    Analyze
                  </Button>
                </div>
                
                <div className="border rounded-md p-4 max-h-[400px] overflow-y-auto bg-black/30">
                  {chatHistory.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <BrainCog className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>Enter a token address to analyze its security</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                      >
                        <div 
                          className={`inline-block px-4 py-2 rounded-lg ${
                            msg.role === 'user' 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-gray-800 text-gray-100'
                          }`}
                        >
                          <div className="text-xs opacity-70 mb-1">
                            {msg.role === 'user' ? 'You' : 'NVIDIA AI'}
                          </div>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))
                  )}
                  {isStreaming && (
                    <div className="flex justify-center my-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NvidiaTestPage;