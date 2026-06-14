import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Bot,
  CheckCircle2,
  Coins,
  Dice6,
  ExternalLink,
  Image,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles as SparklesIcon,
  Wallet,
  Zap,
} from "lucide-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  GACHA_CLAWD_MINT,
  GACHA_MAX_SINGLE_PRIZE_CLAWD,
  GACHA_PUBLIC_SPIN_PRICE_SOL,
  GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD,
  RARITY_CONFIG,
  getGachaPublicPriceLamports,
  getGachaPublicPriceSol,
  type AgentCardTemplate,
  type GachaPullCount,
  type Rarity,
} from "@shared/gacha";
import {
  createClientSeed,
  isGachaPaymentRequiredError,
  type RequestJsonError,
  type GachaRevealCard,
  type GachaRevealResponse,
  type GachaSessionResponse,
  type GachaStatusResponse,
  verifyGachaReveal,
} from "@/lib/gachaMachine";
import { useTokenGate } from "@/contexts/TokenGateContext";

type DisplayCard = GachaRevealCard & {
  pullKey: string;
  minted?: boolean;
  assetAddress?: string;
  imageUrl?: string;
  explorerUrl?: string;
};

type SpinPhase =
  | "idle"
  | "locking"
  | "sampling"
  | "resolving"
  | "settling"
  | "revealed";

const capsuleColors = [
  "#72f6ff",
  "#ff5b4f",
  "#ffe0b8",
  "#8ee7b3",
  "#9945ff",
  "#facc15",
  "#22c55e",
  "#f472b6",
];

const SPIN_PHASES: Array<{
  key: SpinPhase;
  label: string;
  detail: string;
}> = [
  { key: "locking", label: "Commit", detail: "Server seed hash locked" },
  { key: "sampling", label: "Entropy", detail: "Wallet + Solana entropy sampled" },
  { key: "resolving", label: "Resolve", detail: "Rarity and CLAWD prize derived" },
  { key: "settling", label: "Settle", detail: "Receipt and payout signer preparing" },
  { key: "revealed", label: "Reveal", detail: "Cards exposed and proof checkable" },
];

function phaseEnergy(phase: SpinPhase) {
  switch (phase) {
    case "locking":
      return 0.35;
    case "sampling":
      return 0.55;
    case "resolving":
      return 0.78;
    case "settling":
      return 0.95;
    case "revealed":
      return 0.62;
    default:
      return 0.18;
  }
}

function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return fetch(url, init).then(async (response) => {
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "Request failed") as RequestJsonError;
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  });
}

function formatSolAmount(value: number) {
  return value.toFixed(6);
}

function addCardsToCollection(
  existing: DisplayCard[],
  reveal: GachaRevealResponse,
): DisplayCard[] {
  const next = reveal.cards.map((card, index) => ({
    ...card,
    pullKey: `${reveal.sessionId}:${index}`,
  }));
  return [...next, ...existing];
}

