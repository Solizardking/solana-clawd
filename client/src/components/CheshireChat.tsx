import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, Send, Image as ImageIcon, UserCircle2, Wallet, Lock as LockIcon, 
  BrainCircuit, ChevronDown 
} from "lucide-react";
import { grokAI } from '@/lib/grokAI';
import { nvidiaAI } from '@/lib/nvidia';
import { useToast } from "@/hooks/use-toast";
import { wsClient } from '@/lib/websocket';
import { useTreasuryGate } from "@/contexts/TreasuryGateContext";
import type { TokenRecommendation } from '@/lib/grokAI';
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { openRouter, type OpenRouterModelOption } from '@/lib/openRouter';
import { VoiceToPrompt } from "@/components/VoiceToPrompt";
import { useAuth } from "@/contexts/AuthContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  role: "user" | "assistant" | "telegram_user";
  content: string;
  imageUrl?: string;
  tokenRecommendation?: TokenRecommendation;
  username?: string;
  timestamp?: Date;
  clientType?: string;
}

interface ChatProps {
  onTokenGenerated: (concept: string) => void;
  onLaunchToken?: () => void;
  initialPrompt?: string;
  telegramUsers?: {
    username: string;
    walletAddress: string;
    isOnline: boolean;
  }[];
}

export function CheshireChat({ onTokenGenerated, onLaunchToken, initialPrompt = "", telegramUsers = [] }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("MiniMax-M2.7");
  const [availableModels, setAvailableModels] = useState<OpenRouterModelOption[]>([]);
  const [connectedTelegramUsers, setConnectedTelegramUsers] = useState<{
    username: string;
    walletAddress: string;
    isOnline: boolean;
  }[]>(telegramUsers);
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialPromptAppliedRef = useRef(false);
  const chatRoomId = useRef<number | null>(null);
  const { connected, publicKey, signTransaction } = useWallet();
  const { isAuthenticated } = useAuth();
  const { requirePayment } = useTreasuryGate();
  const isDeepSeekModel = (model: string) =>
    model.startsWith("MiniMax-") || model.startsWith("deepseek-") || model.startsWith("kimi-") || model.startsWith("gpt-") || model.includes("/");

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Add debug logging
  useEffect(() => {
    console.log("Chat component mounted");
  }, []);

  useEffect(() => {
    if (!initialPrompt || initialPromptAppliedRef.current) return;
    initialPromptAppliedRef.current = true;
    setInput(initialPrompt);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: `Remote prompt loaded. Review it, then send when ready:\n${initialPrompt}`,
        timestamp: new Date(),
        username: "System",
      },
    ]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [initialPrompt]);
  
  // Fetch available models
  useEffect(() => {
    if (!isAuthenticated) {
      setAvailableModels([]);
      return;
    }

    const fetchModels = async () => {
      try {
        const models = await openRouter.getAvailableModels();
        setAvailableModels(models);
        console.log("Available models loaded:", models);
      } catch (error) {
        console.error("Failed to load models:", error);
        toast({
          title: "Model Loading Error",
          description: "Could not load available models. Using default models.",
          variant: "destructive"
        });
      }
    };
    
    fetchModels();
  }, [isAuthenticated, toast]);

  // Initial welcome message
  useEffect(() => {
    console.log("Setting initial welcome message");
    setMessages([{
      role: "assistant",
      content: "GM fam! 🚀 Ready to create some epic tokens on Solana? I'm your AI guide to the moon! What kind of token are we launching today? 💫"
    }]);
  }, []);
  
  // Update messages when wallet connection status changes
  useEffect(() => {
    if (connected && publicKey) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✅ Wallet connected: ${publicKey.toString().slice(0, 6)}...${publicKey.toString().slice(-6)}. You can now fully interact with the terminal and launch tokens!`,
        timestamp: new Date(),
        username: "System"
      }]);
    }
  }, [connected, publicKey]);
  
  // Function to join a chat room
  const joinChatRoom = (roomId: number) => {
    if (wsClient.isConnected()) {
      wsClient.send({
        type: 'join_room',
        roomId
      });
      chatRoomId.current = roomId;
      console.log(`Joined chat room: ${roomId}`);
    }
  };

  // Function to leave a chat room
  const leaveChatRoom = () => {
    if (wsClient.isConnected() && chatRoomId.current !== null) {
      wsClient.send({
        type: 'leave_room',
        roomId: chatRoomId.current
      });
      console.log(`Left chat room: ${chatRoomId.current}`);
      chatRoomId.current = null;
    }
  };

  // Set up WebSocket listener for real-time chat
  useEffect(() => {
    // Ensure we're connected to WebSocket
    if (!wsClient.isConnected()) {
      wsClient.connect();
    }
    
    // Listen for incoming messages
    wsClient.onMessage = (data) => {
      console.log('WebSocket message received in chat:', data);
      
      // Handle message from Telegram users
      if (data.type === 'new_message' && data.message) {
        if (data.clientType === 'telegram_mini_app' || data.message.clientType === 'telegram_mini_app') {
          // This is a message from a Telegram user
          setMessages(prev => [...prev, {
            role: 'telegram_user',
            content: data.message.content,
            username: data.message.senderName || 'Telegram User',
            timestamp: data.message.timestamp ? new Date(data.message.timestamp) : new Date(),
            clientType: 'telegram_mini_app'
          }]);
        }
      }
      
      // Handle user presence updates (users joining/leaving)
      if (data.type === 'user_presence') {
        const { username, walletAddress, isOnline } = data;
        
        if (username && walletAddress) {
          setConnectedTelegramUsers(prev => {
            // Check if user already exists
            const existingUserIndex = prev.findIndex(u => u.walletAddress === walletAddress);
            
            if (existingUserIndex >= 0) {
              // Update existing user
              const updatedUsers = [...prev];
              updatedUsers[existingUserIndex] = {
                ...updatedUsers[existingUserIndex],
                isOnline
              };
              return updatedUsers;
            } else if (isOnline) {
              // Add new user only if they're online
              return [...prev, { username, walletAddress, isOnline }];
            }
            
            return prev;
          });
          
          // Add system message about user joining/leaving
          const action = isOnline ? 'joined' : 'left';
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `${username} has ${action} via Telegram`,
            timestamp: new Date(),
            username: 'System'
          }]);
        }
      }
    };
    
    // Join the default chat room (ID: 1) when component mounts
    joinChatRoom(1);
    
    // Clean up on unmount
    return () => {
      leaveChatRoom();
      wsClient.onMessage = undefined;
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isProcessing || !connected) return;

    // 🔥 Treasury gate — pay 0.00069420 SOL & burn CLAWD
    const paid = await requirePayment("chat", "Chat with CLAWD");
    if (!paid) return;

    try {
      console.log("Processing message:", input);
      setIsProcessing(true);

      // Add user message
      const timestamp = new Date();
      setMessages(prev => [...prev, {
        role: "user",
        content: input,
        timestamp
      }]);

      // Broadcast message to Telegram users via WebSocket
      if (wsClient.isConnected()) {
        wsClient.send({
          type: 'terminal_message',
          content: input,
          timestamp: timestamp.toISOString(),
          room: chatRoomId.current
        });
      }

      const userInput = input;
      setInput("");

      // Check if this is a token idea request
      const isTokenRequest = userInput.toLowerCase().includes("token") || 
                           userInput.toLowerCase().includes("idea") || 
                           userInput.toLowerCase().includes("launch");

      if (isTokenRequest) {
        console.log("Generating token idea using model:", selectedModel);
        try {
          let tokenIdea;
          
          // Check if using OpenRouter model
          if (selectedModel !== "grok-1" && isDeepSeekModel(selectedModel)) {
            console.log("Using OpenRouter model for token idea:", selectedModel);
            tokenIdea = await openRouter.generateTokenIdea(userInput, selectedModel);
          } else {
            // Use default Grok AI for token ideas
            tokenIdea = await grokAI.generateTokenIdea(userInput);
          }
          
          console.log("Token idea generated:", tokenIdea);

          const message = `🎉 I've got an awesome token idea for you!

Name: ${tokenIdea.name} ($${tokenIdea.symbol})
Description: ${tokenIdea.description}
Initial Buy: ${tokenIdea.initialBuyAmount} SOL
Total Supply: ${tokenIdea.totalSupply} tokens

Marketing Potential:
${tokenIdea.marketingPoints.map((point: string) => `• ${point}`).join('\n')}

Viral Factor: ${tokenIdea.viralPotential}

Want me to help you launch this token? Just say the word! 🚀`;

          setMessages(prev => [...prev, {
            role: "assistant",
            content: message,
            tokenRecommendation: tokenIdea
          }]);

          onTokenGenerated(userInput);
        } catch (error) {
          console.error("Token idea generation error:", error);
          throw error;
        }
      } else {
        console.log("Processing regular chat message with model: ", selectedModel);
        let fullResponse = "";

        try {
          // Start with empty assistant message to enable streaming-like updates
          setMessages(prev => [...prev, { role: "assistant", content: "" }]);
          
          // Check if using NVIDIA AI model
          if (selectedModel.startsWith("nvidia/")) {
            console.log("Using NVIDIA AI model:", selectedModel);
            
            try {
              // Use NVIDIA AI with streaming
              await nvidiaAI.streamChat(
                [{ role: "user", content: userInput }],
                (chunk) => {
                  console.log("Received NVIDIA chunk:", chunk);
                  fullResponse += chunk;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    if (newMessages[newMessages.length - 1]?.role === "assistant") {
                      newMessages[newMessages.length - 1].content = fullResponse;
                    }
                    return newMessages;
                  });
                },
                selectedModel
              );
            } catch (error) {
              console.error("NVIDIA AI chat error:", error);
              throw error;
            }
          }
          // Check if using OpenRouter model
          else if (selectedModel !== "grok-1" && isDeepSeekModel(selectedModel)) {
            console.log("Using OpenRouter model:", selectedModel);
            
            try {
              // Call OpenRouter API via our client
              const response = await openRouter.chat([{
                role: "user",
                content: userInput
              }], selectedModel);
              
              console.log("OpenRouter response:", response);
              
              // Update the message with full response
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages[newMessages.length - 1]?.role === "assistant") {
                  newMessages[newMessages.length - 1].content = response;
                }
                return newMessages;
              });
            } catch (error) {
              console.error("OpenRouter chat error:", error);
              throw error;
            }
          } else {
            // Use default Grok AI with streaming
            await grokAI.chat([{
              role: "user",
              content: userInput
            }], (chunk) => {
              console.log("Received chunk:", chunk);
              fullResponse += chunk;
              setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages[newMessages.length - 1]?.role === "assistant") {
                  newMessages[newMessages.length - 1].content = fullResponse;
                } else {
                  newMessages.push({
                    role: "assistant",
                    content: fullResponse
                  });
                }
                return newMessages;
              });
            });
          }
        } catch (error) {
          console.error("Chat streaming error:", error);
          throw error;
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Chat Error",
        description: "Having trouble right now. Could you try again?",
        variant: "destructive"
      });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Oops! 😅 I'm having some technical difficulties. Could you try asking that again in a different way? 🚀"
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file || !connected) return;

    try {
      console.log("Processing image upload");
      setIsProcessing(true);
      const reader = new FileReader();

      reader.onload = async () => {
        const imageUrl = reader.result as string;
        console.log("Image loaded, analyzing...");

        setMessages(prev => [...prev, {
          role: "user",
          content: "Here's an image to analyze:",
          imageUrl
        }]);

        try {
          let analysis;
          
          // Check if selected model is multimodal via OpenRouter
          const selectedModelObj = availableModels.find(m => m.id === selectedModel);
          
          if (selectedModel !== "grok-1" && selectedModelObj?.multimodal) {
            console.log("Using OpenRouter multimodal model for image analysis:", selectedModel);
            
          analysis = await openRouter.analyzeImage(
            imageUrl,
            "Analyze this image and suggest how it could be used for a token launch. Be creative and fun!"
          );
          } else {
            // Default to Grok for image analysis
            analysis = await grokAI.analyzeImage(
              imageUrl,
              "Analyze this image and suggest how it could be used for a token launch. Be creative and fun!"
            );
          }
          
          console.log("Image analysis completed");

          setMessages(prev => [...prev, {
            role: "assistant",
            content: analysis || "I couldn't analyze this image properly. Could you try another one?"
          }]);
        } catch (error) {
          console.error("Image analysis error:", error);
          toast({
            title: "Image Analysis Error",
            description: "Sorry, I couldn't analyze that image. Please try another one.",
            variant: "destructive"
          });
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: "Upload Error",
        description: "Failed to process the image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-black border-purple-500/30 w-full max-w-7xl mx-auto rounded-t-xl rounded-b-none">
      <div className="bg-gradient-to-r from-purple-800 to-purple-600 p-2 px-4 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex space-x-2 mr-3">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <p className="text-white font-mono text-sm">cheshire@terminal:~ $</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Telegram connected users indicator */}
          {connectedTelegramUsers.filter(u => u.isOnline).length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-300 font-mono">
                {connectedTelegramUsers.filter(u => u.isOnline).length} Telegram user{connectedTelegramUsers.filter(u => u.isOnline).length !== 1 ? 's' : ''} online
              </span>
              <div className="flex -space-x-2">
                {connectedTelegramUsers
                  .filter(u => u.isOnline)
                  .slice(0, 3)
                  .map((user, idx) => (
                    <div 
                      key={idx} 
                      className="w-6 h-6 rounded-full bg-orange-600 border border-black flex items-center justify-center"
                      title={user.username}
                    >
                      <span className="text-xs text-white font-bold">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  ))}
                {connectedTelegramUsers.filter(u => u.isOnline).length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-orange-800 border border-black flex items-center justify-center">
                    <span className="text-xs text-white font-bold">
                      +{connectedTelegramUsers.filter(u => u.isOnline).length - 3}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Wallet Connection Button */}
          <div className="wallet-adapter-dropdown">
            <WalletMultiButton className="!bg-gradient-to-r !from-purple-700 !to-purple-900 !text-xs !py-1" />
          </div>
        </div>
      </div>
      <CardContent className="p-4 sm:p-6 pt-3">
        <ScrollArea 
          ref={scrollRef} 
          className="h-[450px] sm:h-[600px] md:h-[calc(100vh-200px)] mb-4 pr-4 overflow-y-auto font-mono"
        >
          {!connected && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md mx-auto p-6 rounded-lg border border-purple-500/30 bg-black/50">
                <Wallet className="h-12 w-12 mx-auto mb-4 text-purple-500" />
                <h3 className="text-xl font-bold text-purple-400 mb-2">Terminal Locked</h3>
                <p className="text-gray-300 mb-4">
                  Connect your wallet to unlock the Cheshire Terminal. This ensures secure token creation and management.
                </p>
                <div className="wallet-adapter-dropdown inline-block">
                  <WalletMultiButton className="!bg-gradient-to-r !from-purple-700 !to-purple-900" />
                </div>
              </div>
            </div>
          )}
          
          <div className={`space-y-4 ${!connected ? 'hidden' : ''}`}>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`rounded p-3 transition-all duration-200 ${
                  message.role === "assistant"
                    ? "bg-black text-green-400 border-l-2 border-purple-500"
                    : message.role === "telegram_user"
                    ? "bg-black/80 text-gray-200 border-l-2 border-orange-500"
                    : "bg-black/80 text-gray-200 border-l-2 border-blue-500"
                }`}
              >
                <div className="flex items-center space-x-2">
                  {message.role === "telegram_user" && (
                    <UserCircle2 className="h-4 w-4 text-orange-400" />
                  )}
                  <p className={`text-xs ${
                    message.role === "assistant" 
                      ? "text-purple-400" 
                      : message.role === "telegram_user"
                      ? "text-orange-400"
                      : "text-blue-400"
                    } mb-1`}
                  >
                    {message.role === "assistant" 
                      ? message.username === "System" 
                        ? "system@terminal" 
                        : "cheshire@terminal" 
                      : message.role === "telegram_user"
                      ? `${message.username || "telegram_user"}@terminal`
                      : "user@terminal"
                    }
                    <span className="text-gray-400">:~$</span>
                  </p>
                  {message.timestamp && (
                    <span className="text-xs text-gray-500">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="Uploaded content"
                    className="max-w-[200px] sm:max-w-[300px] rounded mb-2 object-cover"
                    loading="lazy"
                  />
                )}
                <p className={`whitespace-pre-wrap break-words text-sm sm:text-base ${
                  message.role === "assistant" 
                    ? "text-green-300" 
                    : message.role === "telegram_user"
                    ? "text-orange-100"
                    : "text-gray-300"
                }`}>
                  {message.content}
                </p>
              </div>
            ))}
          </div>
          {isProcessing && (
            <div className="flex items-center py-2 text-green-400 font-mono animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Processing command...</span>
            </div>
          )}
        </ScrollArea>

        {/* Model Selection Dropdown - above the input area */}
        <div className="flex items-center justify-end mb-2">
          <div className="flex items-center text-xs text-gray-400">
            <BrainCircuit className="h-3 w-3 mr-1 text-purple-400" />
            <span className="mr-2">Model:</span>
            <Select
              value={selectedModel}
              onValueChange={(value) => setSelectedModel(value)}
              disabled={isProcessing || !connected}
            >
              <SelectTrigger className="w-[180px] h-7 text-xs bg-black border-purple-500/30 text-purple-300">
                <SelectValue placeholder="Select AI Model" />
              </SelectTrigger>
              <SelectContent className="bg-black border-purple-500/30">
                <SelectItem value="grok-1" className="text-xs cursor-pointer">
                  Grok 1
                </SelectItem>
                <SelectItem value="nvidia/llama-3.3-nemotron-super-49b-v1" className="text-xs cursor-pointer">
                  NVIDIA Llama 3.3 (Deep Reasoning)
                </SelectItem>
                {availableModels.map((model) => (
                  <SelectItem 
                    key={model.id} 
                    value={model.id}
                    className="text-xs cursor-pointer"
                  >
                    {model.name}
                    {model.multimodal && " 🖼️"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex gap-2 mt-4 border-t border-purple-500/20 pt-4">
          <div className="flex-grow flex items-center bg-black border border-purple-500/30 rounded-md px-2">
            <span className="text-purple-400 mr-2 font-mono text-sm">$</span>
            <Input
              ref={inputRef}
              placeholder={connected ? "Enter command..." : "Connect wallet to use terminal..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && !isProcessing && connected && handleSend()}
              className="bg-transparent border-none text-white text-sm sm:text-base w-full focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={isProcessing || !connected}
            />
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={(e) => e.target.files?.[0] && connected && handleImageUpload(e.target.files[0])}
          />
          <VoiceToPrompt
            onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)}
            disabled={isProcessing || !connected}
            mode="trading"
            usePromptIntent
            className="flex-shrink-0 border-purple-500/30 bg-purple-950/50 text-purple-100 hover:bg-purple-900/70"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => connected && fileInputRef.current?.click()}
            className="text-purple-400 hover:text-purple-300 flex-shrink-0 border-purple-500/30"
            disabled={isProcessing || !connected}
          >
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Button
            onClick={handleSend}
            disabled={isProcessing || !input.trim() || !connected}
            className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 flex-shrink-0"
          >
            {isProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
