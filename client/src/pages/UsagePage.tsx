import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Activity, BarChart3, Bot, Clock, Coins, Database, MessageSquare, Radio, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClawdPixelArt } from "@/components/ClawdPixelArt";
import { isConvexConfigured } from "@/lib/convex";

function formatNumber(value?: number | null) {
  return Number(value ?? 0).toLocaleString();
}

function formatTime(value?: number) {
  if (!value) return "just now";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function breakdownEntries(record: unknown) {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function StatCard({
  label,
  value,
  icon,
  tone = "cyan",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: "cyan" | "green" | "red" | "yellow" | "purple";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/5 text-cyan-200",
    green: "border-green-300/20 bg-green-300/5 text-green-200",
    red: "border-red-300/20 bg-red-300/5 text-red-200",
    yellow: "border-yellow-300/20 bg-yellow-300/5 text-yellow-200",
    purple: "border-purple-300/20 bg-purple-300/5 text-purple-200",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{label}</span>
        <span className="text-white/70">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-black tracking-tight text-white">{value}</div>
    </div>
  );
}

function MissingConvexConfig() {
  return (
    <div className="mx-auto max-w-3xl py-12">
      <Card className="border-red-400/30 bg-black/60">
        <CardHeader>
          <CardTitle className="text-red-100">Usage is unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-red-100/80">
          Convex is not configured for this frontend build. Set `VITE_CONVEX_URL` or `VITE_CONVEX_SITE_URL`, then rebuild and redeploy.
        </CardContent>
      </Card>
    </div>
  );
}

function UsagePageContent() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;
  const summary = useConvexQuery(
    api.usage.getRealtimeSummaryByWallet,
    walletAddress ? { walletAddress } : "skip",
  );
  const timeline = useConvexQuery(
    api.usage.getUsageTimelineByWallet,
    walletAddress ? { walletAddress, days: 14 } : "skip",
  );

  const daily = summary?.daily;
  const recentEvents = summary?.recentEvents ?? [];
  const products = breakdownEntries(daily?.productBreakdown);
  const models = breakdownEntries(daily?.modelBreakdown);
  const maxTimelineEvents = useMemo(
    () => Math.max(1, ...(timeline ?? []).map((row: any) => row.totalEvents ?? 0)),
    [timeline],
  );

  if (!walletAddress) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <Card className="border-yellow-400/30 bg-black/60">
          <CardContent className="py-8 text-sm text-yellow-100">Connect your CLAWD wallet to view live usage.</CardContent>
        </Card>
      </div>
    );
  }

  const loading = summary === undefined || timeline === undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 py-6">
      <div className="relative overflow-hidden rounded-lg border border-cyan-300/20 bg-black/70 p-5 shadow-2xl shadow-cyan-950/20">
        <div className="pointer-events-none absolute right-4 top-3 opacity-75">
          <ClawdPixelArt state="codex" autoAnimate={false} size={0.36} showLabel={false} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 pr-24">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-green-300/80">
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Convex live
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Usage</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              Realtime counters for messages, agents, token actions, deployments, and model calls stored under your CLAWD profile.
            </p>
          </div>
          <Badge variant="outline" className="border-green-400/35 bg-green-400/10 px-3 py-1 text-green-200">
            {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events Today" value={loading ? "..." : formatNumber(daily?.totalEvents)} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Messages" value={loading ? "..." : formatNumber(daily?.messagesCount)} icon={<MessageSquare className="h-4 w-4" />} tone="green" />
        <StatCard label="Model Tokens" value={loading ? "..." : formatNumber(daily?.totalTokens)} icon={<Database className="h-4 w-4" />} tone="purple" />
        <StatCard label="Deployments" value={loading ? "..." : formatNumber((daily?.agentDeploymentsCount ?? 0) + (daily?.tokenDeploymentsCount ?? 0))} icon={<Bot className="h-4 w-4" />} tone="yellow" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border-white/10 bg-black/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              Last 14 days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(timeline ?? []).length === 0 ? (
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">
                No tracked usage yet. Send a chat message or deploy an agent and this panel will update.
              </div>
            ) : (
              [...(timeline ?? [])].reverse().map((row: any) => (
                <div key={row.day} className="grid grid-cols-[92px_1fr_76px] items-center gap-3 text-xs">
                  <span className="font-mono text-gray-400">{row.day.slice(5)}</span>
                  <Progress value={Math.round(((row.totalEvents ?? 0) / maxTimelineEvents) * 100)} className="h-2 bg-white/10" />
                  <span className="text-right font-mono text-cyan-200">{formatNumber(row.totalEvents)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-white/10 bg-black/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-purple-300" />
                Product Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {products.length === 0 ? (
                <div className="text-sm text-gray-500">No product activity today.</div>
              ) : (
                products.map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="capitalize text-gray-200">{name.replace(/_/g, " ")}</span>
                    <span className="font-mono text-cyan-200">{formatNumber(value)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="h-4 w-4 text-yellow-300" />
                Models
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {models.length === 0 ? (
                <div className="text-sm text-gray-500">No model calls today.</div>
              ) : (
                models.map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="truncate text-gray-200">{name}</span>
                    <span className="font-mono text-purple-200">{formatNumber(value)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-white/10 bg-black/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-green-300" />
            Live Event Feed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentEvents.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-400">No events recorded yet.</div>
          ) : (
            recentEvents.map((event: any) => (
              <div key={event._id} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm sm:grid-cols-[130px_1fr_160px] sm:items-center">
                <div className="font-mono text-xs text-gray-500">{formatTime(event.createdAt)}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{event.eventType.replace(/_/g, " ")}</div>
                  <div className="truncate text-xs text-gray-400">{event.route ?? event.productArea}</div>
                </div>
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {event.model && <Badge variant="outline" className="border-purple-400/25 text-purple-200">{event.model}</Badge>}
                  {event.totalTokens && <Badge variant="outline" className="border-cyan-400/25 text-cyan-200">{formatNumber(event.totalTokens)} tok</Badge>}
                  {event.tokenMint && <Badge variant="outline" className="border-yellow-400/25 text-yellow-200">token</Badge>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UsagePage() {
  if (!isConvexConfigured) return <MissingConvexConfig />;
  return <UsagePageContent />;
}
