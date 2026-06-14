import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { ClawdSpinner, TerminalSpinnerLine } from "@/components/ClawdSpinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWebSocket } from "@/hooks/useWebSocket";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { grokAI } from "@/lib/grokAI";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Define message types
interface MessageType {
  role: 'user' | 'assistant' | 'telegram_user';
  content: string;
  username?: string;
  isStreaming?: boolean;
}

// Define websocket message types
interface WebSocketChatMessage {
  type: 'chat_message';
  clientId?: string; 
  clientType?: 'web' | 'telegram' | 'terminal';
  content?: string;
  username?: string;
  timestamp: string;
}

export function MiniTerminal() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [streamingMessage, setStreamingMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  
  const { socket, clientId, sendMessage } = useWebSocket(isAuthenticated);

  // Set initial welcome message
  useEffect(() => {
    // Get welcome message from API
    const getWelcomeMessage = async () => {
      if (!isAuthenticated) {
        setMessages([
          {
            role: "assistant",
            content: "Cheshire Terminal ready. Connect a wallet and hold $CLAWD to unlock live AI terminal access."
          }
        ]);
        return;
      }

      try {
        const response = await fetch('/api/ai/welcome');
        if (response.ok) {
          const data = await response.json();
          setMessages([
            {
              role: "assistant", 
              content: data.message || "Cheshire Terminal ready. Type a command or question to get started."
            }
          ]);
        } else {
          throw new Error('Failed to fetch welcome message');
        }
      } catch (error) {
        console.error('Error fetching welcome message:', error);
        setMessages([
          {
            role: "assistant", 
            content: "Cheshire Terminal ready. Type a command or question to get started."
          }
        ]);
      }
    };
    
    getWelcomeMessage();
  }, [isAuthenticated]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  // Listen for socket messages
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WebSocketChatMessage;
        
        if (data.type === 'chat_message' && data.content) {
          // Add the message to our chat if it's not from ourselves
          if (data.clientId !== clientId) {
            setMessages(prev => [
              ...prev, 
              {
                role: data.clientType === 'telegram' ? 'telegram_user' : 'user',
                content: data.content || '',
                username: data.username
              }
            ]);
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, clientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);
    setStreamingMessage("");

    try {
      // Send to websocket to broadcast
      sendMessage('chat_message', {
        clientType: 'web',
        content: userMessage
      });

      // Add a placeholder message for streaming
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "",
        isStreaming: true
      }]);
      
      // Use the Grok AI client for streaming response
      let accumulatedResponse = "";
      
      try {
        // Use GrokAI for streaming responses
        await grokAI.chat([{
          role: "user",
          content: userMessage
        }], (chunk) => {
          accumulatedResponse += chunk;
          setStreamingMessage(accumulatedResponse);
        });
        
        // When stream is complete, replace the streaming message
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0 && newMessages[lastIndex].isStreaming) {
            newMessages[lastIndex] = {
              role: "assistant",
              content: accumulatedResponse,
              isStreaming: false
            };
          }
          return newMessages;
        });
        setStreamingMessage("");
        
      } catch (streamError) {
        console.error("Grok streaming error:", streamError);
        
        // Try using server-side streaming as fallback
        try {
          const response = await fetch('/api/ai/chat-stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              message: userMessage,
              sessionId: clientId || 'mini-terminal' 
            })
          });

          if (response.ok) {
            // Set up streaming handling
            const reader = response.body?.getReader();
            if (reader) {
              const decoder = new TextDecoder();
              let done = false;
              accumulatedResponse = "";  // Reset accumulated response

              while (!done) {
                const { done: isDone, value } = await reader.read();
                done = isDone;
                
                if (value) {
                  const chunk = decoder.decode(value, { stream: true });
                  accumulatedResponse += chunk;
                  setStreamingMessage(accumulatedResponse);
                }
              }

              // When stream is complete, replace the streaming message
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (lastIndex >= 0 && newMessages[lastIndex].isStreaming) {
                  newMessages[lastIndex] = {
                    role: "assistant",
                    content: accumulatedResponse,
                    isStreaming: false
                  };
                }
                return newMessages;
              });
              setStreamingMessage("");
            }
          } else {
            throw new Error(`Server returned ${response.status}`);
          }
        } catch (serverStreamError) {
          console.error("Server streaming error:", serverStreamError);
          
          // Final fallback to non-streaming endpoint
          const regularResponse = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              message: userMessage,
              sessionId: clientId || 'mini-terminal' 
            })
          });
          
          if (regularResponse.ok) {
            const data = await regularResponse.json();
            
            if (data.message) {
              // Update the existing assistant message
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIndex = newMessages.length - 1;
                if (lastIndex >= 0 && newMessages[lastIndex].isStreaming) {
                  newMessages[lastIndex] = {
                    role: "assistant", 
                    content: data.message,
                    isStreaming: false
                  };
                } else {
                  // This shouldn't normally happen, but add a new message just in case
                  newMessages.push({
                    role: "assistant", 
                    content: data.message
                  });
                }
                return newMessages;
              });
            } else {
              throw new Error("No response from AI");
            }
          } else {
            throw new Error(`Server responded with ${regularResponse.status}`);
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast({
        title: "Error",
        description: "Failed to process your message. Please try again.",
        variant: "destructive"
      });
      
      // Update or add error message
      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        
        if (lastIndex >= 0 && newMessages[lastIndex].isStreaming) {
          newMessages[lastIndex] = {
            role: "assistant", 
            content: "Sorry, I encountered an error processing your request. Please try again.",
            isStreaming: false
          };
        } else {
          newMessages.push({
            role: "assistant", 
            content: "Sorry, I encountered an error processing your request. Please try again."
          });
        }
        return newMessages;
      });
      setStreamingMessage("");
    } finally {
      setIsProcessing(false);
      // Focus the input field after sending
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const toggleTerminal = () => {
    setIsMinimized(prev => !prev);
  };

  const toggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  // Render message content with markdown support
  const renderMessageContent = (content: string, role: string) => {
    // If it's an assistant message, render with markdown
    if (role === "assistant") {
      return (
        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-gray-900 prose-pre:text-green-300 prose-code:text-green-300 prose-headings:text-green-200 prose-a:text-purple-400">
          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
        </div>
      );
    }
    
    // Otherwise just return the plain text
    return <p className="whitespace-pre-wrap break-words text-sm">{content}</p>;
  };

  return (
    <Card className={`bg-black border-purple-500/30 w-full rounded-t-xl rounded-b-none transition-all duration-300 ${isMinimized ? 'h-12' : isExpanded ? 'h-[calc(50vh)]' : 'h-[300px]'}`}>
      <div className="bg-gradient-to-r from-purple-800 to-purple-600 p-2 px-4 rounded-t-xl flex items-center justify-between cursor-pointer" onClick={toggleTerminal}>
        <div className="flex items-center">
          <div className="flex space-x-2 mr-3">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <p className="text-white font-mono text-sm">cheshire@terminal:~ $</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Link href="/terminal">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0 text-purple-200 hover:text-white hover:bg-purple-700/50"
              onClick={(e) => e.stopPropagation()}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </Link>
          
          {!isMinimized && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0 text-purple-200 hover:text-white hover:bg-purple-700/50"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand();
              }}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          )}
          
          <div className="text-white">
            {isMinimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>
      
      {!isMinimized && (
        <CardContent className="p-3 h-[calc(100%-40px)] flex flex-col">
          <ScrollArea ref={scrollRef} className="flex-grow pr-3 mb-3 font-mono">
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded p-2 transition-all duration-200 ${
                    message.role === "assistant"
                      ? "bg-black text-green-400 border-l-2 border-purple-500"
                      : message.role === "telegram_user"
                      ? "bg-black/80 text-gray-200 border-l-2 border-orange-500"
                      : "bg-black/80 text-gray-200 border-l-2 border-blue-500"
                  }`}
                >
                  {message.role === "telegram_user" && message.username && (
                    <div className="flex items-center mb-1">
                      <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center mr-2">
                        <span className="text-xs text-white font-bold">
                          {message.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-xs text-orange-300">{message.username}</span>
                    </div>
                  )}
                  <div className={`${
                    message.role === "assistant" 
                      ? "text-green-300" 
                      : message.role === "telegram_user"
                      ? "text-orange-100"
                      : "text-gray-300"
                  }`}>
                    {renderMessageContent(message.content, message.role)}
                  </div>
                </div>
              ))}
              
              {/* Streaming message display */}
              {streamingMessage && (
                <div className="rounded p-2 transition-all duration-200 bg-black text-green-400 border-l-2 border-purple-500">
                  <div className="text-green-300 prose prose-invert prose-sm max-w-none prose-pre:bg-gray-900 prose-pre:text-green-300 prose-code:text-green-300 prose-headings:text-green-200 prose-a:text-purple-400">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>{streamingMessage}</ReactMarkdown>
                  </div>
                </div>
              )}
              
              {isProcessing && !streamingMessage && (
                <div className="py-2 border-l-2 border-purple-500 pl-2">
                  <TerminalSpinnerLine
                    name="solanaPulse"
                    label="Clawd is thinking..."
                  />
                </div>
              )}
            </div>
          </ScrollArea>
          
          <form onSubmit={handleSubmit} className="flex items-center space-x-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-gray-900 border-gray-700 text-gray-200 focus:border-purple-500"
            />
            <Button 
              type="submit" 
              disabled={isProcessing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isProcessing
              ? <ClawdSpinner name="clawdSpin" size="xs" inline />
              : "Send"
            }
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
