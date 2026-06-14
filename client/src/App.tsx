import React, { Suspense, lazy, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Wallet } from "@/components/Wallet";
import { Navigation } from "@/components/Navigation";
import { MobileRemoteControl } from "@/components/MobileRemoteControl";
import { TokenGateProvider } from "@/contexts/TokenGateContext";
import { TreasuryGateProvider } from "@/contexts/TreasuryGateContext";
import { TokenGateBadge } from "@/components/TokenGateBadge";
import { TokenGate } from "@/components/TokenGate";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { convexClient } from "@/lib/convex";
import { hasClerk } from "@/lib/clerk";
import { useAuth as useClerkAuth } from "@clerk/react";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home").then((m) => ({ default: m.Home })));
const TerminalPage = lazy(() => import("@/pages/terminal").then((m) => ({ default: m.TerminalPage })));
const FreeTerminalPage = lazy(() => import("@/pages/FreeTerminalPage"));
const BurnPage = lazy(() => import("@/pages/burn"));
const MiniAppPage = lazy(() => import("@/pages/mini-app"));
const DeepSeekPage = lazy(() => import("@/pages/DeepSeekPage"));
const HermesPage = lazy(() => import("@/pages/HermesPage"));
const MemeGalleryPage = lazy(() => import("@/pages/meme-gallery"));
const AgentLaunchpadPage = lazy(() => import("./pages/AgentLaunchpadPage"));
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const GrokTestPage = lazy(() => import("@/pages/GrokTestPage"));
const ClawdGrokPage = lazy(() => import("@/pages/ClawdGrokPage"));
const NvidiaTestPage = lazy(() => import("@/pages/NvidiaTestPage"));
const TokenGatedPage = lazy(() => import("@/pages/TokenGatedPage"));
const ProverPage = lazy(() => import("@/pages/ProverPage"));
const BrowserTabAnalyzerPage = lazy(() => import("@/pages/BrowserTabAnalyzerPage"));
const DexPage = lazy(() => import("@/pages/DexPage"));
const TradingPage = lazy(() => import("@/pages/TradingPage"));
const WalletScannerPage = lazy(() => import("@/pages/WalletScannerPage"));
const ImperialDeskPage = lazy(() => import("@/pages/ImperialDeskPage"));
const GachaPage = lazy(() => import("@/pages/GachaPage"));
const GachaVerifyPage = lazy(() => import("@/pages/GachaVerifyPage"));
const VideoGenPage = lazy(() => import("@/pages/VideoGenPage"));
const StreamPage = lazy(() => import("@/pages/StreamPage"));
const MetaplexAgentPage = lazy(() => import("@/pages/MetaplexAgentPage"));
const AgentExplorerPage = lazy(() => import("@/pages/AgentExplorerPage"));
const NftStudioPage = lazy(() => import("@/pages/NftStudioPage"));
const ImagineStudioPage = lazy(() => import("@/pages/ImagineStudioPage"));
const GeminiStudioPage = lazy(() => import("@/pages/GeminiStudioPage"));
const GalleryPage = lazy(() => import("@/pages/GalleryPage"));
const BrowserUsePage = lazy(() => import("@/pages/BrowserUsePage"));
const StakingPage = lazy(() => import("@/pages/StakingPage"));
const TreasuryPage = lazy(() => import("@/pages/TreasuryPage"));
const MyBurnsPage = lazy(() => import("@/pages/MyBurnsPage"));
const HoldersDirectoryPage = lazy(() => import("@/pages/HoldersDirectoryPage"));
const TelegramLinkPage = lazy(() => import("@/pages/TelegramLinkPage"));
const RemoteControlPage = lazy(() => import("@/pages/RemoteControlPage"));
const AgentBuilderPage = lazy(() => import("@/pages/AgentBuilderPage"));
const ClawdPortfolioPage = lazy(() => import("@/pages/ClawdPortfolioPage"));
const DiscordPage = lazy(() => import("@/pages/DiscordPage"));
const NewsFeedPage = lazy(() => import("@/pages/NewsFeedPage"));
const ClawdArenaPage = lazy(() => import("@/pages/ClawdArenaPage"));
const AgentArenaPage = lazy(() => import("@/pages/AgentArenaPage"));
const VoicePage = lazy(() => import("@/pages/VoicePage"));
const StocksPage = lazy(() => import("@/pages/StocksPage"));
const AgentTemplatesPage = lazy(() => import("@/pages/AgentTemplatesPage"));
const AgentsHubPage = lazy(() => import("@/pages/AgentsHubPage"));
const AgentChatPage = lazy(() => import("@/pages/AgentChatPage"));
const AgentDetailPage = lazy(() => import("@/pages/AgentDetailPage"));
const DeployedAgentDetailPage = lazy(() => import("@/pages/DeployedAgentDetailPage"));
const AgentRuntimeMatrixPage = lazy(() => import("@/pages/AgentRuntimeMatrixPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const PredictionMarketsPage = lazy(() => import("@/pages/PredictionMarketsPage"));
const DFlowMarketsPage = lazy(() => import("@/pages/DFlowMarketsPage"));
const DFlowOODAPage = lazy(() => import("@/pages/DFlowOODAPage"));
const PhoenixPerpsPage = lazy(() => import("@/pages/PhoenixPerpsPage"));
const FlashPage = lazy(() => import("@/pages/FlashPage"));
const BoxesPage = lazy(() => import("@/pages/BoxesPage"));
const NewPage = lazy(() => import("@/pages/NewPage"));
const TeePage = lazy(() => import("@/pages/TeePage"));
const ClawdSwapArticlePage = lazy(() => import("@/pages/ClawdSwapArticlePage"));
const UsagePage = lazy(() => import("@/pages/UsagePage"));
const ApiCatalogPage = lazy(() => import("@/pages/ApiCatalogPage"));
const RouterKeysPage = lazy(() => import("@/pages/RouterKeysPage"));
const DeployPage = lazy(() => import("@/pages/DeployPage"));
const BackroomPage = lazy(() => import("@/pages/BackroomPage"));
const PumpPage = lazy(() => import("@/pages/PumpPage"));
const AccountPage = lazy(() => import("@/pages/AccountPage"));
const ContractPage = lazy(() => import("@/pages/contract").then((m) => ({ default: m.Contract })));
const SearchInterface = lazy(() => import("@/components/SearchInterface").then((m) => ({ default: m.SearchInterface })));
const ContractExplorer = lazy(() => import("@/components/ContractExplorer").then((m) => ({ default: m.ContractExplorer })));
const TokenTicker = lazy(() => import("@/components/TokenTicker"));
const BurnTicker = lazy(() => import("@/components/BurnTicker").then((m) => ({ default: m.BurnTicker })));
const SocialLinks = lazy(() => import("@/components/SocialLinks").then((m) => ({ default: m.SocialLinks })));
const MiniTerminal = lazy(() => import("@/components/MiniTerminal").then((m) => ({ default: m.MiniTerminal })));
const SmartSearchBar = lazy(() => import("@/components/SmartSearchBar").then((m) => ({ default: m.SmartSearchBar })));
const StreamPlayer = lazy(() => import("@/components/StreamPlayer").then((m) => ({ default: m.StreamPlayer })));
const MusicPlayer = lazy(() => import("@/components/MusicPlayer").then((m) => ({ default: m.MusicPlayer })));
const ClawdCompanion = lazy(() => import("@/components/ClawdCompanion").then((m) => ({ default: m.ClawdCompanion })));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function LazyShellWidget({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

function FreeTerminalRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/free", { replace: true });
  }, [setLocation]);

  return <RouteLoadingFallback />;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, signIn, error } = useAuth();

  if (isLoading) return <RouteLoadingFallback />;
  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-[26rem] max-w-xl flex-col items-center justify-center gap-4 rounded-lg border border-cyan-500/20 bg-black/40 p-6 text-center">
      <div className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Registered Users</div>
      <h2 className="text-2xl font-black text-white">Sign in to use Clawd Grok</h2>
      <p className="text-sm text-zinc-400">
        Paid AI tools are unavailable to public visitors. Sign in with your wallet to use Grok, files, voice, code, search, and trading tools.
      </p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button
        type="button"
        onClick={() => signIn().catch(() => {})}
        className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25"
      >
        Sign in with wallet
      </button>
    </div>
  );
}

