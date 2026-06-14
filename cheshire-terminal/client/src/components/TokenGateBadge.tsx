import { Link } from 'wouter';
import { useWallet } from '@solana/wallet-adapter-react';
import { useTokenGate } from '@/contexts/TokenGateContext';
import { Shield, CheckCircle2, Lock, ExternalLink } from 'lucide-react';

export function TokenGateBadge() {
  const { connected } = useWallet();
  const { isVerified, clawdBalance } = useTokenGate();

  if (!connected) return null;

  return (
    <Link href="/token-gated">
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-300 mb-2 ${
          isVerified
            ? 'bg-green-950/60 border border-green-500/30 text-green-400 hover:bg-green-950/80 shadow-sm shadow-green-900/20'
            : 'bg-red-950/40 border border-red-500/20 text-red-400 hover:bg-red-950/60 animate-pulse'
        }`}
      >
        {isVerified ? (
          <>
            <CheckCircle2 className="w-3 h-3" />
            <span>CLAWD Verified</span>
            {clawdBalance !== null && (
              <span className="text-green-600">
                · {clawdBalance >= 1_000_000
                  ? `${(clawdBalance / 1_000_000).toFixed(1)}M`
                  : clawdBalance >= 1_000
                  ? `${(clawdBalance / 1_000).toFixed(1)}K`
                  : clawdBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </>
        ) : (
          <>
            <Lock className="w-3 h-3" />
            <span>Verify CLAWD Access</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </>
        )}
      </div>
    </Link>
  );
}
