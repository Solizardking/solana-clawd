import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Link } from "wouter";
import {
  Bot,
  CheckCircle2,
  Cloud,
  Coins,
  ExternalLink,
  Globe2,
  KeyRound,
  Network,
  Rocket,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Provider = "deepseek" | "openai" | "xai" | "kimi";
type Runtime = "cloudflare-workers" | "google-agent-engine" | "hybrid";
type Visibility = "public" | "unlisted";
type PriceUnit = "call" | "minute" | "task";
type MonetizedService = {
  id: number;
  slug: string;
  recipientWallet: string;
  pricePerCallAtomic: number;
  commissionBps: number;
  network: string;
  active: boolean;
};

const providers: Array<{ value: Provider; label: string; model: string }> = [
  { value: "deepseek", label: "DeepSeek V4 Pro", model: "deepseek-v4-pro" },
  { value: "openai", label: "GPT-4o", model: "gpt-4o" },
  { value: "xai", label: "Grok 4", model: "grok-4" },
  { value: "kimi", label: "Kimi K2", model: "kimi-k2" },
];

const capabilities = [
  "chat.execute",
  "tools.call",
  "browser.run",
  "market.read",
  "wallet.request_approval",
  "agent.registry.publish",
];

const tiers = [
  { name: "Free", balance: "0 CLAWD", access: "Discovery and trial calls" },
  { name: "Bronze", balance: "100,000 CLAWD", access: "Deploy persistent agents" },
  { name: "Silver", balance: "500,000 CLAWD", access: "Higher paid-service limits" },
  { name: "Gold", balance: "1,000,000 CLAWD", access: "Priority routing and registry promotion" },
  { name: "Diamond", balance: "5,000,000 CLAWD", access: "Premium routing and partner surfaces" },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export default function DeployPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58() ?? "";
  const { toast } = useToast();

  const [name, setName] = useState("Cloudflare Agent Desk");
  const [slug, setSlug] = useState("cloudflare_agent_desk");
  const [description, setDescription] = useState("A public paid agent that answers customer requests, calls approved tools, and routes sensitive work through Agent Auth capability grants.");
  const [instructions, setInstructions] = useState("You are a production agent service. Verify Agent Auth grants before tool execution, explain paid actions clearly, and require wallet approval before transfers or account changes.");
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [runtime, setRuntime] = useState<Runtime>("hybrid");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [price, setPrice] = useState("0.02");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("call");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [cloudflareEnabled, setCloudflareEnabled] = useState(true);
  const [googleRegistryEnabled, setGoogleRegistryEnabled] = useState(true);
  const [adkEnabled, setAdkEnabled] = useState(true);
  const [agentAuthEnabled, setAgentAuthEnabled] = useState(true);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(capabilities.slice(0, 4));
  const [busy, setBusy] = useState(false);
  const [deployedSlug, setDeployedSlug] = useState<string | null>(null);
  const [monetizedService, setMonetizedService] = useState<MonetizedService | null>(null);

  const selectedProvider = providers.find((item) => item.value === provider) ?? providers[0];
  const effectiveRecipient = recipientWallet.trim() || wallet;
  const publicUrl = deployedSlug ? `/agents/deployed/${deployedSlug}` : `/agents/deployed/${slug || "agent"}`;
  const manifestUrl = deployedSlug ? `/api/user-agents/by-slug/${deployedSlug}/deploy-manifest` : null;
  const packageUrl = deployedSlug ? `/api/user-agents/by-slug/${deployedSlug}/deploy-package` : null;

  const readiness = useMemo(() => {
    return [
      { label: "Wallet identity", ok: connected && Boolean(wallet) },
      { label: "Public route", ok: visibility === "public" },
      { label: "Payment recipient", ok: Boolean(effectiveRecipient) },
      { label: "Agent Auth discovery", ok: agentAuthEnabled },
      { label: "Cloudflare edge", ok: cloudflareEnabled },
      { label: "Google ADK registry", ok: googleRegistryEnabled && adkEnabled },
    ];
  }, [adkEnabled, agentAuthEnabled, cloudflareEnabled, connected, effectiveRecipient, googleRegistryEnabled, visibility, wallet]);

  const toggleCapability = (capability: string) => {
    setSelectedCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  };

  const deploy = async (event: FormEvent) => {
    event.preventDefault();
    if (!wallet) {
      toast({ title: "Connect a wallet", description: "Deploys are wallet-owned and require CLAWD balance verification.", variant: "destructive" });
      return;
    }

    const normalizedSlug = slugify(slug || name);
    if (normalizedSlug.length < 2) {
      toast({ title: "Invalid slug", description: "Use at least two lowercase letters, numbers, or underscores.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/user-agents", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerWallet: wallet,
          slug: normalizedSlug,
          name: name.slice(0, 64),
          persona: `${instructions}\n\nService description: ${description}`,
          greeting: "This paid public agent is online. Connect through Agent Auth discovery or open the public page to request a capability grant.",
          provider,
          model: selectedProvider.model,
          launchRuntime: runtime,
          importedSpec: {
            source: "deploy-page",
            service: {
              visibility,
              public: visibility === "public",
              paid: true,
              price,
              priceUnit,
              recipientWallet: effectiveRecipient,
            },
            runtimes: {
              cloudflare: {
                enabled: cloudflareEnabled,
                workerRoute: `/api/agents/${normalizedSlug}/run`,
                bindings: ["AGENT_AUTH_SECRET", "GOOGLE_AGENT_ENGINE_ID", "X402_RECEIVER_WALLET"],
              },
              googleAgentEngine: {
                enabled: googleRegistryEnabled,
                adkEnabled,
                registryName: normalizedSlug,
                entrypoint: "adk.agent:root_agent",
              },
            },
            agentAuth: {
              enabled: agentAuthEnabled,
              protocol: "CAAP/1.0",
              discovery: "/caap/discovery",
              attestation: "/caap/attest",
              status: "/caap/status/:agentId?wallet=",
              capabilities: selectedCapabilities,
              identity: "SIWS",
              gating: ["Helius DAS", "CLAWD token balance", "subscription tier"],
            },
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        toast({ title: "Deploy failed", description: json?.error ?? `${res.status}`, variant: "destructive" });
        return;
      }
      setDeployedSlug(json.agent.slug);
      setMonetizedService(json.monetizedService ?? null);
      toast({
        title: `/${json.agent.slug} deployed`,
        description: json.monetizedService
          ? `Paid service #${json.monetizedService.id} is active.`
          : "Agent deployed. Paid service metadata was not created.",
      });
    } catch (error: any) {
      toast({ title: "Deploy failed", description: error?.message ?? "Unexpected error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-4 sm:px-5 lg:px-6">
        <section className="grid gap-5 border-b border-white/10 pb-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-200">Cloudflare edge</Badge>
              <Badge className="border-sky-400/30 bg-sky-500/10 text-sky-200">Google Agent Engine</Badge>
              <Badge className="border-amber-400/30 bg-amber-500/10 text-amber-200">Paid service</Badge>
            </div>
            <div>
              <h1 className="max-w-3xl text-4xl font-black tracking-normal text-white sm:text-5xl">
                Deploy a public paid agent
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                Publish an agent as a callable service with Cloudflare routing, Google Agent Engine registry metadata,
                ADK entrypoints, and Agent Auth capability grants.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { icon: Cloud, label: "Edge", value: "Cloudflare Worker route" },
                { icon: Network, label: "Registry", value: "Google Agent Engine + ADK" },
                { icon: KeyRound, label: "Auth", value: "CAAP/1.0 + SIWS grants" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <item.icon className="h-4 w-4 text-emerald-300" />
                  <div className="mt-2 text-xs uppercase text-zinc-500">{item.label}</div>
                  <div className="mt-1 text-sm text-zinc-100">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <Card className="border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase text-zinc-500">Readiness</div>
                <div className="mt-1 text-lg font-bold text-white">Public launch checklist</div>
              </div>
              <Rocket className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="mt-4 grid gap-2">
              {readiness.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border border-white/10 bg-zinc-950/70 px-3 py-2 text-sm">
                  <span className="text-zinc-300">{item.label}</span>
                  <CheckCircle2 className={`h-4 w-4 ${item.ok ? "text-emerald-300" : "text-zinc-600"}`} />
                </div>
              ))}
            </div>
          </Card>
        </section>

        <form onSubmit={deploy} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <Card className="border-white/10 bg-black/30 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Bot className="h-4 w-4 text-sky-300" />
                <h2 className="text-lg font-bold text-white">Agent Service</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="agent-name">Name</Label>
                  <Input id="agent-name" value={name} onChange={(event) => { setName(event.target.value); if (!deployedSlug) setSlug(slugify(event.target.value)); }} className="mt-2 border-white/10 bg-zinc-950" />
                </div>
                <div>
                  <Label htmlFor="agent-slug">Slug</Label>
                  <Input id="agent-slug" value={slug} onChange={(event) => setSlug(slugify(event.target.value))} className="mt-2 border-white/10 bg-zinc-950" />
                </div>
                <div>
                  <Label>Model Provider</Label>
                  <Select value={provider} onValueChange={(value) => setProvider(value as Provider)}>
                    <SelectTrigger className="mt-2 border-white/10 bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providers.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Runtime</Label>
                  <Select value={runtime} onValueChange={(value) => setRuntime(value as Runtime)}>
                    <SelectTrigger className="mt-2 border-white/10 bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hybrid">Hybrid edge + Agent Engine</SelectItem>
                      <SelectItem value="cloudflare-workers">Cloudflare Workers</SelectItem>
                      <SelectItem value="google-agent-engine">Google Agent Engine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="description">Public Description</Label>
                  <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-24 border-white/10 bg-zinc-950" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="instructions">Agent Instructions</Label>
                  <Textarea id="instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} className="mt-2 min-h-32 border-white/10 bg-zinc-950" />
                </div>
              </div>
            </Card>

            <Card className="border-white/10 bg-black/30 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-300" />
                <h2 className="text-lg font-bold text-white">Paid Public Access</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Visibility</Label>
                  <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
                    <SelectTrigger className="mt-2 border-white/10 bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public directory</SelectItem>
                      <SelectItem value="unlisted">Unlisted link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="price">Price</Label>
                  <Input id="price" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-2 border-white/10 bg-zinc-950" />
                </div>
                <div>
                  <Label>Unit</Label>
                  <Select value={priceUnit} onValueChange={(value) => setPriceUnit(value as PriceUnit)}>
                    <SelectTrigger className="mt-2 border-white/10 bg-zinc-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Per call</SelectItem>
                      <SelectItem value="minute">Per minute</SelectItem>
                      <SelectItem value="task">Per task</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="recipient-wallet">Recipient Wallet</Label>
                  <Input id="recipient-wallet" value={recipientWallet} onChange={(event) => setRecipientWallet(event.target.value)} placeholder={wallet || "Connect wallet or paste a payout wallet"} className="mt-2 border-white/10 bg-zinc-950" />
                </div>
              </div>
            </Card>

            <Card className="border-white/10 bg-black/30 p-4">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <h2 className="text-lg font-bold text-white">Infrastructure & Agent Auth</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Cloudflare Worker", cloudflareEnabled, setCloudflareEnabled],
                  ["Google Agent Engine registry", googleRegistryEnabled, setGoogleRegistryEnabled],
                  ["Google ADK entrypoint", adkEnabled, setAdkEnabled],
                  ["CAAP/1.0 Agent Auth", agentAuthEnabled, setAgentAuthEnabled],
                ].map(([label, value, setter]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-950/70 px-3 py-3">
                    <span className="text-sm text-zinc-200">{String(label)}</span>
                    <Switch checked={Boolean(value)} onCheckedChange={setter as (checked: boolean) => void} />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Label>Capabilities</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {capabilities.map((capability) => (
                    <button
                      key={capability}
                      type="button"
                      onClick={() => toggleCapability(capability)}
                      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                        selectedCapabilities.includes(capability)
                          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                          : "border-white/10 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {capability}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Wallet className="h-4 w-4 text-emerald-300" />
                Owner
              </div>
              <div className="mt-2 break-all rounded-md border border-white/10 bg-zinc-950 p-3 text-xs text-zinc-300">
                {wallet || "Connect wallet to deploy"}
              </div>
              <Button type="submit" disabled={busy || !connected} className="mt-4 w-full bg-emerald-600 text-white hover:bg-emerald-500">
                <Rocket className="mr-2 h-4 w-4" />
                {busy ? "Deploying..." : "Deploy Agent"}
              </Button>
              {deployedSlug && (
                <div className="mt-3 space-y-2">
                  <Link href={publicUrl} className="flex items-center justify-center gap-2 rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 hover:bg-sky-500/20">
                    Open public page <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {manifestUrl && (
                    <a href={manifestUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-500/20">
                      Deploy manifest <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {packageUrl && (
                    <a href={packageUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-500/20">
                      Worker + ADK package <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </Card>

            {monetizedService && (
              <Card className="border-amber-400/20 bg-amber-500/5 p-4">
                <div className="text-sm font-semibold text-amber-100">Paid Service Active</div>
                <div className="mt-3 space-y-2 text-xs text-amber-100/75">
                  <div className="flex justify-between gap-3">
                    <span className="text-amber-200/60">Service</span>
                    <span>#{monetizedService.id}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-amber-200/60">Price</span>
                    <span>{monetizedService.pricePerCallAtomic} atomic USDC</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-amber-200/60">Commission</span>
                    <span>{monetizedService.commissionBps} bps</span>
                  </div>
                  <div className="break-all rounded-md border border-amber-400/10 bg-black/30 p-2">
                    {monetizedService.recipientWallet}
                  </div>
                </div>
              </Card>
            )}

            <Card className="border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Globe2 className="h-4 w-4 text-sky-300" />
                Discovery Contract
              </div>
              <div className="mt-3 space-y-2 text-xs text-zinc-400">
                <div className="rounded-md bg-zinc-950 p-2">GET /caap/discovery</div>
                <div className="rounded-md bg-zinc-950 p-2">POST /caap/attest</div>
                <div className="rounded-md bg-zinc-950 p-2">GET /caap/status/:agentId?wallet=</div>
              </div>
            </Card>

            <Card className="border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold text-white">CLAWD Tiers</div>
              <div className="mt-3 space-y-2">
                {tiers.map((tier) => (
                  <div key={tier.name} className="rounded-md border border-white/10 bg-zinc-950/70 p-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-zinc-100">{tier.name}</span>
                      <span className="text-zinc-500">{tier.balance}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">{tier.access}</div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </form>
      </div>
    </div>
  );
}
