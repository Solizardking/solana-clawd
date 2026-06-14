import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Copy, KeyRound, Loader2, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { hasClerk } from "@/lib/clerk";

type RouterKey = {
  id: string;
  keyPrefix?: string;
  name?: string;
  walletAddress?: string;
  holderTier?: string;
  scopes?: string[];
  createdAt?: string;
  lastUsedAt?: string;
  monthlyLimitUSDC?: number | null;
  remainingUSDC?: number | null;
  usagePercent?: number | null;
  usage?: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUSDC: number;
  };
};

type Status = {
  configured: boolean;
  routerUrl: string;
  walletAddress: string | null;
  holderMinimum: number;
  clawdBalance: number;
  allowed: boolean;
};

function formatUsd(value?: number | null) {
  if (value == null) return "Unlimited";
  return `$${Number(value).toFixed(4)}`;
}

function shortWallet(value?: string | null) {
  if (!value) return "No wallet";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatDate(value?: string) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function RouterKeysPage() {
  const { user, isAuthenticated, signIn, signInStatus } = useAuth();
  const { getToken, isSignedIn: clerkSignedIn } = hasClerk() ? useClerkAuth() : { getToken: async () => null, isSignedIn: false };
  const { publicKey, signMessage } = useWallet();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [keys, setKeys] = useState<RouterKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState("Cheshire Terminal key");
  const [limit, setLimit] = useState("25");
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = user?.walletAddress ?? publicKey?.toBase58() ?? null;
  const hasWalletSigner = Boolean(publicKey && signMessage);
  const canIssue = Boolean(isAuthenticated && walletAddress && hasWalletSigner && status?.allowed && status?.configured);

  const totals = useMemo(() => {
    return keys.reduce(
      (acc, key) => {
        acc.requests += key.usage?.requests ?? 0;
        acc.cost += key.usage?.costUSDC ?? 0;
        acc.input += key.usage?.inputTokens ?? 0;
        acc.output += key.usage?.outputTokens ?? 0;
        return acc;
      },
      { requests: 0, cost: 0, input: 0, output: 0 },
    );
  }, [keys]);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = clerkSignedIn ? await getToken().catch(() => null) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [clerkSignedIn, getToken]);

  const routerQuery = useCallback(() => {
    return walletAddress ? `?walletAddress=${encodeURIComponent(walletAddress)}` : "";
  }, [walletAddress]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const query = routerQuery();
      const [statusRes, keysRes] = await Promise.all([
        fetch(`/api/router-keys/status${query}`, { credentials: "include", headers }),
        fetch(`/api/router-keys${query}`, { credentials: "include", headers }),
      ]);
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusData.error || "Failed to load router status");
      setStatus(statusData);

      if (keysRes.ok) {
        const keysData = await keysRes.json().catch(() => ({}));
        setKeys(Array.isArray(keysData.data) ? keysData.data : []);
      } else {
        const keysData = await keysRes.json().catch(() => ({}));
        throw new Error(keysData.error || "Failed to load API keys");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load API-key data");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, routerQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const issueKey = async () => {
    if (!isAuthenticated) {
      await signIn();
      return;
    }
    if (!publicKey || !signMessage) {
      toast({ title: "Wallet signer required", description: "Connect the same Solana wallet used for this account.", variant: "destructive" });
      return;
    }

    setIssuing(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const challengeRes = await fetch("/api/router-keys/challenge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });
      const challenge = await challengeRes.json().catch(() => ({}));
      if (!challengeRes.ok) throw new Error(challenge.error || "Failed to prepare wallet challenge");

      const messageBytes = new TextEncoder().encode(challenge.message);
      const signature = bs58.encode(await signMessage(messageBytes));
      const issueRes = await fetch("/api/router-keys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          name,
          monthlyLimitUSDC: limit.trim() === "" ? null : Number(limit),
          message: challenge.message,
          signature,
        }),
      });
      const data = await issueRes.json().catch(() => ({}));
      if (!issueRes.ok) throw new Error(data.error || "Failed to issue API key");
      setNewKey(data.apiKey);
      setKeys((current) => [data.key, ...current.filter((key) => key.id !== data.key?.id)]);
      toast({ title: "API key issued", description: "Store it now. Cheshire will not show the secret again." });
    } catch (err: any) {
      setError(err?.message || "Failed to issue API key");
      toast({ title: "API key failed", description: err?.message || "Issue request failed", variant: "destructive" });
    } finally {
      setIssuing(false);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    toast({ title: "Copied", description: "API key copied to clipboard." });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 py-6">
      <div className="rounded-lg border border-cyan-300/20 bg-black/70 p-5 shadow-2xl shadow-cyan-950/20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-cyan-300/80">
              <KeyRound className="h-3.5 w-3.5" />
              CLAWD Router
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">API Keys</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              Issue wallet-bound router keys, track usage, and cap monthly spend for multi-model OpenRouter access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-cyan-400/35 bg-cyan-400/10 px-3 py-1 text-cyan-200">
              {shortWallet(walletAddress)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-white/10 bg-black/60"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Keys</div><div className="mt-2 text-2xl font-black text-white">{keys.length}</div></CardContent></Card>
        <Card className="border-white/10 bg-black/60"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Requests</div><div className="mt-2 text-2xl font-black text-white">{totals.requests.toLocaleString()}</div></CardContent></Card>
        <Card className="border-white/10 bg-black/60"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Cost</div><div className="mt-2 text-2xl font-black text-white">{formatUsd(totals.cost)}</div></CardContent></Card>
        <Card className="border-white/10 bg-black/60"><CardContent className="p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-white/45">Balance</div><div className="mt-2 text-2xl font-black text-white">{Number(status?.clawdBalance ?? 0).toLocaleString()} $CLAWD</div></CardContent></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="border-cyan-300/20 bg-black/60">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><WalletCards className="h-4 w-4 text-cyan-300" />Issue key</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="bg-black/50" maxLength={80} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Monthly limit, USDC</label>
              <Input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="decimal" className="bg-black/50" placeholder="blank for no cap" />
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-gray-300">
              <div className="flex items-center gap-2 text-green-200"><ShieldCheck className="h-3.5 w-3.5" /> Holder-gated issuing</div>
              <div className="mt-1 text-gray-400">Each key is bound to your signed Solana wallet and tracked by router usage.</div>
            </div>
            <Button onClick={() => void issueKey()} disabled={issuing || Boolean(isAuthenticated && !canIssue)} className="w-full">
              {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              {isAuthenticated ? "Sign and issue key" : signInStatus || "Sign in first"}
            </Button>
            {newKey && (
              <div className="space-y-2 rounded-md border border-green-400/25 bg-green-500/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-green-200">New key</div>
                <div className="break-all rounded bg-black/60 p-2 font-mono text-xs text-green-100">{newKey}</div>
                <Button variant="outline" size="sm" onClick={() => void copyKey()} className="w-full"><Copy className="mr-2 h-3.5 w-3.5" />Copy key</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/60">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-purple-300" />Issued keys</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading keys</div>
            ) : keys.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">No API keys issued for this wallet yet.</div>
            ) : keys.map((key) => (
              <div key={key.id} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{key.name || key.id}</div>
                    <div className="mt-1 font-mono text-xs text-gray-500">{key.keyPrefix || key.id}</div>
                  </div>
                  <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">{key.holderTier || "HOLDER"}</Badge>
                </div>
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
                  <div><div className="text-white/40">Requests</div><div className="mt-1 font-mono text-cyan-200">{(key.usage?.requests ?? 0).toLocaleString()}</div></div>
                  <div><div className="text-white/40">Used</div><div className="mt-1 font-mono text-red-100">{formatUsd(key.usage?.costUSDC ?? 0)}</div></div>
                  <div><div className="text-white/40">Remaining</div><div className="mt-1 font-mono text-green-100">{formatUsd(key.remainingUSDC)}</div></div>
                  <div><div className="text-white/40">Last used</div><div className="mt-1 font-mono text-gray-300">{formatDate(key.lastUsedAt)}</div></div>
                </div>
                {typeof key.usagePercent === "number" && <Progress value={key.usagePercent} className="mt-4 h-2 bg-white/10" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
