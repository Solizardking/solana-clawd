// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ArrowLeft, Mic, MicOff, Coins, Bot, MessagesSquare, Zap, Sparkles, Droplets, Headphones, ShoppingCart, X, MonitorSmartphone, Wallet } from "lucide-react";
import { ClawdSpinner, BirthCeremony, type CeremonyPhase } from "@/components/ClawdSpinner";
import { ClawdPixelArt } from "@/components/ClawdPixelArt";
import { VoiceSynthesis } from "@/lib/voice";
import { voiceCommandManager } from "@/lib/voice/VoiceCommands";
import { chatWithCheshire, generateMemeImage } from "@/lib/ai";
import { useToast } from "@/hooks/use-toast";
import { PumpFunService } from '@/lib/pumpFunService';
import { Keypair } from '@solana/web3.js';
import { CheshireChat } from "@/components/CheshireChat";
import { TokenOpsPanel } from "@/components/TokenOpsPanel";
import { DFlowSwapPanel } from "@/components/DFlowSwapPanel";
import { DeepSeekTerminalPanel } from "@/components/DeepSeekTerminalPanel";
import { ClawdSwapWidget } from "@/components/ClawdSwapWidget";
import { MeteoraPriceBar } from "@/components/MeteoraPriceBar";
import { VoiceAgent } from "@/components/VoiceAgent";
import { JupiterClawdSwap } from "@/components/ClawdBuyPanel";

interface TokenPreview {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  artPrompt: string;
  mintAddress?: string;
}

const TERMINAL_PHASES: CeremonyPhase[] = [
  { spinner: 'walletHeartbeat', label: 'Reading concept...', durationMs: 900 },
  { spinner: 'solanaPulse',     label: 'Generating token...', durationMs: 1800 },
  { spinner: 'mevScan',         label: 'Scanning meme space...', durationMs: 1200 },
  { spinner: 'tokenOrbit',      label: 'Finalising metadata...', durationMs: 800 },
];

const LAUNCH_PHASES: CeremonyPhase[] = [
  { spinner: 'walletHeartbeat', label: 'Connecting wallet...',  durationMs: 700 },
  { spinner: 'blockFinality',   label: 'Building transaction...', durationMs: 1000 },
  { spinner: 'pumpLoader',      label: 'Filling bonding curve...', durationMs: 2000 },
  { spinner: 'solanaPulse',     label: 'Confirming on-chain...', durationMs: 1500 },
];

type TabId = "ops" | "chat" | "dflow" | "ai" | "pool" | "buy" | "voice";

type TerminalHandoff = {
  tab: TabId;
  prompt: string;
  source: string;
};

function normalizeTerminalTab(raw: string | null): TabId {
  const value = (raw || "").trim().toLowerCase();
  const aliases: Record<string, TabId> = {
    ops: "ops",
    trade: "ops",
    token: "ops",
    command: "ops",
    chat: "chat",
    clawd: "chat",
    meme: "chat",
    dflow: "dflow",
    swap: "dflow",
    ai: "ai",
    deepseek: "ai",
    research: "ai",
    pool: "pool",
    meteora: "pool",
    buy: "buy",
    clawd_buy: "buy",
    voice: "voice",
    speak: "voice",
  };
  return aliases[value] ?? "ops";
}

function readTerminalHandoff(): TerminalHandoff {
  if (typeof window === "undefined") return { tab: "ops", prompt: "", source: "" };
  const params = new URLSearchParams(window.location.search);
  return {
    tab: normalizeTerminalTab(params.get("tab") || params.get("mode")),
    prompt: params.get("prompt") || params.get("task") || params.get("command") || params.get("q") || "",
    source: params.get("source") || params.get("utm_source") || "",
  };
}

function sourceLabel(source: string) {
  if (/telegram/i.test(source)) return "Telegram";
  if (/agent/i.test(source)) return "Agent";
  if (/voice/i.test(source)) return "Voice";
  return source || "Remote";
}

// ── Pool Stats Card ────────────────────────────────────────────────────────────

