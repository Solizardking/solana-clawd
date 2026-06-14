import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowRightLeft, Bot, CheckCircle2, ExternalLink,
  Loader2, MessageCircle, MonitorSmartphone, ShieldCheck, Sparkles,
  Terminal, Wallet, XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getPhantomBrowseUrl, isMobileUserAgent } from "@/lib/phantomLinks";
import { apiRequest, queryClient } from "@/lib/queryClient";

declare global {
  interface Window {
    onTelegramAuth?: (user: any) => void;
  }
}

type TelegramConfig = {
  botUsername: string;
  loginConfigured: boolean;
  oidcConfigured: boolean;
  tradingEnabled: boolean;
};

type ClawdStatus = {
  success: boolean;
  wallet: string;
  balance: number;
  isHolder: boolean;
  decimals: number;
};

export default function TelegramLinkPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58();
  const { toast } = useToast();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  const [tgUser, setTgUser] = useState<any>(null);
  const [authing, setAuthing] = useState(false);
  const [clawd, setClawd] = useState<ClawdStatus | null>(null);
  const [clawdLoading, setClawdLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    setIsMobile(isMobileUserAgent());
  }, []);

  const { data: config } = useQuery<TelegramConfig>({
    queryKey: ["/api/telegram/config"],
  });

  // Link status once wallet is connected
  const { data: linkStatus } = useQuery<{
    linked: boolean;
    telegramUsername?: string;
    telegramFirstName?: string;
    photoUrl?: string;
    linkedAt?: string;
  }>({
    queryKey: ["/api/telegram-link/status", wallet],
    enabled: !!wallet,
  });

  // Inject Telegram Login Widget (step 1 — no wallet required)
  useEffect(() => {
    if (!config?.botUsername || !widgetRef.current || tgUser || linkStatus?.linked) return;
    widgetRef.current.innerHTML = "";

    window.onTelegramAuth = (user: any) => {
      setTgUser(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", config.botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-radius", "8");
    widgetRef.current.appendChild(script);
  }, [config?.botUsername, tgUser, linkStatus?.linked]);

  // Verify CLAWD when wallet is available
  const verifyClawd = async () => {
    if (!wallet) return;
    setClawdLoading(true);
    try {
      const res = await fetch(`/api/helius/verify-clawd?wallet=${wallet}`);
      const data: ClawdStatus = await res.json();
      setClawd(data);
    } catch {
      toast({ title: "RPC error", description: "Could not verify $CLAWD balance.", variant: "destructive" });
    } finally {
      setClawdLoading(false);
    }
  };

  // Link Telegram + wallet (called after both are present)
  const linkMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<any>("/api/telegram-link/verify", {
        method: "POST",
        body: JSON.stringify({ walletAddress: wallet, auth: tgUser }),
      });
    },
    onSuccess: (data) => {
      if (data?.error) {
        toast({ title: "Link failed", description: data.error, variant: "destructive" });
      } else {
        setRegistered(true);
        toast({
          title: "Linked!",
          description: `@${data.telegramUsername ?? data.telegramFirstName ?? "telegram"} linked to your wallet.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/telegram-link/status", wallet] });
      }
      setAuthing(false);
    },
    onError: (err: any) => {
      toast({ title: "Link failed", description: err?.message ?? "Verification failed.", variant: "destructive" });
      setAuthing(false);
    },
  });

  const handleLink = () => {
    setAuthing(true);
    linkMutation.mutate();
  };

  const openPath = (path: string) => {
    const url = `${window.location.origin}${path}`;
    if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
    else window.location.href = path;
  };

  const openPhantom = () => {
    const url = getPhantomBrowseUrl(window.location.href, window.location.origin);
    if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
    else window.location.href = url;
  };

  const tgName = tgUser?.username
    ? `@${tgUser.username}`
    : tgUser?.first_name ?? linkStatus?.telegramUsername ?? linkStatus?.telegramFirstName ?? null;

  const isLinked = linkStatus?.linked || registered;
  const remoteCommands = [
    "/trade buy 0.1 SOL of CLAWD",
    "/trade long SOL 0.1",
    "spawn a Grok trading agent",
    "/computer monitor my launch page",
    "/ask summarize wallet risk",
  ];

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast({ title: "Command copied", description: command });
    } catch {
      toast({ title: "Copy failed", description: command, variant: "destructive" });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">

      {/* ── Header ── */}
      <div className="rounded-lg border border-cyan-500/20 bg-black/60 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md border border-cyan-400/30 bg-cyan-400/10">
            <MessageCircle className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Telegram Terminal</h1>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
                @{config?.botUsername || "clawdloginbot"}
              </Badge>
              {tgName && (
                <Badge variant="outline" className="border-green-400/30 text-green-300">
                  {tgName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Quick nav buttons */}
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
          <Button className="h-10 justify-start gap-2 bg-cyan-500 text-black hover:bg-cyan-400" onClick={() => openPath("/free?source=telegram")}>
            <Sparkles className="h-4 w-4" />Free
          </Button>
          <Button className="h-10 justify-start gap-2" variant="outline" onClick={() => openPath("/terminal?source=telegram&tab=ai&prompt=Help%20me%20control%20Cheshire%20Terminal%20from%20Telegram.")}>
            <Terminal className="h-4 w-4" />Terminal
          </Button>
          <Button className="h-10 justify-start gap-2" variant="outline" onClick={() => openPath("/agents?source=telegram")}>
            <Bot className="h-4 w-4" />Agents
          </Button>
          <Button className="h-10 justify-start gap-2" variant="outline" onClick={() => openPath("/swap?source=telegram&from=SOL&to=CLAWD")}>
            <ArrowRightLeft className="h-4 w-4" />Swap
          </Button>
          <Button className="h-10 justify-start gap-2" variant="outline" onClick={() => openPath("/dex?source=telegram")}>
            <Activity className="h-4 w-4" />DEX
          </Button>
          <Button className="h-10 justify-start gap-2" variant="outline" onClick={() => openPath("/account?source=telegram")}>
            <ShieldCheck className="h-4 w-4" />Account
          </Button>
        </div>
      </div>

      <Card className="border-cyan-500/25 bg-black/50">
        <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <MonitorSmartphone className="h-4 w-4 text-cyan-300" />
              Remote Control
            </div>
            <p className="text-xs leading-5 text-white/55">
              Telegram prepares live routes, agent tasks, and terminal handoffs. The app still handles wallet connection,
              signatures, and gated execution so mobile users can review before anything is submitted.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {remoteCommands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => copyCommand(command)}
                className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-mono text-[11px] text-white/70 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
              >
                {command}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Main flow ── */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* Step 1: Telegram Login */}
        <Card className="border-cyan-500/25 bg-black/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-cyan-300" />
              Step 1 — Connect Telegram
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLinked || tgName ? (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3">
                <div className="flex items-center gap-2 text-sm text-green-200">
                  <CheckCircle2 className="h-4 w-4" />
                  {tgName ? tgName : "Telegram connected"}
                  {tgUser?.photo_url && (
                    <img src={tgUser.photo_url} alt="" className="ml-auto h-8 w-8 rounded-full border border-green-400/30" />
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-3 text-xs text-white/60">
                  Click the button below to log in with your Telegram account. No wallet needed for this step.
                </p>
                {config?.loginConfigured ? (
                  <div ref={widgetRef} data-testid="telegram-login-widget" />
                ) : (
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                    Telegram login not configured — set <code>TELEGRAM_BOT_TOKEN</code> and register the domain in BotFather:
                    <br /><code>/setdomain → @clawdloginbot → cheshireterminal.ai</code>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Wallet + CLAWD verification */}
        <Card className="border-purple-500/25 bg-black/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-green-300" />
              Step 2 — Verify $CLAWD
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Wallet connection */}
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-purple-300" />
                {connected ? (
                  <span className="text-xs text-white/60 font-mono">{wallet?.slice(0,6)}…{wallet?.slice(-4)}</span>
                ) : (
                  <span className="text-white/70">Connect Solana Wallet</span>
                )}
              </div>
              {!connected ? (
                <div className="space-y-2">
                  {isMobile && (
                    <Button
                      type="button"
                      className="h-10 w-full justify-center gap-2 bg-purple-600 text-sm hover:bg-purple-700"
                      onClick={openPhantom}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open in Phantom
                    </Button>
                  )}
                  <WalletMultiButton className="!w-full !justify-center !rounded-md !bg-purple-600 hover:!bg-purple-700 !text-sm" />
                  <p className="text-[11px] leading-4 text-white/45">
                    {isMobile
                      ? "Phantom opens this Telegram handoff in its in-app browser so the wallet adapter can connect cleanly."
                      : "Use the wallet adapter to connect Phantom in this browser."}
                  </p>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/20"
                  onClick={verifyClawd}
                  disabled={clawdLoading}
                >
                  {clawdLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Check $CLAWD Balance
                </Button>
              )}
            </div>

            {/* CLAWD result */}
            {clawd && (
              <div className={`rounded-md border p-3 text-sm ${
                clawd.isHolder
                  ? "border-green-500/30 bg-green-500/10 text-green-200"
                  : "border-red-500/30 bg-red-500/10 text-red-200"
              }`}>
                <div className="flex items-center gap-2">
                  {clawd.isHolder ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  <span className="font-semibold">{clawd.isHolder ? "CLAWD Holder ✓" : "Not a holder"}</span>
                </div>
                <p className="mt-1 text-xs opacity-80">
                  Balance: {(clawd.balance / 10 ** (clawd.decimals || 6)).toLocaleString()} $CLAWD
                </p>
              </div>
            )}

            {/* Link button (need both tgUser and wallet) */}
            {tgUser && connected && !isLinked && (
              <Button
                className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white"
                onClick={handleLink}
                disabled={authing}
              >
                {authing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Link Telegram + Wallet
              </Button>
            )}

            {/* Linked confirmation */}
            {isLinked && clawd?.isHolder && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                <p className="font-semibold mb-1">CLAWD role awarded!</p>
                <p>Open the bot to access holder-only commands.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bot info ── */}
      {config?.botUsername && (
        <Card className="border-white/10 bg-black/40">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-white/70">
                <Bot className="h-4 w-4 text-cyan-300" />
                <span>@{config.botUsername}</span>
              </div>
              <a
                href={`https://t.me/${config.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                Open in Telegram <ExternalLink className="h-3 w-3" />
              </a>
              <div className="ml-auto flex flex-wrap gap-2 text-xs text-white/50">
                <code>/ask</code> <code>/price</code> <code>/trend</code>
                <code>/clawd</code> <code>/scan</code> <code>/imagine</code>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/40">
              Type any message to chat with DeepSeek AI. Verify $CLAWD above to unlock holder commands.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
