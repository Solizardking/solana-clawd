import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { CrossmintWalletButton } from './CrossmintWalletButton';
import { useCrossmintWallet } from './CrossmintWalletProvider';
import WalletConfetti from './WalletConfetti';
import { useWalletConfetti } from '@/hooks/useWalletConfetti';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BlockchainType } from '@/lib/solanaConfig';

interface MultiChainWalletSelectorProps {
  className?: string;
  defaultChain?: BlockchainType;
}

export const MultiChainWalletSelector: React.FC<MultiChainWalletSelectorProps> = ({ 
  className = '',
  defaultChain = BlockchainType.SOLANA
}) => {
  const [selectedChain, setSelectedChain] = useState<BlockchainType>(defaultChain);
  const solanaWallet = useWallet();
  const baseWallet = useCrossmintWallet();
  const { showConfetti, handleConfettiFinish } = useWalletConfetti(selectedChain);
  
  const handleChainChange = (chain: string) => {
    setSelectedChain(chain as BlockchainType);
  };

  // Check if any wallet is connected
  const isAnyWalletConnected = 
    (selectedChain === BlockchainType.SOLANA && solanaWallet.connected) ||
    (selectedChain === BlockchainType.BASE && baseWallet.isConnected);

  // Disconnect both wallets
  const disconnectAll = () => {
    if (solanaWallet.connected) {
      solanaWallet.disconnect();
    }
    if (baseWallet.isConnected) {
      baseWallet.logout();
    }
  };

  return (
    <>
      {/* Confetti component - will render when a wallet connects */}
      <WalletConfetti 
        isConnected={showConfetti} 
        onFinish={handleConfettiFinish} 
      />
      
      <div className={`flex items-center gap-2 ${className}`}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Select value={selectedChain} onValueChange={handleChainChange}>
                <SelectTrigger className="w-[120px] bg-background border-primary/20 focus:ring-primary/30">
                  <SelectValue>
                    {selectedChain === BlockchainType.SOLANA ? 'Solana' : 'Base'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-card border-primary/20">
                  <SelectItem value={BlockchainType.SOLANA}>Solana</SelectItem>
                  <SelectItem value={BlockchainType.BASE}>Base</SelectItem>
                </SelectContent>
              </Select>
            </TooltipTrigger>
            <TooltipContent>
              <p>Select blockchain network</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {selectedChain === BlockchainType.SOLANA ? (
          <WalletMultiButton className="!bg-primary hover:!bg-primary/90 rounded-md" />
        ) : (
          <CrossmintWalletButton className="bg-[#0052FF] hover:bg-[#0052FF]/90" />
        )}

        {isAnyWalletConnected && (
          <Button 
            variant="outline" 
            size="icon" 
            onClick={disconnectAll}
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Button>
        )}
      </div>
    </>
  );
};