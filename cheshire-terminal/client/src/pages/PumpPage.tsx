import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction } from "@solana/web3.js";
import { ArrowDownUp, CheckCircle2, Copy, ExternalLink, Rocket, Send, Zap } from "lucide-react";
import { PumpFunLivePanel } from "@/components/PumpFunLivePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { HeliusService } from "@/lib/heliusService";
import { resolveBrowserRpcUrl } from "@/lib/runtimeConfig";

type PumpResult = {
  signature: string;
  signatures?: string[];
  mintAddress?: string;
  bondingCurveAddress?: string;
  creator?: string;
  feeRecipient?: string;
  buybackFeeRecipient?: string;
  launchRegistry?: { launchRecordAddress?: string; programId?: string } | null;
  clawdAgentBinding?: { agentBindingAddress?: string; programId?: string } | null;
  pumpUrl?: string;
  solscanUrl?: string;
  solscanTxUrl?: string;
};

type PumpMetadataResult = {
  success: boolean;
  uri?: string;
  metadataUri?: string;
  error?: string;
  details?: string;
};

function short(value?: string, size = 6) {
  if (!value) return "-";
  if (value.length <= size * 2 + 3) return value;
  return `${value.slice(0, size)}...${value.slice(-size)}`;
}

function transactionFromBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return Transaction.from(bytes);
}

