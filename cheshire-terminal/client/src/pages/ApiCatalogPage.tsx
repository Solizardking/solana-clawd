import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  Filter,
  KeyRound,
  LineChart,
  Search,
  Shield,
  Sparkles,
  Terminal,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Method = "GET" | "POST" | "DELETE";
type Access = "Public" | "Registered" | "Holder" | "API Key" | "Operator";

type CatalogEndpoint = {
  method: Method;
  path: string;
  family: string;
  product: string;
  access: Access;
  meter: string;
  description: string;
};

const productPlans = [
  {
    name: "Registered Builder",
    price: "$0",
    unit: "to start",
    tone: "cyan",
    badge: "site AI",
    description: "Wallet registration for the public AI surface, docs, model discovery, and low-volume testing.",
    includes: ["Developer docs", "Public market data", "Registered AI routes", "Upgrade path to scoped keys"],
  },
  {
    name: "Developer API Key",
    price: "$25",
    unit: "monthly cap",
    tone: "green",
    badge: "for sale",
    description: "Scoped Cheshire API keys for apps, agents, and automation that need server-to-server access.",
    includes: ["ct_sk bearer keys", "Route scopes", "Usage audit trail", "Key revocation"],
  },
  {
    name: "$CLAWD Holder",
    price: "included",
    unit: "with holder access",
    tone: "orange",
    badge: "holder",
    description: "Holder-gated terminal, trading, wallet intelligence, and API key issuance from the live app.",
    includes: ["Router keys", "Trading surfaces", "Token-gated tools", "Holder directory access"],
  },
  {
    name: "Agent Commerce",
    price: "custom",
    unit: "settlement",
    tone: "purple",
    badge: "sales",
    description: "Higher-limit API access for autonomous agents, Telegram/Discord bots, and execution workflows.",
    includes: ["Custom scopes", "Agent wallet binding", "Operational limits", "Priority integration review"],
  },
] as const;

