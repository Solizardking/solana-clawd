import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClawdSpinner } from "@/components/ClawdSpinner";
import {
  Bot, Cpu, Zap, Search, Coins, Shield, ChevronRight,
  CheckCircle2, XCircle, ExternalLink, Copy, RefreshCw, Activity
} from "lucide-react";
import { resolveBrowserRpcUrl } from "@/lib/runtimeConfig";
import { HeliusService } from "@/lib/heliusService";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentData {
  assetAddress: string;
  asset?: { name: string; uri: string; owner: string; updateAuthority: any };
  identity?: { registrationDoc: string; wallet: string; executive?: string };
  isRegisteredAgent: boolean;
  explorerUrl: string;
}

interface HealthData {
  success: boolean;
  rpcConfigured: boolean;
  walletConfigured: boolean;
  currentSlot: number;
  network: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const truncate = (s: string, n = 16) =>
  s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-n)}` : s;

function transactionFromBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return Transaction.from(bytes);
}

function TxResult({
  sig,
  label,
  extra,
}: {
  sig: string;
  label: string;
  extra?: Record<string, string>;
}) {
  const { toast } = useToast();
  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: "Copied!", description: val.slice(0, 40) + "…" });
  };
  return (
    <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
      <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
        <CheckCircle2 className="w-4 h-4" /> {label}
      </div>
      {extra &&
        Object.entries(extra).map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{k}</span>
            <div className="flex items-center gap-1">
              <code className="font-mono text-purple-300">{truncate(v, 12)}</code>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copy(v)}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Signature</span>
        <div className="flex items-center gap-1">
          <code className="font-mono text-blue-300">{truncate(sig, 10)}</code>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copy(sig)}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-2 text-sm text-red-400">
      <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {msg}
    </div>
  );
}

// ─── Tab: Mint Agent ──────────────────────────────────────────────────────────

function MintAgentTab() {
  const { toast } = useToast();
  const { publicKey } = useWallet();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [agentType, setAgentType] = useState("oracle");
  const [personality, setPersonality] = useState("professional");
  const [capabilities, setCapabilities] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [regDoc, setRegDoc] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/metaplex-agents/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol: symbol || "AGENT",
          description,
          agentType,
          personality,
          capabilities: capabilities.split(",").map((c) => c.trim()).filter(Boolean),
          imageUri: imageUri || undefined,
          registrationDoc: regDoc || undefined,
          ownerPubkey: publicKey?.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mint failed");
      return data;
    },
    onSuccess: () => toast({ title: "Agent Minted On-Chain!", description: "Your Metaplex Core agent is live." }),
    onError: (e: Error) => toast({ title: "Mint Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mints a Metaplex Core agent with the platform fee payer. Connect a wallet to receive the asset gaslessly.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Agent Name *</Label>
          <Input placeholder="CLAWD Oracle" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Symbol</Label>
          <Input placeholder="CWDORA" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} maxLength={8} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Agent Type *</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
          >
            {["oracle", "creator", "analyst", "community", "trader", "security"].map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Personality</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
          >
            {["professional", "friendly", "witty", "technical", "creative"].map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description</Label>
        <Input placeholder="Decentralized price oracle agent for DeFi..." value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Capabilities (comma-separated)</Label>
        <Input placeholder="market analysis, price prediction, risk assessment" value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Image URI (optional)</Label>
        <Input placeholder="https://arweave.net/..." value={imageUri} onChange={(e) => setImageUri(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Registration Doc (optional — auto-generated if blank)</Label>
        <Textarea
          placeholder="Custom on-chain registration document for this agent..."
          rows={3}
          value={regDoc}
          onChange={(e) => setRegDoc(e.target.value)}
        />
      </div>

      {!publicKey && (
        <p className="text-xs text-yellow-400">Connect a wallet to receive the minted agent. Without one, the platform wallet owns the asset.</p>
      )}

      <Button
        className="w-full bg-purple-600 hover:bg-purple-700"
        onClick={() => mutation.mutate()}
        disabled={!name || !agentType || mutation.isPending}
      >
        {mutation.isPending ? <ClawdSpinner size="sm" /> : <><Bot className="w-4 h-4 mr-2" />Mint Free Gasless Agent</>}
      </Button>

      {mutation.isSuccess && (
        <TxResult
          sig={mutation.data.signature}
          label="Agent minted!"
          extra={{
            "Asset Address": mutation.data.assetAddress,
            "Explorer": mutation.data.explorerUrl,
          }}
        />
      )}
      {mutation.isError && <ErrorBox msg={(mutation.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Register Identity ───────────────────────────────────────────────────

function RegisterIdentityTab() {
  const { toast } = useToast();
  const [assetAddress, setAssetAddress] = useState("");
  const [regDoc, setRegDoc] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/metaplex-agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress, registrationDoc: regDoc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      return data;
    },
    onSuccess: () => toast({ title: "Identity Registered!", description: "AgentIdentityV1 PDA created on-chain." }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Register an <code className="text-purple-400">AgentIdentityV1</code> PDA for an existing Metaplex Core NFT using{" "}
        <code className="text-purple-400">registerIdentityV1</code>.
      </p>

      <div className="space-y-1">
        <Label>Asset Address *</Label>
        <Input
          placeholder="4x7mK9..."
          value={assetAddress}
          onChange={(e) => setAssetAddress(e.target.value.trim())}
          className="font-mono"
        />
      </div>

      <div className="space-y-1">
        <Label>Registration Document *</Label>
        <Textarea
          placeholder={`Agent: MyAgent\nType: oracle\nCapabilities: price prediction, market analysis\nOwner: <wallet>\nCreated: 2026-05-05`}
          rows={5}
          value={regDoc}
          onChange={(e) => setRegDoc(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          This document is stored on-chain in the AgentIdentityV1 account.
        </p>
      </div>

      <Button
        className="w-full bg-blue-600 hover:bg-blue-700"
        onClick={() => mutation.mutate()}
        disabled={!assetAddress || !regDoc || mutation.isPending}
      >
        {mutation.isPending ? <ClawdSpinner size="sm" /> : <><Shield className="w-4 h-4 mr-2" />Register Identity</>}
      </Button>

      {mutation.isSuccess && <TxResult sig={mutation.data.signature} label="Identity registered!" />}
      {mutation.isError && <ErrorBox msg={(mutation.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Inspect Agent ───────────────────────────────────────────────────────

function InspectAgentTab() {
  const [assetAddress, setAssetAddress] = useState("");
  const [lookup, setLookup] = useState("");

  const { data, isLoading, error, refetch } = useQuery<AgentData>({
    queryKey: ["/api/metaplex-agents/fetch", lookup],
    queryFn: async () => {
      const res = await fetch(`/api/metaplex-agents/fetch/${lookup}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Fetch failed");
      return d;
    },
    enabled: !!lookup,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reads the Metaplex Core asset + <code className="text-purple-400">AgentIdentityV1</code> PDA via Helius RPC.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="Paste asset address..."
          value={assetAddress}
          onChange={(e) => setAssetAddress(e.target.value.trim())}
          className="font-mono"
        />
        <Button
          onClick={() => setLookup(assetAddress)}
          disabled={!assetAddress || isLoading}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          {isLoading ? <ClawdSpinner size="sm" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {error && <ErrorBox msg={(error as Error).message} />}

      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={data.isRegisteredAgent ? "default" : "secondary"} className={data.isRegisteredAgent ? "bg-green-600" : ""}>
              {data.isRegisteredAgent ? "✓ Registered Agent" : "Core Asset (no identity)"}
            </Badge>
            <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
              Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {data.asset && (
            <Card className="bg-black/30 border-purple-500/20">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" /> Core Asset
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{data.asset.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Owner</span><code className="text-xs font-mono text-purple-300">{truncate(data.asset.owner, 10)}</code></div>
                <div className="flex justify-between"><span className="text-muted-foreground">URI</span><code className="text-xs font-mono text-blue-300 truncate max-w-[180px]">{truncate(data.asset.uri || "—", 14)}</code></div>
              </CardContent>
            </Card>
          )}

          {data.identity && (
            <Card className="bg-black/30 border-green-500/20">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" /> AgentIdentityV1
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Wallet</span><code className="text-xs font-mono text-purple-300">{truncate(data.identity.wallet, 10)}</code></div>
                {data.identity.executive && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Executive</span><code className="text-xs font-mono text-yellow-300">{truncate(data.identity.executive, 10)}</code></div>
                )}
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">Registration Doc</span>
                  <pre className="text-xs bg-black/40 p-2 rounded border border-border whitespace-pre-wrap font-mono text-green-300 max-h-32 overflow-y-auto">
                    {data.identity.registrationDoc}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Launch Token ────────────────────────────────────────────────────────

function LaunchTokenTab() {
  const { toast } = useToast();
  const { publicKey, signTransaction } = useWallet();
  const [assetAddress, setAssetAddress] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenUri, setTokenUri] = useState("");
  const [configAddress, setConfigAddress] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signTransaction) {
        throw new Error("Connect a wallet that owns the agent asset before launching.");
      }
      const res = await fetch("/api/metaplex-agents/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetAddress,
          tokenName,
          tokenSymbol,
          tokenUri: tokenUri || undefined,
          configAddress: configAddress || undefined,
          userWallet: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Launch failed");
      if (!data.transaction) throw new Error("Launch builder did not return a transaction");

      const tx = transactionFromBase64(data.transaction);
      const signed = await signTransaction(tx);
      const connection = new Connection(resolveBrowserRpcUrl(), "confirmed");
      const { signature } = await HeliusService.sendSignedTransaction(
        Buffer.from(signed.serialize()).toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      await connection.confirmTransaction(signature, "confirmed");

      return {
        ...data,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        solscanTxUrl: `https://solscan.io/tx/${signature}`,
      };
    },
    onSuccess: () => toast({ title: "Token Launched!", description: "DBC token transaction confirmed." }),
    onError: (e: Error) => toast({ title: "Launch Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Creates a token mint linked to your agent using{" "}
        <code className="text-purple-400">createAndRegisterLaunch</code> — Genesis bonding curve on Solana.
      </p>

      <div className="space-y-1">
        <Label>Agent Asset Address *</Label>
        <Input placeholder="Your agent's NFT address" value={assetAddress} onChange={(e) => setAssetAddress(e.target.value.trim())} className="font-mono" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Token Name *</Label>
          <Input placeholder="CLAWD Oracle Token" value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Token Symbol *</Label>
          <Input placeholder="CWDORA" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())} maxLength={10} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Token Metadata URI (optional)</Label>
        <Input placeholder="https://arweave.net/..." value={tokenUri} onChange={(e) => setTokenUri(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>DBC Config Address (optional)</Label>
        <Input
          placeholder="Uses the platform default when configured"
          value={configAddress}
          onChange={(e) => setConfigAddress(e.target.value.trim())}
          className="font-mono"
        />
      </div>

      <Button
        className="w-full bg-yellow-600 hover:bg-yellow-700"
        onClick={() => mutation.mutate()}
        disabled={!publicKey || !assetAddress || !tokenName || !tokenSymbol || mutation.isPending}
      >
        {mutation.isPending ? <ClawdSpinner size="sm" /> : <><Coins className="w-4 h-4 mr-2" />Launch Agent Token</>}
      </Button>

      {mutation.isSuccess && (
        <TxResult
          sig={mutation.data.signature}
          label="Token launched on Genesis bonding curve!"
          extra={{
            "Mint Address": mutation.data.mintAddress,
            "Pool Address": mutation.data.poolAddress,
            "DBC Config": mutation.data.configAddress,
            "Fee Wallet": mutation.data.protocolFeeWallet,
            "Creator Fee Wallet": mutation.data.creatorFeeWallet,
            ...(mutation.data.launchRegistry?.launchRecordAddress
              ? {
                  "Launchpad Program": mutation.data.launchRegistry.programId,
                  "Launch Record": mutation.data.launchRegistry.launchRecordAddress,
                }
              : {}),
            ...(mutation.data.clawdAgentBinding?.agentBindingAddress
              ? {
                  "CLAWD Program": mutation.data.clawdAgentBinding.programId,
                  "Agent Binding": mutation.data.clawdAgentBinding.agentBindingAddress,
                }
              : {}),
            "Solscan": mutation.data.solscanUrl,
          }}
        />
      )}
      {mutation.isError && <ErrorBox msg={(mutation.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Execution Delegation ────────────────────────────────────────────────

function DelegationTab() {
  const { toast } = useToast();
  const [assetAddress, setAssetAddress] = useState("");
  const [execDoc, setExecDoc] = useState("");
  const [delegateAddr, setDelegateAddr] = useState("");
  const [activeOp, setActiveOp] = useState<"exec" | "delegate">("exec");

  const execMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/metaplex-agents/register-executive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress, executiveDoc: execDoc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => toast({ title: "Executive Registered!", description: "On-chain executive profile created." }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const delegateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/metaplex-agents/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress, delegateAddress: delegateAddr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      return data;
    },
    onSuccess: () => toast({ title: "Delegation Set!", description: "Execution rights delegated on-chain." }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Register an executive profile with{" "}
        <code className="text-purple-400">registerExecutiveV1</code>, then delegate execution to a wallet via{" "}
        <code className="text-purple-400">delegateExecutionV1</code>.
      </p>

      <div className="space-y-1">
        <Label>Agent Asset Address *</Label>
        <Input placeholder="Agent NFT address" value={assetAddress} onChange={(e) => setAssetAddress(e.target.value.trim())} className="font-mono" />
      </div>

      <div className="flex gap-2">
        <Button
          variant={activeOp === "exec" ? "default" : "outline"}
          className="flex-1 text-xs"
          onClick={() => setActiveOp("exec")}
        >
          <Zap className="w-3 h-3 mr-1" /> Register Executive
        </Button>
        <Button
          variant={activeOp === "delegate" ? "default" : "outline"}
          className="flex-1 text-xs"
          onClick={() => setActiveOp("delegate")}
        >
          <ChevronRight className="w-3 h-3 mr-1" /> Delegate Execution
        </Button>
      </div>

      {activeOp === "exec" && (
        <>
          <div className="space-y-1">
            <Label>Executive Document *</Label>
            <Textarea
              placeholder={`Executive: MyAgent\nPowers: market operations, trade execution, content publishing\nScope: DeFi, social media\nCreated: 2026-05-05`}
              rows={5}
              value={execDoc}
              onChange={(e) => setExecDoc(e.target.value)}
            />
          </div>
          <Button
            className="w-full bg-orange-600 hover:bg-orange-700"
            onClick={() => execMutation.mutate()}
            disabled={!assetAddress || !execDoc || execMutation.isPending}
          >
            {execMutation.isPending ? <ClawdSpinner size="sm" /> : <><Zap className="w-4 h-4 mr-2" />Register Executive On-Chain</>}
          </Button>
          {execMutation.isSuccess && <TxResult sig={execMutation.data.signature} label="Executive registered!" />}
          {execMutation.isError && <ErrorBox msg={(execMutation.error as Error).message} />}
        </>
      )}

      {activeOp === "delegate" && (
        <>
          <div className="space-y-1">
            <Label>Delegate Wallet Address *</Label>
            <Input
              placeholder="Target wallet to receive execution rights"
              value={delegateAddr}
              onChange={(e) => setDelegateAddr(e.target.value.trim())}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">This wallet can execute operations on behalf of the agent.</p>
          </div>
          <Button
            className="w-full bg-pink-600 hover:bg-pink-700"
            onClick={() => delegateMutation.mutate()}
            disabled={!assetAddress || !delegateAddr || delegateMutation.isPending}
          >
            {delegateMutation.isPending ? <ClawdSpinner size="sm" /> : <><ChevronRight className="w-4 h-4 mr-2" />Delegate Execution</>}
          </Button>
          {delegateMutation.isSuccess && <TxResult sig={delegateMutation.data.signature} label="Execution delegated!" />}
          {delegateMutation.isError && <ErrorBox msg={(delegateMutation.error as Error).message} />}
        </>
      )}
    </div>
  );
}

// ─── Health Badge ─────────────────────────────────────────────────────────────

function HealthBadge() {
  const { data, isLoading, refetch } = useQuery<HealthData>({
    queryKey: ["/api/metaplex-agents/health"],
    queryFn: async () => {
      const res = await fetch("/api/metaplex-agents/health");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      return d;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isLoading ? (
        <Badge variant="outline"><ClawdSpinner size="xs" /> Checking RPC…</Badge>
      ) : data?.success ? (
        <>
          <Badge className="bg-green-600/20 text-green-400 border-green-500/30">
            <Activity className="w-3 h-3 mr-1" /> {data.network} · slot {data.currentSlot?.toLocaleString()}
          </Badge>
          <Badge variant={data.walletConfigured ? "default" : "secondary"} className={data.walletConfigured ? "bg-purple-600/20 text-purple-400 border-purple-500/30" : ""}>
            {data.walletConfigured ? "✓ Server wallet" : "⚠ No server wallet"}
          </Badge>
        </>
      ) : (
        <Badge variant="destructive">RPC unavailable</Badge>
      )}
      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => refetch()}>
        <RefreshCw className="w-3 h-3" />
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MetaplexAgentPage() {
  return (
    <div className="container py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="w-8 h-8 text-purple-400" />
              Metaplex Agent Registry
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Real on-chain agent deployment · Helius RPC · mpl-agent-registry SDK
            </p>
          </div>
          <HealthBadge />
        </div>
      </div>

      {/* Flow Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        {[
          { icon: <Bot className="w-4 h-4" />, label: "1. Mint Agent", color: "text-purple-400" },
          { icon: <Shield className="w-4 h-4" />, label: "2. Register ID", color: "text-blue-400" },
          { icon: <Search className="w-4 h-4" />, label: "3. Inspect", color: "text-cyan-400" },
          { icon: <Coins className="w-4 h-4" />, label: "4. Launch Token", color: "text-yellow-400" },
          { icon: <Zap className="w-4 h-4" />, label: "5. Delegate", color: "text-orange-400" },
        ].map((step, i) => (
          <div key={i} className={`flex flex-col items-center p-2 rounded-lg bg-black/20 border border-white/5 ${step.color}`}>
            {step.icon}
            <span className="text-xs mt-1 text-center font-medium">{step.label}</span>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <Card className="bg-black/40 border-purple-500/20">
        <CardContent className="p-4">
          <Tabs defaultValue="mint">
            <TabsList className="grid w-full grid-cols-5 h-auto mb-4">
              <TabsTrigger value="mint" className="text-xs py-2"><Bot className="w-3 h-3 mr-1 hidden sm:block" />Mint</TabsTrigger>
              <TabsTrigger value="register" className="text-xs py-2"><Shield className="w-3 h-3 mr-1 hidden sm:block" />Register</TabsTrigger>
              <TabsTrigger value="inspect" className="text-xs py-2"><Search className="w-3 h-3 mr-1 hidden sm:block" />Inspect</TabsTrigger>
              <TabsTrigger value="token" className="text-xs py-2"><Coins className="w-3 h-3 mr-1 hidden sm:block" />Token</TabsTrigger>
              <TabsTrigger value="delegate" className="text-xs py-2"><Zap className="w-3 h-3 mr-1 hidden sm:block" />Delegate</TabsTrigger>
            </TabsList>

            <TabsContent value="mint"><MintAgentTab /></TabsContent>
            <TabsContent value="register"><RegisterIdentityTab /></TabsContent>
            <TabsContent value="inspect"><InspectAgentTab /></TabsContent>
            <TabsContent value="token"><LaunchTokenTab /></TabsContent>
            <TabsContent value="delegate"><DelegationTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* SDK Reference */}
      <Card className="mt-4 bg-black/20 border-white/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <Cpu className="w-4 h-4" /> SDK Functions Used
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs font-mono">
            {[
              ["mintAndSubmitAgent", "Mint + register in one tx"],
              ["registerIdentityV1", "Register AgentIdentityV1 PDA"],
              ["safeFetchAgentIdentityV1", "Read identity (nullable)"],
              ["fetchAsset", "Read Core NFT data"],
              ["createAndRegisterLaunch", "Genesis bonding curve token"],
              ["registerExecutiveV1", "On-chain executive profile"],
              ["delegateExecutionV1", "Delegate execution rights"],
            ].map(([fn, desc]) => (
              <div key={fn} className="flex gap-2 items-start">
                <code className="text-purple-400 shrink-0">{fn}</code>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Powered by Metaplex mpl-agent-registry · Helius RPC · CLAWD Terminal
      </p>
    </div>
  );
}
