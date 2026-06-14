import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import {
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

type TelegramConfig = {
  botUsername?: string;
  tradingEnabled?: boolean;
};

type TelegramLinkStatus = {
  linked: boolean;
  telegramUsername?: string;
  telegramFirstName?: string;
};

type TerminalTab = "ai" | "ops" | "chat" | "dflow";

const tabOptions: Array<{ value: TerminalTab; label: string }> = [
  { value: "ai", label: "AI" },
  { value: "ops", label: "Ops" },
  { value: "chat", label: "Chat" },
  { value: "dflow", label: "DFlow" },
];

const quickActions = [
  {
    href: "/free?source=remote",
    label: "Free Terminal",
    detail: "Public AI entry point",
    icon: Sparkles,
  },
  {
    href: "/terminal?source=remote&tab=ai&prompt=Open%20my%20AI%20terminal%20remote%20control.",
    label: "AI Terminal",
    detail: "Prefill a terminal task",
    icon: Terminal,
  },
  {
    href: "/agents?source=remote",
    label: "Agent Hub",
    detail: "Browse and launch agents",
    icon: Bot,
  },
  {
    href: "/agents/builder?source=remote",
    label: "Build Agent",
    detail: "Create a remote agent",
    icon: Bot,
  },
  {
    href: "/telegram?source=remote",
    label: "Telegram Link",
    detail: "Connect bot control",
    icon: MessageCircle,
  },
  {
    href: "/mini-app?source=remote",
    label: "Mini App",
    detail: "Telegram-style mobile shell",
    icon: MonitorSmartphone,
  },
  {
    href: "/swap?source=remote&from=SOL&to=CLAWD",
    label: "Swap",
    detail: "Prepare a wallet trade",
    icon: ArrowRightLeft,
  },
  {
    href: "/account?source=remote",
    label: "Wallet",
    detail: "Auth and account state",
    icon: Wallet,
  },
] as const;

const commandTemplates = [
  "/trade buy 0.1 SOL of CLAWD",
  "/trade long SOL 0.1",
  "spawn a Grok trading agent",
  "/computer inspect my terminal",
  "/ask summarize wallet risk",
];

function shortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}

function telegramName(status?: TelegramLinkStatus) {
  if (!status?.linked) return "Not linked";
  if (status.telegramUsername) return `@${status.telegramUsername}`;
  return status.telegramFirstName || "Linked";
}

