import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  stakeAgent as stakeAgentOnchain,
  unstakeAgent as unstakeAgentOnchain,
} from "@/lib/staking/program";
import type { AgentStake } from "@shared/schema";
import {
  Lock, Unlock, Coins, Zap, TrendingUp, Clock, Shield,
  ExternalLink, Copy, RefreshCw, Loader2, AlertTriangle,
  CheckCircle2, Bot, Image as ImageIcon, ChevronRight, Star,
} from "lucide-react";

type BrowserProject = {
  id: string;
  title: string;
  path: string;
  summary: string;
};

const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

type StakeConfig = {
  programId: string;
  poolPda: string;
  cluster: string;
  deployed: boolean;
  ready: boolean;
  programDeployed: boolean;
  poolInitialized: boolean;
  status: string;
  note: string;
  tiers: Record<string, { id: number; label: string; baseWeight: number }>;
  locks: Record<string, { id: number; label: string; seconds: number; multiplier: number }>;
  multiplierPrecision: number;
};

type OnchainStakeRecord = {
  pda: string;
  owner: string;
  asset: string;
  stakedAt: number;
  lastClaimedAt: number;
  totalClaimedBaseUnits: number;
};

type StakingRuntimeConfig = {
  programId: string;
  poolPda: string;
  cluster: string;
  rpcEndpoint: string;
  deployed: boolean;
  ready: boolean;
  programDeployed: boolean;
  poolInitialized: boolean;
  status: string;
  writeMode: string;
  notes: string[];
};

type StakePreview = {
  address: string;
  cluster: string;
  programId: string;
  name: string;
  image: string | null;
  uri: string | null;
  owner: string;
  collectionAddress: string | null;
  derivedAssetType: "agent" | "nft";
  isRegisteredAgent: boolean;
  agentIdentityVersion: string | null;
  agentRegistrationUri: string | null;
  assetSignerPda: string;
  freezeDelegate: { frozen: boolean } | null;
  onchainStakeRecord: OnchainStakeRecord | null;
  canStake: boolean;
  canUnstake: boolean;
};

type StakePosition = {
  owner: string; agentAsset: string; assetName: string | null;
  tier: number; tierLabel: string; lockKind: number; lockLabel: string;
  weight: number; stakeStartedTs: number; unlockTs: number;
  clawdPending: number; solPending: number;
};