const endpoints: CatalogEndpoint[] = [
  {
    method: "GET",
    path: "/api/developer/status",
    family: "Developer Core",
    product: "Docs",
    access: "Public",
    meter: "Free",
    description: "API status, auth modes, integration readiness, and discovery links.",
  },
  {
    method: "GET",
    path: "/api/developer/openapi.json",
    family: "Developer Core",
    product: "Docs",
    access: "Public",
    meter: "Free",
    description: "OpenAPI document for agent and client integration.",
  },
  {
    method: "GET",
    path: "/api/developer/llms.txt",
    family: "Developer Core",
    product: "Docs",
    access: "Public",
    meter: "Free",
    description: "LLM-readable API guide for autonomous client setup.",
  },
  {
    method: "POST",
    path: "/api/developer/keys",
    family: "Developer Core",
    product: "Keys",
    access: "Registered",
    meter: "Plan cap",
    description: "Create scoped Cheshire API keys for server-side clients.",
  },
  {
    method: "DELETE",
    path: "/api/developer/keys/{id}",
    family: "Developer Core",
    product: "Keys",
    access: "Registered",
    meter: "Included",
    description: "Revoke a developer key without exposing the stored secret hash.",
  },
  {
    method: "GET",
    path: "/api/router-keys/status",
    family: "Developer Core",
    product: "Router Keys",
    access: "Holder",
    meter: "Holder plan",
    description: "Check holder eligibility and router-key limits.",
  },
  {
    method: "POST",
    path: "/api/router-keys",
    family: "Developer Core",
    product: "Router Keys",
    access: "Holder",
    meter: "Monthly USDC cap",
    description: "Issue wallet-bound CLAWD Router keys with enforced spend limits.",
  },
  {
    method: "GET",
    path: "/api/clawdrouter/models",
    family: "AI Router",
    product: "Models",
    access: "Registered",
    meter: "Free discovery",
    description: "List model options exposed through the CLAWD router.",
  },
  {
    method: "POST",
    path: "/api/clawdrouter/chat",
    family: "AI Router",
    product: "Text AI",
    access: "Registered",
    meter: "Tokens",
    description: "Unified chat completions for registered site users and API clients.",
  },
  {
    method: "POST",
    path: "/api/clawdrouter/chat/stream",
    family: "AI Router",
    product: "Text AI",
    access: "Registered",
    meter: "Tokens",
    description: "Streaming chat responses for terminal and agent interfaces.",
  },
  {
    method: "POST",
    path: "/api/xai/responses",
    family: "AI Router",
    product: "Grok",
    access: "Registered",
    meter: "Tokens",
    description: "Structured Grok response API with the Cheshire auth layer.",
  },
  {
    method: "POST",
    path: "/api/xai/web-search",
    family: "AI Router",
    product: "Search AI",
    access: "Registered",
    meter: "Request",
    description: "Web search backed Grok calls for research and agent workflows.",
  },
  {
    method: "POST",
    path: "/api/xai/image-gen",
    family: "AI Router",
    product: "Media",
    access: "Registered",
    meter: "Generation",
    description: "Image generation endpoint routed through Cheshire auth and usage tracking.",
  },
  {
    method: "POST",
    path: "/api/xai/video-gen",
    family: "AI Router",
    product: "Media",
    access: "Registered",
    meter: "Generation",
    description: "Video generation endpoint for approved media workflows.",
  },
  {
    method: "GET",
    path: "/api/wallet-intel/summary",
    family: "Market Data",
    product: "Wallet Intel",
    access: "Public",
    meter: "Request",
    description: "Wallet and market summary data used by the portfolio surface.",
  },
  {
    method: "GET",
    path: "/api/wallet-intel/leaderboard",
    family: "Market Data",
    product: "Wallet Intel",
    access: "Public",
    meter: "Request",
    description: "Ranked wallet intelligence feed for discovery and analytics.",
  },
  {
    method: "GET",
    path: "/api/helius/wallet/{address}/assets",
    family: "Market Data",
    product: "Wallet Intel",
    access: "Public",
    meter: "Request",
    description: "Parsed Solana wallet asset inventory via Helius.",
  },
  {
    method: "GET",
    path: "/api/helius/wallet/{address}/transactions-v2",
    family: "Market Data",
    product: "Wallet Intel",
    access: "Public",
    meter: "Request",
    description: "Enhanced wallet transaction history for analytics and agents.",
  },
  {
    method: "GET",
    path: "/api/birdeye/token/{address}",
    family: "Market Data",
    product: "Token Data",
    access: "Public",
    meter: "Request",
    description: "Token market data sourced from the BirdEye integration.",
  },
  {
    method: "GET",
    path: "/api/jupiter-tokens/search",
    family: "Market Data",
    product: "Token Data",
    access: "Public",
    meter: "Request",
    description: "Jupiter token search for swap, wallet, and discovery surfaces.",
  },
  {
    method: "GET",
    path: "/api/coingecko/simple/price",
    family: "Market Data",
    product: "Token Data",
    access: "Public",
    meter: "Request",
    description: "CoinGecko spot pricing proxy for lightweight clients.",
  },
  {
    method: "GET",
    path: "/api/stocks/search",
    family: "Market Data",
    product: "Stocks",
    access: "Public",
    meter: "Request",
    description: "Equity symbol search and stock terminal data.",
  },
  {
    method: "GET",
    path: "/api/dflow/markets",
    family: "Trading",
    product: "DFlow",
    access: "Holder",
    meter: "Request",
    description: "Prediction and market-routing data for DFlow screens.",
  },
  {
    method: "POST",
    path: "/api/dflow/swap",
    family: "Trading",
    product: "DFlow",
    access: "Holder",
    meter: "Execution",
    description: "Build or execute DFlow swap workflow requests.",
  },
  {
    method: "POST",
    path: "/api/wallet-ops/jupiter-build",
    family: "Trading",
    product: "Wallet Ops",
    access: "Holder",
    meter: "Execution",
    description: "Build Jupiter swap transactions for wallet-authorized execution.",
  },
  {
    method: "POST",
    path: "/api/wallet-ops/jupiter-execute",
    family: "Trading",
    product: "Wallet Ops",
    access: "Holder",
    meter: "Execution",
    description: "Submit wallet operation payloads through the trading relay.",
  },
  {
    method: "GET",
    path: "/api/phoenix/markets",
    family: "Trading",
    product: "Phoenix",
    access: "Public",
    meter: "Request",
    description: "Phoenix perpetual market data for the perps desk.",
  },
  {
    method: "POST",
    path: "/api/flash/quote",
    family: "Trading",
    product: "Flash",
    access: "Holder",
    meter: "Execution",
    description: "Low-latency quote path for flash trading flows.",
  },
  {
    method: "GET",
    path: "/api/agents/catalog",
    family: "Agents",
    product: "Agent Hub",
    access: "Registered",
    meter: "Request",
    description: "Catalog of deployable and discoverable Cheshire agents.",
  },
  {
    method: "POST",
    path: "/api/agents/deploy",
    family: "Agents",
    product: "Agent Hub",
    access: "Holder",
    meter: "Deployment",
    description: "Deploy or register an agent runtime under an authenticated wallet.",
  },
  {
    method: "POST",
    path: "/api/upstash-box",
    family: "Agents",
    product: "Boxes",
    access: "Holder",
    meter: "Deployment",
    description: "Create hosted agent boxes backed by the Upstash integration.",
  },
  {
    method: "POST",
    path: "/api/upstash-box/{id}/run",
    family: "Agents",
    product: "Boxes",
    access: "Holder",
    meter: "Runtime",
    description: "Run a provisioned agent box with scoped credentials.",
  },
  {
    method: "GET",
    path: "/api/agent-explorer/feed",
    family: "Agents",
    product: "Explorer",
    access: "Public",
    meter: "Request",
    description: "Live agent activity feed for public discovery.",
  },
  {
    method: "POST",
    path: "/api/telegram/session",
    family: "Social",
    product: "Telegram",
    access: "Public",
    meter: "Included",
    description: "Telegram mini-app session handshake and validation.",
  },
  {
    method: "POST",
    path: "/api/telegram/register",
    family: "Social",
    product: "Telegram",
    access: "Public",
    meter: "Included",
    description: "Register Telegram-linked users into the Cheshire account flow.",
  },
  {
    method: "POST",
    path: "/api/discord/trading/webhook/{secret}",
    family: "Social",
    product: "Discord",
    access: "Public",
    meter: "Relay",
    description: "Discord trading relay webhook for configured integrations.",
  },
  {
    method: "GET",
    path: "/api/news/trending",
    family: "Social",
    product: "News",
    access: "Public",
    meter: "Request",
    description: "Trending news feed used by public and agent-facing surfaces.",
  },
];

