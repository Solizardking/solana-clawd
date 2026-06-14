import React from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Activity, BarChart3, Bot, Brain, Calculator, CandlestickChart, CheckCircle2, Cloud, Code,
  KeyRound,
  ChevronDown, Clock, Cpu, Dice6, ExternalLink, Flame,
  GalleryHorizontalEnd, Globe, Home, Image, Info, Lock,
  MessagesSquare, Mic, MonitorSmartphone, Newspaper, Paintbrush,
  Radio, Search, Shield, Sparkles, Target, Terminal, TrendingUp,
  User, Video, Wallet, Zap,
} from 'lucide-react';
import { ClawdPixelArt } from '@/components/ClawdPixelArt';
import { useTokenGate } from '@/contexts/TokenGateContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletSignIn } from '@/components/WalletSignIn';
import { useAuth } from '@/contexts/AuthContext';
import { getPublicConfig } from '@/lib/publicConfig';

// ── Types ────────────────────────────────────────────────────────────────────

const AssemblyVoiceAgent = React.lazy(() =>
  import('@/components/AssemblyVoiceAgent').then((m) => ({ default: m.AssemblyVoiceAgent })),
);

const APP_ROUTE_HREFS = [
  '/',
  '/about',
  '/api-catalog',
  '/api-keys',
  '/arena',
  '/agent/arena',
  '/backroom',
  '/boxes',
  '/browser-analyzer',
  '/burn',
  '/clawd',
  '/computer',
  '/dex',
  '/desk',
  '/deploy',
  '/discord',
  '/dflow',
  '/free',
  '/flash',
  '/gallery',
  '/gacha',
  '/gemini-studio',
  '/grok',
  '/holders',
  '/imagine',
  '/launch',
  '/launchpad',
  '/meme-gallery',
  '/metaplex-agents',
  '/my-burns',
  '/new',
  '/news',
  '/nft-studio',
  '/ooda',
  '/perps',
  '/prediction',
  '/prover',
  '/search',
  '/skill',
  '/skills',
  '/stake',
  '/staking',
  '/stocks',
  '/stream',
  '/streaming',
  '/swap',
  '/telegram',
  '/terminal',
  '/token-gated',
  '/trade',
  '/trading',
  '/treasury',
  '/usage',
  '/video-gen',
  '/voice',
  '/wallet',
  '/wallet-scanner',
  '/agent-launchpad',
  '/agent-explorer',
  '/agentexplorer',
  '/agent-templates',
  '/agents',
  '/agents/boxes',
  '/agents/builder',
  '/agents/runtime',
  '/agents/stake',
  '/account',
  '/backrooms',
  '/burns',
  '/clawd-arena',
  '/clawd-portfolio',
  '/clawd-swap',
  '/contract',
  '/contract-explorer',
  '/feed',
  '/gacha/verify',
  '/grok-test',
  '/hermes',
  '/mini-app',
  '/nvidia-test',
  '/phoenix',
  '/portfolio',
  '/predictions',
  '/profile',
  '/pump',
  '/pumpfun',
  '/remote',
  '/router-keys',
  '/tee',
  '/templates',
  '/terminal/free',
] as const;

type AppRouteHref = (typeof APP_ROUTE_HREFS)[number];
type NavigateToRoute = (href: AppRouteHref) => void;
type NavItem = { href: AppRouteHref; label: string; icon: React.ReactNode };

type NavGroup = {
  label: string;
  icon: React.ReactNode;
  color: string;
  items: NavItem[];
};

// ── Groups ───────────────────────────────────────────────────────────────────

