import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Rocket, Eye, Wand2, Wallet as WalletIcon } from "lucide-react";

type TemplateSummary = {
  templateId: string;
  templateName: string;
  templateDescription: string;
  templateCategory: string;
  templateAvatar: string;
  variableCount: number;
  requiredCount: number;
};

type TemplateVariable = {
  name: string;
  description: string;
  example?: string;
  required?: boolean;
};

type FullTemplate = {
  templateId: string;
  templateName: string;
  templateDescription: string;
  templateCategory: string;
  templateAvatar: string;
  variables: TemplateVariable[];
  agent: {
    config: { systemRole: string; openingMessage: string; openingQuestions: string[] };
    meta: { title: string; description: string; avatar: string; tags: string[]; category: string };
  };
};

type RenderResult = {
  templateId: string;
  values: Record<string, string>;
  errors: string[];
  deployable: {
    name: string;
    persona: string;
    greeting: string;
    avatarEmoji: string;
    tags: string[];
    category: string;
    openingQuestions: string[];
    suggestedSlug: string;
  };
};

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek V4 Pro", model: "deepseek-v4-pro" },
  { value: "xai", label: "Grok 4", model: "grok-4" },
  { value: "openai", label: "GPT-4o", model: "gpt-4o" },
];

export default function AgentTemplatesPage() {
  const { publicKey, connected } = useWallet();
  const wallet = publicKey?.toBase58();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [full, setFull] = useState<FullTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [render, setRender] = useState<RenderResult | null>(null);
  const [renderBusy, setRenderBusy] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);
  const [provider, setProvider] = useState(PROVIDERS[0].value);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    fetch("/api/clawd/templates")
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setFull(null);
      setValues({});
      setRender(null);
      return;
    }
    fetch(`/api/clawd/templates/${selectedId}`)
      .then((r) => r.json())
      .then((j: FullTemplate) => {
        setFull(j);
        const init: Record<string, string> = {};
        for (const v of j.variables) init[v.name] = "";
        setValues(init);
        setRender(null);
      })
      .catch(() => {});
  }, [selectedId]);

  const requiredOk = useMemo(() => {
    if (!full) return false;
    return full.variables.every((v) => !v.required || (values[v.name]?.trim() ?? ""));
  }, [full, values]);

  const previewRender = async () => {
    if (!selectedId) return;
    setRenderBusy(true);
    try {
      const r = await fetch(`/api/clawd/templates/${selectedId}/render`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      const j = await r.json();
      setRender(j);
      if (!slug && j.deployable?.suggestedSlug) setSlug(j.deployable.suggestedSlug);
    } finally {
      setRenderBusy(false);
    }
  };

  const deploy = async () => {
    if (!render || !wallet) return;
    if (render.errors.length > 0) {
      toast({ title: "Fix required fields first", description: render.errors.join("; "), variant: "destructive" });
      return;
    }
    const provInfo = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];
    setDeployBusy(true);
    try {
      const r = await fetch("/api/user-agents", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerWallet: wallet,
          slug: (slug || render.deployable.suggestedSlug).toLowerCase(),
          name: render.deployable.name.slice(0, 64),
          persona: render.deployable.persona,
          greeting: render.deployable.greeting || undefined,
          provider: provInfo.value,
          model: provInfo.model,
        }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) {
        toast({ title: "Deploy failed", description: j?.error ?? `${r.status}`, variant: "destructive" });
        return;
      }
      toast({
        title: `Agent /${j.agent.slug} deployed`,
        description: `${j.agent.name} from template ${selectedId}`,
      });
      setSelectedId(null);
      setSlug("");
    } catch (e: any) {
      toast({ title: "Deploy failed", description: e?.message ?? "error", variant: "destructive" });
    } finally {
      setDeployBusy(false);
    }
  };

  if (full && selectedId) {
    return (
      <div className="min-h-screen bg-black text-orange-100 font-mono">
        <header className="border-b border-orange-500/30 px-6 py-4 flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelectedId(null)} className="border-orange-500/30 text-orange-300">
            <ChevronLeft className="w-3 h-3 mr-1" /> Back
          </Button>
          <div className="text-2xl">{full.templateAvatar}</div>
          <div>
            <h1 className="text-xl font-black tracking-wider">{full.templateName}</h1>
            <p className="text-xs text-orange-300/60">{full.templateDescription}</p>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 max-w-[1400px] mx-auto">
          <Card className="bg-black/60 border-orange-500/20 p-4">
            <h2 className="text-xs font-black tracking-wider text-orange-400 mb-3">VARIABLES</h2>
            <div className="space-y-3">
              {full.variables.map((v) => (
                <div key={v.name}>
                  <label className="text-[10px] uppercase tracking-wider text-orange-300/70 flex items-center gap-2">
                    {v.name}
                    {v.required && <Badge variant="outline" className="border-red-500/40 text-red-300 py-0 px-1 text-[8px]">required</Badge>}
                  </label>
                  <p className="text-[10px] text-orange-300/50 mb-1">{v.description}</p>
                  {v.name.includes("DESCRIPTION") || v.name.includes("CHECK_LIST") || v.name.includes("OPENING") ? (
                    <Textarea
                      value={values[v.name] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={v.example}
                      className="bg-black/60 border-orange-500/30 text-orange-100 font-mono text-xs min-h-[60px]"
                    />
                  ) : (
                    <Input
                      value={values[v.name] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={v.example}
                      className="bg-black/60 border-orange-500/30 text-orange-100 font-mono text-xs"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-orange-500/10 space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-orange-300/70">SLUG</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  placeholder="auto from title"
                  className="bg-black/60 border-orange-500/30 text-orange-100 font-mono text-xs"
                />
                <p className="text-[10px] text-orange-300/40 mt-1">Lowercase + underscore. Used as /{slug || "your_agent"} on Telegram.</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-orange-300/70">PROVIDER</label>
                <div className="flex gap-2 mt-1">
                  {PROVIDERS.map((p) => (
                    <Button
                      key={p.value}
                      size="sm"
                      variant={provider === p.value ? "default" : "outline"}
                      onClick={() => setProvider(p.value)}
                      className={provider === p.value ? "bg-orange-600 text-white h-7 text-xs" : "border-orange-500/30 text-orange-300 h-7 text-xs"}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                onClick={previewRender}
                disabled={!requiredOk || renderBusy}
                variant="outline"
                className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
              >
                <Eye className="w-3 h-3 mr-1" /> {renderBusy ? "Rendering…" : "Preview"}
              </Button>
              <Button
                onClick={deploy}
                disabled={!render || render.errors.length > 0 || !connected || deployBusy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Rocket className="w-3 h-3 mr-1" /> {deployBusy ? "Deploying…" : "Deploy Agent"}
              </Button>
            </div>
            {!connected && (
              <p className="text-[10px] text-yellow-300/80 mt-2 flex items-center gap-1">
                <WalletIcon className="w-3 h-3" /> Connect a wallet to deploy. Requires ≥ 100,000 $CLAWD.
              </p>
            )}
          </Card>

          <Card className="bg-black/60 border-orange-500/20 p-4 flex flex-col">
            <h2 className="text-xs font-black tracking-wider text-orange-400 mb-3">PREVIEW</h2>
            {!render && (
              <div className="text-xs text-orange-300/40 italic">Fill the required variables and click Preview.</div>
            )}
            {render && (
              <>
                {render.errors.length > 0 && (
                  <div className="text-xs text-red-300 mb-2">
                    {render.errors.map((e) => (
                      <div key={e}>⚠ {e}</div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-orange-300/70 mb-2">
                  <span className="font-bold text-orange-200">{render.deployable.name}</span>{" "}
                  · {render.deployable.avatarEmoji} · {render.deployable.category}
                </div>
                <div className="text-[10px] text-emerald-300/80 italic mb-3">{render.deployable.greeting}</div>
                <ScrollArea className="flex-1 max-h-[500px]">
                  <pre className="text-[10px] text-orange-100/80 whitespace-pre-wrap font-mono pr-3">
                    {render.deployable.persona}
                  </pre>
                </ScrollArea>
                <div className="mt-3 flex flex-wrap gap-1">
                  {render.deployable.tags.map((t) => (
                    <Badge key={t} variant="outline" className="border-orange-500/30 text-orange-300/80 text-[9px]">
                      {t}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-orange-100 font-mono">
      <header className="border-b border-orange-500/30 px-6 py-4">
        <div className="flex items-center gap-3">
          <Wand2 className="w-6 h-6 text-orange-400" />
          <div>
            <h1 className="text-2xl font-black tracking-wider">AGENT TEMPLATES</h1>
            <p className="text-xs text-orange-300/60">Spawn a Solana-native agent from a battle-tested starting point.</p>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 max-w-[1400px] mx-auto">
        {templates.length === 0 && (
          <div className="col-span-full text-center text-orange-300/40 italic py-12">Loading templates…</div>
        )}
        {templates.map((t) => (
          <Card
            key={t.templateId}
            onClick={() => setSelectedId(t.templateId)}
            className="bg-black/60 border-orange-500/20 p-4 cursor-pointer hover:border-orange-500/60 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">{t.templateAvatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-bold text-orange-200">{t.templateName}</h2>
                  <Badge variant="outline" className="border-orange-500/40 text-orange-300/80 text-[9px]">
                    {t.templateCategory}
                  </Badge>
                </div>
                <p className="text-xs text-orange-300/60 mb-2">{t.templateDescription}</p>
                <div className="text-[10px] text-orange-300/40">
                  {t.variableCount} variables · {t.requiredCount} required
                </div>
              </div>
            </div>
          </Card>
        ))}
      </main>
    </div>
  );
}