async function sendWalletTransaction(base64Tx: string, signTransaction: (tx: Transaction) => Promise<Transaction>) {
  const tx = transactionFromBase64(base64Tx);
  const signed = await signTransaction(tx);
  const connection = new Connection(resolveBrowserRpcUrl(), "confirmed");
  const { signature } = await HeliusService.sendSignedTransaction(
    Buffer.from(signed.serialize()).toString("base64"),
    { skipPreflight: false, maxRetries: 3 },
  );
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

function ResultPanel({ result }: { result: PumpResult }) {
  const { toast } = useToast();
  const copy = (label: string, value?: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast({ title: `${label} copied`, description: short(value, 10) });
  };

  const allRows: Array<[string, string | undefined]> = [
    ["Signature", result.signature],
    ["Mint", result.mintAddress],
    ["Bonding Curve", result.bondingCurveAddress],
    ["Creator", result.creator],
    ["Fee Recipient", result.feeRecipient],
    ["Buyback Recipient", result.buybackFeeRecipient],
    ["Launch Record", result.launchRegistry?.launchRecordAddress],
    ["Agent Binding", result.clawdAgentBinding?.agentBindingAddress],
  ];
  const rows = allRows.filter(([, value]) => !!value);

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-950/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        Confirmed
      </div>
      <div className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-zinc-500">{label}</span>
            <div className="flex min-w-0 items-center gap-1">
              <code className="truncate font-mono text-sky-300">{short(value, 10)}</code>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(label, value)}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {result.signatures && result.signatures.length > 1 && (
        <div className="mt-2 text-xs text-zinc-500">
          Bundle: <span className="font-mono text-zinc-300">{result.signatures.length}</span> transactions
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {result.pumpUrl && (
          <Button asChild type="button" size="sm" variant="outline" className="h-8 border-zinc-700">
            <a href={result.pumpUrl} target="_blank" rel="noreferrer">
              Pump <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        )}
        {(result.solscanTxUrl || result.solscanUrl) && (
          <Button asChild type="button" size="sm" variant="outline" className="h-8 border-zinc-700">
            <a href={result.solscanTxUrl || result.solscanUrl} target="_blank" rel="noreferrer">
              Solscan <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function LaunchPanel() {
  const { publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [uri, setUri] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [agentWallet, setAgentWallet] = useState("");
  const [mayhemMode, setMayhemMode] = useState(false);
  const [cashback, setCashback] = useState(false);
  const [registryEnabled, setRegistryEnabled] = useState(true);
  const [uploadingMetadata, setUploadingMetadata] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PumpResult | null>(null);

  const canLaunch = !!publicKey && !!name.trim() && !!symbol.trim() && (
    !!uri.trim() || (!!description.trim() && !!imageFile)
  ) && !isSubmitting && !uploadingMetadata;

  async function resolveMetadataUri() {
    const existingUri = uri.trim();
    if (existingUri) return existingUri;
    if (!imageFile || !description.trim()) {
      throw new Error("Provide a metadata URI or upload an image with a description.");
    }

    setUploadingMetadata(true);
    try {
      const form = new FormData();
      form.append("file", imageFile);
      form.append("name", name.trim());
      form.append("symbol", symbol.trim().toUpperCase());
      form.append("description", description.trim());
      form.append("twitter", twitter.trim());
      form.append("telegram", telegram.trim());
      form.append("website", website.trim());

      const response = await fetch("/api/pump/metadata", {
        method: "POST",
        body: form,
      });
      const data = await response.json() as PumpMetadataResult;
      if (!response.ok) throw new Error(data.error || data.details || "Metadata upload failed");
      const uploadedUri = data.metadataUri || data.uri;
      if (!uploadedUri) throw new Error("Metadata upload did not return a URI");
      setUri(uploadedUri);
      return uploadedUri;
    } finally {
      setUploadingMetadata(false);
    }
  }

  async function launch() {
    if (!publicKey || !signTransaction) {
      toast({ title: "Wallet required", description: "Connect a wallet before launching.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const metadataUri = await resolveMetadataUri();
      const response = await fetch("/api/pump/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          symbol,
          uri: metadataUri,
          userWallet: publicKey.toBase58(),
          mayhemMode,
          cashback,
          registryEnabled,
          agentWallet: agentWallet || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Launch failed");
      const transactions: string[] = Array.isArray(data.transactions) && data.transactions.length
        ? data.transactions
        : [data.transaction];
      const signatures: string[] = [];
      for (const tx of transactions) {
        signatures.push(await sendWalletTransaction(tx, signTransaction as (transaction: Transaction) => Promise<Transaction>));
      }
      const signature = signatures[0];
      setResult({
        ...data,
        signature,
        signatures,
        solscanTxUrl: `https://solscan.io/tx/${signature}`,
      });
      toast({ title: "Pump token launched", description: short(data.mintAddress, 10) });
    } catch (error) {
      toast({
        title: "Launch failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-lime-300">
          <Rocket className="h-5 w-5" />
          Pump Launch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} placeholder="Cheshire Agent" />
          </div>
          <div className="space-y-1.5">
            <Label>Symbol</Label>
            <Input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={13} placeholder="CHESH" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            placeholder="Describe the token. This is used for Pump metadata when you upload an image."
            className="min-h-24"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Token Image</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-zinc-500">PNG, JPG, GIF, or WEBP. Used only when Metadata URI is blank.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Metadata URI</Label>
            <Input value={uri} onChange={(event) => setUri(event.target.value)} placeholder="Optional: https://arweave.net/metadata.json" />
            <p className="text-[11px] text-zinc-500">Paste a hosted metadata URI or let the launchpad upload one.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>X / Twitter</Label>
            <Input value={twitter} onChange={(event) => setTwitter(event.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Telegram</Label>
            <Input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Agent Wallet</Label>
          <Input value={agentWallet} onChange={(event) => setAgentWallet(event.target.value.trim())} placeholder="Optional Clawd agent binding wallet" className="font-mono" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-md border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
            <input type="checkbox" checked={registryEnabled} onChange={(event) => setRegistryEnabled(event.target.checked)} />
            Registry
          </label>
          <label className="flex items-center gap-2 rounded-md border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
            <input type="checkbox" checked={mayhemMode} onChange={(event) => setMayhemMode(event.target.checked)} />
            Mayhem
          </label>
          <label className="flex items-center gap-2 rounded-md border border-zinc-800 bg-black/30 px-3 py-2 text-sm">
            <input type="checkbox" checked={cashback} onChange={(event) => setCashback(event.target.checked)} />
            Cashback
          </label>
        </div>
        <Button
          type="button"
          className="w-full bg-lime-600 text-black hover:bg-lime-500"
          onClick={launch}
          disabled={!canLaunch}
        >
          {uploadingMetadata ? "Uploading metadata..." : isSubmitting ? "Signing..." : <><Rocket className="mr-2 h-4 w-4" />Launch Pump Token</>}
        </Button>
        {result && <ResultPanel result={result} />}
      </CardContent>
    </Card>
  );
}

function TradePanel() {
  const { publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [mint, setMint] = useState("");
  const [creator, setCreator] = useState("");
  const [tokenAmount, setTokenAmount] = useState("100000");
  const [quoteSol, setQuoteSol] = useState("0.1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PumpResult | null>(null);

  const quoteLabel = useMemo(() => side === "buy" ? "Max SOL Cost" : "Min SOL Output", [side]);

  async function trade() {
    if (!publicKey || !signTransaction) {
      toast({ title: "Wallet required", description: "Connect a wallet before trading.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const endpoint = side === "buy" ? "/api/pump/build-buy" : "/api/pump/build-sell";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mint,
          userWallet: publicKey.toBase58(),
          creator: creator || undefined,
          tokenAmount,
          ...(side === "buy" ? { maxSolCost: quoteSol } : { minSolOutput: quoteSol }),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Trade builder failed");
      const signature = await sendWalletTransaction(data.transaction, signTransaction as (tx: Transaction) => Promise<Transaction>);
      setResult({
        ...data,
        signature,
        solscanTxUrl: `https://solscan.io/tx/${signature}`,
      });
      toast({ title: `Pump ${side} confirmed`, description: short(signature, 10) });
    } catch (error) {
      toast({
        title: "Trade failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-sky-300">
          <ArrowDownUp className="h-5 w-5" />
          Pump Trade
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-black/30 p-1">
          <Button type="button" variant={side === "buy" ? "default" : "ghost"} onClick={() => setSide("buy")}>Buy</Button>
          <Button type="button" variant={side === "sell" ? "default" : "ghost"} onClick={() => setSide("sell")}>Sell</Button>
        </div>
        <div className="space-y-1.5">
          <Label>Mint</Label>
          <Input value={mint} onChange={(event) => setMint(event.target.value.trim())} placeholder="Pump token mint" className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Creator</Label>
          <Input value={creator} onChange={(event) => setCreator(event.target.value.trim())} placeholder="Optional, fetched from curve when blank" className="font-mono" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Token Amount</Label>
            <Input value={tokenAmount} onChange={(event) => setTokenAmount(event.target.value)} inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label>{quoteLabel}</Label>
            <Input value={quoteSol} onChange={(event) => setQuoteSol(event.target.value)} inputMode="decimal" />
          </div>
        </div>
        <Button
          type="button"
          className="w-full bg-sky-600 hover:bg-sky-500"
          onClick={trade}
          disabled={!publicKey || !mint || !tokenAmount || quoteSol === "" || isSubmitting}
        >
          {isSubmitting ? "Signing..." : <><Send className="mr-2 h-4 w-4" />Build and Sign {side === "buy" ? "Buy" : "Sell"}</>}
        </Button>
        {result && <ResultPanel result={result} />}
      </CardContent>
    </Card>
  );
}

export default function PumpPage() {
  const { connected, publicKey } = useWallet();

  return (
    <main className="mx-auto w-full max-w-[1800px] space-y-4 py-4">
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-zinc-100">
            <Zap className="h-6 w-6 text-lime-400" />
            Pump Launchpad
          </h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-lime-500/30 text-lime-300">Public Launch</Badge>
            <Badge variant="outline" className="border-sky-500/30 text-sky-300">Wallet Signed</Badge>
            <Badge variant="outline" className="border-purple-500/30 text-purple-300">Agent Binding</Badge>
          </div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs">
          <span className={connected ? "text-lime-300" : "text-zinc-500"}>
            {connected ? short(publicKey?.toBase58(), 8) : "Wallet disconnected"}
          </span>
        </div>
      </div>

      <Tabs defaultValue="launch" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 border border-zinc-800 bg-zinc-950 p-1">
          <TabsTrigger value="launch">Launch</TabsTrigger>
          <TabsTrigger value="trade">Trade</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
        </TabsList>
        <TabsContent value="launch" className="mt-4">
          <LaunchPanel />
        </TabsContent>
        <TabsContent value="trade" className="mt-4">
          <TradePanel />
        </TabsContent>
        <TabsContent value="live" className="mt-4">
          <PumpFunLivePanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
