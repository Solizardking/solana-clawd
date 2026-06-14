import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';

interface VoteButtonProps {
  tokenAddress: string;
  voteType: 'up' | 'down';
  count?: number;
  userHasVoted?: boolean;
  disabled?: boolean;
}

export function VoteButton({
  tokenAddress,
  voteType,
  count = 0,
  userHasVoted = false,
  disabled = false
}: VoteButtonProps) {
  const [isVoting, setIsVoting] = useState(false);
  const [voteCount, setVoteCount] = useState(count);
  const [hasVoted, setHasVoted] = useState(userHasVoted);
  const { toast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signMessage } = useWallet();

  const handleVote = async () => {
    if (!publicKey || !signMessage) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to vote",
        variant: "destructive"
      });
      return;
    }

    if (hasVoted) {
      toast({
        title: "Already voted",
        description: "You have already voted for this token",
        variant: "default"
      });
      return;
    }

    try {
      setIsVoting(true);

      // Generate a message to sign as proof of wallet ownership
      const message = new TextEncoder().encode(
        `Vote ${voteType === 'up' ? 'up' : 'down'} for token: ${tokenAddress}\nTimestamp: ${Date.now()}`
      );

      // Sign the message with the wallet
      const signature = await signMessage(message);

      // Send the vote to the server
      const response = await fetch('/api/votes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenAddress,
          voteType,
          wallet: publicKey.toString(),
          signature: Buffer.from(signature).toString('base64'),
          message: Buffer.from(message).toString('base64'),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit vote');
      }

      const result = await response.json();
      
      // Update local state
      setVoteCount(result.count);
      setHasVoted(true);
      
      toast({
        title: "Vote submitted!",
        description: `Your ${voteType === 'up' ? 'upvote' : 'downvote'} has been recorded`,
        variant: "default"
      });
    } catch (error) {
      console.error('Voting error:', error);
      toast({
        title: "Voting failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsVoting(false);
    }
  };

  const buttonVariant = voteType === 'up' ? 'default' : 'outline';
  
  const buttonClass = voteType === 'up' 
    ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
    : 'border-red-500/50 text-red-400 hover:bg-red-900/20 hover:text-red-300';
  
  const isDisabled = disabled || isVoting || (!publicKey && !disabled);

  const tooltipText = !publicKey
    ? "Connect wallet to vote"
    : hasVoted
    ? "You've already voted"
    : `${voteType === 'up' ? 'Upvote' : 'Downvote'} this token`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={voteType === 'up' ? 'default' : 'outline'}
            size="sm"
            className={`relative ${buttonClass} ${hasVoted ? 'opacity-80' : ''}`}
            onClick={handleVote}
            disabled={isDisabled}
          >
            {isVoting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : voteType === 'up' ? (
              <ThumbsUp className="h-4 w-4" />
            ) : (
              <ThumbsDown className="h-4 w-4" />
            )}
            <span className="ml-2">{voteCount}</span>
            {hasVoted && (
              <div className="absolute inset-0 bg-white opacity-10 rounded-md pointer-events-none" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}