function Router() {
  // Get current location to check if we're in mini-app mode
  const [location] = useLocation();

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
    <Switch>
      {/* PUBLIC — discoverable, no AI compute */}
      <Route path="/" component={Home} />
      <Route path="/about" component={AboutPage} />
      <Route path="/free" component={FreeTerminalPage} />
      <Route path="/terminal/free" component={FreeTerminalRedirect} />
      <Route path="/burn" component={BurnPage} />
      <Route path="/treasury" component={TreasuryPage} />
      <Route path="/staking" component={StakingPage} />
      <Route path="/stake" component={StakingPage} />
      <Route path="/agents/stake" component={StakingPage} />
      <Route path="/mini-app" component={MiniAppPage} />
      <Route path="/token-gated" component={TokenGatedPage} />
      <Route path="/my-burns" component={MyBurnsPage} />
      <Route path="/burns" component={MyBurnsPage} />
      <Route path="/holders" component={HoldersDirectoryPage} />
      <Route path="/telegram" component={TelegramLinkPage} />
      <Route path="/api-catalog" component={ApiCatalogPage} />
      <Route path="/deploy" component={DeployPage} />
      <Route path="/agents/builder" component={AgentBuilderPage} />
      <Route path="/agents" component={AgentsHubPage} />
      <Route path="/skill" component={SkillsPage} />
      <Route path="/skills" component={SkillsPage} />
      <Route path="/agents/runtime" component={AgentRuntimeMatrixPage} />
      <Route path="/agents/chat" component={AgentChatPage} />
      <Route path="/agents/deployed/:slug" component={DeployedAgentDetailPage} />
      <Route path="/agents/:id" component={AgentDetailPage} />
      <Route path="/portfolio" component={ClawdPortfolioPage} />
      <Route path="/clawd-portfolio" component={ClawdPortfolioPage} />
      <Route path="/news" component={NewsFeedPage} />
      <Route path="/feed" component={NewsFeedPage} />
      <Route path="/stocks" component={StocksPage} />
      <Route path="/arena" component={AgentArenaPage} />
      <Route path="/agent/arena" component={AgentArenaPage} />
      <Route path="/clawd-arena" component={ClawdArenaPage} />
      <Route path="/voice" component={VoicePage} />
      <Route path="/stream" component={StreamPage} />
      <Route path="/streaming" component={StreamPage} />
      <Route path="/trading" component={TradingPage} />
      <Route path="/agent-templates" component={AgentTemplatesPage} />
      <Route path="/templates" component={AgentTemplatesPage} />
      <Route path="/boxes" component={BoxesPage} />
      <Route path="/agents/boxes" component={BoxesPage} />
      <Route path="/new" component={NewPage} />
      <Route path="/clawd-swap" component={ClawdSwapArticlePage} />
      <Route path="/swap" component={ClawdSwapArticlePage} />
      <Route path="/remote" component={RemoteControlPage} />
      <Route path="/wallet" component={AccountPage} />
      <Route path="/trade" component={TradingPage} />
      <Route path="/desk" component={ImperialDeskPage} />
      <Route path="/grok">{() => <AuthGate><ClawdGrokPage /></AuthGate>}</Route>

      {/* GATED — require $CLAWD holdings (no free AI) */}
      <Route path="/search">{() => <TokenGate><SearchInterface /></TokenGate>}</Route>
      <Route path="/contract">{() => <TokenGate><ContractPage /></TokenGate>}</Route>
      <Route path="/contract-explorer">{() => <TokenGate><ContractExplorer /></TokenGate>}</Route>
      <Route path="/clawd">{() => <TokenGate><DeepSeekPage /></TokenGate>}</Route>
      <Route path="/terminal">{() => <TokenGate><TerminalPage /></TokenGate>}</Route>
      <Route path="/meme-gallery">{() => <TokenGate><MemeGalleryPage /></TokenGate>}</Route>
      <Route path="/agent-launchpad">{() => <TokenGate><AgentLaunchpadPage /></TokenGate>}</Route>
      <Route path="/grok-test">{() => <TokenGate><GrokTestPage /></TokenGate>}</Route>
      <Route path="/hermes">{() => <TokenGate><HermesPage /></TokenGate>}</Route>
      <Route path="/nvidia-test">{() => <TokenGate><NvidiaTestPage /></TokenGate>}</Route>
      <Route path="/prover">{() => <TokenGate><ProverPage /></TokenGate>}</Route>
      <Route path="/browser-analyzer">{() => <TokenGate><BrowserTabAnalyzerPage /></TokenGate>}</Route>
      <Route path="/dex" component={DexPage} />
      <Route path="/wallet-scanner">{() => <TokenGate><WalletScannerPage /></TokenGate>}</Route>
      <Route path="/gacha" component={GachaPage} />
      <Route path="/gacha/verify" component={GachaVerifyPage} />
      <Route path="/video-gen">{() => <TokenGate><VideoGenPage /></TokenGate>}</Route>
      <Route path="/metaplex-agents" component={MetaplexAgentPage} />
      <Route path="/agentexplorer" component={AgentExplorerPage} />
      <Route path="/agent-explorer" component={AgentExplorerPage} />
      <Route path="/nft-studio">{() => <TokenGate><NftStudioPage /></TokenGate>}</Route>
      <Route path="/imagine">{() => <TokenGate><ImagineStudioPage /></TokenGate>}</Route>
      <Route path="/gemini-studio">{() => <TokenGate><GeminiStudioPage /></TokenGate>}</Route>
      <Route path="/gallery">{() => <TokenGate><GalleryPage /></TokenGate>}</Route>
      <Route path="/computer">{() => <TokenGate><BrowserUsePage /></TokenGate>}</Route>
      <Route path="/discord">{() => <TokenGate><DiscordPage /></TokenGate>}</Route>
      <Route path="/prediction">{() => <TokenGate><PredictionMarketsPage /></TokenGate>}</Route>
      <Route path="/predictions">{() => <TokenGate><PredictionMarketsPage /></TokenGate>}</Route>
      <Route path="/dflow">{() => <TokenGate><DFlowMarketsPage /></TokenGate>}</Route>
      <Route path="/ooda">{() => <TokenGate><DFlowOODAPage /></TokenGate>}</Route>
      <Route path="/perps" component={PhoenixPerpsPage} />
      <Route path="/phoenix" component={PhoenixPerpsPage} />
      <Route path="/flash" component={FlashPage} />
      <Route path="/usage">{() => <TokenGate><UsagePage /></TokenGate>}</Route>
      <Route path="/api-keys">{() => <TokenGate><RouterKeysPage /></TokenGate>}</Route>
      <Route path="/router-keys">{() => <TokenGate><RouterKeysPage /></TokenGate>}</Route>
      <Route path="/backroom">{() => <TokenGate><BackroomPage /></TokenGate>}</Route>
      <Route path="/backrooms">{() => <TokenGate><BackroomPage /></TokenGate>}</Route>
      <Route path="/tee">{() => <TokenGate><TeePage /></TokenGate>}</Route>
      <Route path="/launch" component={PumpPage} />
      <Route path="/launchpad" component={PumpPage} />
      <Route path="/pump" component={PumpPage} />
      <Route path="/pumpfun" component={PumpPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/profile" component={AccountPage} />

      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function AppShell() {
  // Check if we're in mini-app mode
  const [location] = useLocation();
  const isMiniApp = location.includes('/mini-app');
  const isTerminal = location === '/terminal' || location === '/clawd' || location === '/free' || location === '/terminal/free';
  const isTradingSurface = /^\/(desk|dex|trading|swap|clawd-swap|perps|phoenix|flash|dflow|prediction|predictions|stocks|stream|streaming)(\/|$)/.test(location);
  const { user, isAuthenticated } = useAuth();
  const isBrowseOnly = isAuthenticated && user?.role !== "admin" && !user?.isTokenGated;
  const canUsePaidAi = isAuthenticated;
  const showGlobalChrome = !isMiniApp && !isTradingSurface;
  const showMobileRemote = !isMiniApp && !isTerminal;

  return (
    <div className={`min-h-screen-dynamic bg-background flex flex-col overflow-x-hidden ${showMobileRemote ? 'pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0' : ''}`}>
      {showGlobalChrome && (
        <LazyShellWidget>
          <div className="hidden sm:block"><TokenTicker /></div>
        </LazyShellWidget>
      )}
      {showGlobalChrome && (
        <LazyShellWidget>
          <div className="hidden sm:block"><BurnTicker /></div>
        </LazyShellWidget>
      )}
      {showGlobalChrome && canUsePaidAi && (
        <div className="hidden border-b border-purple-500/10 bg-black/40 py-2 px-4 md:block">
          <div className="container mx-auto">
            <LazyShellWidget>
              <SmartSearchBar />
            </LazyShellWidget>
          </div>
        </div>
      )}
      
      <div className={`${isMiniApp || isTradingSurface ? '' : 'container'} mx-auto ${isMiniApp ? 'p-0' : isTradingSurface ? 'px-2 py-2 sm:px-4' : 'px-3 py-2 sm:px-4'} ${isTerminal ? 'pb-0' : ''} w-full flex-grow`}>
        {!isMiniApp && <Navigation />}
        {showGlobalChrome && <TokenGateBadge />}
        {!isMiniApp && isBrowseOnly && (
          <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            Registered access is active for this account. Site AI is available; holder-only trading and terminal areas stay locked until this account holds `$CLAWD` or completes entry access.
          </div>
        )}
        <Router />
        {!isTerminal && showGlobalChrome && (
          <LazyShellWidget>
            <SocialLinks />
          </LazyShellWidget>
        )}
      </div>
      
      {!isTerminal && showGlobalChrome && canUsePaidAi && (
        <div className="mt-auto hidden w-full md:block">
          <LazyShellWidget>
            <MiniTerminal />
          </LazyShellWidget>
        </div>
      )}
      <MobileRemoteControl hidden={!showMobileRemote} />
    </div>
  );
}

function EntryGate() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  return (
    <AppShell />
  );
}

function AuthenticatedMedia() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || user?.role !== "admin") return null;
  return (
    <LazyShellWidget>
      <StreamPlayer />
      <MusicPlayer />
    </LazyShellWidget>
  );
}

function OptionalConvexProvider({ children }: { children: React.ReactNode }) {
  if (!convexClient) return <>{children}</>;
  if (hasClerk()) {
    return (
      <ConvexProviderWithClerk client={convexClient} useAuth={useClerkAuth}>
        {children}
      </ConvexProviderWithClerk>
    );
  }
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OptionalConvexProvider>
      <ErrorBoundary>
        <Wallet>
          <AuthProvider>
          <TokenGateProvider>
          <TreasuryGateProvider>
          <EntryGate />
          <AuthenticatedMedia />
          <LazyShellWidget>
            <ClawdCompanion />
          </LazyShellWidget>
          <Toaster />
          </TreasuryGateProvider>
          </TokenGateProvider>
          </AuthProvider>
        </Wallet>
      </ErrorBoundary>
      </OptionalConvexProvider>
    </QueryClientProvider>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch dynamically imported module") ||
      error.message.includes("Importing a module script failed");

    if (isChunkError) {
      window.location.reload();
      return;
    }
    console.error("Error in app:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 text-sm text-gray-400">
          <p className="mb-3">Something went wrong.</p>
          <button type="button" onClick={() => window.location.reload()} className="underline hover:text-white">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;
