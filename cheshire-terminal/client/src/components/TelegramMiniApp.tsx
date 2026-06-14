import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Activity,
  ArrowRightLeft,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WalletSignIn } from "@/components/WalletSignIn";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getPhantomBrowseUrl, isMobileUserAgent } from "@/lib/phantomLinks";

interface TelegramMiniAppProps {
  telegramInitData?: string;
}

type TelegramConfig = {
  appUrl?: string;
  botUsername?: string;
  loginConfigured?: boolean;
  tradingEnabled?: boolean;
};

type TelegramMiniAppUser = {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
};

type TelegramSession = {
  status: "ok" | "invalid";
  isValid: boolean;
  user: TelegramMiniAppUser | null;
};

type RemoteAction = {
  label: string;
  path: string;
  params?: Record<string, string>;
  icon: typeof Sparkles;
  tone: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        close?: () => void;
        expand?: () => void;
        openLink?: (url: string) => void;
        openTelegramLink?: (url: string) => void;
        sendData?: (data: string) => void;
      };
    };
  }
}

const remoteActions: RemoteAction[] = [
  { label: "Free Terminal", path: "/free", icon: Sparkles, tone: "border-emerald-400/30 text-emerald-200" },
  { label: "Terminal Ops", path: "/terminal", params: { tab: "ops" }, icon: Terminal, tone: "border-cyan-400/30 text-cyan-200" },
  { label: "AI Console", path: "/terminal", params: { tab: "ai", prompt: "Help me plan my next Cheshire Terminal action." }, icon: Bot, tone: "border-purple-400/30 text-purple-200" },
  { label: "Agent Hub", path: "/agents", icon: Bot, tone: "border-purple-400/30 text-purple-200" },
  { label: "Computer Use", path: "/computer", icon: MonitorSmartphone, tone: "border-blue-400/30 text-blue-200" },
  { label: "Swap", path: "/swap", icon: ArrowRightLeft, tone: "border-yellow-400/30 text-yellow-200" },
  { label: "Perps", path: "/perps", icon: Activity, tone: "border-rose-400/30 text-rose-200" },
];

const commandExamples = [
  "/trade buy 0.1 SOL of CLAWD",
  "/trade long SOL 0.1",
  "spawn a Grok trading agent",
  "/computer research a token launch",
  "/ask summarize my wallet risk",
];

function shortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

function displayTelegramUser(user: TelegramMiniAppUser | null | undefined) {
  if (!user) return "Telegram not verified";
  if (user.username) return `@${user.username}`;
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || `tg:${user.id}`;
}

function getInitDataFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return (
    window.Telegram?.WebApp?.initData ||
    params.get("tgWebAppData") ||
    params.get("initData") ||
    ""
  );
}

