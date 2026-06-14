import { useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link } from "wouter";
import {
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  MessageCircle,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WalletSignIn } from "@/components/WalletSignIn";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  getClerkSignInUrl,
  getClerkSignUpUrl,
  getClerkUserProfileUrl,
  hasClerk,
} from "@/lib/clerk";

type TelegramConfig = {
  botUsername?: string;
  loginConfigured?: boolean;
  tradingEnabled?: boolean;
};

type TelegramLinkStatus = {
  linked: boolean;
  telegramUsername?: string;
  telegramFirstName?: string;
  linkedAt?: string;
};

type DeveloperApiStatus = {
  status: string;
  auth: {
    clerkBearer: { configured: boolean };
    apiKey: { configured: boolean; defaultScopes: string[] };
    agentAuth: { discovery: string; betterAuthEnabled: boolean };
  };
  principal?: { type: string; userId?: number | null; scopes?: string[] } | null;
};

type DeveloperApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  agentWalletId?: number | null;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

type CreateKeyResponse = {
  key: string;
  record: DeveloperApiKey;
  warning: string;
};

const accountCommands = [
  "/trade buy 0.1 SOL of CLAWD",
  "spawn a Grok trading agent",
  "/computer inspect my terminal",
];

function shortAddress(address?: string | null) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