function PoolStatsCard() {
  const [info, setInfo] = useState<any | null>(null);

  useEffect(() => {
    fetch("/api/meteora-swap/pool-info")
      .then((r) => r.ok ? r.json() : null)
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) {
    return (
      <div className="rounded-md border border-green-500/20 bg-zinc-900/60 p-4 text-xs text-green-600/50 font-mono">
        Loading pool stats...
      </div>
    );
  }

  return (
    <div className="rounded-md border border-green-500/20 bg-zinc-900/60 p-4 space-y-3">
      <div className="text-xs font-semibold text-green-400 font-mono tracking-wide flex items-center gap-2">
        <Droplets className="w-3.5 h-3.5" />
        CLAWD/SOL Pool — Meteora DAMM V2
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-mono">
        <div className="text-zinc-500">CLAWD Reserve</div>
        <div className="text-zinc-200">{Number(info.tokenAAmount ?? 0).toLocaleString()} CLAWD</div>
        <div className="text-zinc-500">SOL Reserve</div>
        <div className="text-zinc-200">{Number(info.tokenBAmount ?? 0).toLocaleString()} SOL</div>
        <div className="text-zinc-500">Price (SOL)</div>
        <div className="text-zinc-200">{info.solPerClawd > 0 ? info.solPerClawd.toExponential(3) : "—"} SOL/CLAWD</div>
        {info.clawdUsdEstimate != null && (
          <>
            <div className="text-zinc-500">Price (USD)</div>
            <div className="text-zinc-200">${info.clawdUsdEstimate.toFixed(8)}</div>
          </>
        )}
        <div className="text-zinc-500">Fee Mode</div>
        <div className="text-zinc-200">{info.collectFeeModeName ?? String(info.collectFeeMode)}</div>
        <div className="text-zinc-500">Liquidity</div>
        <div className={info.liquidityReady ? "text-green-400" : "text-amber-400"}>
          {info.liquidityReady ? "Active" : "Not seeded yet"}
        </div>
      </div>
      {info.poolAddress && (
        <a
          href={`https://app.meteora.ag/pools/${info.poolAddress}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-green-500/70 hover:text-green-400 font-mono"
        >
          View on Meteora app →
        </a>
      )}
    </div>
  );
}

export function TerminalPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const [handoff] = useState<TerminalHandoff>(() => readTerminalHandoff());
  const [activeTab, setActiveTab] = useState<TabId>(handoff.tab);
  const [showHandoff, setShowHandoff] = useState(() => Boolean(handoff.source || handoff.prompt));
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [tokenPreview, setTokenPreview] = useState<TokenPreview | null>(null);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      voiceCommandManager.setContextualState({
        walletPublicKey: publicKey,
        signTransaction,
        tokenPreview,
        launchToken: handleTokenLaunch,
        createToken: handleTokenGeneration
      });
    }
  }, [connected, publicKey, signTransaction, tokenPreview]);

  const handleTokenGeneration = async (concept: string) => {
    setActiveTab("chat");
    try {
      if (!connected || !publicKey || !signTransaction) {
        VoiceSynthesis.speak("Please connect your wallet first to create a token.");
        toast({ title: "Wallet Required", description: "Please connect your wallet to create tokens", variant: "destructive" });
        return;
      }

      setIsProcessing(true);
      VoiceSynthesis.speak("Generating your meme token...");

      const response = await chatWithCheshire(concept);
      VoiceSynthesis.speak(`Created token ${response.tokenDetails.name} with symbol ${response.tokenDetails.symbol}`);

      const imageUrl = await generateMemeImage(response.artPrompt);
      setTokenPreview({ ...response.tokenDetails, imageUrl, artPrompt: response.artPrompt });
      VoiceSynthesis.speak("Token preview ready! Say 'launch token' when you want to deploy it.");
    } catch (error) {
      if (error instanceof Error) {
        toast({ title: "Generation Error", description: error.message, variant: "destructive" });
      }
      VoiceSynthesis.speak("Sorry, there was an error generating your token");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTokenLaunch = async () => {
    if (!tokenPreview || !publicKey || !signTransaction) {
      toast({ title: "Wallet Required", description: "Please connect your wallet to launch tokens", variant: "destructive" });
      return;
    }
    try {
      setIsLaunching(true);
      VoiceSynthesis.speak("Launching your meme token on mainnet...");

      const pumpFunService = new PumpFunService({ publicKey, signTransaction, network: 'mainnet-beta' });
      const mintKeypair = Keypair.generate();

      const result = await pumpFunService.createAndBuyToken(
        mintKeypair,
        { name: tokenPreview.name, symbol: tokenPreview.symbol, description: tokenPreview.description, imageUrl: tokenPreview.imageUrl },
        1.0, 1000n
      );

      if (result.success) {
        toast({
          title: "Token Launched Successfully! 🚀",
          description: `${tokenPreview.symbol} is now live! View on Solscan: https://solscan.io/token/${result.tokenAddress}`,
        });
        VoiceSynthesis.speak(`Token ${tokenPreview.name} launched successfully on mainnet!`);
      } else {
        throw new Error(result.error || 'Failed to launch token');
      }
    } catch (error) {
      toast({
        title: "Launch Error",
        description: error instanceof Error ? error.message : 'Failed to launch token.',
        variant: "destructive"
      });
      VoiceSynthesis.speak("Sorry, there was an error launching your token");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black bg-gradient-to-br from-purple-900/20 to-black">
      <div className="pointer-events-none absolute bottom-6 right-6 hidden opacity-70 xl:block">
        <div className="rounded-full border border-cyan-300/20 bg-cyan-300/5 p-5 shadow-2xl shadow-cyan-950/30">
          <ClawdPixelArt autoAnimate size={0.55} showLabel={false} />
        </div>
      </div>
      <div className="container mx-auto px-4 py-6 flex flex-col h-screen max-h-screen">

        {/* Header */}
        <div className="mb-3 flex flex-shrink-0 flex-wrap items-center justify-between gap-2 sm:mb-4">
          <Link href="/">
            <Button variant="outline" size="sm" className="h-8 bg-purple-500/20 border-purple-500/30 px-2 text-xs text-purple-200 hover:bg-purple-500/30 sm:px-3">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </Link>

          <div className="order-first flex min-w-0 flex-1 items-center justify-center gap-2 sm:order-none sm:flex-none">
            <ClawdPixelArt
              state={isProcessing ? 'codex' : isLaunching ? 'alert' : 'idle'}
              autoAnimate={false}
              size={0.35}
              showLabel={false}
            />
            <span className="text-sm font-black tracking-widest bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">
              CLAWD TERMINAL
            </span>
            {(isProcessing || isLaunching) && (
              <BirthCeremony phases={isProcessing ? TERMINAL_PHASES : LAUNCH_PHASES} className="text-left ml-2" />
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {!connected && (
              <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !text-xs !h-8 !rounded-md !px-3" />
            )}
            <Link href="/discord">
              <Button variant="outline" size="sm" className="h-8 bg-indigo-500/20 border-indigo-500/30 px-2 text-xs text-indigo-200 hover:bg-indigo-500/30 sm:px-3">
                <MessagesSquare className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline">Discord</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              className={`h-8 px-2 text-xs sm:px-3 ${isListening
                ? "bg-green-500/20 border-green-500/30 text-green-300"
                : "bg-purple-500/20 border-purple-500/30 text-purple-200"}`}
              onClick={() => { voiceCommandManager.toggleListening(); setIsListening((v) => !v); }}
            >
              {isListening ? <MicOff className="h-3 w-3 sm:mr-1" /> : <Mic className="h-3 w-3 sm:mr-1" />}
              <span className="hidden sm:inline">{isListening ? 'Listening' : 'Voice'}</span>
            </Button>
          </div>
        </div>

        <nav aria-label="Terminal mobile remote controls" className="mb-3 grid grid-cols-4 gap-1 md:hidden">
          <Link href="/remote?source=terminal">
            <Button variant="outline" size="sm" className="h-9 w-full gap-1 border-cyan-400/25 bg-cyan-500/10 px-1 text-[11px] text-cyan-100 hover:bg-cyan-500/15">
              <MonitorSmartphone className="h-3.5 w-3.5" />
              Remote
            </Button>
          </Link>
          <Link href="/telegram?source=terminal">
            <Button variant="outline" size="sm" className="h-9 w-full gap-1 border-cyan-400/25 bg-black/25 px-1 text-[11px] text-cyan-100 hover:bg-cyan-500/10">
              <MessagesSquare className="h-3.5 w-3.5" />
              Telegram
            </Button>
          </Link>
          <Link href="/agents?source=terminal">
            <Button variant="outline" size="sm" className="h-9 w-full gap-1 border-purple-400/25 bg-black/25 px-1 text-[11px] text-purple-100 hover:bg-purple-500/10">
              <Bot className="h-3.5 w-3.5" />
              Agents
            </Button>
          </Link>
          <Link href="/account?source=terminal">
            <Button variant="outline" size="sm" className="h-9 w-full gap-1 border-green-400/25 bg-black/25 px-1 text-[11px] text-green-100 hover:bg-green-500/10">
              <Wallet className="h-3.5 w-3.5" />
              Wallet
            </Button>
          </Link>
        </nav>

        {showHandoff && (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{sourceLabel(handoff.source)} handoff</span>
              <span className="text-cyan-100/60"> opened </span>
              <span className="font-mono text-cyan-50">{activeTab}</span>
              {handoff.prompt && (
                <>
                  <span className="text-cyan-100/60"> with </span>
                  <span className="font-mono text-cyan-50">{handoff.prompt}</span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/remote?source=terminal-handoff">
                <Button size="sm" variant="outline" className="h-7 border-cyan-400/30 bg-black/20 px-2 text-[11px] text-cyan-100 hover:bg-cyan-500/10">
                  Remote
                </Button>
              </Link>
              <Link href="/telegram?source=terminal-handoff">
                <Button size="sm" variant="outline" className="h-7 border-cyan-400/30 bg-black/20 px-2 text-[11px] text-cyan-100 hover:bg-cyan-500/10">
                  Telegram
                </Button>
              </Link>
              <Link href="/agents?source=terminal-handoff">
                <Button size="sm" variant="outline" className="h-7 border-purple-400/30 bg-black/20 px-2 text-[11px] text-purple-100 hover:bg-purple-500/10">
                  Agents
                </Button>
              </Link>
              <button
                type="button"
                onClick={() => setShowHandoff(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-cyan-200/60 hover:bg-white/10 hover:text-white"
                aria-label="Dismiss remote handoff"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-3 flex flex-shrink-0 gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          <button
            onClick={() => setActiveTab("ops")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "ops"
                ? "bg-purple-600/40 text-purple-200 border border-purple-500/40"
                : "text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10"
            }`}
          >
            <Coins className="h-3 w-3" />
            Token Ops
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "chat"
                ? "bg-purple-600/40 text-purple-200 border border-purple-500/40"
                : "text-purple-400/60 hover:text-purple-300 hover:bg-purple-500/10"
            }`}
          >
            <Bot className="h-3 w-3" />
            CLAWD Chat
          </button>
          <button
            onClick={() => setActiveTab("dflow")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "dflow"
                ? "bg-cyan-600/40 text-cyan-200 border border-cyan-500/40"
                : "text-cyan-400/60 hover:text-cyan-300 hover:bg-cyan-500/10"
            }`}
          >
            <Zap className="h-3 w-3" />
            DFlow Swap
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "ai"
                ? "bg-violet-600/40 text-violet-200 border border-violet-500/40"
                : "text-violet-400/60 hover:text-violet-300 hover:bg-violet-500/10"
            }`}
          >
            <Sparkles className="h-3 w-3" />
            CLAWD AI
          </button>
          <button
            onClick={() => setActiveTab("pool")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "pool"
                ? "bg-green-600/40 text-green-200 border border-green-500/40"
                : "text-green-400/60 hover:text-green-300 hover:bg-green-500/10"
            }`}
          >
            <Droplets className="h-3 w-3" />
            Pool
          </button>
          <button
            onClick={() => setActiveTab("buy")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "buy"
                ? "bg-yellow-600/40 text-yellow-100 border border-yellow-500/40"
                : "text-yellow-400/60 hover:text-yellow-300 hover:bg-yellow-500/10"
            }`}
          >
            <ShoppingCart className="h-3 w-3" />
            Buy CLAWD
          </button>
          <button
            onClick={() => setActiveTab("voice")}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              activeTab === "voice"
                ? "bg-rose-600/40 text-rose-200 border border-rose-500/40"
                : "text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/10"
            }`}
          >
            <Headphones className="h-3 w-3" />
            Voice Trade
          </button>
          <div className="ml-auto hidden self-center font-mono text-[10px] text-purple-400/40 sm:block">
            {connected ? (
              <span className="text-green-400/60">● {publicKey?.toBase58().slice(0, 8)}…</span>
            ) : (
              <span className="text-yellow-500/60">○ not connected</span>
            )}
          </div>
        </div>

        {/* Panel content */}
        <div className="flex-1 min-h-0">
          {activeTab === "ops" && (
            <TokenOpsPanel initialCommand={activeTab === handoff.tab ? handoff.prompt : ""} onLaunchToken={handleTokenGeneration} />
          )}
          {activeTab === "chat" && (
            <div className="h-full">
              <CheshireChat
                initialPrompt={activeTab === handoff.tab ? handoff.prompt : ""}
                onTokenGenerated={handleTokenGeneration}
                onLaunchToken={handleTokenLaunch}
              />
            </div>
          )}
          {activeTab === "dflow" && (
            <div className="h-full overflow-y-auto">
              <DFlowSwapPanel />
            </div>
          )}
          {activeTab === "ai" && (
            <div className="h-full">
              <DeepSeekTerminalPanel initialPrompt={activeTab === handoff.tab ? handoff.prompt : ""} />
            </div>
          )}
          {activeTab === "pool" && (
            <div className="h-full overflow-y-auto space-y-4 pb-4">
              {/* Live price bar */}
              <div className="rounded-md border border-green-500/20 bg-green-950/20">
                <MeteoraPriceBar />
              </div>

              {/* Swap widget */}
              <ClawdSwapWidget />

              {/* Pool stats card */}
              <PoolStatsCard />
            </div>
          )}

          {activeTab === "buy" && (
            <div className="h-full overflow-y-auto pb-4">
              <JupiterClawdSwap />
            </div>
          )}

          {activeTab === "voice" && (
            <div className="h-full">
              <VoiceAgent />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default TerminalPage;