const buildGroups = (backroomAvailable: boolean): NavGroup[] => [
  {
    label: 'Trade',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: 'text-red-400 border-red-500/50 hover:bg-red-900/20',
    items: [
      { href: '/clawd',      label: 'CLAWD Terminal',     icon: <span className="text-sm leading-none">🦞</span> },
      { href: '/arena',      label: 'Agent Arena',        icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/dex',        label: 'DEX Explorer',       icon: <BarChart3 className="h-3.5 w-3.5" /> },
      { href: '/desk',       label: 'Imperial Desk',      icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/trading',    label: 'Trading',            icon: <TrendingUp className="h-3.5 w-3.5" /> },
      { href: '/stocks',     label: 'Stocks',             icon: <CandlestickChart className="h-3.5 w-3.5" /> },
      { href: '/prediction', label: 'Prediction Markets', icon: <TrendingUp className="h-3.5 w-3.5" /> },
      { href: '/dflow',      label: 'DFlow Markets',      icon: <TrendingUp className="h-3.5 w-3.5" /> },
      { href: '/ooda',       label: 'DFlow OODA',         icon: <Target className="h-3.5 w-3.5" /> },
      { href: '/perps',      label: 'Phoenix Perps',      icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/flash',      label: 'Flash Trade',        icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/launchpad',  label: 'Launchpad',          icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/swap',       label: 'Swap',               icon: <Zap className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: 'AI',
    icon: <Brain className="h-3.5 w-3.5" />,
    color: 'text-purple-400 border-purple-500/50 hover:bg-purple-900/20',
    items: [
      { href: '/voice',            label: 'Voice',           icon: <Mic className="h-3.5 w-3.5" /> },
      { href: '/agents',           label: 'Agent Hub',       icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/skill',            label: 'Skill Catalog',   icon: <Code className="h-3.5 w-3.5" /> },
      { href: '/deploy',           label: 'Deploy Agent',    icon: <Cloud className="h-3.5 w-3.5" /> },
      { href: '/agents/builder',   label: 'Agent Builder',   icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/agents/runtime',   label: 'Agent Runtime',   icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/imagine',          label: 'Imagine Studio',  icon: <Sparkles className="h-3.5 w-3.5" /> },
      { href: '/gemini-studio',    label: 'Gemini Studio',   icon: <Sparkles className="h-3.5 w-3.5" /> },
      { href: '/video-gen',        label: 'Video Gen',       icon: <Video className="h-3.5 w-3.5" /> },
      { href: '/grok',             label: 'Grok',            icon: <Brain className="h-3.5 w-3.5" /> },
      { href: '/prover',           label: 'DeepSeek Prover', icon: <Calculator className="h-3.5 w-3.5" /> },
      { href: '/agent-templates',  label: 'Agent Templates', icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/agent-launchpad',  label: 'AI Agents',       icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/metaplex-agents',  label: 'Agent Registry',  icon: <Cpu className="h-3.5 w-3.5" /> },
      { href: '/agent-explorer',   label: 'Agent Explorer',  icon: <Activity className="h-3.5 w-3.5" /> },
      ...(backroomAvailable ? [{ href: '/backroom' as const, label: 'Backroom', icon: <Radio className="h-3.5 w-3.5" /> }] : []),
    ],
  },
  {
    label: 'Social',
    icon: <MessagesSquare className="h-3.5 w-3.5" />,
    color: 'text-cyan-400 border-cyan-500/50 hover:bg-cyan-900/20',
    items: [
      { href: '/telegram', label: 'Telegram',    icon: <MessagesSquare className="h-3.5 w-3.5" /> },
      { href: '/discord',  label: 'Discord',     icon: <MessagesSquare className="h-3.5 w-3.5" /> },
      { href: '/news',     label: 'News & Feed', icon: <Newspaper className="h-3.5 w-3.5" /> },
      { href: '/gallery',  label: 'Live Gallery',icon: <GalleryHorizontalEnd className="h-3.5 w-3.5" /> },
      { href: '/stream',   label: 'Stream',       icon: <Radio className="h-3.5 w-3.5" /> },
      { href: '/meme-gallery', label: 'Meme Gallery', icon: <Image className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: 'CLAWD',
    icon: <Flame className="h-3.5 w-3.5" />,
    color: 'text-orange-400 border-orange-500/50 hover:bg-orange-900/20',
    items: [
      { href: '/stake',       label: 'Stake',         icon: <Shield className="h-3.5 w-3.5" /> },
      { href: '/staking',     label: 'Agent Staking', icon: <Shield className="h-3.5 w-3.5" /> },
      { href: '/treasury',    label: 'Treasury',      icon: <Flame className="h-3.5 w-3.5" /> },
      { href: '/burn',        label: 'Burn',          icon: <Flame className="h-3.5 w-3.5" /> },
      { href: '/my-burns',    label: 'My Burns',      icon: <Flame className="h-3.5 w-3.5" /> },
      { href: '/holders',     label: 'Holders',       icon: <Shield className="h-3.5 w-3.5" /> },
      { href: '/nft-studio',  label: 'NFT Studio',    icon: <Paintbrush className="h-3.5 w-3.5" /> },
      { href: '/gacha',       label: 'Gacha',         icon: <Dice6 className="h-3.5 w-3.5" /> },
      { href: '/boxes',       label: 'Boxes',         icon: <Dice6 className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: 'Tools',
    icon: <Terminal className="h-3.5 w-3.5" />,
    color: 'text-green-400 border-green-500/50 hover:bg-green-900/20',
    items: [
      { href: '/search',           label: 'Search',         icon: <Search className="h-3.5 w-3.5" /> },
      { href: '/contract',         label: 'Contract',       icon: <Code className="h-3.5 w-3.5" /> },
      { href: '/contract-explorer', label: 'Contract Explorer', icon: <Search className="h-3.5 w-3.5" /> },
      { href: '/free',             label: 'Free Terminal',  icon: <Sparkles className="h-3.5 w-3.5" /> },
      { href: '/terminal',         label: 'Terminal',       icon: <Terminal className="h-3.5 w-3.5" /> },
      { href: '/wallet-scanner',   label: 'Wallet Scanner', icon: <Wallet className="h-3.5 w-3.5" /> },
      { href: '/computer',         label: 'Computer Use',   icon: <Globe className="h-3.5 w-3.5" /> },
      { href: '/browser-analyzer', label: 'Tab Analyzer',   icon: <MonitorSmartphone className="h-3.5 w-3.5" /> },
      { href: '/usage',            label: 'Usage Stats',    icon: <BarChart3 className="h-3.5 w-3.5" /> },
      { href: '/api-catalog',      label: 'API Catalog',    icon: <Code className="h-3.5 w-3.5" /> },
      { href: '/api-keys',         label: 'API Keys',       icon: <KeyRound className="h-3.5 w-3.5" /> },
      { href: '/new',              label: 'Recently Shopped',icon: <Clock className="h-3.5 w-3.5" /> },
      { href: '/about',            label: 'About',          icon: <Info className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: 'More',
    icon: <Globe className="h-3.5 w-3.5" />,
    color: 'text-zinc-300 border-zinc-500/50 hover:bg-zinc-900/40',
    items: [
      { href: '/portfolio',       label: 'Portfolio',       icon: <Wallet className="h-3.5 w-3.5" /> },
      { href: '/clawd-portfolio', label: 'CLAWD Portfolio', icon: <Wallet className="h-3.5 w-3.5" /> },
      { href: '/profile',         label: 'Profile',         icon: <User className="h-3.5 w-3.5" /> },
      { href: '/mini-app',        label: 'Mini App',        icon: <MonitorSmartphone className="h-3.5 w-3.5" /> },
      { href: '/hermes',          label: 'Hermes',          icon: <Sparkles className="h-3.5 w-3.5" /> },
      { href: '/grok-test',       label: 'Grok Test',       icon: <Brain className="h-3.5 w-3.5" /> },
      { href: '/nvidia-test',     label: 'NVIDIA Test',     icon: <Cpu className="h-3.5 w-3.5" /> },
      { href: '/tee',             label: 'TEE',             icon: <Shield className="h-3.5 w-3.5" /> },
      { href: '/gacha/verify',    label: 'Gacha Verify',    icon: <Dice6 className="h-3.5 w-3.5" /> },
      { href: '/templates',       label: 'Templates',       icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/agents/stake',    label: 'Agents Stake',    icon: <Shield className="h-3.5 w-3.5" /> },
      { href: '/agents/boxes',    label: 'Agents Boxes',    icon: <Dice6 className="h-3.5 w-3.5" /> },
      { href: '/phoenix',         label: 'Phoenix Alias',   icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/clawd-swap',      label: 'CLAWD Swap',      icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/predictions',     label: 'Predictions',     icon: <TrendingUp className="h-3.5 w-3.5" /> },
      { href: '/trade',           label: 'Trade Alias',     icon: <TrendingUp className="h-3.5 w-3.5" /> },
      { href: '/wallet',          label: 'Wallet Alias',    icon: <Wallet className="h-3.5 w-3.5" /> },
      { href: '/remote',          label: 'Remote Alias',    icon: <MessagesSquare className="h-3.5 w-3.5" /> },
      { href: '/router-keys',     label: 'Router Keys Alias', icon: <KeyRound className="h-3.5 w-3.5" /> },
      { href: '/launch',          label: 'Launch Alias',    icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/agentexplorer',   label: 'Agent Explorer Alias', icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/pump',            label: 'Pump',            icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/pumpfun',         label: 'Pumpfun',         icon: <Zap className="h-3.5 w-3.5" /> },
      { href: '/backrooms',       label: 'Backrooms',       icon: <Radio className="h-3.5 w-3.5" /> },
      { href: '/burns',           label: 'Burns',           icon: <Flame className="h-3.5 w-3.5" /> },
      { href: '/feed',            label: 'Feed',            icon: <Newspaper className="h-3.5 w-3.5" /> },
      { href: '/agent/arena',     label: 'Agent Arena Alias', icon: <Bot className="h-3.5 w-3.5" /> },
      { href: '/clawd-arena',     label: 'CLAWD Duel',      icon: <Activity className="h-3.5 w-3.5" /> },
      { href: '/terminal/free',   label: 'Free Redirect',   icon: <Terminal className="h-3.5 w-3.5" /> },
    ],
  },
];

// ── Dropdown component ───────────────────────────────────────────────────────
// Rendered as a fixed-position portal so it escapes the overflow-x:auto nav
// container and always appears fully visible over all page content.

function NavDropdown({
  group,
  currentPath,
  navigate,
}: {
  group: NavGroup;
  currentPath: string;
  navigate: NavigateToRoute;
}) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const panelId = React.useId();
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: 220 });
  const isActive = group.items.some((i) => i.href === currentPath);

  const updatePos = React.useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 220;
    const panelWidth = Math.min(Math.max(viewportWidth - 16, 180), 240);
    const left = Math.min(
      Math.max(r.left, 8),
      Math.max(viewportWidth - panelWidth - 8, 8),
    );

    setPos({ top: r.bottom + 6, left, width: panelWidth });
  }, []);

  const toggle = () => {
    updatePos();
    setOpen((o) => !o);
  };

  const closeAndFocusTrigger = React.useCallback(() => {
    setOpen(false);
    window.setTimeout(() => btnRef.current?.focus(), 0);
  }, []);

  const handleItemClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: AppRouteHref) => {
      setOpen(false);

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0
      ) {
        return;
      }

      event.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  React.useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (e: PointerEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const closeOnKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndFocusTrigger();
    };
    const reposition = () => { updatePos(); };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnKeyDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnKeyDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [closeAndFocusTrigger, open, updatePos]);

  React.useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  const panel = open ? createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="menu"
      aria-label={`${group.label} navigation`}
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      className="fixed z-[9999] max-h-[min(70vh,480px)] overflow-y-auto rounded-lg border border-white/10 bg-black/95 p-1 shadow-2xl backdrop-blur-md"
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeAndFocusTrigger();
      }}
    >
      {group.items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          role="menuitem"
          aria-current={currentPath === item.href ? 'page' : undefined}
          onClick={(event) => handleItemClick(event, item.href)}
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors hover:bg-white/10 ${
            currentPath === item.href ? 'bg-white/10 font-medium text-white' : 'text-white/70 hover:text-white'
          }`}
        >
          <span className="shrink-0 opacity-60">{item.icon}</span>
          {item.label}
          {currentPath === item.href && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-400" />
          )}
        </a>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            updatePos();
            setOpen(true);
          }
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? panelId : undefined}
        className={`flex snap-start items-center gap-1 whitespace-nowrap transition-all duration-200 ${group.color} ${
          isActive ? 'bg-white/10' : ''
        }`}
      >
        {group.icon}
        <span>{group.label}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      {panel}
    </div>
  );
}

// ── Main navigation ──────────────────────────────────────────────────────────

export function Navigation() {
  const [location, setLocation] = useLocation();
  const { isVerified } = useTokenGate();
  const { connected } = useWallet();
  const { user, isAuthenticated } = useAuth();
  const hasHolderAccess = isAuthenticated && (user?.role === 'admin' || user?.isTokenGated);
  const [backroomAvailable, setBackroomAvailable] = React.useState(false);
  const isTradingPath = /^\/(desk|dex|trading|swap|clawd-swap|perps|phoenix|dflow|prediction|predictions|stocks)(\/|$)/.test(location);
  const [tradingNavHidden, setTradingNavHidden] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    void getPublicConfig()
      .then((config) => { if (mounted) setBackroomAvailable(config.features.backroomAvailable); })
      .catch(() => { if (mounted) setBackroomAvailable(false); });
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (!isTradingPath || typeof window === 'undefined') return;
    setTradingNavHidden(window.localStorage.getItem('cheshire:trading-nav-hidden') === '1');
  }, [isTradingPath]);

  const persistTradingNavHidden = React.useCallback((hidden: boolean) => {
    setTradingNavHidden(hidden);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cheshire:trading-nav-hidden', hidden ? '1' : '0');
    }
  }, []);

  const groups = React.useMemo(() => buildGroups(backroomAvailable), [backroomAvailable]);

  if (isTradingPath && tradingNavHidden) {
    return (
      <div className="pointer-events-none fixed right-3 top-3 z-50">
        <button
          type="button"
          onClick={() => persistTradingNavHidden(false)}
          className="pointer-events-auto rounded-full border border-cyan-500/30 bg-black/85 px-3 py-1.5 text-[11px] font-mono text-cyan-200 shadow-2xl backdrop-blur transition-colors hover:bg-cyan-950/60 hover:text-white"
        >
          Show nav
        </button>
      </div>
    );
  }

  return (
    <div className={`sticky top-0 z-40 -mx-2 border-b border-purple-500/20 bg-black/85 px-2 pt-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 ${
      isTradingPath ? 'mb-2 pb-2 sm:mb-4' : 'mb-4 pb-3 sm:mb-6 sm:pb-4'
    }`}>
      {/* Top bar */}
      <div className={`${isTradingPath ? 'mb-1' : 'mb-2'} flex items-center justify-between gap-2 px-1`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <ClawdPixelArt autoAnimate size={isTradingPath ? 0.18 : 0.2} showLabel={false} className="sm:hidden" />
              <ClawdPixelArt autoAnimate size={isTradingPath ? 0.24 : 0.28} showLabel={false} className="hidden sm:inline-flex" />
              <span className="text-xs font-black tracking-widest bg-gradient-to-r from-green-400 to-cyan-400 text-transparent bg-clip-text">CLAWD</span>
            </div>
          </Link>
          <span className={`hidden text-xs text-purple-400/40 ${isTradingPath ? 'sm:inline' : 'min-[380px]:inline'}`}>&</span>
          <span className={`hidden text-xs font-black tracking-widest bg-gradient-to-r from-purple-400 to-blue-400 text-transparent bg-clip-text ${isTradingPath ? 'sm:inline' : 'min-[380px]:inline'}`}>CODEX</span>
          <span className="text-xs text-purple-400/60 ml-1 hidden sm:inline">— Cheshire Terminal · <span className="text-purple-300">powered by $CLAWD</span></span>
        </div>
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
          {isTradingPath && (
            <button
              type="button"
              onClick={() => persistTradingNavHidden(true)}
              className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] font-mono text-zinc-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-200"
            >
              Hide nav
            </button>
          )}
          {hasHolderAccess && (
            <React.Suspense fallback={null}>
              <div className="hidden sm:block"><AssemblyVoiceAgent /></div>
            </React.Suspense>
          )}
          <WalletSignIn compact />
        </div>
      </div>

      {/* Nav row */}
      <nav className={`mobile-scroll flex snap-x items-center gap-2 overflow-x-auto ${isTradingPath ? 'py-1 sm:py-1.5' : 'py-1 sm:py-2'}`}>
        {/* Home */}
        <Button
          asChild
          variant={location === '/' ? 'default' : 'outline'}
          size="sm"
          className="flex snap-start items-center gap-1 whitespace-nowrap"
        >
          <Link href="/">
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </Button>

        {/* CLAWD Gate */}
        <Button
          asChild
          variant={location === '/token-gated' ? 'default' : 'outline'}
          size="sm"
          className={`flex snap-start items-center gap-1 whitespace-nowrap transition-all duration-300 ${
            isVerified
              ? 'border-green-500/60 text-green-400 hover:bg-green-900/20 hover:text-green-300 shadow-sm shadow-green-900/20'
              : connected
              ? 'border-red-500/40 text-red-400 hover:bg-red-900/20 hover:text-red-300 animate-pulse'
              : 'border-orange-500/30 text-orange-400/70 hover:bg-orange-900/10'
          }`}
        >
          <Link href="/token-gated">
            {isVerified
              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              : <Lock className="h-3.5 w-3.5" />}
            {isVerified ? 'CLAWD ✓' : 'Gate'}
          </Link>
        </Button>

        {/* Telegram quick link */}
        <Button
          asChild
          variant={location === '/telegram' ? 'default' : 'outline'}
          size="sm"
          className="flex snap-start items-center gap-1 whitespace-nowrap border-cyan-500/50 text-cyan-400 hover:bg-cyan-900/20"
        >
          <Link href="/telegram">
            <ExternalLink className="h-3.5 w-3.5" />
            Telegram
          </Link>
        </Button>

        {/* Account */}
        {isAuthenticated && (
          <Button
            asChild
            variant={location === '/account' ? 'default' : 'outline'}
            size="sm"
            className="flex snap-start items-center gap-1 whitespace-nowrap border-indigo-500/50 text-indigo-300 hover:bg-indigo-900/20"
          >
            <Link href="/account">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Account</span>
            </Link>
          </Button>
        )}

        {/* Dropdown groups */}
        {groups.map((group) => (
          <NavDropdown key={group.label} group={group} currentPath={location} navigate={setLocation} />
        ))}
      </nav>
    </div>
  );
}