function RewardProtocolPanel({ wallet }: { wallet: string }) {
  const { data: config } = useQuery<StakeConfig>({ queryKey: ["/api/clawd-stake/config"] });
  const { data: pool } = useQuery<{ totalPositions: number; totalWeight: number; paused: boolean }>({
    queryKey: ["/api/clawd-stake/pool"],
  });
  const { data: positionsRes } = useQuery<{ positions: StakePosition[] }>({
    queryKey: ["/api/clawd-stake/positions", wallet],
    enabled: !!wallet,
  });

  if (!config) return null;
  const positions = positionsRes?.positions ?? [];
  const tiers = Object.entries(config.tiers);
  const locks = Object.entries(config.locks);
  const runtimeStatus = getRuntimeStatus(config);

  return (
    <Card className="bg-gradient-to-br from-[#0f0f1e] to-[#160622] border-fuchsia-500/25">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-mono text-fuchsia-300">
          <Zap className="h-4 w-4" /> Reward Protocol · clawd-stake
          <Badge variant="outline" className={`ml-2 text-[10px] ${runtimeStatus.badgeClass}`}>
            {runtimeStatus.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300">{config.cluster}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div><p className="text-gray-500 text-[10px]">Pool Positions</p><p className="text-fuchsia-300 text-base font-bold">{pool?.totalPositions ?? 0}</p></div>
          <div><p className="text-gray-500 text-[10px]">Total Weight</p><p className="text-fuchsia-300 text-base font-bold">{(pool?.totalWeight ?? 0).toLocaleString()}</p></div>
          <div><p className="text-gray-500 text-[10px]">Your Positions</p><p className="text-fuchsia-300 text-base font-bold">{positions.length}</p></div>
          <div><p className="text-gray-500 text-[10px]">Your Weight</p><p className="text-fuchsia-300 text-base font-bold">{positions.reduce((a, p) => a + p.weight, 0).toLocaleString()}</p></div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-gray-500 font-mono mb-1">TIER WEIGHTS</p>
            <div className="space-y-1">
              {tiers.map(([k, t]) => (
                <div key={k} className="flex justify-between text-xs font-mono bg-black/30 px-2 py-1 rounded">
                  <span className="text-gray-300">{t.label}</span>
                  <span className="text-fuchsia-300">{t.baseWeight.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 font-mono mb-1">LOCK MULTIPLIERS</p>
            <div className="space-y-1">
              {locks.map(([k, l]) => (
                <div key={k} className="flex justify-between text-xs font-mono bg-black/30 px-2 py-1 rounded">
                  <span className="text-gray-300">{l.label}</span>
                  <span className="text-fuchsia-300">{(l.multiplier / config.multiplierPrecision).toFixed(1)}×</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-gray-500 font-mono">
          Pool PDA <span className="text-purple-400">{truncate(config.poolPda, 8)}</span>
          {" · "}Program <span className="text-purple-400">{truncate(config.programId, 8)}</span>
        </p>
        <p className="text-[10px] text-amber-400/70 font-mono italic">{config.note}</p>
      </CardContent>
    </Card>
  );
}

type StakeWithRewards = AgentStake & { pendingRewards: number };
type GlobalStats = {
  totalStakes: number;
  totalEverStaked: number;
  totalRewardsPaid: number;
  totalPendingRewards: number;
};

function truncate(s: string, n = 12) {
  return s?.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-6)}` : s;
}

type RuntimeStatusLike = {
  cluster: string;
  programId: string;
  deployed?: boolean;
  ready?: boolean;
  programDeployed?: boolean;
  poolInitialized?: boolean;
  status?: string;
};

function isRuntimeReady(runtime?: RuntimeStatusLike | null) {
  return Boolean(runtime?.ready ?? runtime?.deployed);
}

function getRuntimeStatus(runtime?: RuntimeStatusLike | null) {
  if (!runtime) {
    return {
      label: "LOADING",
      badgeClass: "border-gray-500/30 text-gray-300",
      panelClass: "border-gray-500/20 bg-gray-500/5",
      title: "Loading staking runtime",
      description: "The page is still resolving the configured cluster, program, and pool state.",
    };
  }

  if (runtime.programDeployed === false || runtime.status === "program-missing") {
    return {
      label: "PROGRAM MISSING",
      badgeClass: "border-red-500/30 text-red-400",
      panelClass: "border-red-500/20 bg-red-500/5",
      title: "Program not deployed on the configured cluster",
      description: `The staking surface is targeting ${runtime.cluster}, but program ${truncate(runtime.programId, 8)} is not deployed there yet.`,
    };
  }

  if (runtime.poolInitialized === false || runtime.status === "pool-uninitialized" || !isRuntimeReady(runtime)) {
    return {
      label: "POOL UNINITIALIZED",
      badgeClass: "border-amber-500/30 text-amber-400",
      panelClass: "border-amber-500/20 bg-amber-500/5",
      title: "Global pool has not been initialized",
      description: "The staking program exists, but the one-time admin initialize flow has not created the global pool yet.",
    };
  }

  if (runtime.cluster === "devnet") {
    return {
      label: "DEVNET READY",
      badgeClass: "border-cyan-500/30 text-cyan-300",
      panelClass: "border-cyan-500/20 bg-cyan-500/5",
      title: "Devnet staking runtime is active",
      description: "Use devnet Metaplex Core assets here. The rest of the site can stay on mainnet while staking signs and submits to devnet.",
    };
  }

  return {
    label: "READY",
    badgeClass: "border-green-500/30 text-green-400",
    panelClass: "border-green-500/20 bg-green-500/5",
    title: "Staking runtime is ready",
    description: "The configured program and global pool are both available for wallet-signed staking.",
  };
}

function msToHuman(ms: number) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StakeDuration({ stakedAt }: { stakedAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span>{msToHuman(Date.now() - new Date(stakedAt).getTime())}</span>;
}

function StakeCard({
  stake,
  onUnstake,
  unstaking,
}: {
  stake: StakeWithRewards;
  onUnstake: (s: StakeWithRewards) => void;
  unstaking: boolean;
}) {
  const { toast } = useToast();
  const age = msToHuman(Date.now() - new Date(stake.stakedAt).getTime());
  const isAgent = stake.assetType === "agent";

  return (
    <Card className="bg-[#0f0f1e] border border-purple-500/20 hover:border-purple-500/40 transition-colors">
      <CardContent className="p-4 space-y-3">
        {/* Asset header */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 overflow-hidden">
            {stake.assetImage ? (
              <img src={stake.assetImage} alt={stake.assetName ?? ""} className="h-full w-full object-cover rounded-xl" />
            ) : isAgent ? (
              <Bot className="h-6 w-6 text-purple-400" />
            ) : (
              <ImageIcon className="h-6 w-6 text-purple-400/60" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-mono font-bold text-white text-sm truncate">{stake.assetName ?? "Unknown Asset"}</p>
              <Badge className={`text-[9px] font-mono shrink-0 ${isAgent ? "bg-orange-500/15 text-orange-400 border-orange-500/30" : "bg-blue-500/15 text-blue-400 border-blue-500/30"}`}>
                {isAgent ? "AGENT" : "NFT"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] font-mono text-gray-500">{truncate(stake.assetAddress)}</p>
              <button onClick={() => { navigator.clipboard.writeText(stake.assetAddress); toast({ title: "Copied!" }); }}>
                <Copy className="h-2.5 w-2.5 text-gray-600 hover:text-gray-400" />
              </button>
            </div>
          </div>
          <Badge className={`text-[10px] font-mono shrink-0 ${stake.status === "staked" ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}>
            {stake.status === "staked" ? "● STAKED" : "UNSTAKED"}
          </Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-black/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-gray-500 font-mono">Rate</p>
            <p className="text-sm font-bold text-yellow-400 font-mono">{stake.rewardRatePerDay}/day</p>
          </div>
          <div className="bg-black/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-gray-500 font-mono">Pending</p>
            <p className="text-sm font-bold text-green-400 font-mono">{stake.pendingRewards.toLocaleString()}</p>
          </div>
          <div className="bg-black/30 rounded-lg p-2 text-center">
            <p className="text-[10px] text-gray-500 font-mono">Duration</p>
            <p className="text-sm font-bold text-purple-300 font-mono">
              {stake.status === "staked" ? <StakeDuration stakedAt={stake.stakedAt as any} /> : age}
            </p>
          </div>
        </div>

        {/* Total claimed */}
        {stake.rewardsClaimed > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-yellow-500/5 border border-yellow-500/15 rounded-lg">
            <Coins className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
            <span className="text-[11px] font-mono text-yellow-300">
              {stake.rewardsClaimed.toLocaleString()} CLAWD already claimed
            </span>
          </div>
        )}

        {/* Action */}
        {stake.status === "staked" && (
          <Button
            onClick={() => onUnstake(stake)}
            disabled={unstaking}
            variant="outline"
            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 font-mono text-xs h-8 gap-1.5"
          >
            {unstaking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            {unstaking ? "Unstaking…" : `Unstake & Claim ${stake.pendingRewards} CLAWD`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function StakingPage() {
  const walletAdapter = useWallet();
  const { publicKey, connected } = walletAdapter;
  const { toast } = useToast();
  const qc = useQueryClient();
  const wallet = publicKey?.toBase58() ?? "";

  const [stakeForm, setStakeForm] = useState({
    assetAddress: "",
    assetName: "",
    assetImage: "",
    assetType: "nft" as "nft" | "agent",
    collectionAddress: "",
  });
  const [unstakingId, setUnstakingId] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<StakePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const { data: browserProjects } = useQuery<{ projects: BrowserProject[] }>({
    queryKey: ["/api/clawd/browser-projects"],
  });
  const stakingProject = (browserProjects?.projects ?? []).find((project) => project.id === "agent-staking");
  const minterProject = (browserProjects?.projects ?? []).find((project) => project.id === "agent-minter");
  const { data: stakingRuntime } = useQuery<StakingRuntimeConfig>({
    queryKey: ["/api/staking/config"],
  });
  const stakingReady = isRuntimeReady(stakingRuntime);
  const stakingRuntimeStatus = getRuntimeStatus(stakingRuntime);
  const stakingSignerRuntime = stakingRuntime
    ? {
        programId: stakingRuntime.programId,
        rpcUrl: stakingRuntime.rpcEndpoint,
      }
    : undefined;

  const fetchPreview = async (assetAddress: string): Promise<StakePreview> => {
    const response = await fetch(`/api/staking/preview/${assetAddress.trim()}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Preview failed");
    return payload;
  };

  const resolveCollectionAddress = async (assetAddress: string, known?: string | null) => {
    if (known?.trim()) return known.trim();
    const preview = await fetchPreview(assetAddress);
    return preview.collectionAddress ?? null;
  };

  // Fetch user stakes
  const { data: stakes = [], isLoading: loadingStakes, refetch } = useQuery<StakeWithRewards[]>({
    queryKey: ["/api/staking/stakes", wallet],
    enabled: !!wallet,
  });

  // Fetch global stats
  const { data: stats } = useQuery<GlobalStats>({
    queryKey: ["/api/staking/stats"],
    refetchInterval: 30_000,
  });

  // Stake mutation
  const stakeMut = useMutation({
    mutationFn: async (body: typeof stakeForm & { walletAddress: string }) => {
      const collectionAddress = await resolveCollectionAddress(body.assetAddress, body.collectionAddress);
      const collection = collectionAddress ? new PublicKey(collectionAddress) : null;
      const onchain = await stakeAgentOnchain(
        walletAdapter,
        new PublicKey(body.assetAddress.trim()),
        collection,
        stakingSignerRuntime
      );

      return apiRequest<{
        stake: { assetName: string; rewardRatePerDay: number };
        onchainSignature?: string;
        error?: string;
      }>("POST", "/api/staking/stake", {
        ...body,
        collectionAddress,
        onchainSignature: onchain.signature,
      });
    },
    onSuccess: async (data) => {
      if (data.error) throw new Error(data.error);
      toast({
        title: "Asset staked!",
        description: data.onchainSignature
          ? `${data.stake.assetName} is locked on-chain and earning ${data.stake.rewardRatePerDay} CLAWD/day`
          : `${data.stake.assetName} is now earning ${data.stake.rewardRatePerDay} CLAWD/day`,
      });
      setStakeForm({ assetAddress: "", assetName: "", assetImage: "", assetType: "nft", collectionAddress: "" });
      setPreviewData(null);
      qc.invalidateQueries({ queryKey: ["/api/staking/stakes"] });
      qc.invalidateQueries({ queryKey: ["/api/staking/stats"] });
    },
    onError: (e: any) => toast({ title: "Stake failed", description: e.message, variant: "destructive" }),
  });

  // Unstake mutation
  const unstakeMut = useMutation({
    mutationFn: async (body: { assetAddress: string; walletAddress: string; collectionAddress?: string | null }) => {
      const collectionAddress = await resolveCollectionAddress(body.assetAddress, body.collectionAddress);
      const collection = collectionAddress ? new PublicKey(collectionAddress) : null;
      const onchain = await unstakeAgentOnchain(
        walletAdapter,
        new PublicKey(body.assetAddress),
        collection,
        stakingSignerRuntime
      );

      return apiRequest<{
        rewardsEarned: number;
        totalRewards: number;
        onchainSignature?: string;
        error?: string;
      }>("POST", "/api/staking/unstake", {
        ...body,
        collectionAddress,
        onchainSignature: onchain.signature,
      });
    },
    onSuccess: async (data) => {
      if (data.error) throw new Error(data.error);
      toast({
        title: "Unstaked successfully!",
        description: `Earned ${data.rewardsEarned.toLocaleString()} CLAWD — total claimed: ${data.totalRewards.toLocaleString()}`,
      });
      setUnstakingId(null);
      qc.invalidateQueries({ queryKey: ["/api/staking/stakes"] });
      qc.invalidateQueries({ queryKey: ["/api/staking/stats"] });
    },
    onError: (e: any) => {
      toast({ title: "Unstake failed", description: e.message, variant: "destructive" });
      setUnstakingId(null);
    },
  });

  const handlePreview = async () => {
    if (!stakeForm.assetAddress.trim()) return;
    setPreviewing(true);
    setPreviewData(null);
    try {
      const d = await fetchPreview(stakeForm.assetAddress.trim());
      setPreviewData(d);
      setStakeForm((f) => ({
        ...f,
        assetName: f.assetName || d.name || "",
        assetImage: f.assetImage || d.image || "",
        assetType: d.derivedAssetType || f.assetType,
        collectionAddress: d.collectionAddress || f.collectionAddress,
      }));
      toast({ title: "Asset found", description: d.name });
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setPreviewing(false);
    }
  };

  const handleStake = () => {
    if (!wallet) return toast({ title: "Connect wallet first", variant: "destructive" });
    if (!stakingRuntime) return toast({ title: "Runtime not loaded", description: "Wait for staking config to load before signing.", variant: "destructive" });
    if (!stakingReady) {
      const description = stakingRuntime.programDeployed === false
        ? "The configured staking program is not deployed on the current cluster yet."
        : "The staking program exists, but the global pool has not been initialized on the current cluster yet.";
      return toast({ title: "Staking runtime not ready", description, variant: "destructive" });
    }
    if (!previewData) return toast({ title: "Preview required", description: "Fetch the asset first so the page can verify its collection and registration state.", variant: "destructive" });
    if (previewData.owner !== wallet) return toast({ title: "Wrong owner wallet", description: "Connect the wallet that owns this Metaplex Core asset before staking.", variant: "destructive" });
    if (!previewData.canStake) {
      const description = previewData.onchainStakeRecord
        ? "This asset already has an on-chain stake record."
        : "This asset must either be collection-backed or registered in the Metaplex Agent Registry.";
      return toast({ title: "Asset cannot be staked", description, variant: "destructive" });
    }
    stakeMut.mutate({ ...stakeForm, walletAddress: wallet });
  };

  const handleUnstake = (stake: StakeWithRewards) => {
    setUnstakingId(stake.id);
    unstakeMut.mutate({
      assetAddress: stake.assetAddress,
      walletAddress: wallet,
      collectionAddress: stake.collectionAddress,
    });
  };

  const activeStakes = stakes.filter((s) => s.status === "staked");
  const pastStakes = stakes.filter((s) => s.status !== "staked");
  const totalPending = activeStakes.reduce((sum, s) => sum + s.pendingRewards, 0);

  return (
    <div className="min-h-screen bg-[#0a0a14] text-gray-200 p-4 md:p-6 space-y-6">
      {(stakingProject || minterProject) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {stakingProject && (
            <Card className="bg-gradient-to-br from-[#0f0f1e] to-[#160622] border-fuchsia-500/25">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-mono text-fuchsia-300">
                  <Shield className="h-4 w-4" /> Imported Agent Staking Context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-[10px] font-mono text-gray-500">{stakingProject.path}</div>
                <p className="whitespace-pre-line text-sm text-gray-300">
                  {stakingProject.summary.split("\n").slice(0, 8).join("\n")}
                </p>
              </CardContent>
            </Card>
          )}
          {minterProject && (
            <Card className="bg-gradient-to-br from-[#101417] to-[#081012] border-cyan-500/25">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-mono text-cyan-300">
                  <Bot className="h-4 w-4" /> Imported Agent Minter Context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-[10px] font-mono text-gray-500">{minterProject.path}</div>
                <p className="text-sm text-gray-300">{minterProject.summary}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-mono text-white flex items-center gap-3">
            <Shield className="h-7 w-7 text-purple-400" />
            Agent Staking
          </h1>
          <p className="text-sm text-gray-500 font-mono mt-1">
            Public wallet-signed staking for Metaplex agents on Solana
          </p>
          {stakingRuntime && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`font-mono text-[10px] ${stakingRuntimeStatus.badgeClass}`}>
                {stakingRuntimeStatus.label}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] border-purple-500/30 text-purple-300">
                {stakingRuntime.cluster}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] border-cyan-500/30 text-cyan-300">
                {stakingRuntime.writeMode}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] border-gray-500/30 text-gray-300">
                {truncate(stakingRuntime.programId, 8)}
              </Badge>
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-purple-500/30 text-purple-400 font-mono text-xs gap-1.5"
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["/api/staking/stats"] }); }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {stakingRuntime && (
        <div className={`flex gap-3 rounded-xl border p-4 ${stakingRuntimeStatus.panelClass}`}>
          {stakingReady ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-current" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-current" />
          )}
          <div className="space-y-1 text-[11px] font-mono">
            <p className="font-bold text-white">{stakingRuntimeStatus.title}</p>
            <p className="text-gray-300">{stakingRuntimeStatus.description}</p>
            <p className="text-gray-500">
              Program {truncate(stakingRuntime.programId, 8)}
              {" · "}Pool {truncate(stakingRuntime.poolPda, 8)}
            </p>
          </div>
        </div>
      )}

      {/* ── Global stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Stakes", value: stats?.totalStakes ?? 0, icon: Lock, color: "text-purple-400" },
          { label: "Total Ever Staked", value: stats?.totalEverStaked ?? 0, icon: TrendingUp, color: "text-blue-400" },
          { label: "Rewards Paid (CLAWD)", value: (stats?.totalRewardsPaid ?? 0).toLocaleString(), icon: Coins, color: "text-yellow-400" },
          { label: "Pending Rewards", value: (stats?.totalPendingRewards ?? 0).toLocaleString(), icon: Zap, color: "text-green-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-[#0f0f1e] border-purple-500/15">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-black/40 flex items-center justify-center shrink-0">
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 font-mono">{label}</p>
                <p className={`text-lg font-black font-mono ${color}`}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Your pending rewards banner ── */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/25 rounded-xl">
          <Star className="h-5 w-5 text-green-400 shrink-0" />
          <div>
            <p className="font-mono text-green-400 font-bold">
              {totalPending.toLocaleString()} CLAWD pending across {activeStakes.length} stake{activeStakes.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-gray-500 font-mono">Unstake to claim. Rewards compound over time.</p>
          </div>
        </div>
      )}

      {/* ── Reward Protocol panel (clawd-stake) ── */}
      <RewardProtocolPanel wallet={wallet} />

      {/* ── Main tabs ── */}
      <Tabs defaultValue="my-stakes">
        <TabsList className="bg-black/40 border border-purple-500/20">
          <TabsTrigger value="my-stakes" className="font-mono text-xs data-[state=active]:bg-purple-600">
            My Stakes {activeStakes.length > 0 && `(${activeStakes.length})`}
          </TabsTrigger>
          <TabsTrigger value="stake-new" className="font-mono text-xs data-[state=active]:bg-purple-600">
            Stake New Asset
          </TabsTrigger>
          <TabsTrigger value="history" className="font-mono text-xs data-[state=active]:bg-purple-600">
            History {pastStakes.length > 0 && `(${pastStakes.length})`}
          </TabsTrigger>
          <TabsTrigger value="how" className="font-mono text-xs data-[state=active]:bg-purple-600">
            How It Works
          </TabsTrigger>
        </TabsList>

        {/* ── My Stakes ── */}
        <TabsContent value="my-stakes" className="mt-4">
          {!connected ? (
            <div className="text-center py-16 space-y-3">
              <Shield className="h-12 w-12 text-purple-400/30 mx-auto" />
              <p className="text-gray-500 font-mono text-sm">Connect your wallet to view stakes</p>
            </div>
          ) : loadingStakes ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
              <span className="text-gray-500 font-mono text-sm">Loading stakes…</span>
            </div>
          ) : activeStakes.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <Lock className="h-12 w-12 text-purple-400/20 mx-auto" />
              <p className="text-gray-500 font-mono text-sm">No active stakes</p>
              <p className="text-gray-600 font-mono text-xs max-w-sm mx-auto">
                Stake registered Metaplex agents to earn CLAWD tokens. Collection-backed Core assets are also supported.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeStakes.map((s) => (
                <StakeCard
                  key={s.id}
                  stake={s}
                  onUnstake={handleUnstake}
                  unstaking={unstakingId === s.id && unstakeMut.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Stake New ── */}
        <TabsContent value="stake-new" className="mt-4">
          <div className="max-w-xl space-y-5">
            {!connected && (
              <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
                <p className="text-yellow-300 font-mono text-xs">Connect your Solana wallet to stake assets.</p>
              </div>
            )}

            <div className="flex gap-2 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
              <Shield className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
              <div className="text-[11px] font-mono text-cyan-100/80 space-y-0.5">
                <p className="font-bold text-cyan-200">Preview derives the staking metadata</p>
                <p>The page reads owner, collection or agent registration status, and live stake state from chain before it lets you sign the Anchor transaction.</p>
              </div>
            </div>

            {stakingRuntime && !stakingReady && (
              <div className={`flex gap-2 rounded-xl border p-3 ${stakingRuntimeStatus.panelClass}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-current" />
                <div className="space-y-0.5 text-[11px] font-mono">
                  <p className="font-bold text-white">{stakingRuntimeStatus.title}</p>
                  <p className="text-gray-300">{stakingRuntimeStatus.description}</p>
                </div>
              </div>
            )}

            {/* Asset address + preview */}
            <div className="space-y-2">
              <Label className="text-gray-400 font-mono text-xs">Asset Address (Metaplex Core agent)</Label>
              <div className="flex gap-2">
                <Input
                  value={stakeForm.assetAddress}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPreviewData(null);
                    setStakeForm((f) => ({
                      ...f,
                      assetAddress: value,
                      collectionAddress: "",
                    }));
                  }}
                  placeholder="Enter Metaplex Core asset address…"
                  className="bg-black/40 border-purple-500/25 text-white placeholder-gray-600 font-mono text-xs focus-visible:ring-purple-500/40"
                />
                <Button
                  onClick={handlePreview}
                  disabled={!stakeForm.assetAddress.trim() || previewing}
                  variant="outline"
                  className="border-purple-500/30 text-purple-400 font-mono text-xs shrink-0 gap-1.5"
                >
                  {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Fetch
                </Button>
              </div>
            </div>

            {/* Preview result */}
            {previewData && (
              <div className="p-4 bg-purple-500/5 border border-purple-500/25 rounded-xl space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="font-mono text-sm font-bold text-white">{previewData.name}</span>
                  <Badge className={`text-[9px] font-mono ${previewData.derivedAssetType === "agent" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" : "bg-blue-500/15 text-blue-400 border-blue-500/30"}`}>
                    {previewData.derivedAssetType === "agent" ? "REGISTERED AGENT" : "CORE NFT"}
                  </Badge>
                  {previewData.cluster && (
                    <Badge variant="outline" className="text-[9px] font-mono border-purple-500/30 text-purple-300">
                      {previewData.cluster}
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] font-mono text-gray-400 space-y-0.5">
                  <p>Owner: <span className="text-gray-300">{truncate(previewData.owner)}</span></p>
                  <p>Collection: <span className="text-gray-300">{previewData.collectionAddress ? truncate(previewData.collectionAddress) : "Not collection-backed"}</span></p>
                  <p>URI: <span className="text-gray-300">{previewData.uri?.slice(0, 60)}…</span></p>
                  <p>Agent Registry: <span className="text-gray-300">{previewData.isRegisteredAgent ? `Yes${previewData.agentIdentityVersion ? ` (${previewData.agentIdentityVersion.toUpperCase()})` : ""}` : "No"}</span></p>
                  <p>Stake Status: <span className="text-gray-300">{previewData.canStake ? "Ready to stake" : previewData.onchainStakeRecord ? "Already staked on-chain" : "Unsupported asset"}</span></p>
                  {previewData.agentRegistrationUri && (
                    <p>Registration URI: <span className="text-gray-300">{previewData.agentRegistrationUri.slice(0, 60)}…</span></p>
                  )}
                </div>
              </div>
            )}

            {/* Optional fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-gray-400 font-mono text-xs">Display Name (optional)</Label>
                <Input
                  value={stakeForm.assetName}
                  onChange={(e) => setStakeForm((f) => ({ ...f, assetName: e.target.value }))}
                  placeholder="e.g. CLAWD Agent #001"
                  className="bg-black/40 border-purple-500/25 text-white placeholder-gray-600 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 font-mono text-xs">Image URI (optional)</Label>
                <Input
                  value={stakeForm.assetImage}
                  onChange={(e) => setStakeForm((f) => ({ ...f, assetImage: e.target.value }))}
                  placeholder="https://arweave.net/…"
                  className="bg-black/40 border-purple-500/25 text-white placeholder-gray-600 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-400 font-mono text-xs">Collection Address (optional; auto-detected from preview)</Label>
                <Input
                  value={stakeForm.collectionAddress}
                  onChange={(e) => setStakeForm((f) => ({ ...f, collectionAddress: e.target.value }))}
                  placeholder="Collection-backed agents populate this automatically"
                  readOnly={Boolean(previewData?.collectionAddress)}
                  className="bg-black/40 border-purple-500/25 text-white placeholder-gray-600 font-mono text-xs"
                />
              </div>
            </div>

            {/* Warning */}
            <div className="flex gap-2 p-3 bg-yellow-500/5 border border-yellow-500/15 rounded-xl">
              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
              <div className="text-[11px] font-mono text-yellow-300/80 space-y-0.5">
                <p className="font-bold text-yellow-300">Wallet-signed Anchor flow only</p>
                <p>The FreezeDelegate plugin is added by the staking program in the same transaction you sign. Collectionless registered agents are supported; your asset stays in your wallet and unlocks after a signed unstake.</p>
              </div>
            </div>

            <Button
              onClick={handleStake}
              disabled={
                !connected ||
                !stakeForm.assetAddress.trim() ||
                stakeMut.isPending ||
                !stakingReady ||
                previewData?.owner !== wallet ||
                !previewData?.canStake
              }
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold gap-2 h-10"
            >
              {stakeMut.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Staking…</>
              ) : (
                <><Lock className="h-4 w-4" /> Stake {previewData?.derivedAssetType === "agent" ? "Agent (200 CLAWD/day)" : "NFT (100 CLAWD/day)"}</>
              )}
            </Button>
          </div>
        </TabsContent>

        {/* ── History ── */}
        <TabsContent value="history" className="mt-4">
          {pastStakes.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="h-10 w-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-600 font-mono text-sm">No staking history yet</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastStakes.map((s) => (
                <StakeCard
                  key={s.id}
                  stake={s}
                  onUnstake={handleUnstake}
                  unstaking={false}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── How It Works ── */}
        <TabsContent value="how" className="mt-4">
          <div className="max-w-2xl space-y-4">
            <Card className="bg-[#0f0f1e] border-purple-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-purple-300 flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Metaplex Core FreezeDelegate Staking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[12px] font-mono text-gray-400">
                <div className="space-y-2">
                  {[
                    ["1. Verify Agent + Owner", "The page reads the Core asset, confirms the owner wallet, and accepts either a collection-backed asset or a registered Metaplex agent."],
                    ["2. Freeze Asset", "The Anchor program adds a `FreezeDelegate` plugin with `frozen: true`. Your agent remains in your wallet but cannot be transferred while staked."],
                    ["3. Earn CLAWD Rewards", "Rewards accrue continuously — 100 CLAWD/day for collection-backed Core NFTs, 200 CLAWD/day for registered Metaplex agents."],
                    ["4. Unstake & Claim", "Call unstake with your wallet to thaw the asset, remove the FreezeDelegate plugin, and mirror the claimable rewards in the site DB."],
                  ].map(([title, desc]) => (
                    <div key={title as string} className="flex gap-3">
                      <ChevronRight className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white font-bold">{title as string}</p>
                        <p className="text-gray-500 text-[11px] mt-0.5">{desc as string}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f1e] border-purple-500/20">
              <CardContent className="p-4">
                <p className="font-mono text-xs text-gray-400 font-bold mb-3 text-purple-300">Reward Rates</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl mb-1">🖼</p>
                    <p className="font-mono font-bold text-blue-300">NFT</p>
                    <p className="font-mono text-xl font-black text-yellow-400">100</p>
                    <p className="font-mono text-[10px] text-gray-500">CLAWD / day</p>
                  </div>
                  <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 text-center">
                    <p className="text-2xl mb-1">🤖</p>
                    <p className="font-mono font-bold text-orange-300">Agent</p>
                    <p className="font-mono text-xl font-black text-yellow-400">200</p>
                    <p className="font-mono text-[10px] text-gray-500">CLAWD / day</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#0f0f1e] border-yellow-500/15">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  <p className="font-mono text-xs text-yellow-300 font-bold">References</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    ["Metaplex Core Docs", "https://developers.metaplex.com/core"],
                    ["solguru310/solana-mpl-core-nft-staking", "https://github.com/solguru310/solana-mpl-core-nft-staking"],
                    ["FreezeDelegate Plugin", "https://developers.metaplex.com/core/plugins/freeze-delegate"],
                  ].map(([label, url]) => (
                    <a
                      key={url as string}
                      href={url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[11px] font-mono text-purple-400 hover:text-purple-300"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {label as string}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
