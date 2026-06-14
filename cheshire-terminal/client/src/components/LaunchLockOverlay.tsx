import React, { useEffect, useState } from 'react';
import { LaunchCountdown } from './LaunchCountdown';

interface LaunchLockOverlayProps {
  children: React.ReactNode;
}

export function LaunchLockOverlay({ children }: LaunchLockOverlayProps) {
  const [isLocked, setIsLocked] = useState(true);
  const [targetDate] = useState(() => {
    // Set target date to 24 hours from now
    const date = new Date();
    date.setHours(date.getHours() + 24);
    return date;
  });

  // Check if we should be locked on mount
  useEffect(() => {
    const checkLockStatus = () => {
      const now = new Date().getTime();
      const targetTime = targetDate.getTime();
      setIsLocked(now < targetTime);
    };

    checkLockStatus();
  }, [targetDate]);

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-purple-950/20 to-black">
      <div className="container mx-auto px-4 py-8">
        {/* Logo area */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
            Cheshire Terminal
          </h1>
          <p className="mt-4 text-lg text-purple-300/60">
            The most sophisticated meme token launcher is awakening
          </p>
        </div>

        {/* Countdown */}
        <div className="max-w-2xl mx-auto mb-12">
          <LaunchCountdown 
            targetDate={targetDate}
            onComplete={() => setIsLocked(false)}
          />
        </div>

        {/* Coming soon features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-center">
          <div className="p-6 bg-black/40 rounded-lg border border-purple-500/30">
            <h3 className="text-xl font-semibold text-purple-400">AI-Powered</h3>
            <p className="mt-2 text-purple-300/60">Advanced token generation with Grok AI integration</p>
          </div>
          <div className="p-6 bg-black/40 rounded-lg border border-purple-500/30">
            <h3 className="text-xl font-semibold text-purple-400">Multi-Chain</h3>
            <p className="mt-2 text-purple-300/60">Launch on Solana & Base with seamless bridge</p>
          </div>
          <div className="p-6 bg-black/40 rounded-lg border border-purple-500/30">
            <h3 className="text-xl font-semibold text-purple-400">Secure</h3>
            <p className="mt-2 text-purple-300/60">ZK-proof verification & automated audits</p>
          </div>
        </div>
      </div>
    </div>
  );
}
