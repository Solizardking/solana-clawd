import React from 'react';
import { Button } from '@/components/ui/button';
import { useCrossmintWallet } from './CrossmintWalletProvider';

interface CrossmintWalletButtonProps {
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export const CrossmintWalletButton: React.FC<CrossmintWalletButtonProps> = ({
  variant = 'default',
  size = 'default',
  className = '',
}) => {
  const { isConnected, walletAddress, status, login, logout } = useCrossmintWallet();

  const handleClick = () => {
    if (isConnected) {
      logout();
    } else {
      login();
    }
  };

  const getButtonText = () => {
    if (status === 'loading' || status === 'in-progress') {
      return 'Connecting...';
    }
    
    if (isConnected && walletAddress) {
      return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
    }
    
    return 'Connect Crossmint';
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={`flex items-center justify-center ${className}`}
      onClick={handleClick}
      disabled={status === 'loading' || status === 'in-progress'}
    >
      <div className="mr-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 128 128"
          fill="none"
        >
          <path 
            d="M64 0C28.65 0 0 28.65 0 64s28.65 64 64 64 64-28.65 64-64S99.35 0 64 0z" 
            fill="#3182CE" 
          />
          <path 
            fillRule="evenodd" 
            clipRule="evenodd" 
            d="M91.82 40.68a4 4 0 0 1 0 5.64L68.3 69.84l-15.12 15.12a4 4 0 0 1-5.66-5.64L71.04 56.8 47.52 33.3a4 4 0 0 1 5.66-5.64l15.12 15.1 23.52 23.52z" 
            fill="#ffffff" 
          />
        </svg>
      </div>
      {getButtonText()}
    </Button>
  );
};