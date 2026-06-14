import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ClawdSpinner } from "@/components/ClawdSpinner";
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  role: 'assistant' | 'loading';
  content: string;
}

interface WelcomeResponse {
  message: string;
  fallback?: boolean;
}

export function CheshireWelcome() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const getWelcomeMessage = async () => {
      if (!isAuthenticated) {
        setMessages([{
          role: 'assistant',
          content: "Cheshire Terminal — powered by $CLAWD on Solana. Connect a holder wallet to unlock the full AI terminal."
        }]);
        return;
      }

      try {
        setMessages([{ role: 'loading', content: '' }]);

        const response = await apiRequest<WelcomeResponse>('/api/ai/welcome', {
          method: 'POST'
        });

        const welcomeMessage = {
          role: 'assistant' as const,
          content: response.message
        };

        setMessages([welcomeMessage]);
        setIsAnimating(true);
      } catch (error) {
        console.error('Error getting welcome message:', error);
        setMessages([{
          role: 'assistant',
          content: "Cheshire Terminal — powered by $CLAWD token on Solana, Open AI Codex, and the power of the wonderland of Web 3."
        }]);
      }
    };

    getWelcomeMessage();
  }, [isAuthenticated]);

  return (
    <Card className={`
      bg-black/40 border-purple-500/30 overflow-hidden
      ${isAnimating ? 'animate-in zoom-in-50 duration-500' : ''}
    `}>
      <CardContent className="p-6 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 animate-pulse"></div>
        {messages.map((message, index) => (
          <div key={index} className="relative z-10">
            {message.role === 'loading' ? (
              <ClawdSpinner
                name="solanaPulse"
                label="Clawd is thinking..."
                size="sm"
              />
            ) : (
              <div className="text-purple-200 leading-relaxed typewriter">
                {message.content}
              </div>
            )}
          </div>
        ))}
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-blue-500 opacity-20 blur animate-gradient"></div>
      </CardContent>
    </Card>
  );
}
