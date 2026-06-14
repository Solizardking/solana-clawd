// @ts-nocheck
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheshireChat } from "@/components/CheshireChat";
import { Rocket, LineChart, Terminal, Zap, Radio, Cpu, ArrowRight, Sparkles } from "lucide-react";
import { ClawdSpinner, TerminalSpinnerLine } from "@/components/ClawdSpinner";
import { useToast } from "@/hooks/use-toast";
import { VoiceSynthesis } from "@/lib/voice";
import { chatWithCheshire, generateMemeImage } from "@/lib/ai";
import { TrendingTokens } from "@/components/TrendingTokens";
import { LaunchedTokens } from "@/components/LaunchedTokens";
import confetti from 'canvas-confetti';
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletInfo } from "@/components/WalletInfo";
import { VoiceCommandButton } from '@/components/VoiceCommandButton';
import { Link } from "wouter";
import { AutoTokenLauncher } from "@/components/AutoTokenLauncher";
import { CheshireWelcome } from "@/components/CheshireWelcome";
import { ClawdTerminalPet, ClawdPixelArt } from "@/components/ClawdPixelArt";
import { BurnHero } from "@/components/BurnHero";
import { TokenRecommendations } from "@/components/TokenRecommendations";
import { PumpFunService } from '@/lib/pumpFunService';
import { Keypair } from '@solana/web3.js';
import { TrendingNews } from "@/components/TrendingNews";
import { RealtimeArtFeed } from "@/components/RealtimeArtFeed";
import { ClawdBuyPanel } from "@/components/ClawdBuyPanel";
import { useAuth } from "@/contexts/AuthContext";
import { PhoenixPerpsPromo } from "@/components/PhoenixPerpsPromo";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";
import { WalletLeaderboardPanel } from "@/components/WalletLeaderboardPanel";
import { HomeArenaPulse } from "@/components/HomeArenaPulse";

const LAMPORTS_PER_SOL = 1000000000;

interface TokenPreview {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  artPrompt: string;
  mintAddress?: string;
}

// Quick-access feature cards shown at top of page
const FEATURE_CARDS = [
  {
    id: "launch",
    label: "Token Launch",
    icon: Rocket,
    description: "AI meme token creator",
    color: "from-green-500/20 to-emerald-500/10 border-green-500/30 hover:border-green-400/60",
    iconColor: "text-green-400",
  },
  {
    id: "feed",
    label: "Live Feed",
    icon: Radio,
    description: "Realtime art & tokens",
    color: "from-purple-500/20 to-blue-500/10 border-purple-500/30 hover:border-purple-400/60",
    iconColor: "text-purple-400",
  },
  {
    id: "terminal",
    label: "Full Terminal",
    icon: Terminal,
    description: "Swap · trade · research",
    color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/30 hover:border-cyan-400/60",
    iconColor: "text-cyan-400",
    href: "/terminal",
  },
  {
    id: "ai",
    label: "AI Research",
    icon: Cpu,
    description: "DeepSeek · NVIDIA · Grok",
    color: "from-orange-500/20 to-yellow-500/10 border-orange-500/30 hover:border-orange-400/60",
    iconColor: "text-orange-400",
    href: "/search",
  },
];