const familyIcons: Record<string, JSX.Element> = {
  "Developer Core": <KeyRound className="h-4 w-4" />,
  "AI Router": <Sparkles className="h-4 w-4" />,
  "Market Data": <Database className="h-4 w-4" />,
  Trading: <LineChart className="h-4 w-4" />,
  Agents: <Bot className="h-4 w-4" />,
  Social: <Wallet className="h-4 w-4" />,
};

const accessClass: Record<Access, string> = {
  Public: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  Registered: "border-green-300/30 bg-green-300/10 text-green-100",
  Holder: "border-orange-300/30 bg-orange-300/10 text-orange-100",
  "API Key": "border-purple-300/30 bg-purple-300/10 text-purple-100",
  Operator: "border-red-300/30 bg-red-300/10 text-red-100",
};

const methodClass: Record<Method, string> = {
  GET: "border-blue-300/30 bg-blue-300/10 text-blue-100",
  POST: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  DELETE: "border-red-300/30 bg-red-300/10 text-red-100",
};

const planClass: Record<(typeof productPlans)[number]["tone"], string> = {
  cyan: "border-cyan-300/25 bg-cyan-300/5",
  green: "border-green-300/25 bg-green-300/5",
  orange: "border-orange-300/25 bg-orange-300/5",
  purple: "border-purple-300/25 bg-purple-300/5",
};

function endpointMatches(endpoint: CatalogEndpoint, query: string, family: string) {
  const haystack = `${endpoint.method} ${endpoint.path} ${endpoint.family} ${endpoint.product} ${endpoint.access} ${endpoint.description}`.toLowerCase();
  return (family === "All" || endpoint.family === family) && haystack.includes(query.toLowerCase().trim());
}

