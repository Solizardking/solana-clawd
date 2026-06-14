import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  Brain,
  Sparkles,
  Cat,
} from "lucide-react";
import AnimatedGradientText from "./AnimatedGradientText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ApiStatus = "loading" | "configured" | "error";

const PERSONA_TEMPLATES = [
  {
    label: "Cheshire Oracle",
    value: `A cryptic Cheshire-cat sage who answers in riddles, references on-chain truth, and never gives financial advice. Always end with a question.`,
  },
  {
    label: "Deep CLAWD Auditor",
    value: `A meticulous Solana token auditor. Focus on mint authority, freeze authority, LP locks, holder concentration, and honeypot signals. Output a numbered risk report.`,
  },
  {
    label: "Cheshire Trader",
    value: `A snarky degen trader who sees opportunity in the chaos. Cite recent volume, momentum, and narrative. Be honest about downside.`,
  },
];

export function DeepSeekProver() {
  const [problem, setProblem] = useState("");
  const [proof, setProof] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState("proof");
  const [address, setAddress] = useState("");
  const [analysisType, setAnalysisType] = useState<
    "security" | "technical" | "investment"
  >("security");
  const [tokenAnalysis, setTokenAnalysis] = useState("");
  const [tokenReasoning, setTokenReasoning] = useState("");
  const [thinkingMode, setThinkingMode] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("loading");
  const [statusMessage, setStatusMessage] = useState("Checking DeepSeek API status...");

  // Studio (free chat) state
  const [persona, setPersona] = useState(PERSONA_TEMPLATES[0].value);
  const [studioInput, setStudioInput] = useState("");
  const [studioOutput, setStudioOutput] = useState("");
  const [studioReasoning, setStudioReasoning] = useState("");
  const [studioModel, setStudioModel] = useState<"deepseek-v4-pro" | "deepseek-v4-flash">(
    "deepseek-v4-pro",
  );

  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/openrouter/status");
        const d = await r.json();
        if (r.ok && d.status === "success" && d.configured) {
          setApiStatus("configured");
          setStatusMessage("DeepSeek API is properly configured and ready");
        } else {
          setApiStatus("error");
          setStatusMessage(d.message || "DeepSeek API is not properly configured");
        }
      } catch {
        setApiStatus("error");
        setStatusMessage("Failed to check DeepSeek API status");
      }
    })();
  }, []);

  const extractContent = (data: any) => {
    const content = data?.choices?.[0]?.message?.content || "";
    const reasoningContent =
      data?.choices?.[0]?.message?.reasoning_content ||
      data?.choices?.[0]?.message?.reasoning ||
      "";
    return { content, reasoning: reasoningContent };
  };

  const generateProof = async () => {
    if (!problem.trim()) {
      toast({ title: "Error", description: "Enter a problem first.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setProof("");
    setReasoning("");
    try {
      const r = await fetch("/api/openrouter/generate-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          temperature: 0.3,
          max_tokens: 2500,
          thinking: thinkingMode,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to generate proof");
      const { content, reasoning } = extractContent(data);
      if (!content) throw new Error("Empty response from DeepSeek");
      setProof(content);
      setReasoning(reasoning);
    } catch (e: any) {
      toast({
        title: "Proof failed",
        description: e?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeToken = async () => {
    if (!address.trim()) {
      toast({ title: "Error", description: "Enter a token address.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setTokenAnalysis("");
    setTokenReasoning("");
    try {
      const r = await fetch("/api/openrouter/analyze-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, analysisType, thinking: thinkingMode }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to analyze token");
      const { content, reasoning } = extractContent(data);
      if (!content) throw new Error("Empty response from DeepSeek");
      setTokenAnalysis(content);
      setTokenReasoning(reasoning);
    } catch (e: any) {
      toast({
        title: "Analysis failed",
        description: e?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runStudio = async () => {
    if (!studioInput.trim()) {
      toast({
        title: "Error",
        description: "Type a prompt for the agent.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    setStudioOutput("");
    setStudioReasoning("");
    try {
      const r = await fetch("/api/openrouter/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: studioModel,
          thinking: thinkingMode && studioModel === "deepseek-v4-pro",
          reasoning_effort: "high",
          temperature: 0.8,
          max_tokens: 1500,
          messages: [
            { role: "system", content: persona },
            { role: "user", content: studioInput },
          ],
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Studio call failed");
      const { content, reasoning } = extractContent(data);
      setStudioOutput(content);
      setStudioReasoning(reasoning);
    } catch (e: any) {
      toast({
        title: "Studio call failed",
        description: e?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const ReasoningPanel = ({ text }: { text: string }) =>
    text ? (
      <div className="mt-2 rounded-md border border-purple-500/30 bg-purple-500/5 p-3">
        <div className="flex items-center gap-2 text-xs text-purple-300 mb-2">
          <Brain className="h-3.5 w-3.5" />
          <span className="font-mono">thinking · {text.length} chars</span>
        </div>
        <ScrollArea className="h-40">
          <pre className="whitespace-pre-wrap text-xs text-purple-200/80 font-mono">{text}</pre>
        </ScrollArea>
      </div>
    ) : null;

  return (
    <Card className="w-full max-w-4xl mx-auto border-purple-500/30">
      <CardHeader>
        <CardTitle className="text-center">
          <AnimatedGradientText
            text="Deep CLAWD Studio"
            size="2xl"
            className="font-bold"
            as="div"
          />
        </CardTitle>
        <CardDescription className="text-center">
          Agentic reasoning, formal proofs, and Solana token audits — DeepSeek V4 Pro · thinking mode
        </CardDescription>
      </CardHeader>
      <CardContent>
        {apiStatus === "loading" && (
          <Alert className="mb-4 border-blue-500/50 bg-blue-500/10">
            <Info className="h-5 w-5 text-blue-500" />
            <AlertTitle className="text-blue-500">Checking API Status</AlertTitle>
            <AlertDescription className="text-blue-400">{statusMessage}</AlertDescription>
          </Alert>
        )}
        {apiStatus === "error" && (
          <Alert className="mb-4 border-red-500/50 bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <AlertTitle className="text-red-500">API Configuration Error</AlertTitle>
            <AlertDescription className="text-red-400">{statusMessage}</AlertDescription>
          </Alert>
        )}
        {apiStatus === "configured" && (
          <Alert className="mb-4 border-green-500/50 bg-green-500/10">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <AlertTitle className="text-green-500">API Ready</AlertTitle>
            <AlertDescription className="text-green-400">{statusMessage}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-purple-500/40 text-purple-300">
              <Sparkles className="h-3 w-3 mr-1" /> deepseek-v4-pro
            </Badge>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
              <Cat className="h-3 w-3 mr-1" /> Cheshire personas
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-300" />
            <Label htmlFor="thinking-toggle" className="text-sm">
              Thinking mode
            </Label>
            <Switch
              id="thinking-toggle"
              checked={thinkingMode}
              onCheckedChange={setThinkingMode}
              disabled={apiStatus === "error"}
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="studio" disabled={apiStatus === "error"}>
              Agent Studio
            </TabsTrigger>
            <TabsTrigger value="proof" disabled={apiStatus === "error"}>
              Formal Proofs
            </TabsTrigger>
            <TabsTrigger value="token" disabled={apiStatus === "error"}>
              Token Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="studio" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Persona template</Label>
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {PERSONA_TEMPLATES.map((p) => (
                    <option key={p.label} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <select
                  value={studioModel}
                  onChange={(e) => setStudioModel(e.target.value as any)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="deepseek-v4-pro">deepseek-v4-pro (thinking)</option>
                  <option value="deepseek-v4-flash">deepseek-v4-flash (fast)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>System prompt (persona)</Label>
              <Textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Your prompt</Label>
              <Textarea
                placeholder="Ask Deep CLAWD anything — riddles, audits, market takes…"
                value={studioInput}
                onChange={(e) => setStudioInput(e.target.value)}
                rows={4}
              />
            </div>

            {(studioOutput || studioReasoning) && (
              <div className="mt-4 space-y-2">
                <Label>Response</Label>
                <ScrollArea className="h-72 w-full rounded-md border border-purple-500/30 p-4">
                  <div className="whitespace-pre-wrap text-sm">{studioOutput}</div>
                </ScrollArea>
                <ReasoningPanel text={studioReasoning} />
              </div>
            )}

            <Button
              onClick={runStudio}
              disabled={isLoading || apiStatus === "error" || !studioInput.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Thinking...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Run agent
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="proof" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="problem">Mathematical problem</Label>
              <Textarea
                id="problem"
                placeholder="e.g., Prove that the sum of the first n odd numbers is n²"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                className="min-h-24"
              />
            </div>

            {(proof || reasoning) && (
              <div className="mt-4 space-y-2">
                <Label>Proof</Label>
                <ScrollArea className="h-72 w-full rounded-md border border-purple-500/30 p-4">
                  <div className="whitespace-pre-wrap text-sm">{proof}</div>
                </ScrollArea>
                <ReasoningPanel text={reasoning} />
              </div>
            )}

            <Button
              onClick={generateProof}
              disabled={isLoading || !problem.trim() || apiStatus === "error"}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reasoning...
                </>
              ) : (
                "Generate proof"
              )}
            </Button>
          </TabsContent>

          <TabsContent value="token" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="address">Token address</Label>
              <Input
                id="address"
                placeholder="Enter token contract address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="analysisType">Analysis type</Label>
              <select
                id="analysisType"
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value as any)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="security">Security audit</option>
                <option value="technical">Technical analysis</option>
                <option value="investment">Investment lens</option>
              </select>
            </div>

            {(tokenAnalysis || tokenReasoning) && (
              <div className="mt-4 space-y-2">
                <Label>Analysis</Label>
                <ScrollArea className="h-72 w-full rounded-md border border-purple-500/30 p-4">
                  <div className="whitespace-pre-wrap text-sm">{tokenAnalysis}</div>
                </ScrollArea>
                <ReasoningPanel text={tokenReasoning} />
              </div>
            )}

            <Button
              onClick={analyzeToken}
              disabled={isLoading || !address.trim() || apiStatus === "error"}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Auditing...
                </>
              ) : (
                "Run audit"
              )}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        Powered by DeepSeek V4 Pro · Cheshire Terminal · $CLAWD
      </CardFooter>
    </Card>
  );
}

export default DeepSeekProver;