export default function RemoteControlPage() {
  const { publicKey, connected } = useWallet();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const wallet = publicKey?.toBase58() || user?.walletAddress || "";
  const [selectedTab, setSelectedTab] = useState<TerminalTab>("ai");
  const [prompt, setPrompt] = useState("Help me control Cheshire Terminal from mobile.");
  const [agentPrompt, setAgentPrompt] = useState("Create a Telegram-controlled Solana trading and research agent that prepares routes through Cheshire Terminal.");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: telegramConfig } = useQuery<TelegramConfig>({
    queryKey: ["/api/telegram/config"],
  });

  const { data: telegramStatus } = useQuery<TelegramLinkStatus>({
    queryKey: ["/api/telegram-link/status", wallet],
    enabled: Boolean(wallet),
  });

  const terminalHref = useMemo(() => {
    const value = prompt.trim() || "Help me control Cheshire Terminal from mobile.";
    return `/terminal?source=remote&tab=${selectedTab}&prompt=${encodeURIComponent(value)}`;
  }, [prompt, selectedTab]);

  const agentHref = useMemo(() => {
    const value = agentPrompt.trim() || "Create a Telegram-controlled Cheshire agent.";
    return `/agents/builder?source=remote&name=Remote%20CLAWD%20Agent&prompt=${encodeURIComponent(value)}`;
  }, [agentPrompt]);

  const copyText = async (value: string, title = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      toast({ title, description: value });
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copy failed", description: value, variant: "destructive" });
    }
  };

  const remoteReady = isAuthenticated && connected && Boolean(telegramStatus?.linked);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <section className="rounded-lg border border-cyan-500/20 bg-black/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={remoteReady ? "border-green-400/30 text-green-300" : "border-yellow-400/30 text-yellow-300"}>
                {remoteReady ? "Remote ready" : "Remote setup"}
              </Badge>
              <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
                @{telegramConfig?.botUsername || "telegram bot"}
              </Badge>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Remote Control
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Route mobile commands into the terminal, agents, Telegram, wallet, and trading surfaces. Handoffs prefill the right page and still require wallet review before execution.
            </p>
          </div>
          <div className="w-full shrink-0 lg:w-auto">
            <div className="sm:hidden">
              <WalletSignIn compact />
            </div>
            <div className="hidden sm:block">
              <WalletSignIn />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="border-purple-500/20 bg-black/55">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/35">
              <Wallet className="h-4 w-4" />
              Wallet
            </div>
            <div className="truncate font-mono text-lg font-semibold text-purple-100">
              {shortAddress(wallet)}
            </div>
            <p className="mt-2 text-xs text-white/45">
              {isAuthenticated ? "Signed into app auth." : connected ? "Connected; sign the app challenge next." : "Connect a Solana wallet to route gated actions."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-cyan-500/20 bg-black/55">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/35">
              <MessageCircle className="h-4 w-4" />
              Telegram
            </div>
            <div className="truncate text-lg font-semibold text-cyan-100">
              {telegramName(telegramStatus)}
            </div>
            <p className="mt-2 text-xs text-white/45">
              {telegramConfig?.tradingEnabled ? "Bot can prepare trade and agent handoffs." : "Link Telegram to unlock bot handoffs."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-black/55">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/35">
              <Terminal className="h-4 w-4" />
              Terminal
            </div>
            <div className="text-lg font-semibold text-green-100">
              Prefill Enabled
            </div>
            <p className="mt-2 text-xs text-white/45">
              Remote links choose a tab and fill the prompt without auto-running commands.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-cyan-500/20 bg-black/55">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <Terminal className="h-4 w-4 text-cyan-300" />
              Terminal Handoff
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
              {tabOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedTab(option.value)}
                  className={`min-h-10 rounded px-2 text-xs font-semibold transition-colors ${
                    selectedTab === option.value
                      ? "bg-cyan-400 text-black"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-28 w-full resize-none rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm leading-6 text-white outline-none transition-colors placeholder:text-white/25 focus:border-cyan-400/50"
              placeholder="Describe what the terminal should prepare."
            />
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button asChild className="justify-center gap-2 bg-cyan-500 text-black hover:bg-cyan-400">
                <Link href={terminalHref}>
                  <Terminal className="h-4 w-4" />
                  Open Terminal
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-center gap-2 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/10"
                onClick={() => copyText(terminalHref, "Terminal link copied")}
              >
                {copied === terminalHref ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4" />}
                Copy Link
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/55">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <MessageCircle className="h-4 w-4 text-cyan-300" />
              Bot Commands
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {commandTemplates.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => copyText(command, "Command copied")}
                className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-mono text-xs text-white/75 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
              >
                {copied === command ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                )}
                <span className="min-w-0 flex-1 truncate">{command}</span>
              </button>
            ))}
          <Button asChild variant="outline" className="mt-2 w-full justify-center gap-2 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/10">
            <Link href="/telegram?source=remote">
              Link Telegram
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card className="border-purple-500/20 bg-black/55">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Bot className="h-4 w-4 text-purple-300" />
            Agent Handoff
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <textarea
              value={agentPrompt}
              onChange={(event) => setAgentPrompt(event.target.value)}
              className="min-h-24 w-full resize-none rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm leading-6 text-white outline-none transition-colors placeholder:text-white/25 focus:border-purple-400/50"
              placeholder="Describe the agent to create or prepare."
            />
            <p className="mt-2 text-xs leading-5 text-white/45">
              Opens the agent builder with a prefilled persona. Deployment still checks wallet ownership and the $CLAWD gate.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-64 lg:grid-cols-1">
            <Button asChild className="justify-center gap-2 bg-purple-500 text-white hover:bg-purple-400">
              <Link href={agentHref}>
                <Bot className="h-4 w-4" />
                Open Builder
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-center gap-2 border-purple-400/30 text-purple-100 hover:bg-purple-500/10"
              onClick={() => copyText(agentHref, "Agent link copied")}
            >
              {copied === agentHref ? <CheckCircle2 className="h-4 w-4 text-green-300" /> : <Copy className="h-4 w-4" />}
              Copy Link
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map(({ href, label, detail, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg border border-white/10 bg-black/55 p-3 transition-colors hover:border-cyan-400/35 hover:bg-cyan-500/10"
          >
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-md border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 transition-colors group-hover:border-cyan-300/45 group-hover:text-cyan-100">
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="mt-1 text-xs leading-5 text-white/45">{detail}</div>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-white/10 bg-black/45 p-4 text-xs leading-5 text-white/45">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-green-300" />
          Execution Guard
        </div>
        Remote links route intent only. Trading, terminal execution, and gated agent actions stay inside the app and require the normal wallet and holder checks.
      </section>
    </div>
  );
}
