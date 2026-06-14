import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTreasuryGate } from "@/contexts/TreasuryGateContext";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClawdSpinner } from "@/components/ClawdSpinner";
import {
  Image, Sparkles, Plus, Search, Edit3, ArrowRight,
  Flame, CheckCircle2, XCircle, Copy, ExternalLink, Activity, RefreshCw
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const truncate = (s: string, n = 14) =>
  s && s.length > n * 2 + 3 ? `${s.slice(0, n)}...${s.slice(-n)}` : s;

function CopyBtn({ value }: { value: string }) {
  const { toast } = useToast();
  return (
    <Button
      size="icon" variant="ghost" className="h-5 w-5 shrink-0"
      onClick={() => { navigator.clipboard.writeText(value); toast({ title: "Copied!" }); }}
    >
      <Copy className="w-3 h-3" />
    </Button>
  );
}

function OkBox({ label, extra }: { label: string; extra?: Record<string, string> }) {
  return (
    <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1.5">
      <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
        <CheckCircle2 className="w-4 h-4" /> {label}
      </div>
      {extra && Object.entries(extra).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{k}</span>
          <div className="flex items-center gap-1">
            <code className="font-mono text-purple-300 truncate max-w-[180px]">{truncate(v)}</code>
            <CopyBtn value={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex gap-2 text-sm text-red-400">
      <XCircle className="w-4 h-4 shrink-0 mt-0.5" /> {msg}
    </div>
  );
}

// ─── Tab: Generate + Mint ─────────────────────────────────────────────────────

function CreateTab() {
  const { toast } = useToast();
  const { publicKey } = useWallet();
  const { requirePayment } = useTreasuryGate();

  const [prompt, setPrompt] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attributes, setAttributes] = useState("");

  const imageMutation = useMutation({
    mutationFn: async () => {
      const paid = await requirePayment("image", "AI Image Generation");
      if (!paid) throw new Error("Payment required");
      const r = await fetch("/api/nft/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Image generation failed");
      return d;
    },
    onSuccess: (d) => {
      setGeneratedUrl(d.imageUrl);
      toast({ title: "Image generated!", description: "Now fill in the NFT details and mint." });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const mintMutation = useMutation({
    mutationFn: async () => {
      if (!generatedUrl && !name) throw new Error("Generate an image first");
      const attrs = attributes
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [trait_type, value] = line.split(":").map((s) => s.trim());
          return { trait_type: trait_type || "Attribute", value: value || trait_type };
        });
      const r = await fetch("/api/nft/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || prompt.slice(0, 32),
          description,
          imageUrl: generatedUrl,
          attributes: attrs,
          ownerAddress: publicKey?.toBase58() || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Mint failed");
      return d;
    },
    onSuccess: () => toast({ title: "NFT Minted!", description: "Your Core NFT is live on Solana." }),
    onError: (e: Error) => toast({ title: "Mint failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Generate AI art with DALL-E 3, then mint it as a Metaplex Core NFT via Helius RPC.
        {publicKey ? (
          <span className="text-green-400"> NFT will be sent to your wallet.</span>
        ) : (
          <span className="text-yellow-400"> Connect wallet to receive the NFT (server wallet holds it otherwise).</span>
        )}
      </p>

      {/* Step 1 — Generate */}
      <div className="space-y-2 p-4 bg-black/20 rounded-lg border border-purple-500/20">
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-300 mb-2">
          <Sparkles className="w-4 h-4" /> Step 1 — Generate AI Image
        </div>
        <Label>Image Prompt</Label>
        <Textarea
          placeholder="A glowing golden lobster king wearing a crown, pixel art, cyberpunk Solana aesthetic..."
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          className="w-full bg-gradient-to-r from-violet-600 to-purple-700"
          onClick={() => imageMutation.mutate()}
          disabled={!prompt || imageMutation.isPending}
        >
          {imageMutation.isPending ? <ClawdSpinner size="sm" /> : <><Sparkles className="w-4 h-4 mr-2" />Generate with DALL-E 3</>}
        </Button>
      </div>

      {/* Generated preview */}
      {generatedUrl && (
        <div className="relative rounded-xl overflow-hidden border border-purple-500/30 bg-black/40">
          <img src={generatedUrl} alt="Generated NFT art" className="w-full aspect-square object-cover" />
          <div className="absolute top-2 right-2">
            <Badge className="bg-green-600/80">AI Generated</Badge>
          </div>
        </div>
      )}

      {/* Step 2 — Details */}
      <div className="space-y-3 p-4 bg-black/20 rounded-lg border border-blue-500/20">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-300 mb-2">
          <Edit3 className="w-4 h-4" /> Step 2 — NFT Details
        </div>
        <div className="space-y-1">
          <Label>Name *</Label>
          <Input placeholder="My CLAWD NFT" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Description</Label>
          <Input placeholder="A unique NFT on Solana..." value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Attributes (one per line, format: Trait: Value)</Label>
          <Textarea
            placeholder={"Rarity: Legendary\nBackground: Cyberpunk\nSpecies: Lobster"}
            rows={3}
            value={attributes}
            onChange={(e) => setAttributes(e.target.value)}
          />
        </div>

        <Button
          className="w-full bg-gradient-to-r from-blue-600 to-cyan-700"
          onClick={() => mintMutation.mutate()}
          disabled={!generatedUrl || !name || mintMutation.isPending}
        >
          {mintMutation.isPending ? <ClawdSpinner size="sm" /> : <><Plus className="w-4 h-4 mr-2" />Mint Core NFT</>}
        </Button>
      </div>

      {mintMutation.isSuccess && (
        <OkBox
          label="NFT minted on Solana!"
          extra={{
            "Asset Address": mintMutation.data.assetAddress,
            "Owner": mintMutation.data.owner,
            "Explorer": mintMutation.data.explorerUrl,
          }}
        />
      )}
      {mintMutation.isError && <ErrBox msg={(mintMutation.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Fetch ───────────────────────────────────────────────────────────────

function FetchTab() {
  const [addr, setAddr] = useState("");
  const [lookup, setLookup] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/nft/fetch", lookup],
    queryFn: async () => {
      const r = await fetch(`/api/nft/fetch/${lookup}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Fetch failed");
      return d;
    },
    enabled: !!lookup,
    retry: false,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Fetch any Metaplex Core NFT data from the chain via Helius DAS API.</p>
      <div className="flex gap-2">
        <Input placeholder="Asset address..." value={addr} onChange={(e) => setAddr(e.target.value.trim())} className="font-mono" />
        <Button onClick={() => setLookup(addr)} disabled={!addr || isLoading} className="bg-cyan-600 hover:bg-cyan-700">
          {isLoading ? <ClawdSpinner size="sm" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      {error && <ErrBox msg={(error as Error).message} />}
      {data && (
        <div className="space-y-3">
          {data.offchainMetadata?.image && (
            <img src={data.offchainMetadata.image} alt={data.name} className="w-48 h-48 rounded-xl object-cover border border-purple-500/30 mx-auto" />
          )}
          <Card className="bg-black/30 border-purple-500/20">
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-bold">{data.name}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Owner</span><div className="flex items-center gap-1"><code className="text-xs font-mono text-purple-300">{truncate(data.owner, 10)}</code><CopyBtn value={data.owner} /></div></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Update Auth</span><code className="text-xs font-mono text-blue-300">{truncate(data.updateAuthority, 10)}</code></div>
              {data.offchainMetadata?.description && (
                <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">{data.offchainMetadata.description}</div>
              )}
              {data.offchainMetadata?.attributes?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {data.offchainMetadata.attributes.map((a: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{a.trait_type}: {a.value}</Badge>
                  ))}
                </div>
              )}
              <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:underline pt-1">
                <ExternalLink className="w-3 h-3" /> View on Explorer
              </a>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Update ──────────────────────────────────────────────────────────────

function UpdateTab() {
  const { toast } = useToast();
  const [assetAddress, setAssetAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newUri, setNewUri] = useState("");

  const genMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nft/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newPrompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: (d) => {
      setNewUri(`data:application/json;base64,${btoa(JSON.stringify({ name: newName, image: d.imageUrl }))}`);
      toast({ title: "New image ready", description: "Click Update to apply to the NFT." });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nft/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress, name: newName || undefined, uri: newUri || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => toast({ title: "NFT Updated!" }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Update the name or metadata URI of a Core NFT you have update authority over.</p>
      <div className="space-y-1"><Label>Asset Address *</Label><Input placeholder="Asset address..." value={assetAddress} onChange={(e) => setAssetAddress(e.target.value.trim())} className="font-mono" /></div>
      <div className="space-y-1"><Label>New Name (optional)</Label><Input placeholder="New NFT name..." value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
      <div className="space-y-3 p-3 bg-black/20 rounded-lg border border-purple-500/10">
        <Label className="text-xs text-muted-foreground">Regenerate Art (optional)</Label>
        <Input placeholder="New image prompt..." value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => genMut.mutate()} disabled={!newPrompt || genMut.isPending}>
          {genMut.isPending ? <ClawdSpinner size="sm" /> : <><Sparkles className="w-3 h-3 mr-1" />Generate New Art</>}
        </Button>
        {genMut.isSuccess && <p className="text-xs text-green-400">✓ New URI built — click Update below</p>}
      </div>
      <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={() => updateMut.mutate()} disabled={!assetAddress || (!newName && !newUri) || updateMut.isPending}>
        {updateMut.isPending ? <ClawdSpinner size="sm" /> : <><Edit3 className="w-4 h-4 mr-2" />Update NFT</>}
      </Button>
      {updateMut.isSuccess && <OkBox label="NFT updated!" extra={{ "Sig": updateMut.data.signature }} />}
      {updateMut.isError && <ErrBox msg={(updateMut.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Transfer ────────────────────────────────────────────────────────────

function TransferTab() {
  const { toast } = useToast();
  const { publicKey } = useWallet();
  const [assetAddress, setAssetAddress] = useState("");
  const [newOwner, setNewOwner] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nft/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress, newOwnerAddress: newOwner }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => toast({ title: "NFT Transferred!" }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Transfer a Core NFT to any Solana wallet. You must be the owner.</p>
      <div className="space-y-1"><Label>Asset Address *</Label><Input placeholder="Asset address..." value={assetAddress} onChange={(e) => setAssetAddress(e.target.value.trim())} className="font-mono" /></div>
      <div className="space-y-1">
        <Label>Recipient Wallet *</Label>
        <Input placeholder="Recipient address..." value={newOwner} onChange={(e) => setNewOwner(e.target.value.trim())} className="font-mono" />
        {publicKey && <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setNewOwner(publicKey.toBase58())}>Use my wallet</Button>}
      </div>
      <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => mut.mutate()} disabled={!assetAddress || !newOwner || mut.isPending}>
        {mut.isPending ? <ClawdSpinner size="sm" /> : <><ArrowRight className="w-4 h-4 mr-2" />Transfer NFT</>}
      </Button>
      {mut.isSuccess && <OkBox label="NFT transferred!" extra={{ "New owner": mut.data.newOwner }} />}
      {mut.isError && <ErrBox msg={(mut.error as Error).message} />}
    </div>
  );
}

// ─── Tab: Burn ────────────────────────────────────────────────────────────────

function BurnTab() {
  const { toast } = useToast();
  const [assetAddress, setAssetAddress] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nft/burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetAddress }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d;
    },
    onSuccess: () => { toast({ title: "NFT Burned", description: "Rent reclaimed to your wallet." }); setAssetAddress(""); setConfirmed(false); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
        ⚠ Burning is permanent and cannot be reversed. You must be the owner of the NFT.
      </div>
      <div className="space-y-1"><Label>Asset Address *</Label><Input placeholder="Asset address to burn..." value={assetAddress} onChange={(e) => setAssetAddress(e.target.value.trim())} className="font-mono" /></div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="rounded" />
        I understand this is permanent and cannot be undone
      </label>
      <Button className="w-full bg-red-700 hover:bg-red-800" onClick={() => mut.mutate()} disabled={!assetAddress || !confirmed || mut.isPending}>
        {mut.isPending ? <ClawdSpinner size="sm" /> : <><Flame className="w-4 h-4 mr-2" />Burn NFT</>}
      </Button>
      {mut.isSuccess && <OkBox label="NFT burned — rent reclaimed!" extra={{ "Sig": mut.data.signature }} />}
      {mut.isError && <ErrBox msg={(mut.error as Error).message} />}
    </div>
  );
}

// ─── Health ───────────────────────────────────────────────────────────────────

function HealthBadge() {
  const { data, refetch } = useQuery({
    queryKey: ["/api/nft/health"],
    queryFn: async () => {
      const r = await fetch("/api/nft/health");
      return r.json();
    },
    refetchInterval: 60000,
  });
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {data?.success ? (
        <>
          <Badge className="bg-green-600/20 text-green-400 border-green-500/30"><Activity className="w-3 h-3 mr-1" />Helius · slot {data.currentSlot?.toLocaleString()}</Badge>
          <Badge className={`border ${data.openaiConfigured ? "bg-purple-600/20 text-purple-400 border-purple-500/30" : "text-yellow-400 border-yellow-500/30"}`}>
            {data.openaiConfigured ? "✓ DALL-E 3" : "⚠ No OpenAI"}
          </Badge>
        </>
      ) : (
        <Badge variant="destructive">RPC offline</Badge>
      )}
      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => refetch()}><RefreshCw className="w-3 h-3" /></Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NftStudioPage() {
  return (
    <div className="container py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Image className="w-8 h-8 text-purple-400" /> NFT Studio
            </h1>
            <p className="text-muted-foreground text-sm mt-1">AI image generation · Metaplex Core · Helius RPC</p>
          </div>
          <HealthBadge />
        </div>
      </div>

      <Card className="bg-black/40 border-purple-500/20">
        <CardContent className="p-4">
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-5 h-auto mb-4">
              <TabsTrigger value="create" className="text-xs py-2"><Plus className="w-3 h-3 mr-1 hidden sm:block" />Create</TabsTrigger>
              <TabsTrigger value="fetch" className="text-xs py-2"><Search className="w-3 h-3 mr-1 hidden sm:block" />Fetch</TabsTrigger>
              <TabsTrigger value="update" className="text-xs py-2"><Edit3 className="w-3 h-3 mr-1 hidden sm:block" />Update</TabsTrigger>
              <TabsTrigger value="transfer" className="text-xs py-2"><ArrowRight className="w-3 h-3 mr-1 hidden sm:block" />Transfer</TabsTrigger>
              <TabsTrigger value="burn" className="text-xs py-2"><Flame className="w-3 h-3 mr-1 hidden sm:block" />Burn</TabsTrigger>
            </TabsList>
            <TabsContent value="create"><CreateTab /></TabsContent>
            <TabsContent value="fetch"><FetchTab /></TabsContent>
            <TabsContent value="update"><UpdateTab /></TabsContent>
            <TabsContent value="transfer"><TransferTab /></TabsContent>
            <TabsContent value="burn"><BurnTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Powered by OpenAI DALL-E 3 · Metaplex Core · Helius RPC · CLAWD Terminal
      </p>
    </div>
  );
}