function GachaMachineHero({
  isSpinning,
  highlight,
  phase,
  pullCount,
  onPull,
}: {
  isSpinning: boolean;
  highlight: string;
  phase: SpinPhase;
  pullCount: GachaPullCount;
  onPull: () => void;
}) {
  const overdrive = isSpinning && pullCount === 10;
  const energy = isSpinning ? phaseEnergy(phase) : 0.18;

  return (
    <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_top,rgba(114,246,255,0.16),transparent_42%),linear-gradient(180deg,#08111c_0%,#05070d_100%)]">
      <motion.div
        className="absolute inset-0 opacity-80"
        animate={{
          backgroundPosition: overdrive
            ? ["0% 0%", "100% 0%", "0% 0%"]
            : ["0% 0%", "0% 100%", "0% 0%"],
        }}
        transition={{ duration: overdrive ? 4 : 10, repeat: Infinity, ease: "linear" }}
        style={{
          backgroundImage:
            "linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <motion.div
        className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        animate={{
          scale: overdrive ? [0.95, 1.16, 0.95] : [0.96, 1.04, 0.96],
          opacity: [0.32, 0.6 + energy * 0.18, 0.32],
        }}
        transition={{ duration: overdrive ? 1.6 : 3.2, repeat: Infinity }}
        style={{ backgroundColor: highlight }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/35 to-transparent" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="flex flex-wrap justify-center gap-3">
          {capsuleColors.map((color, index) => (
            <motion.div
              key={`${color}-${index}`}
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
              animate={{
                y: isSpinning ? [0, -10 - (index % 3) * 4, 0] : [0, -3, 0],
                scale: isSpinning ? [1, 1.35, 1] : [1, 1.08, 1],
                opacity: [0.55, 1, 0.55],
              }}
              transition={{
                duration: isSpinning ? 0.8 + (index % 4) * 0.08 : 2.2,
                repeat: Infinity,
                delay: index * 0.05,
              }}
            />
          ))}
        </div>

        <motion.div
          className="mt-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-black/45 p-6 shadow-[0_0_60px_rgba(114,246,255,0.12)] backdrop-blur"
          animate={isSpinning ? { y: [0, -8, 0] } : { y: 0 }}
          transition={{ duration: overdrive ? 0.8 : 1.8, repeat: isSpinning ? Infinity : 0 }}
        >
          <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-100/70">
            CLAWD Vault Machine
          </div>
          <div className="mt-3 text-4xl">🎰</div>
          <div className="mt-4 text-2xl font-black text-white">
            {overdrive ? "Overdrive pull armed" : "Capsules primed"}
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {isSpinning
              ? `${phase} sequence live. Entropy, reveal, and vault settlement are in motion.`
              : "Launch a deterministic pull and let the vault settle the result back to your wallet."}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-left text-xs text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.16em] text-slate-400">Mode</div>
              <div className="mt-2 font-semibold text-white">
                {pullCount === 10 ? "x10 rare tail" : "single pull"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.16em] text-slate-400">State</div>
              <div className="mt-2 font-semibold text-white">
                {isSpinning ? "Resolving" : "Idle"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="uppercase tracking-[0.16em] text-slate-400">Vault</div>
              <div className="mt-2 font-semibold text-white">
                {Math.max(energy * 100, 18).toFixed(0)}% charged
              </div>
            </div>
          </div>
        </motion.div>

        <button
          type="button"
          onClick={onPull}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-50 transition hover:border-cyan-200/60 hover:bg-cyan-300/25"
        >
          <Zap className="h-3.5 w-3.5" />
          Pull Lever
        </button>
      </div>
    </div>
  );
}

function RarityBadge({ rarity }: { rarity: Rarity }) {
  const config = RARITY_CONFIG[rarity];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${config.color} ${config.bg} ${config.border}`}>
      {config.label}
    </span>
  );
}

function AgentCardDisplay({
  card,
  revealed,
  onMint,
  isMinting,
}: {
  card: DisplayCard;
  revealed: boolean;
  onMint: (card: DisplayCard) => void;
  isMinting: boolean;
}) {
  const config = RARITY_CONFIG[card.rarity];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 22, scale: 0.96 }}
      animate={{
        opacity: revealed ? 1 : 0,
        y: revealed ? 0 : 16,
        scale: revealed ? 1 : 0.96,
        rotateX: revealed ? 0 : -18,
      }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      className={`relative flex h-full flex-col gap-3 rounded-2xl border-2 p-3 ${config.border} ${config.bg} ${config.glow}`}
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/8 to-transparent opacity-70" />
      <div className={`flex aspect-square items-center justify-center rounded-xl border border-white/10 ${config.bg}`}>
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <span className="text-5xl">{card.icon}</span>
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm font-bold ${config.color}`}>{card.name}</div>
          <div className="text-xs text-slate-400">{card.role}</div>
        </div>
        <RarityBadge rarity={card.rarity} />
      </div>

      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <Coins className="h-3.5 w-3.5" />
          <span>Prize</span>
        </div>
        <div className="mt-1 text-lg font-black tracking-wide text-emerald-200">
          {card.prizeClawd.toLocaleString()} CLAWD
        </div>
        {card.guaranteedRarePlus && (
          <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-amber-300/90">
            Rare+ lock
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Zap className="h-3 w-3 text-amber-300" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
          <div
            className={`h-full rounded-full ${
              card.rarity === "legendary"
                ? "bg-gradient-to-r from-amber-300 to-orange-400"
                : card.rarity === "epic"
                  ? "bg-gradient-to-r from-fuchsia-300 to-violet-400"
                  : card.rarity === "rare"
                    ? "bg-gradient-to-r from-cyan-300 to-sky-400"
                    : "bg-gradient-to-r from-slate-300 to-slate-500"
            }`}
            style={{ width: `${card.power}%` }}
          />
        </div>
        <span className="text-xs font-mono text-slate-300">{card.power}</span>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">{card.description}</p>

      <div className="flex flex-wrap gap-1">
        {card.abilities.map((ability) => (
          <span
            key={`${card.pullKey}-${ability}`}
            className="rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 text-[11px] text-slate-300"
          >
            {ability}
          </span>
        ))}
      </div>

      <div className="mt-auto space-y-2">
        <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
            <ShieldCheck className="h-3 w-3" />
            Proof
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-200">
            {card.proofHash.slice(0, 18)}...
          </div>
        </div>

        {card.minted ? (
          <div className="space-y-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-300">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>Minted on-chain</span>
            </div>
            {card.explorerUrl && (
              <a
                href={card.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                View asset
              </a>
            )}
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-950/30"
            onClick={() => onMint(card)}
            disabled={isMinting}
          >
            {isMinting ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Image className="mr-2 h-3.5 w-3.5" />
            )}
            {isMinting ? "Minting..." : "Mint as NFT"}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function ValueLine({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive";
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className={tone === "positive" ? "font-mono text-emerald-300" : "font-mono text-slate-200"}>
        {value}
      </span>
    </div>
  );
}

function VaultPressureMeter({
  balance,
  recommendedBuffer,
  jackpotCoverage,
  shortfall,
}: {
  balance: number;
  recommendedBuffer: number;
  jackpotCoverage: number;
  shortfall: number;
}) {
  const pct =
    recommendedBuffer > 0
      ? Math.min(100, (balance / recommendedBuffer) * 100)
      : 0;
  const tone =
    pct >= 100 ? "from-emerald-300 via-cyan-300 to-cyan-500" :
    pct >= 45 ? "from-amber-300 via-orange-300 to-amber-500" :
    "from-rose-300 via-orange-400 to-rose-500";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <span>Vault Pressure</span>
        <span>{Math.max(jackpotCoverage, 0).toFixed(1)}x max jackpots</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${tone}`}
          animate={{ width: `${pct}%`, opacity: [0.72, 1, 0.72] }}
          transition={{ width: { duration: 0.5, ease: "easeOut" }, opacity: { duration: 1.8, repeat: Infinity } }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{balance.toLocaleString()} CLAWD live</span>
        <span>
          {shortfall > 0
            ? `${shortfall.toLocaleString()} CLAWD short`
            : `${recommendedBuffer.toLocaleString()} CLAWD target met`}
        </span>
      </div>
    </div>
  );
}

function StatusMarquee({ items }: { items: string[] }) {
  const loopItems = [...items, ...items];

  return (
    <div className="overflow-hidden rounded-full border border-cyan-400/15 bg-black/25">
      <motion.div
        className="flex w-max gap-3 px-3 py-2"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        {loopItems.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-3 whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-slate-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

function SpinPhaseRail({
  phase,
  proofVerified,
  recordedOnChain,
}: {
  phase: SpinPhase;
  proofVerified: boolean | null;
  recordedOnChain: boolean;
}) {
  const activeIndex = SPIN_PHASES.findIndex((entry) => entry.key === phase);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-5">
        {SPIN_PHASES.map((entry, index) => {
          const active = activeIndex >= index;
          return (
            <motion.div
              key={entry.key}
              animate={{ scale: active ? [1, 1.02, 1] : 1 }}
              transition={{ duration: 0.9, repeat: active && phase !== "revealed" ? Infinity : 0 }}
              className={`rounded-2xl border px-3 py-3 ${
                active
                  ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              <div className="text-[10px] uppercase tracking-[0.18em]">{entry.label}</div>
              <div className="mt-1 text-xs leading-relaxed">{entry.detail}</div>
            </motion.div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
        <span
          className={`rounded-full border px-3 py-1 ${
            proofVerified
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-400"
          }`}
        >
          {proofVerified ? "Proof locally verified" : "Proof pending"}
        </span>
        <span
          className={`rounded-full border px-3 py-1 ${
            recordedOnChain
              ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 bg-white/5 text-slate-400"
          }`}
        >
          {recordedOnChain ? "Receipt staged on-chain" : "Receipt not yet broadcast"}
        </span>
      </div>
    </div>
  );
}

export default function GachaPage() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { isVerified, clawdBalance } = useTokenGate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"pull" | "collection">("pull");
  const [activePullCount, setActivePullCount] = useState<GachaPullCount>(1);
  const [isPreparingPull, setIsPreparingPull] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [revealedIndexes, setRevealedIndexes] = useState<Set<number>>(new Set());
  const [pulledCards, setPulledCards] = useState<DisplayCard[]>([]);
  const [collection, setCollection] = useState<DisplayCard[]>([]);
  const [mintingCardKey, setMintingCardKey] = useState<string | null>(null);
  const [lastSession, setLastSession] = useState<GachaSessionResponse | null>(null);
  const [lastReveal, setLastReveal] = useState<GachaRevealResponse | null>(null);
  const [proofVerified, setProofVerified] = useState<boolean | null>(null);
  const [spinPhase, setSpinPhase] = useState<SpinPhase>("idle");
  const spinTimersRef = useRef<number[]>([]);
  const celebratedSessionRef = useRef<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["gacha-status"],
    queryFn: () => requestJson<GachaStatusResponse>("/api/gacha/status"),
    refetchInterval: 30_000,
  });

  const mintMutation = useMutation({
    mutationFn: async (card: DisplayCard) => {
      const response = await requestJson<{
        assetAddress: string;
        imageUrl: string;
        explorerUrl: string;
      }>("/api/nft/gacha-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardName: card.name,
          cardRole: card.role,
          cardRarity: card.rarity,
          abilities: card.abilities,
          ownerAddress: publicKey?.toBase58() || undefined,
        }),
      });

      return { ...response, pullKey: card.pullKey };
    },
    onSuccess: (result) => {
      setMintingCardKey(null);
      const markMinted = (cards: DisplayCard[]) =>
        cards.map((card) =>
          card.pullKey === result.pullKey
            ? {
                ...card,
                minted: true,
                assetAddress: result.assetAddress,
                imageUrl: result.imageUrl,
                explorerUrl: result.explorerUrl,
              }
            : card,
        );

      setPulledCards((current) => markMinted(current));
      setCollection((current) => markMinted(current));
      toast({
        title: "NFT minted",
        description: `${result.assetAddress.slice(0, 16)}...`,
      });
    },
    onError: (error: Error) => {
      setMintingCardKey(null);
      toast({
        title: "Mint failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!lastReveal) return;

    verifyGachaReveal(lastReveal)
      .then((verified) => setProofVerified(verified))
      .catch(() => setProofVerified(false));
  }, [lastReveal]);

  useEffect(() => {
    return () => {
      spinTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      spinTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!lastReveal) return;
    if (celebratedSessionRef.current === lastReveal.sessionId) return;

    const highestRarity =
      lastReveal.cards.find((card) => card.rarity === "legendary")?.rarity ||
      lastReveal.cards.find((card) => card.rarity === "epic")?.rarity ||
      lastReveal.cards.find((card) => card.rarity === "rare")?.rarity ||
      null;

    if (!highestRarity) return;

    celebratedSessionRef.current = lastReveal.sessionId;
    void confetti({
      particleCount: highestRarity === "legendary" ? 220 : 120,
      spread: highestRarity === "legendary" ? 82 : 56,
      startVelocity: highestRarity === "legendary" ? 48 : 34,
      gravity: 0.9,
      scalar: highestRarity === "legendary" ? 1.15 : 0.95,
      origin: { y: 0.2 },
      colors:
        highestRarity === "legendary"
          ? ["#fbbf24", "#f59e0b", "#fde68a", "#fef3c7"]
          : ["#72f6ff", "#c084fc", "#22c55e", "#f8fafc"],
    });
  }, [lastReveal]);

  const totalPulls = collection.length;
  const mintedCount = collection.filter((card) => card.minted).length;
  const totalClawdWon = collection.reduce((sum, card) => sum + card.prizeClawd, 0);
  const rarityStats = collection.reduce<Record<Rarity, number>>(
    (stats, card) => {
      stats[card.rarity] += 1;
      return stats;
    },
    { common: 0, rare: 0, epic: 0, legendary: 0 },
  );

  const hasLegendary = pulledCards.some((card) => card.rarity === "legendary");
  const hasEpic = pulledCards.some((card) => card.rarity === "epic");
  const highlight = hasLegendary ? "#fbbf24" : hasEpic ? "#c084fc" : "#72f6ff";
  const vault = statusQuery.data?.vault;
  const receiptUrl = lastReveal?.payout.explorerUrl;
  const marqueeItems = useMemo(
    () => [
      vault?.walletAddress
        ? `Vault ${vault.walletAddress.slice(0, 6)}...${vault.walletAddress.slice(-4)}`
        : "Vault not configured",
      `${vault?.readyForClaims ? "CLAWD vault funded" : "Vault needs CLAWD"}`,
      `Signer ${vault?.receiptSignerReady ? "live" : "missing"}`,
      `${vault?.signerCanTransfer ? "Transfer authority ready" : "Delegate GACHA_KEY on vault ATA"}`,
      `${Math.max(vault?.jackpotCoverage ?? 0, 0).toFixed(1)}x max jackpot coverage`,
      vault && vault.shortfallClawd > 0
        ? `Top off ${vault.shortfallClawd.toLocaleString()} CLAWD`
        : "Vault buffer target met",
      statusQuery.data?.magicBlock.readyForOnChainPulls
        ? "MagicBlock VRF configured"
        : "MagicBlock program or queue pending",
      statusQuery.data?.magicBlock.supportsGuaranteedRareTail
        ? "10-pull rare tail wired"
        : "Guaranteed rare tail pending",
      `${proofVerified ? "Proof verified" : "Proof chain armed"}`,
    ],
    [proofVerified, statusQuery.data?.magicBlock.readyForOnChainPulls, statusQuery.data?.magicBlock.supportsGuaranteedRareTail, vault],
  );
  const activePhase =
    SPIN_PHASES.find((entry) => entry.key === spinPhase) ??
    SPIN_PHASES[0];
  const vaultRecommendedBuffer =
    vault?.recommendedBufferClawd ?? GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD;
  const vaultJackpotCoverage =
    vault?.jackpotCoverage ??
    ((vault?.clawdBalance ?? 0) / GACHA_MAX_SINGLE_PRIZE_CLAWD);
  const vaultShortfall = vault?.shortfallClawd ?? vaultRecommendedBuffer;
  const treasuryWallet = statusQuery.data?.access?.treasuryWallet ?? null;
  const publicSpinPriceSol =
    statusQuery.data?.access?.publicSpinPriceSol ?? GACHA_PUBLIC_SPIN_PRICE_SOL;
  const publicX1PriceSol = getGachaPublicPriceSol(1);
  const publicX10PriceSol = getGachaPublicPriceSol(10);
  const holderStatusCopy = !connected
    ? `Connect a wallet. Verified $CLAWD holders spin free, public wallets pay ${formatSolAmount(publicSpinPriceSol)} SOL per spin.`
    : isVerified
      ? `Holder mode active — this wallet${typeof clawdBalance === "number" ? ` holds ${clawdBalance.toLocaleString()} $CLAWD` : ""}, so spins are free.`
      : clawdBalance == null
        ? `Wallet connected. Holder status is still resolving; if this wallet is public, spins cost ${formatSolAmount(publicSpinPriceSol)} SOL each.`
        : `Public mode active — this wallet is below the holder threshold, so each spin costs ${formatSolAmount(publicSpinPriceSol)} SOL.`;

  function clearSpinTimers() {
    spinTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    spinTimersRef.current = [];
  }

  function stageSpinTimeline(pullCount: GachaPullCount) {
    clearSpinTimers();
    const timeline =
      pullCount === 10
        ? [
            { afterMs: 260, phase: "locking" as const },
            { afterMs: 900, phase: "sampling" as const },
            { afterMs: 1650, phase: "resolving" as const },
            { afterMs: 2350, phase: "settling" as const },
          ]
        : [
            { afterMs: 180, phase: "locking" as const },
            { afterMs: 620, phase: "sampling" as const },
            { afterMs: 1160, phase: "resolving" as const },
            { afterMs: 1520, phase: "settling" as const },
          ];

    setSpinPhase("locking");
    spinTimersRef.current = timeline.map(({ afterMs, phase }) =>
      window.setTimeout(() => setSpinPhase(phase), afterMs),
    );
  }

  async function collectPublicSpinPayment(args: {
    pullCount: GachaPullCount;
    expectedAmountLamports?: number;
    expectedAmountSol?: number;
    treasuryAddress?: string;
  }) {
    if (!publicKey || !sendTransaction) {
      throw new Error("Connect a wallet that can sign transactions before paying for a public spin.");
    }

    const targetTreasury = args.treasuryAddress ?? treasuryWallet;
    if (!targetTreasury) {
      throw new Error("Treasury wallet is not configured for public gacha payments.");
    }

    const lamports =
      args.expectedAmountLamports ?? getGachaPublicPriceLamports(args.pullCount);
    const amountSol =
      args.expectedAmountSol ?? getGachaPublicPriceSol(args.pullCount);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(targetTreasury),
        lamports,
      }),
    );
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    try {
      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");
      toast({
        title: "Public spin payment confirmed",
        description: `${formatSolAmount(amountSol)} SOL sent to the CLAWD treasury.`,
      });
      return signature;
    } catch (error: any) {
      const message = error?.message || "Public spin payment was cancelled.";
      if (/rejected|cancelled|canceled/i.test(message)) {
        throw new Error("Public spin payment was cancelled.");
      }
      throw error;
    }
  }

  async function createGachaSession(
    walletAddress: string,
    pullCount: GachaPullCount,
  ) {
    try {
      return await requestJson<GachaSessionResponse>("/api/gacha/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, pullCount }),
      });
    } catch (error) {
      if (!isGachaPaymentRequiredError(error)) {
        throw error;
      }

      const paymentSignature = await collectPublicSpinPayment({
        pullCount,
        expectedAmountLamports: error.data.access.expectedAmountLamports,
        expectedAmountSol: error.data.access.expectedAmountSol,
        treasuryAddress: error.data.access.treasuryWallet,
      });

      return requestJson<GachaSessionResponse>("/api/gacha/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          pullCount,
          paymentSignature,
        }),
      });
    }
  }

  async function runPull(pullCount: GachaPullCount) {
    if (!publicKey) {
      toast({
        title: "Connect wallet",
        description: "Connect a wallet before pulling capsules.",
        variant: "destructive",
      });
      return;
    }

    const walletAddress = publicKey.toBase58();
    setActivePullCount(pullCount);
    setIsPreparingPull(true);
    setProofVerified(null);
    setPulledCards([]);
    setLastReveal(null);
    setRevealedIndexes(new Set());

    try {
      const session = await createGachaSession(walletAddress, pullCount);
      setLastSession(session);
      setIsPreparingPull(false);
      setIsSpinning(true);
      stageSpinTimeline(pullCount);

      await new Promise((resolve) =>
        window.setTimeout(resolve, pullCount === 10 ? 2200 : 1700),
      );

      const clientSeed = createClientSeed();
      const reveal = await requestJson<GachaRevealResponse>("/api/gacha/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          walletAddress,
          clientSeed,
        }),
      });

      setLastReveal(reveal);

      const cards = reveal.cards.map((card, index) => ({
        ...card,
        pullKey: `${reveal.sessionId}:${index}`,
      }));

      clearSpinTimers();
      setSpinPhase("revealed");
      setPulledCards(cards);
      setCollection((current) => addCardsToCollection(current, reveal));
      setIsSpinning(false);

      cards.forEach((_, index) => {
        window.setTimeout(() => {
          setRevealedIndexes((current) => new Set([...current, index]));
        }, index * 110);
      });

      void statusQuery.refetch();

      if (reveal.totalPrizeClawd > 0) {
        toast({
          title: `${reveal.totalPrizeClawd.toLocaleString()} CLAWD won`,
          description: reveal.payout.recordedOnChain
            ? "Receipt recorded on-chain."
            : "Prize derived. Receipt pending.",
        });
      }

      if (reveal.payout.error) {
        toast({
          title: "Payout note",
          description: reveal.payout.error,
        });
      }

      if (cards.some((card) => card.rarity === "legendary")) {
        toast({
          title: "Legendary pull",
          description: "Vault burst detected. Mint it or inspect the on-chain receipt.",
        });
      }
    } catch (error: any) {
      clearSpinTimers();
      setIsPreparingPull(false);
      setIsSpinning(false);
      setSpinPhase("idle");
      setPulledCards([]);
      setLastReveal(null);
      setRevealedIndexes(new Set());
      setActivePullCount(1);
      toast({
        title: /cancelled|canceled/i.test(error?.message || "")
          ? "Payment cancelled"
          : "Pull failed",
        description:
          error?.message || "Could not resolve the gacha pull.",
        variant: /cancelled|canceled/i.test(error?.message || "")
          ? "default"
          : "destructive",
      });
    }
  }

  function handleMint(card: DisplayCard) {
    setMintingCardKey(card.pullKey);
    mintMutation.mutate(card);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070d] pb-16 text-white">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute inset-x-[-15%] top-[-18%] h-[32rem] rounded-full bg-cyan-400/10 blur-3xl"
          animate={{ x: [-40, 50, -40], opacity: [0.35, 0.6, 0.35] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[-12%] top-[18%] h-[26rem] w-[26rem] rounded-full bg-fuchsia-500/10 blur-3xl"
          animate={{ y: [-20, 40, -20], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(114,246,255,0.08),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_100%,100%_100%,48px_48px,48px_48px]" />
      </div>

      <div className="relative container mx-auto px-4 py-8">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Commit Reveal + On-Chain Receipts
          </div>
          <div className="mb-3 flex items-center justify-center gap-3">
            <Dice6 className="h-8 w-8 text-cyan-300" />
            <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl">
              CLAWD Vault Gacha
            </h1>
            <SparklesIcon className="h-8 w-8 text-fuchsia-300" />
          </div>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-300">
            Verified $CLAWD holders spin free. Public wallets can still pull
            animated agent capsules for {formatSolAmount(publicSpinPriceSol)} SOL
            per spin, with each reveal bound to a wallet, a server commitment,
            and Solana entropy before the outcome is revealed.
          </p>
          <div className="mt-4 flex justify-center">
            <motion.div
              animate={
                isSpinning || isPreparingPull
                  ? { scale: [1, 1.02, 1], opacity: [0.78, 1, 0.78] }
                  : { scale: 1, opacity: 1 }
              }
              transition={{ duration: 1.2, repeat: isSpinning || isPreparingPull ? Infinity : 0 }}
              className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-fuchsia-100/90"
            >
              {isPreparingPull
                ? "Wallet approval · access check"
                : isSpinning
                  ? `${activePhase.label} · ${activePhase.detail}`
                  : "Vault primed for the next pull"}
            </motion.div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              CLAWD mint: {GACHA_CLAWD_MINT.slice(0, 10)}...
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {statusQuery.data?.magicBlock.readyForOnChainPulls
                ? "MagicBlock VRF configured"
                : statusQuery.data?.magicBlock.scaffoldReady
                  ? "MagicBlock program configured"
                  : "MagicBlock scaffold wired"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {statusQuery.data?.fairnessMode ?? "commit-reveal"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {statusQuery.data?.magicBlock.supportsGuaranteedRareTail
                ? "10x Rare+ tail"
                : "Single-spin only"}
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">
              Holders free · Public {formatSolAmount(publicSpinPriceSol)} SOL / spin
            </span>
          </div>
          <div className="mx-auto mt-5 max-w-4xl">
            <StatusMarquee items={marqueeItems} />
          </div>
        </div>

        <div className="mb-8 flex justify-center gap-2">
          {(["pull", "collection"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                activeTab === tab
                  ? "bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.18)]"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/8"
              }`}
            >
              {tab === "pull" ? "Live Pull" : `Collection (${collection.length})`}
            </button>
          ))}
        </div>

        {activeTab === "pull" && (
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_0_60px_rgba(114,246,255,0.08)]">
                {isSpinning && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),transparent_55%)] mix-blend-screen"
                    animate={{
                      opacity: activePullCount === 10 ? [0.18, 0.42, 0.18] : [0.08, 0.22, 0.08],
                      scale: activePullCount === 10 ? [1, 1.12, 1] : [1, 1.05, 1],
                    }}
                    transition={{ duration: activePullCount === 10 ? 0.7 : 1.1, repeat: Infinity }}
                  />
                )}
                <div className="h-80 sm:h-[26rem]">
                  <GachaMachineHero
                    isSpinning={isSpinning}
                    highlight={highlight}
                    phase={spinPhase}
                    pullCount={activePullCount}
                    onPull={() => {
                      if (!isSpinning && !isPreparingPull) {
                        void runPull(1);
                      }
                    }}
                  />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-2">
                  <div className="rounded-full border border-cyan-400/20 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 backdrop-blur">
                    Claim CLAWD
                  </div>
                  <div className="rounded-full border border-fuchsia-400/20 bg-black/55 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.28em] text-white backdrop-blur">
                    CLAWD Vault
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      Vault Heat
                    </div>
                    <div className="mt-1 text-sm font-semibold text-emerald-200">
                      {Math.max(vaultJackpotCoverage, 0).toFixed(1)}x jackpots
                    </div>
                  </div>
                  <motion.div
                    animate={isSpinning ? { y: [0, -4, 0] } : { y: 0 }}
                    transition={{ duration: 1, repeat: isSpinning ? Infinity : 0 }}
                    className="max-w-[14rem] rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-right backdrop-blur"
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/75">
                      {activePullCount === 10 ? `x10 ${activePhase.label}` : activePhase.label}
                    </div>
                    <div className="mt-1 text-xs text-cyan-50/90">
                      {activePhase.detail}
                    </div>
                  </motion.div>
                </div>
                {isSpinning && (
                  <div className="pointer-events-none absolute inset-x-6 bottom-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-center backdrop-blur"
                    >
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                        Live Spin State
                      </div>
                      <div className="mt-1 text-sm font-semibold text-white">
                        {activePullCount === 10
                          ? `${activePhase.detail} · guaranteed rare tail armed`
                          : activePhase.detail}
                      </div>
                    </motion.div>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className={`sm:col-span-2 rounded-2xl border px-4 py-3 text-sm ${
                    isVerified
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-cyan-400/20 bg-cyan-500/10 text-cyan-100"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isVerified ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    <span className="font-semibold">
                      {isVerified
                        ? "Holder pricing unlocked"
                        : clawdBalance == null
                          ? "Pricing check in progress"
                          : "Public pricing active"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-current/85">
                    {holderStatusCopy}
                  </p>
                </div>
                {!connected ? (
                  <div className="sm:col-span-2 flex justify-center rounded-2xl border border-white/10 bg-white/5 p-5">
                    <WalletMultiButton className="!rounded-xl !bg-cyan-500 !text-black" />
                  </div>
                ) : (
                  <>
                    <Button
                      onClick={() => void runPull(1)}
                      disabled={isSpinning || isPreparingPull}
                      className="h-16 rounded-2xl bg-gradient-to-r from-cyan-300 to-cyan-500 text-black hover:from-cyan-200 hover:to-cyan-400"
                    >
                      {isSpinning || isPreparingPull ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Dice6 className="mr-2 h-4 w-4" />
                      )}
                      <span className="flex flex-col items-start">
                        <span>{isPreparingPull ? "Preparing x1" : "Pull x1"}</span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-black/65">
                          Free for holders · Public {formatSolAmount(publicX1PriceSol)} SOL
                        </span>
                      </span>
                    </Button>
                    <Button
                      onClick={() => void runPull(10)}
                      disabled={isSpinning || isPreparingPull}
                      className="h-16 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white hover:from-fuchsia-400 hover:to-violet-500"
                    >
                      {isSpinning || isPreparingPull ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <SparklesIcon className="mr-2 h-4 w-4" />
                      )}
                      <span className="flex flex-col items-start">
                        <span>{isPreparingPull ? "Preparing x10" : "Pull x10"}</span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-fuchsia-100/85">
                          Free for holders · Public {formatSolAmount(publicX10PriceSol)} SOL
                        </span>
                      </span>
                    </Button>
                  </>
                )}
              </div>

              <VaultPressureMeter
                balance={vault?.clawdBalance ?? 0}
                recommendedBuffer={vaultRecommendedBuffer}
                jackpotCoverage={vaultJackpotCoverage}
                shortfall={vaultShortfall}
              />

              {vault && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    vault.readyForRecommendedBuffer
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">
                      {vault.readyForRecommendedBuffer
                        ? "Vault buffer is stocked for live pulls."
                        : `Top off ${vaultShortfall.toLocaleString()} CLAWD to hit the recommended live buffer.`}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                      {vault.fundingMode}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-current/80">
                    {vault.signerCanTransfer
                      ? "The configured GACHA_KEY can already settle wins from the current vault."
                      : "Match GACHA_WALLET to the keypair behind GACHA_KEY or delegate transfer authority on the CLAWD vault ATA before promoting this path."}
                  </p>
                </motion.div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                      <Wallet className="h-4 w-4 text-cyan-300" />
                      Vault
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ValueLine
                      label="Balance"
                      value={
                        statusQuery.isLoading
                          ? "Loading..."
                          : `${(vault?.clawdBalance ?? 0).toLocaleString()} CLAWD`
                      }
                      tone="positive"
                    />
                    <ValueLine
                      label="Wallet"
                      value={
                        vault?.walletAddress
                          ? `${vault.walletAddress.slice(0, 10)}...${vault.walletAddress.slice(-6)}`
                          : "Not configured"
                      }
                    />
                    <ValueLine
                      label="Payout signer"
                      value={
                        vault?.receiptSignerReady
                          ? vault.payoutEnabled
                            ? "Ready"
                            : "Receipt only"
                          : "Missing GACHA_KEY"
                      }
                    />
                    <ValueLine
                      label="Transfer auth"
                      value={vault?.vaultAuthorityMode || "Unknown"}
                    />
                    <ValueLine
                      label="Receipt mode"
                      value={
                        vault?.onChainRecordingEnabled
                          ? "Every pull recorded"
                          : "Wins only"
                      }
                    />
                    <ValueLine
                      label="Signer"
                      value={
                        vault?.signerAddress
                          ? `${vault.signerAddress.slice(0, 10)}...${vault.signerAddress.slice(-6)}`
                          : "Unavailable"
                      }
                    />
                    <ValueLine
                      label="Top-off"
                      value={
                        vault?.readyForRecommendedBuffer
                          ? "Target met"
                          : `${vault?.shortfallClawd.toLocaleString() ?? "0"} CLAWD`
                      }
                    />
                  </CardContent>
                </Card>

                <Card className="border-white/10 bg-white/5 text-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                      <Bot className="h-4 w-4 text-fuchsia-300" />
                      MagicBlock Path
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ValueLine
                      label="Program"
                      value={
                        statusQuery.data?.magicBlock.programId
                          ? `${statusQuery.data.magicBlock.programId.slice(0, 10)}...`
                          : "Scaffold only"
                      }
                    />
                    <ValueLine
                      label="ER endpoint"
                      value={statusQuery.data?.magicBlock.ephemeralEndpoint ? "Configured" : "Missing"}
                    />
                    <ValueLine
                      label="VRF queue"
                      value={statusQuery.data?.magicBlock.vrfOracleQueue || "Pending"}
                    />
                    <ValueLine
                      label="Bundle pulls"
                      value={statusQuery.data?.magicBlock.bundlePullCounts.join(" / ") || "1 / 10"}
                    />
                    <ValueLine
                      label="Guaranteed tail"
                      value={
                        statusQuery.data?.magicBlock.supportsGuaranteedRareTail
                          ? "10x slot 10 is Rare+"
                          : "Pending"
                      }
                    />
                    <ValueLine
                      label="Settlement"
                      value={
                        statusQuery.data?.magicBlock.readyForOnChainPulls
                          ? "Program vault path ready"
                          : "Server vault live / program vault pending"
                      }
                    />
                    <ValueLine
                      label="Flow"
                      value={statusQuery.data?.magicBlock.targetSettlementMode || "Adapted locally"}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-white/10 bg-white/5 text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm text-slate-100">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    Fairness
                  </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <ValueLine
                      label="Verification"
                    value={
                      proofVerified == null
                        ? "Waiting for reveal"
                        : proofVerified
                          ? "Locally verified"
                          : "Verification failed"
                    }
                    tone={proofVerified ? "positive" : "default"}
                  />
                  <ValueLine
                    label="Server commitment"
                    value={
                      lastSession
                        ? `${lastSession.serverSeedHash.slice(0, 14)}...`
                        : "Not started"
                    }
                  />
                  <ValueLine
                    label="Entropy"
                    value={
                      lastReveal
                        ? `${lastReveal.fairness.entropyBlockhash.slice(0, 14)}...`
                        : "Awaiting session"
                    }
                  />
                    <ValueLine
                      label="Client seed"
                      value={
                      lastReveal
                        ? `${lastReveal.fairness.clientSeed.slice(0, 14)}...`
                        : "Awaiting reveal"
                    }
                  />
                  <SpinPhaseRail
                    phase={spinPhase}
                    proofVerified={proofVerified}
                    recordedOnChain={Boolean(lastReveal?.payout.recordedOnChain)}
                  />
                  {receiptUrl && (
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 pt-2 text-xs text-cyan-300 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open receipt on Solscan
                    </a>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      <Dice6 className="h-3.5 w-3.5 text-cyan-300" />
                      Pulls
                    </div>
                    <div className="mt-2 text-2xl font-black">{totalPulls}</div>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      <Coins className="h-3.5 w-3.5 text-emerald-300" />
                      Won
                    </div>
                    <div className="mt-2 text-2xl font-black text-emerald-200">
                      {totalClawdWon.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/5 text-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      <Image className="h-3.5 w-3.5 text-fuchsia-300" />
                      Minted
                    </div>
                    <div className="mt-2 text-2xl font-black">{mintedCount}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-white/10 bg-white/5 text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-100">
                    {isSpinning
                      ? "Resolving pull"
                      : pulledCards.length === 0
                        ? "Ready to pull"
                        : `${pulledCards.length} capsules revealed`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isSpinning && (
                    <div className="flex min-h-[15rem] flex-col items-center justify-center gap-4 text-center">
                      <motion.div
                        animate={{ rotate: 360, scale: [1, 1.08, 1] }}
                        transition={{ rotate: { duration: 1.2, repeat: Infinity, ease: "linear" }, scale: { duration: 1, repeat: Infinity } }}
                        className="rounded-full border border-cyan-400/20 bg-cyan-400/10 p-5"
                      >
                        <Loader2 className="h-10 w-10 text-cyan-200" />
                      </motion.div>
                      <div>
                        <div className="text-lg font-semibold text-slate-100">
                          {activePhase.label} in motion
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {activePhase.detail}
                        </div>
                      </div>
                    </div>
                  )}

                  {!isSpinning && pulledCards.length === 0 && (
                    <div className="flex min-h-[15rem] flex-col items-center justify-center gap-4 text-center">
                      <div className="rounded-full border border-white/10 bg-white/5 p-6 text-6xl">
                        🎰
                      </div>
                      <div>
                        <div className="text-xl font-semibold text-slate-100">
                          Pull the vault
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          Every reveal returns cards, CLAWD rewards, and a verifiable proof chain.
                        </div>
                      </div>
                    </div>
                  )}

                  {!isSpinning && pulledCards.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <motion.div
                            animate={{ scale: [1, 1.03, 1] }}
                            transition={{ duration: 1.1, repeat: 2 }}
                            className="text-lg font-bold text-slate-100"
                          >
                            {lastReveal?.totalPrizeClawd.toLocaleString()} CLAWD derived
                          </motion.div>
                          <div className="mt-1 text-xs text-slate-400">
                            {lastReveal?.payout.payablePrizeClawd
                              ? `${lastReveal.payout.payablePrizeClawd.toLocaleString()} CLAWD sent from vault`
                              : "Receipt recorded even if no token transfer was sent."}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                          onClick={() => void runPull(lastReveal?.pullCount === 10 ? 10 : 1)}
                          disabled={isSpinning || isPreparingPull}
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Pull again
                        </Button>
                      </div>

                      <div className={`grid gap-3 ${pulledCards.length > 1 ? "grid-cols-2 xl:grid-cols-3" : "max-w-sm grid-cols-1"}`}>
                        <AnimatePresence>
                          {pulledCards.map((card, index) => (
                            <AgentCardDisplay
                              key={card.pullKey}
                              card={card}
                              revealed={revealedIndexes.has(index)}
                              onMint={handleMint}
                              isMinting={mintingCardKey === card.pullKey}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/5 text-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-100">Drop Table</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {(Object.entries(RARITY_CONFIG) as [Rarity, (typeof RARITY_CONFIG)[Rarity]][]).map(
                    ([rarity, config]) => (
                      <div
                        key={rarity}
                        className={`rounded-xl border px-3 py-3 ${config.border} ${config.bg}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold ${config.color}`}>{config.label}</span>
                          <span className="text-xs text-slate-400">{config.chance}%</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-300">
                          {config.payoutMin.toLocaleString()} - {config.payoutMax.toLocaleString()} CLAWD
                        </div>
                      </div>
                    ),
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === "collection" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {(Object.entries(RARITY_CONFIG) as [Rarity, (typeof RARITY_CONFIG)[Rarity]][]).map(
                ([rarity, config]) => (
                  <Card key={rarity} className="border-white/10 bg-white/5 text-white">
                    <CardContent className="p-4">
                      <div className={`text-sm font-semibold ${config.color}`}>{config.label}</div>
                      <div className="mt-2 text-2xl font-black">{rarityStats[rarity]}</div>
                    </CardContent>
                  </Card>
                ),
              )}
            </div>

            {collection.length === 0 ? (
              <div className="rounded-[2rem] border border-white/10 bg-white/5 py-20 text-center">
                <div className="text-6xl opacity-40">📦</div>
                <div className="mt-4 text-xl font-semibold text-slate-100">
                  Your collection is empty
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  Pull capsules to build a reward-backed CLAWD deck.
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {collection.map((card) => (
                  <AgentCardDisplay
                    key={card.pullKey}
                    card={card}
                    revealed={true}
                    onMint={handleMint}
                    isMinting={mintingCardKey === card.pullKey}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