export function Home() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<TokenPreview | null>(null);
  const [launchedTokens, setLaunchedTokens] = useState<TokenPreview[]>([]);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<"launch" | "feed">("launch");

  const handleTokenGeneration = async (concept: string) => {
    try {
      if (!connected || !publicKey || !signTransaction) {
        toast({ title: "Wallet Required", description: "Please connect your wallet to create tokens", variant: "destructive" });
        return;
      }
      setIsProcessing(true);
      const response = await chatWithCheshire(concept);
      const imageUrl = await generateMemeImage(response.artPrompt);
      setTokenPreview({ ...response.tokenDetails, imageUrl, artPrompt: response.artPrompt });
    } catch (error) {
      if (error instanceof Error) toast({ title: "Generation Error", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerConfetti = () => {
    const count = 200;
    const defaults = { origin: { y: 0.7 }, colors: ['#9333ea', '#2563eb', '#16a34a'] };
    const fire = (ratio: number, opts: any) => confetti({ ...defaults, ...opts, particleCount: Math.floor(count * ratio) });
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  };

  const handleTokenLaunch = async () => {
    if (!tokenPreview || !publicKey || !signTransaction) {
      toast({ title: "Wallet Required", description: "Please connect your wallet to launch tokens", variant: "destructive" });
      return;
    }
    try {
      setIsLaunching(true);
      setLaunchProgress(0);
      const progressInterval = setInterval(() => {
        setLaunchProgress(prev => prev >= 90 ? prev : prev + Math.random() * 15);
      }, 500);
      const pumpFunService = new PumpFunService({ publicKey, signTransaction, network: 'mainnet-beta' });
      const mintKeypair = Keypair.generate();
      const result = await pumpFunService.createAndBuyToken(mintKeypair, {
        name: tokenPreview.name, symbol: tokenPreview.symbol,
        description: tokenPreview.description, imageUrl: tokenPreview.imageUrl,
      }, 1.0, 1000n);
      clearInterval(progressInterval);
      if (result.success) {
        setLaunchProgress(100);
        setTimeout(triggerConfetti, 300);
        setLaunchedTokens(prev => [...prev, { ...tokenPreview, mintAddress: result.tokenAddress }]);
        toast({ title: "Token Launched! 🚀", description: `${tokenPreview.symbol} is live on mainnet!` });
      } else throw new Error(result.error || 'Failed to launch token');
    } catch (error) {
      toast({ title: "Launch Error", description: error instanceof Error ? error.message : 'Failed to launch token', variant: "destructive" });
    } finally {
      setIsLaunching(false);
      setLaunchProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-black bg-gradient-to-br from-purple-900/20 to-black">
      <div className="container mx-auto px-4 py-6 space-y-6">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <BurnHero />
          <div className="flex items-center gap-2 shrink-0">
            <VoiceCommandButton />
            <Link href="/free">
              <Button size="sm" variant="outline" className="h-8 text-xs bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Free
              </Button>
            </Link>
            <Link href="/terminal">
              <Button size="sm" variant="outline" className="h-8 text-xs bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 gap-1.5">
                <Terminal className="h-3.5 w-3.5" /> Terminal
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Hero ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-xl border border-purple-500/20 bg-black/40 px-6 py-5">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-4xl font-black tracking-tight bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 text-transparent bg-clip-text">CLAWD</span>
              <span className="text-4xl font-black text-purple-300/50">&</span>
              <span className="text-4xl font-black tracking-tight bg-gradient-to-r from-purple-400 to-blue-400 text-transparent bg-clip-text">CODEX</span>
            </div>
            <p className="text-sm text-purple-300/70 mb-2">Agentic Meme Launchpad · AI Terminal · Powered by $CLAWD</p>
            <div className="inline-flex px-2.5 py-0.5 bg-black/40 border border-green-500/30 rounded-full">
              <span className="text-[10px] font-mono text-green-400/70 truncate max-w-[260px] sm:max-w-none">
                CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <ClawdTerminalPet />
            {isAuthenticated && <ClawdBuyPanel compact />}
          </div>
        </div>

        <HomeArenaPulse />

        {/* ── Feature quick-access cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            const inner = (
              <button
                key={card.id}
                onClick={() => !card.href && setActiveSection(card.id as "launch" | "feed")}
                className={`w-full flex items-start gap-3 rounded-xl border bg-gradient-to-br p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40 ${card.color} ${!card.href && activeSection === card.id ? "ring-1 ring-white/20" : ""}`}
              >
                <div className={`mt-0.5 rounded-lg border border-white/10 bg-black/30 p-2`}>
                  <Icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white leading-tight">{card.label}</div>
                  <div className="text-[11px] text-white/50 mt-0.5">{card.description}</div>
                </div>
                {card.href && <ArrowRight className="ml-auto h-3.5 w-3.5 text-white/30 self-center" />}
              </button>
            );
            return card.href
              ? <Link key={card.id} href={card.href}>{inner}</Link>
              : <div key={card.id}>{inner}</div>;
          })}
        </div>

        <WalletLeaderboardPanel />

        {/* ── Wallet strip (when connected) ── */}
        {connected && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <WalletInfo />
            <AutoTokenLauncher />
            <TokenRecommendations />
          </div>
        )}

        {/* ── Main content: Launch + Feed toggle ── */}
        <div className="flex flex-col gap-0">
          {/* Section toggle tabs */}
          <div className="flex items-center gap-1 border-b border-white/10 pb-0 mb-0">
            <button
              onClick={() => setActiveSection("launch")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeSection === "launch"
                  ? "border-green-400 text-green-300 bg-green-500/5"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              <Rocket className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Token Launch
            </button>
            <button
              onClick={() => setActiveSection("feed")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeSection === "feed"
                  ? "border-purple-400 text-purple-300 bg-purple-500/5"
                  : "border-transparent text-white/40 hover:text-white/70"
              }`}
            >
              <Radio className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Live Feed
            </button>
            <div className="ml-auto flex items-center gap-2 pb-1">
              <Link href="/terminal">
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-cyan-400/70 hover:text-cyan-300 gap-1">
                  <Zap className="h-3 w-3" /> Open Full Terminal <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Launch section */}
          {activeSection === "launch" && (
            <div className="pt-4">
              {connected ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: AI chat + token launch */}
                  <div className="lg:col-span-5 space-y-4">
                    <Tabs defaultValue="create" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-8">
                        <TabsTrigger value="create" className="text-xs">Create Token</TabsTrigger>
                        <TabsTrigger value="launches" className="text-xs">Your Launches {launchedTokens.length > 0 && `(${launchedTokens.length})`}</TabsTrigger>
                      </TabsList>
                      <TabsContent value="create" className="mt-3">
                        <CheshireChat onTokenGenerated={handleTokenGeneration} onLaunchToken={handleTokenLaunch} />
                      </TabsContent>
                      <TabsContent value="launches" className="mt-3">
                        {launchedTokens.length === 0 ? (
                          <div className="rounded-lg border border-white/10 bg-black/30 p-6 text-center text-sm text-white/40">
                            No tokens launched yet. Use "Create Token" to get started.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {launchedTokens.map((token, i) => (
                              <Card key={i} className="bg-black/40 border-purple-500/30">
                                <CardContent className="p-4">
                                  <img src={token.imageUrl} alt={token.name} className="w-full h-32 object-cover rounded-lg mb-3" />
                                  <p className="font-bold text-purple-200 text-sm">{token.name}</p>
                                  <p className="font-mono text-purple-400 text-xs">{token.symbol}</p>
                                  {token.mintAddress && (
                                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                                      <Button variant="outline" size="sm" className="h-7 text-xs"
                                        onClick={() => window.open(`https://solscan.io/token/${token.mintAddress}`, '_blank')}>
                                        <LineChart className="h-3 w-3 mr-1" /> Solscan
                                      </Button>
                                      <ClawdTokenAction
                                        mintAddress={token.mintAddress}
                                        symbol={token.symbol}
                                        name={token.name}
                                        logoURI={token.imageUrl}
                                      />
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* Center: token preview + LaunchedTokens */}
                  <div className="lg:col-span-4 space-y-4">
                    {tokenPreview ? (
                      <Card className="bg-black/40 border-green-500/30">
                        <CardContent className="p-4">
                          <img src={tokenPreview.imageUrl} alt={tokenPreview.name} className="w-full h-48 object-cover rounded-lg mb-3" />
                          <h2 className="text-lg font-bold text-purple-200">{tokenPreview.name}</h2>
                          <p className="font-mono text-sm text-purple-400 mb-1">{tokenPreview.symbol}</p>
                          <p className="text-xs text-gray-400 mb-3">{tokenPreview.description}</p>
                          <Button onClick={handleTokenLaunch} disabled={isLaunching}
                            className="w-full bg-gradient-to-r from-green-600 to-green-800 hover:from-green-500 hover:to-green-700 h-9 text-sm">
                            {isLaunching ? <ClawdSpinner name="pumpLoader" size="xs" inline /> : <Rocket className="h-4 w-4 mr-1.5" />}
                            {isLaunching ? "Launching..." : "Launch Token"}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/30 h-[200px] flex items-center justify-center">
                        Token preview will appear here after generation
                      </div>
                    )}
                    <LaunchedTokens />
                  </div>

                  {/* Right: trending */}
                  <div className="lg:col-span-3">
                    <TrendingNews variant="compact" limit={6} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <CheshireWelcome />
                  <PhoenixPerpsPromo />
                  <div className="rounded-xl border border-white/10 bg-black/30 p-6 text-center">
                    <p className="text-purple-300/70 text-sm mb-3">Connect your wallet to start creating and launching tokens</p>
                    <Link href="/terminal">
                      <Button variant="outline" size="sm" className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10">
                        <Terminal className="h-3.5 w-3.5 mr-1.5" /> Open Terminal Instead
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feed section */}
          {activeSection === "feed" && (
            <div className="pt-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <RealtimeArtFeed variant="full" />
                </div>
                <div className="space-y-4">
                  <TrendingNews variant="compact" limit={10} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Terminal CTA banner (always visible at bottom) ── */}
        <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Terminal className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-cyan-200">Full Trading Terminal</span>
            </div>
            <p className="text-xs text-cyan-300/60">
              Swap via DFlow · Jupiter Ultra · Prediction markets · Voice agent · DeepSeek AI · Pool analytics
            </p>
          </div>
          <Link href="/terminal">
            <Button className="shrink-0 bg-cyan-600 hover:bg-cyan-500 text-black font-semibold h-9 text-sm gap-2">
              <Zap className="h-4 w-4" /> Open Terminal <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

      </div>

      {/* ── Processing overlay ── */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/80 p-8 rounded-xl border border-purple-500/30 space-y-3">
            <TerminalSpinnerLine name="walletHeartbeat" label="Reading concept..." />
            <TerminalSpinnerLine name="solanaPulse" label="Generating meme token..." />
            <TerminalSpinnerLine name="mevScan" label="Scanning meme space..." />
          </div>
        </div>
      )}

      {/* ── Launch overlay ── */}
      {isLaunching && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/80 p-8 rounded-xl border border-green-500/30 w-full max-w-sm">
            <div className="flex flex-col items-center gap-3">
              <Rocket className="h-10 w-10 text-green-400 animate-bounce" />
              <p className="text-green-200 font-bold">Launching your token...</p>
              <Progress value={launchProgress} className="w-full h-2 bg-black/60" />
              <p className="text-green-200/60 text-xs">
                {launchProgress < 100 ? 'Initializing launch sequence...' : 'Launch successful! 🎉'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
