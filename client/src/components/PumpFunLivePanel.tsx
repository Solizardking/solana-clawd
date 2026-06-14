import { ExternalLink, Github, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePumpFunLive, type PumpFunToken } from "@/hooks/usePumpFunLive";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

function shortAddress(value?: string) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTime(value?: string) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return "";
  }
}

function pumpFunUrl(mint?: string) {
  return mint ? `https://pump.fun/coin/${mint}` : "https://pump.fun";
}

function solscanUrl(mint?: string) {
  return mint ? `https://solscan.io/token/${mint}` : "https://solscan.io";
}

function TokenRow({ token }: { token: PumpFunToken }) {
  const githubUrl = token.githubUrls?.[0];

  return (
    <article className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950/80 p-3 shadow-lg shadow-black/20 sm:grid-cols-[68px_minmax(0,1fr)_96px]">
      <a href={pumpFunUrl(token.mint)} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-md border border-zinc-800 bg-black">
        {token.imageUri ? (
          <img src={token.imageUri} alt={token.name ?? "PumpFun token"} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg">⚡</div>
        )}
      </a>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0 truncate text-base font-black text-zinc-100">{token.name || "Unnamed"}</div>
          <div className="font-mono text-sm font-black text-yellow-300">${token.symbol || "?"}</div>
          {typeof token.marketCapSol === "number" && (
            <div className="font-mono text-sm font-bold text-lime-400">{token.marketCapSol.toFixed(2)} SOL</div>
          )}
          {token.isV2 && <span className="rounded border border-red-500/30 px-1.5 py-0.5 text-[10px] font-black text-red-300">V2</span>}
          {token.hasGithub && <span className="rounded border border-purple-400/30 px-1.5 py-0.5 text-[10px] font-black text-purple-200">GITHUB</span>}
        </div>

        {token.description && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{token.description}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold">
          <a href={pumpFunUrl(token.mint)} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-200">pump.fun</a>
          <a href={solscanUrl(token.mint)} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-200">solscan</a>
          {token.website && <a href={token.website} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-200">site</a>}
          {token.twitter && <a href={token.twitter} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-200">x</a>}
          {token.telegram && <a href={token.telegram} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-200">telegram</a>}
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-100">
              <Github className="h-3 w-3" />
              github
            </a>
          )}
          {token.mint && (
            <ClawdTokenAction
              mintAddress={token.mint}
              symbol={token.symbol}
              name={token.name}
              logoURI={token.imageUri}
              variant="badge"
            />
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-zinc-500">
          <span>mint: <span className="text-sky-400">{shortAddress(token.mint)}</span></span>
          <span>creator: <span className="text-sky-400">{shortAddress(token.creator)}</span></span>
        </div>
      </div>

      <div className="text-left text-xs text-zinc-500 sm:text-right">
        <div>{formatTime(token.time)}</div>
        <a href={token.signature ? `https://solscan.io/tx/${token.signature}` : solscanUrl(token.mint)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
          tx <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}

export function PumpFunLivePanel() {
  const { clear, connectionState, lastError, paused, status, togglePaused, tokens, tokensWithGithub } = usePumpFunLive();
  const isLive = connectionState === "live";

  return (
    <div className="min-h-[calc(100vh-180px)] overflow-hidden rounded-lg border border-zinc-800 bg-[#070707] text-zinc-100">
      <header className="flex flex-col gap-3 border-b border-zinc-900 bg-zinc-950/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-xl font-black text-lime-400">
            <Zap className="h-5 w-5" />
            PumpFun Live
          </h1>
          <div className="flex items-center gap-2 text-sm font-bold text-lime-400">
            <span className={`h-3 w-3 rounded-full ${isLive ? "bg-lime-400" : paused ? "bg-yellow-300" : "bg-red-400"}`} />
            {connectionState}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={togglePaused} className="border-zinc-700 text-lime-400 hover:bg-zinc-900">
            {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clear} className="border-zinc-700 text-lime-400 hover:bg-zinc-900">
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </header>

      <section className="mobile-scroll flex gap-6 overflow-x-auto border-b border-zinc-900 px-3 py-2 font-mono text-xs text-zinc-500">
        <span>Tokens: <b className="text-lime-400">{status?.totalLaunches?.toLocaleString() ?? tokens.length}</b></span>
        <span>With GitHub: <b className="text-lime-400">{status?.githubLaunches?.toLocaleString() ?? tokensWithGithub}</b></span>
        <span>Clients: <b className="text-lime-400">{status?.clients ?? "-"}</b></span>
        <span>Source: <b className="text-lime-400">PumpFun API ✓</b></span>
        <span>Uptime: <b className="text-lime-400">{status?.uptime ? `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` : "-"}</b></span>
      </section>

      {lastError && <div className="border-b border-red-500/20 bg-red-950/30 px-3 py-2 text-sm text-red-100">{lastError}</div>}

      <section className="mobile-scroll h-[calc(100vh-300px)] min-h-[620px] space-y-2 overflow-y-auto p-2">
        {tokens.map((token, index) => (
          <TokenRow key={token.mint ?? token.signature ?? index} token={token} />
        ))}
        {tokens.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Waiting for PumpFun launches from the live websocket feed…
          </div>
        )}
      </section>
    </div>
  );
}
