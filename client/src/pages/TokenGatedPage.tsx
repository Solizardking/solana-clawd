import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TokenVerifier } from '@/components/TokenVerifier';
import { useTokenGate, CLAWD_TOKEN } from '@/contexts/TokenGateContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import {
  Lock, Unlock, Crown, Zap, Brain, Video, Image, BarChart2, Shield,
  Layers, ExternalLink, CheckCircle2, Cpu, Rocket
} from 'lucide-react';

const FEATURES = [
  { icon: Brain, label: 'CLAWD Terminal', desc: 'DeepSeek V4 Pro agentic AI with memory', href: '/clawd', color: 'from-red-900/40 to-orange-900/20', border: 'border-red-500/20' },
  { icon: Video, label: 'AI Video Gen', desc: 'SeeAnce 2.0 text & image-to-video', href: '/video-gen', color: 'from-purple-900/40 to-blue-900/20', border: 'border-purple-500/20' },
  { icon: Image, label: 'NFT Studio', desc: 'GPT-Image-1 powered NFT creation', href: '/nft-studio', color: 'from-blue-900/40 to-cyan-900/20', border: 'border-blue-500/20' },
  { icon: BarChart2, label: 'DEX Terminal', desc: 'Real-time Birdeye charts & analytics', href: '/dex', color: 'from-green-900/40 to-emerald-900/20', border: 'border-green-500/20' },
  { icon: Layers, label: 'Agent Launchpad', desc: 'Deploy autonomous Solana agents', href: '/agent-launchpad', color: 'from-yellow-900/40 to-orange-900/20', border: 'border-yellow-500/20' },
  { icon: Cpu, label: 'NVIDIA Deep Reason', desc: 'Nemotron advanced reasoning engine', href: '/nvidia-test', color: 'from-cyan-900/40 to-teal-900/20', border: 'border-cyan-500/20' },
  { icon: Rocket, label: 'Meme Gallery', desc: 'AI meme generation & social sharing', href: '/meme-gallery', color: 'from-pink-900/40 to-purple-900/20', border: 'border-pink-500/20' },
  { icon: Shield, label: 'Metaplex Agents', desc: 'On-chain NFT agent registry', href: '/metaplex-agents', color: 'from-indigo-900/40 to-purple-900/20', border: 'border-indigo-500/20' },
];

export function TokenGatedPage() {
  const { connected } = useWallet();
  const { isVerified, clawdBalance } = useTokenGate();

  return (
    <div className="min-h-screen bg-black">
      {/* Hero section */}
      <div className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-red-900/20 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-[300px] h-[200px] bg-orange-900/10 rounded-full blur-2xl" />
        </div>

        <div className="relative container mx-auto px-4 py-10 max-w-6xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 text-xs font-semibold mb-4 uppercase tracking-widest">
              <Shield className="w-3.5 h-3.5" />
              Token-Gated Platform
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white mb-3">
              CLAWD <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">ACCESS</span>
            </h1>
            <p className="text-gray-400 max-w-xl mx-auto text-sm">
              Hold CLAWD tokens to unlock the full suite of AI-powered DeFi tools —
              trading intelligence, content creation, and autonomous agents.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left — Verifier */}
            <div>
              <Card className="bg-black/80 border border-gray-800 rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-gray-800/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isVerified ? (
                        <div className="flex items-center gap-2">
                          <Unlock className="w-4 h-4 text-green-400" />
                          <CardTitle className="text-base text-green-300">Access Verified</CardTitle>
                          <Badge className="bg-green-900/60 text-green-300 border border-green-500/30 text-xs">ACTIVE</Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-red-400" />
                          <CardTitle className="text-base text-gray-200">Verify Wallet</CardTitle>
                        </div>
                      )}
                    </div>
                    <a
                      href={`https://solscan.io/token/${CLAWD_TOKEN}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
                    >
                      {CLAWD_TOKEN.slice(0, 6)}…{CLAWD_TOKEN.slice(-4)}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <TokenVerifier />
                </CardContent>
              </Card>

              {/* How it works */}
              <div className="mt-4 p-4 rounded-xl border border-gray-800/40 bg-gray-950/40">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">How it works</p>
                <div className="space-y-2">
                  {[
                    { n: '1', text: 'Connect your Solana wallet' },
                    { n: '2', text: 'Hold at least 1 CLAWD token' },
                    { n: '3', text: 'Press Verify — access unlocked instantly' },
                    { n: '4', text: 'Use the full platform for free, forever' },
                  ].map(({ n, text }) => (
                    <div key={n} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-red-900/60 border border-red-500/30 flex items-center justify-center text-xs font-bold text-red-400 flex-shrink-0">
                        {n}
                      </div>
                      <p className="text-xs text-gray-400">{text}</p>
                    </div>
                  ))}
                </div>
                <a
                  href={`https://jup.ag/swap/SOL-${CLAWD_TOKEN}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gradient-to-r from-red-950/60 to-orange-950/60 border border-red-500/20 text-red-300 text-sm font-semibold hover:from-red-900/60 hover:to-orange-900/60 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buy CLAWD on Jupiter
                </a>
              </div>
            </div>

            {/* Right — Feature grid */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Crown className="w-3.5 h-3.5 text-yellow-500" />
                Included with CLAWD access
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {FEATURES.map(({ icon: Icon, label, desc, href, color, border }) => (
                  <div
                    key={label}
                    className={`relative p-3 rounded-xl border bg-gradient-to-br ${color} ${border} group transition-all duration-200`}
                  >
                    {isVerified ? (
                      <Link href={href}>
                        <div className="cursor-pointer">
                          <div className="flex items-start justify-between mb-2">
                            <Icon className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors" />
                            <CheckCircle2 className="w-3 h-3 text-green-400 opacity-70" />
                          </div>
                          <p className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors leading-tight">{label}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{desc}</p>
                        </div>
                      </Link>
                    ) : (
                      <div className="opacity-50">
                        <div className="flex items-start justify-between mb-2">
                          <Icon className="w-4 h-4 text-gray-500" />
                          <Lock className="w-3 h-3 text-gray-600" />
                        </div>
                        <p className="text-xs font-bold text-gray-500 leading-tight">{label}</p>
                        <p className="text-xs text-gray-600 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Status banner */}
              <div className={`mt-4 p-3 rounded-xl border flex items-center gap-3 transition-all duration-500 ${
                isVerified
                  ? 'bg-green-950/40 border-green-500/20'
                  : 'bg-red-950/20 border-red-500/10'
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isVerified ? 'bg-green-400 shadow-sm shadow-green-400' : 'bg-red-500/60'} ${isVerified ? 'animate-pulse' : ''}`} />
                {isVerified ? (
                  <p className="text-xs text-green-400">
                    Full platform access active
                    {clawdBalance !== null && ` · ${clawdBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} CLAWD`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">
                    {connected ? 'Verify your CLAWD token to unlock all features' : 'Connect wallet to get started'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TokenGatedPage;