export default function ApiCatalogPage() {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const families = useMemo(() => ["All", ...Array.from(new Set(endpoints.map((endpoint) => endpoint.family)))], []);
  const visibleEndpoints = useMemo(
    () => endpoints.filter((endpoint) => endpointMatches(endpoint, query, family)),
    [family, query],
  );
  const familyCounts = useMemo(
    () =>
      endpoints.reduce<Record<string, number>>((acc, endpoint) => {
        acc[endpoint.family] = (acc[endpoint.family] ?? 0) + 1;
        return acc;
      }, {}),
    [],
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 py-6">
      <section className="rounded-lg border border-white/10 bg-black/70 p-5 shadow-2xl shadow-cyan-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
              <Terminal className="h-3.5 w-3.5" />
              API marketplace
              <Badge variant="outline" className="border-green-300/30 bg-green-300/10 text-[10px] text-green-100">
                {endpoints.length} listed endpoints
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">Cheshire API Catalog</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              Buy scoped access to the same AI, market-data, trading, social, and agent APIs that power the site. Registered users can use site AI, while holder and paid API plans unlock higher-value routes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="gap-2 bg-cyan-500 text-black hover:bg-cyan-400">
              <Link href="/api-keys">
                <KeyRound className="h-4 w-4" />
                Create API key
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10">
              <a href="/api/developer/openapi.json" target="_blank" rel="noreferrer">
                <Code2 className="h-4 w-4" />
                OpenAPI
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-white/15 bg-white/[0.03] text-white hover:bg-white/10">
              <a href="/api/developer/llms.txt" target="_blank" rel="noreferrer">
                <ArrowUpRight className="h-4 w-4" />
                LLM docs
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {productPlans.map((plan) => (
          <Card key={plan.name} className={`${planClass[plan.tone]} border bg-black/60`}>
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base text-white">{plan.name}</CardTitle>
                <Badge variant="outline" className="border-white/15 bg-white/[0.04] text-[10px] uppercase tracking-wide text-white/70">
                  {plan.badge}
                </Badge>
              </div>
              <div>
                <span className="text-3xl font-black tracking-tight text-white">{plan.price}</span>
                <span className="ml-2 text-xs text-zinc-400">{plan.unit}</span>
              </div>
              <p className="min-h-[4.5rem] text-sm leading-6 text-zinc-300">{plan.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.includes.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-zinc-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-300" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {Object.entries(familyCounts).map(([name, count]) => (
          <button
            key={name}
            type="button"
            onClick={() => setFamily(name)}
            className={`rounded-lg border p-3 text-left transition ${
              family === name
                ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-black/50 text-zinc-300 hover:border-white/25 hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/80">{familyIcons[name]}</span>
              <span className="font-mono text-xs text-white/45">{count}</span>
            </div>
            <div className="mt-3 text-sm font-semibold text-white">{name}</div>
          </button>
        ))}
      </section>

      <section className="rounded-lg border border-white/10 bg-black/60">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <Filter className="h-4 w-4 text-cyan-300" />
              Endpoint Directory
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {visibleEndpoints.length} of {endpoints.length} endpoints visible. Use API keys for commercial apps; holder routes require wallet access.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search endpoints"
                className="h-10 w-full rounded-md border border-white/10 bg-black/70 pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-cyan-300/50"
              />
            </label>
            <select
              value={family}
              onChange={(event) => setFamily(event.target.value)}
              className="h-10 rounded-md border border-white/10 bg-black/70 px-3 text-sm text-white outline-none focus:border-cyan-300/50"
            >
              {families.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Endpoint</th>
                <th className="px-4 py-3 font-semibold">Family</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Meter</th>
                <th className="px-4 py-3 font-semibold">Use</th>
              </tr>
            </thead>
            <tbody>
              {visibleEndpoints.map((endpoint) => (
                <tr key={`${endpoint.method}:${endpoint.path}`} className="border-b border-white/5 align-top hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`${methodClass[endpoint.method]} font-mono text-[10px]`}>
                      {endpoint.method}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-cyan-100">{endpoint.path}</div>
                    <div className="mt-1 text-xs text-zinc-500">{endpoint.product}</div>
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{endpoint.family}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={`${accessClass[endpoint.access]} text-[10px]`}>
                      {endpoint.access}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{endpoint.meter}</td>
                  <td className="max-w-sm px-4 py-3 leading-6 text-zinc-400">{endpoint.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-white/10 bg-black/60 p-4">
          <h2 className="flex items-center gap-2 text-base font-black text-white">
            <Shield className="h-4 w-4 text-green-300" />
            Commercial Access Rules
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Auth</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Use wallet sessions in the app or `Authorization: Bearer ct_sk_...` for API clients.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-200">Scopes</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Keys can be broad with `api:*` or narrow with route-family and exact-route scopes.</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-200">Holder Gates</div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Trading, terminal, and router-key issuing stay gated to holders or paid-entry accounts.</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 p-4">
          <h2 className="text-base font-black text-white">Ready to buy access?</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Register with a wallet, open API Keys, then issue a scoped key with the smallest route set your app needs.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button asChild className="gap-2 bg-cyan-500 text-black hover:bg-cyan-400">
              <Link href="/api-keys">
                <KeyRound className="h-4 w-4" />
                Open API Keys
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2 border-white/15 bg-black/40 text-white hover:bg-white/10">
              <a href="/api/developer/status" target="_blank" rel="noreferrer">
                <Zap className="h-4 w-4" />
                Check API status
              </a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
