import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AudioVisualizer } from './AudioVisualizer';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function VoiceCommandButton() {
  const [isListening, setIsListening] = useState(false);
  const { toast } = useToast();

  const toggleVoiceCommands = async () => {
    try {
      const { voiceCommandManager } = await import('@/lib/voice/VoiceCommands');
      voiceCommandManager.toggleListening();
      setIsListening(!isListening);

      toast({
        title: isListening ? 'Voice Assistant Deactivated' : 'Cheshire Assistant',
        description: isListening 
          ? 'Voice control turned off'
          : 'Say "help" to get started',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error toggling voice commands:', error);
      toast({
        title: 'Voice Command Error',
        description: error instanceof Error ? error.message : 'Failed to toggle voice commands',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`relative transition-all duration-300 ${
              isListening 
                ? 'bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20' 
                : 'bg-black/40 border-purple-500/30'
            }`}
            onClick={toggleVoiceCommands}
          >
            {isListening ? (
              <>
                <Mic className="h-5 w-5 text-purple-200 animate-pulse" />
                <span className="absolute -top-1 -right-1 h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
                <AudioVisualizer isListening={isListening} />
              </>
            ) : (
              <MicOff className="h-5 w-5 text-purple-400" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-black/90 border-purple-500/30">
          <p>{isListening ? 'Cheshire is listening' : 'Activate Voice Assistant'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