function telegramName(status?: TelegramLinkStatus) {
  if (!status?.linked) return "Not linked";
  if (status.telegramUsername) return `@${status.telegramUsername}`;
  return status.telegramFirstName || "Linked";
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ClerkAccountPanel() {
  const { isSignedIn } = useClerkAuth();

  if (!hasClerk()) {
    return (
      <Card className="border-yellow-500/20 bg-yellow-500/10">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
            <div>
              <h2 className="text-sm font-semibold text-yellow-100">Clerk is not configured</h2>
              <p className="mt-1 text-xs leading-5 text-yellow-100/75">
                Wallet sign-in still controls the $CLAWD gate. Add `VITE_CLERK_PUBLISHABLE_KEY`
                to enable the hosted account portal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isSignedIn ? "border-green-500/20 bg-green-500/10" : "border-cyan-500/20 bg-cyan-500/10"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isSignedIn ? (
            <ShieldCheck className="h-4 w-4 text-green-300" />
          ) : (
            <UserPlus className="h-4 w-4 text-cyan-300" />
          )}
          Hosted Account
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-white/60">
          {isSignedIn
            ? "Manage profile, security, and social sessions from Clerk."
            : "Create or sign into the hosted profile portal. Wallet sign-in still controls holder access."}
        </p>
        {isSignedIn ? (
          <Button asChild className="w-full bg-green-500 text-black hover:bg-green-400 sm:w-auto">
            <a href={getClerkUserProfileUrl()}>
              Manage account
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="bg-cyan-500 text-black hover:bg-cyan-400">
              <a href={getClerkSignUpUrl()}>
                Create account
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" className="border-cyan-400/30 bg-black/30 text-cyan-200 hover:bg-cyan-500/10">
              <a href={getClerkSignInUrl()}>
                Sign in
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeveloperApiPanel({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("Default API key");
  const [scopes, setScopes] = useState("api:*");
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const { data: status } = useQuery<DeveloperApiStatus>({
    queryKey: ["/api/developer/status"],
  });

  const { data: keysData, isLoading, refetch } = useQuery<{ keys: DeveloperApiKey[] }>({
    queryKey: ["/api/developer/keys"],
    enabled,
    retry: false,
  });

  const createKey = useMutation({
    mutationFn: async () => {
      const parsedScopes = scopes
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean);
      return apiRequest<CreateKeyResponse>("POST", "/api/developer/keys", {
        name: keyName.trim() || "Cheshire API key",
        scopes: parsedScopes.length ? parsedScopes : ["api:*"],
      });
    },
    onSuccess: (response) => {
      setNewSecret(response.key);
      queryClient.invalidateQueries({ queryKey: ["/api/developer/keys"] });
      toast({ title: "API key created", description: "Copy it now. Only the hash is stored." });
    },
    onError: (error) => {
      toast({ title: "API key creation failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/developer/keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/developer/keys"] });
      toast({ title: "API key revoked" });
    },
    onError: (error) => {
      toast({ title: "Revoke failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    },
  });

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      toast({ title: `${label} copied` });
      window.setTimeout(() => setCopiedValue(null), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const keys = keysData?.keys ?? [];
  const disabledReason = !enabled
    ? "Sign in with a wallet or Clerk account to create API keys."
    : !status?.auth.apiKey.configured
      ? "API key storage is not configured on this environment."
      : null;

  return (
    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="border-cyan-500/20 bg-black/55">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <KeyRound className="h-4 w-4 text-cyan-300" />
            Developer API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">Clerk JWT</div>
              <div className={status?.auth.clerkBearer.configured ? "mt-1 text-sm font-semibold text-green-300" : "mt-1 text-sm font-semibold text-yellow-300"}>
                {status?.auth.clerkBearer.configured ? "Configured" : "Pending"}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">API Keys</div>
              <div className={status?.auth.apiKey.configured ? "mt-1 text-sm font-semibold text-green-300" : "mt-1 text-sm font-semibold text-yellow-300"}>
                {status?.auth.apiKey.configured ? "Ready" : "No DB"}
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">Agents</div>
              <div className={status?.auth.agentAuth.betterAuthEnabled ? "mt-1 text-sm font-semibold text-green-300" : "mt-1 text-sm font-semibold text-yellow-300"}>
                {status?.auth.agentAuth.betterAuthEnabled ? "Discovery" : "Disabled"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Input
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              placeholder="Key name"
              className="border-white/10 bg-black/40"
              disabled={!enabled || createKey.isPending}
            />
            <Textarea
              value={scopes}
              onChange={(event) => setScopes(event.target.value)}
              placeholder="api:*"
              className="min-h-[64px] border-white/10 bg-black/40 font-mono text-xs"
              disabled={!enabled || createKey.isPending}
            />
            <p className="text-xs leading-5 text-white/45">
              Comma-separate scopes. Use `api:*` for normal developer access, or narrow keys with route scopes.
            </p>
          </div>

          {disabledReason ? (
            <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-100/80">
              {disabledReason}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="gap-2 bg-cyan-500 text-black hover:bg-cyan-400"
              onClick={() => createKey.mutate()}
              disabled={Boolean(disabledReason) || createKey.isPending}
            >
              {createKey.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create key
            </Button>
            <Button type="button" variant="outline" className="gap-2 border-white/10" onClick={() => refetch()} disabled={!enabled || isLoading}>
              <RefreshCw className={isLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Refresh
            </Button>
          </div>

          {newSecret ? (
            <div className="rounded-md border border-green-500/25 bg-green-500/10 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-green-200">
                <ShieldCheck className="h-4 w-4" />
                Copy this key now
              </div>
              <button
                type="button"
                onClick={() => copyText(newSecret, "API key")}
                className="flex w-full items-center gap-2 rounded border border-green-400/20 bg-black/40 px-3 py-2 text-left font-mono text-xs text-green-100"
              >
                {copiedValue === newSecret ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{newSecret}</span>
              </button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-black/55">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Code2 className="h-4 w-4 text-purple-300" />
            Active Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!enabled ? (
            <p className="text-sm text-white/45">Authenticate to list API keys.</p>
          ) : isLoading ? (
            <p className="text-sm text-white/45">Loading keys...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-white/45">No active API keys yet.</p>
          ) : (
            keys.map((key) => (
              <div key={key.id} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{key.name}</div>
                    <div className="mt-1 font-mono text-xs text-cyan-200">{key.keyPrefix}...</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="border-purple-400/25 text-purple-200">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0 border-red-400/25 text-red-200 hover:bg-red-500/10"
                    onClick={() => revokeKey.mutate(key.id)}
                    disabled={revokeKey.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-white/40 sm:grid-cols-2">
                  <span>Created {formatDate(key.createdAt)}</span>
                  <span>Last used {formatDate(key.lastUsedAt)}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export default function AccountPage() {
  const { publicKey, connected } = useWallet();
  const { isSignedIn: isClerkSignedIn } = useClerkAuth();
  const { user, isAuthenticated } = useAuth();
  const wallet = publicKey?.toBase58() || user?.walletAddress || "";
  const { toast } = useToast();
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const { data: telegramConfig } = useQuery<TelegramConfig>({
    queryKey: ["/api/telegram/config"],
  });

  const { data: telegramStatus } = useQuery<TelegramLinkStatus>({
    queryKey: ["/api/telegram-link/status", wallet],
    enabled: Boolean(wallet),
  });

  const remoteReady = isAuthenticated && connected && Boolean(telegramStatus?.linked);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      toast({ title: "Command copied", description: command });
      window.setTimeout(() => setCopiedCommand(null), 1500);
    } catch {
      toast({ title: "Copy failed", description: command, variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <section className="rounded-lg border border-cyan-500/20 bg-black/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={remoteReady ? "border-green-400/30 text-green-300" : "border-yellow-400/30 text-yellow-300"}>
                {remoteReady ? "Remote ready" : "Setup required"}
              </Badge>
              {user?.isTokenGated && (
                <Badge variant="outline" className="border-purple-400/30 text-purple-200">
                  $CLAWD holder
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              Account Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Connect wallet auth, Telegram remote control, terminal handoffs, and agent workflows from one mobile-safe page.
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
              Wallet Session
            </div>
            <div className="truncate font-mono text-lg font-semibold text-purple-100">
              {shortAddress(wallet)}
            </div>
            <p className="mt-2 text-xs text-white/45">
              {isAuthenticated ? "Wallet challenge signed for app auth." : connected ? "Wallet connected; sign in to unlock account state." : "Connect a Solana wallet to start."}
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
              @{telegramConfig?.botUsername || "bot"} {telegramConfig?.tradingEnabled ? "can prepare trade and agent handoffs." : "configuration pending."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-black/55">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/35">
              <Terminal className="h-4 w-4" />
              Terminal Remote
            </div>
            <div className="text-lg font-semibold text-green-100">
              {remoteReady ? "Connected" : "Not ready"}
            </div>
            <p className="mt-2 text-xs text-white/45">
              Handoffs open the exact terminal tab and prefill prompts without auto-executing.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <Card className="border-white/10 bg-black/55">
          <CardHeader>
            <CardTitle className="text-base text-white">Remote Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Button asChild className="justify-start gap-2 bg-cyan-500 text-black hover:bg-cyan-400">
              <Link href="/telegram?source=account">
                <MessageCircle className="h-4 w-4" />
                Link Telegram
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2 border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/10">
              <Link href="/terminal?source=account&tab=ai&prompt=Help%20me%20control%20Cheshire%20Terminal.">
                <Terminal className="h-4 w-4" />
                Open AI Terminal
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2 border-purple-400/30 text-purple-100 hover:bg-purple-500/10">
              <Link href="/agents?source=account">
                <Bot className="h-4 w-4" />
                Agent Hub
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2 border-purple-400/30 text-purple-100 hover:bg-purple-500/10">
              <Link href="/agents/builder?source=account">
                <Sparkles className="h-4 w-4" />
                Build Agent
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2 border-blue-400/30 text-blue-100 hover:bg-blue-500/10">
              <Link href="/computer?source=account&task=Inspect%20my%20Cheshire%20Terminal%20workflow.">
                <MonitorSmartphone className="h-4 w-4" />
                Computer Use
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start gap-2 border-green-400/30 text-green-100 hover:bg-green-500/10">
              <Link href="/mini-app?source=account">
                <ShieldCheck className="h-4 w-4" />
                Mobile Remote
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/55">
          <CardHeader>
            <CardTitle className="text-base text-white">Bot Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {accountCommands.map((command) => (
              <button
                key={command}
                type="button"
                onClick={() => copyCommand(command)}
                className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left font-mono text-xs text-white/75 transition-colors hover:border-cyan-400/30 hover:text-cyan-100"
              >
                {copiedCommand === command ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                )}
                <span className="min-w-0 flex-1 truncate">{command}</span>
              </button>
            ))}
            <p className="pt-2 text-xs leading-5 text-white/45">
              Paste these into Telegram. The bot prepares routes and opens signer pages; wallet approval stays in the app.
            </p>
          </CardContent>
        </Card>
      </section>

      <ClerkAccountPanel />

      <DeveloperApiPanel enabled={isAuthenticated || Boolean(isClerkSignedIn)} />
    </div>
  );
}
