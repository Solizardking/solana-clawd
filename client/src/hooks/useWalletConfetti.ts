import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useCrossmintWallet } from '@/components/CrossmintWalletProvider';
import { BlockchainType } from '@/lib/solanaConfig';

export const useWalletConfetti = (selectedChain: BlockchainType) => {
  const solanaWallet = useWallet();
  const baseWallet = useCrossmintWallet();
  
  const [showConfetti, setShowConfetti] = useState(false);
  const [prevSolanaConnected, setPrevSolanaConnected] = useState(false);
  const [prevBaseConnected, setPrevBaseConnected] = useState(false);
  
  // Track wallet connection changes
  useEffect(() => {
    // For Solana wallet
    if (selectedChain === BlockchainType.SOLANA && 
        solanaWallet.connected && 
        !prevSolanaConnected) {
      setShowConfetti(true);
    }
    setPrevSolanaConnected(solanaWallet.connected);
    
    // For Base/Crossmint wallet
    if (selectedChain === BlockchainType.BASE && 
        baseWallet.isConnected && 
        !prevBaseConnected) {
      setShowConfetti(true);
    }
    setPrevBaseConnected(baseWallet.isConnected);
  }, [
    selectedChain,
    solanaWallet.connected,
    baseWallet.isConnected,
    prevSolanaConnected,
    prevBaseConnected
  ]);
  
  const handleConfettiFinish = () => {
    setShowConfetti(false);
  };
  
  return {
    showConfetti,
    handleConfettiFinish
  };
};

export default useWalletConfetti;