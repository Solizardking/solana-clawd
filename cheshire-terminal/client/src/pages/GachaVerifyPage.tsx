import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Clock,
  ExternalLink,
  Copy,
  RefreshCw,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RARITY_CONFIG, type Rarity } from "@shared/gacha";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VerifyCard {
  slot: number;
  rarity: Rarity;
  prizeClawd: number;
  proofHash: string;
  guaranteedRarePlus: boolean;
}

interface VerifyResult {
  success: boolean;
  serverSeedHash: string;
  revealHash: string;
  pullCount: number;
  cards: VerifyCard[];
  totalPrizeClawd: number;
  error?: string;
}

interface Attestation {
  signature: string;
  blockTime: number | null;
  sessionId: string;
  serverSeedHashPrefix: string;
  revealHashPrefix: string;
  totalPrizeClawd: number;
  raw: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function RarityBadge({ rarity }: { rarity: Rarity }) {
  const cfg = RARITY_CONFIG[rarity];
  return (
    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function truncate(s: string, n = 12) {
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

function copyToClipboard(text: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard.writeText(text).then(() => toast({ title: "Copied" }));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GachaVerifyPage() {
  const { toast } = useToast();

  // Verify form state
  const [form, setForm] = useState({
    serverSeed: "",
    clientSeed: "",
    walletAddress: "",
    entropyBlockhash: "",
    pullCount: "1",
    sessionId: "",
  });
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [claimedServerSeedHash, setClaimedServerSeedHash] = useState("");

  // Attestations query
  const { data: attestData, isLoading: attestLoading, refetch } = useQuery({
    queryKey: ["gacha-attestations"],
    queryFn: async () => {
      const r = await fetch("/api/gacha/attestations?limit=30");
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ success: boolean; signerAddress: string; attestations: Attestation[] }>;
    },
    refetchInterval: 30_000,
  });

  // Verify mutation
  const verifyMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/gacha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverSeed: form.serverSeed.trim(),
          clientSeed: form.clientSeed.trim(),
          walletAddress: form.walletAddress.trim(),
          entropyBlockhash: form.entropyBlockhash.trim(),
          pullCount: Number(form.pullCount),
          sessionId: form.sessionId.trim(),
        }),
      });
      const data = await r.json() as VerifyResult;
      if (!data.success) throw new Error(data.error ?? "Verification failed");
      return data;
    },
    onSuccess: (data) => {
      setVerifyResult(data);
    },
    onError: (e: Error) => {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" });
    },
  });

  const seedHashMatch =
    verifyResult && claimedServerSeedHash
      ? verifyResult.serverSeedHash.toLowerCase() === claimedServerSeedHash.toLowerCase()
      : null;

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-bold tracking-tight">Provably Fair Verification</h1>
        </div>
        <p className="text-sm text-white/50">
          Re-derive any CLAWD gacha pull from its public inputs and confirm the outcome is deterministic.
        </p>
      </div>

      {/* How it works */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white/70 font-normal">How commit-reveal works</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-white/50 space-y-1 font-mono">
          <p>1. Server commits <code className="text-cyan-400">sha256(serverSeed)</code> before the pull.</p>
          <p>2. Client supplies a <code className="text-cyan-400">clientSeed</code> at reveal time.</p>
          <p>3. <code className="text-cyan-400">revealHash = sha256(serverSeed:clientSeed:wallet:blockhash:pullCount:sessionId)</code></p>
          <p>4. Each slot: <code className="text-cyan-400">proofHash = sha256(revealHash:i)</code> → rarity + prize.</p>
          <p>5. Pull is recorded on-chain via Memo program (immutable attestation).</p>
        </CardContent>
      </Card>

      {/* Verify form */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-base">Verify a pull</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Server seed (revealed after pull)</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="64-char hex…"
                value={form.serverSeed}
                onChange={(e) => setForm((f) => ({ ...f, serverSeed: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Server seed hash (from session — to confirm no swap)</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="sha256(serverSeed) from /session response…"
                value={claimedServerSeedHash}
                onChange={(e) => setClaimedServerSeedHash(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Client seed</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="Your client seed…"
                value={form.clientSeed}
                onChange={(e) => setForm((f) => ({ ...f, clientSeed: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Wallet address</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="Solana pubkey…"
                value={form.walletAddress}
                onChange={(e) => setForm((f) => ({ ...f, walletAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Entropy blockhash</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="Finalized Solana blockhash…"
                value={form.entropyBlockhash}
                onChange={(e) => setForm((f) => ({ ...f, entropyBlockhash: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Session ID</Label>
              <Input
                className="bg-black/40 border-white/20 font-mono text-xs"
                placeholder="UUID from /session response…"
                value={form.sessionId}
                onChange={(e) => setForm((f) => ({ ...f, sessionId: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-white/60">Pull count</Label>
              <select
                className="bg-black/40 border border-white/20 rounded px-3 py-1.5 text-sm text-white"
                value={form.pullCount}
                onChange={(e) => setForm((f) => ({ ...f, pullCount: e.target.value }))}
              >
                <option value="1">1x</option>
                <option value="10">10x</option>
              </select>
            </div>
            <Button
              className="mt-5 bg-emerald-600 hover:bg-emerald-500"
              onClick={() => verifyMut.mutate()}
              disabled={verifyMut.isPending || !form.serverSeed || !form.clientSeed}
            >
              {verifyMut.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Verify
            </Button>
          </div>

          {/* Result */}
          <AnimatePresence>
            {verifyResult && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3 pt-2 border-t border-white/10"
              >
                {/* Seed commitment check */}
                {claimedServerSeedHash && (
                  <div className={`flex items-center gap-2 text-sm font-medium ${seedHashMatch ? "text-emerald-400" : "text-red-400"}`}>
                    {seedHashMatch
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <XCircle className="w-4 h-4" />}
                    {seedHashMatch
                      ? "Server seed matches committed hash — no swap occurred"
                      : "Server seed hash MISMATCH — seed may have been swapped"}
                  </div>
                )}

                <div className="text-xs text-white/40 font-mono space-y-0.5">
                  <div>revealHash: <span className="text-white/70">{verifyResult.revealHash}</span></div>
                </div>

                <div className="space-y-2">
                  {verifyResult.cards.map((card) => (
                    <div key={card.slot} className="flex items-center gap-3 bg-white/5 rounded px-3 py-2">
                      <span className="text-xs text-white/40 w-10">Slot {card.slot + 1}</span>
                      <RarityBadge rarity={card.rarity} />
                      {card.guaranteedRarePlus && (
                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30">guaranteed rare+</Badge>
                      )}
                      <span className="ml-auto text-sm font-mono text-emerald-300">
                        {card.prizeClawd.toLocaleString()} CLAWD
                      </span>
                      <button
                        onClick={() => copyToClipboard(card.proofHash, toast)}
                        className="text-white/20 hover:text-white/60"
                        title="Copy proof hash"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="text-right text-sm text-white/60">
                  Total: <span className="font-bold text-white">{verifyResult.totalPrizeClawd.toLocaleString()} CLAWD</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* On-chain attestation log */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">On-chain attestations</CardTitle>
            <button onClick={() => refetch()} className="text-white/40 hover:text-white/80">
              <RefreshCw className={`w-4 h-4 ${attestLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
          {attestData?.signerAddress && (
            <p className="text-xs text-white/40 font-mono mt-1">
              Signer: {attestData.signerAddress}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {attestLoading && (
            <div className="text-center py-8 text-white/30 text-sm">Loading…</div>
          )}
          {!attestLoading && !attestData?.attestations?.length && (
            <div className="text-center py-8 text-white/30 text-sm">No attestations found yet.</div>
          )}
          {attestData?.attestations?.map((a) => (
            <div
              key={a.signature}
              className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 text-xs"
            >
              <Hash className="w-3 h-3 text-white/20 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-white/60 truncate">{truncate(a.sessionId, 8)}</div>
                <div className="text-white/30">
                  reveal: <span className="text-white/50">{a.revealHashPrefix}…</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-emerald-400 font-mono">{a.totalPrizeClawd.toLocaleString()} CLAWD</div>
                {a.blockTime && (
                  <div className="text-white/30 flex items-center gap-1 justify-end">
                    <Clock className="w-3 h-3" />
                    {new Date(a.blockTime * 1000).toLocaleTimeString()}
                  </div>
                )}
              </div>
              <a
                href={`https://solscan.io/tx/${a.signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/20 hover:text-cyan-400 shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Source links */}
      <div className="text-xs text-white/30 space-y-1">
        <p className="font-semibold text-white/50">Open source</p>
        <p>Program: <code>magicblock-gacha/programs/clawd-gacha/src/lib.rs</code></p>
        <p>Derivation: <code>shared/gacha.ts</code> — <code>deriveRarityFromHash</code>, <code>derivePrizeAmountFromHash</code></p>
        <p>Server: <code>server/routes/gacha.ts</code> — <code>POST /api/gacha/verify</code>, <code>GET /api/gacha/attestations</code></p>
        <p>Docs: <code>magicblock-gacha/GACHA.md</code></p>
      </div>
    </div>
  );
}