export function TelegramMiniApp({ telegramInitData }: TelegramMiniAppProps) {
  const { publicKey, connected } = useWallet();
  const { isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const wallet = publicKey?.toBase58() ?? "";
  const initData = useMemo(() => telegramInitData || getInitDataFromLocation(), [telegramInitData]);
  const [session, setSession] = useState<TelegramSession | null>(null);
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const { data: config } = useQuery<TelegramConfig>({
    queryKey: ["/api/telegram/config"],
  });

  const { data: linkStatus } = useQuery<{
    linked: boolean;
    telegramUsername?: string;
    telegramFirstName?: string;
  }>({
    queryKey: ["/api/telegram-link/status", wallet],
    enabled: !!wallet,
  });

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    setIsMobile(isMobileUserAgent());
  }, []);

  useEffect(() => {
    if (!initData) return;
    let cancelled = false;

    fetch("/api/telegram/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch(() => {
        if (!cancelled) setSession({ status: "invalid", isValid: false, user: null });
      });

    return () => {
      cancelled = true;
    };
  }, [initData]);

  useEffect(() => {
    const tgUser = session?.user;
    if (!wallet || !tgUser?.id || registered || registering) return;

    const username =
      tgUser.username ||
      [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
      `telegram-${tgUser.id}`;

    setRegistering(true);
    fetch("/api/telegram/register", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: wallet,
        username,
        telegramId: String(tgUser.id),
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Telegram session registration failed");
        setRegistered(true);
        window.Telegram?.WebApp?.sendData?.(
          JSON.stringify({ action: "wallet_connected", walletAddress: wallet }),
        );
      })
      .catch(() => {})
      .finally(() => setRegistering(false));
  }, [registered, registering, session?.user, wallet]);

  const openPath = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("source", "telegram-mini");
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }

    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url.toString());
    } else {
      window.location.href = url.toString();
    }
  };

  const openBot = () => {
    if (!config?.botUsername) return;
    const url = `https://t.me/${config.botUsername}`;
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
    } else {
      window.location.href = url;
    }
  };

  const openPhantom = () => {
    const url = getPhantomBrowseUrl(window.location.href, window.location.origin);
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.location.href = url;
    }
  };

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast({ title: "Command copied", description: command });
    } catch {
      toast({ title: "Copy failed", description: command, variant: "destructive" });
    }
  };

  const linkedName =
    linkStatus?.telegramUsername
      ? `@${linkStatus.telegramUsername}`
      : linkStatus?.telegramFirstName || null;
  const tgUser = session?.user ?? null;
  const isDurablyLinked = Boolean(linkStatus?.linked);
  const remoteReady = connected && (isDurablyLinked || registered || session?.isValid);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card className="border-cyan-500/20 bg-black/70">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <MessageCircle className="h-5 w-5 text-cyan-300" />
                Telegram Remote
              </CardTitle>
              <p className="mt-1 text-xs text-white/50">
                Use Telegram as the mobile control surface for terminals, agents, and wallet-signed actions.
              </p>
            </div>
            <Badge variant="outline" className={remoteReady ? "border-green-400/30 text-green-300" : "border-yellow-400/30 text-yellow-300"}>
              {remoteReady ? "Ready" : "Setup"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
                <MessageCircle className="h-3.5 w-3.5" />
                Telegram
              </div>
              <div className="truncate text-sm text-cyan-100">
                {linkedName || displayTelegramUser(tgUser)}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
                <Wallet className="h-3.5 w-3.5" />
                Wallet
              </div>
              <div className="truncate font-mono text-sm text-purple-100">
                {shortAddress(wallet || user?.walletAddress)}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/35">
                <ShieldCheck className="h-3.5 w-3.5" />
                Session
              </div>
              <div className="truncate text-sm text-emerald-100">
                {isAuthenticated ? "Signed wallet" : connected ? "Wallet connected" : "Connect wallet"}
              </div>
            </div>
          </div>

          {!connected ? (
            <div className="rounded-md border border-purple-500/25 bg-purple-500/10 p-3">
              <p className="mb-3 text-sm text-purple-100">
                Connect a Solana wallet once, then Telegram can route you back to the exact signer page for trades and terminal actions.
              </p>
              {isMobile && (
                <Button
                  type="button"
                  className="mb-2 h-10 w-full justify-center gap-2 bg-purple-600 text-sm hover:bg-purple-700"
                  onClick={openPhantom}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open in Phantom
                </Button>
              )}
              <WalletMultiButton className="!w-full !justify-center !rounded-md !bg-purple-600 hover:!bg-purple-700 !text-sm" />
              <p className="mt-2 text-[11px] leading-4 text-purple-100/60">
                {isMobile
                  ? "Phantom opens this Telegram session in its in-app browser so wallet connection and signatures work reliably."
                  : "Use the wallet adapter to connect Phantom in this browser."}
              </p>
            </div>
          ) : !isAuthenticated ? (
            <div className="rounded-md border border-green-500/25 bg-green-500/10 p-3">
              <p className="mb-3 text-sm text-green-100">
                Sign the wallet challenge so holder-gated terminal actions and account state follow this mobile session.
              </p>
              <WalletSignIn compact />
            </div>
          ) : null}

          {!isDurablyLinked && (
            <div className="flex flex-col gap-2 rounded-md border border-yellow-500/25 bg-yellow-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-yellow-100">
                Durable Telegram linking still happens through the Telegram Terminal page.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-yellow-400/30 text-yellow-100 hover:bg-yellow-500/10"
                onClick={() => openPath("/telegram")}
              >
                Link Telegram
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {remoteActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.path}
              type="button"
              variant="outline"
              className={`h-12 justify-start gap-2 bg-black/50 text-xs ${action.tone}`}
              onClick={() => openPath(action.path, action.params)}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{action.label}</span>
            </Button>
          );
        })}
      </div>

      <Card className="border-white/10 bg-black/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Bot Commands</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {commandExamples.map((command) => (
            <button
              key={command}
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-mono text-xs text-white/75 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
              onClick={() => copyCommand(command)}
            >
              <Copy className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
              <span className="min-w-0 flex-1 truncate">{command}</span>
            </button>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" onClick={openBot} disabled={!config?.botUsername} className="gap-2 bg-cyan-500 text-black hover:bg-cyan-400">
              <ExternalLink className="h-4 w-4" />
              Open @{config?.botUsername || "bot"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-2 border-white/10 text-white/70" onClick={() => openPath("/account")}>
              <ShieldCheck className="h-4 w-4" />
              Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
