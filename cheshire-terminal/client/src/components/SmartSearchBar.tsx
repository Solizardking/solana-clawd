import { useState, useRef, useEffect, useMemo } from "react";
import { Search, X, Loader2, ExternalLink, Sparkles, ChevronDown, Globe, BadgeCheck, AlertTriangle, Copy } from "lucide-react";
import { searchTokens, type MintInformation } from "@/lib/jupiterTokens";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

interface SearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
  description: string;
  publishedDate?: string;
  highlights?: string[];
  score?: number;
}

interface SmartSearchResponse {
  query: string;
  aiSummary: string;
  results: SearchResult[];
  sources: { web: number; crypto: number; total: number };
}

const ORGANIC_LABEL_STYLES: Record<string, string> = {
  high:   "border-green-500/40 bg-green-900/30 text-green-300",
  medium: "border-amber-500/40 bg-amber-900/30 text-amber-300",
  low:    "border-red-500/40   bg-red-900/30   text-red-300",
};

function fmtUsd(n?: number | null, digits = 2): string {
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  if (n < 0.01) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(digits)}`;
}

function fmtPct(n?: number | null): { text: string; positive: boolean } {
  if (n == null) return { text: "—", positive: true };
  const positive = n >= 0;
  return { text: `${positive ? "+" : ""}${n.toFixed(2)}%`, positive };
}

function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

export function SmartSearchBar() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<SmartSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live token typeahead state — fires on every keystroke (debounced)
  const [tokens, setTokens] = useState<MintInformation[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copiedMint, setCopiedMint] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenAbortRef = useRef<AbortController | null>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced live token search via Jupiter Tokens V2
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setTokens([]);
      setTokensLoading(false);
      setTokenError(null);
      return;
    }
    setTokensLoading(true);
    setTokenError(null);
    const id = window.setTimeout(async () => {
      tokenAbortRef.current?.abort();
      const ac = new AbortController();
      tokenAbortRef.current = ac;
      try {
        const results = await searchTokens(q);
        if (!ac.signal.aborted) {
          setTokens(Array.isArray(results) ? results.slice(0, 8) : []);
        }
      } catch (e: any) {
        if (!ac.signal.aborted) {
          setTokenError(e?.message ?? "Token search failed");
          setTokens([]);
        }
      } finally {
        if (!ac.signal.aborted) setTokensLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [query]);

  const handleSearch = async (q = query) => {
    if (!q.trim()) return;
    setIsLoading(true);
    setError(null);
    setIsOpen(true);
    try {
      const res = await fetch("/api/search/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim() }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResponse(data);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") { setIsOpen(false); inputRef.current?.blur(); }
  };

  const clearSearch = () => {
    setQuery("");
    setResponse(null);
    setError(null);
    setTokens([]);
    setTokenError(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const copyMint = async (mint: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(mint);
      setCopiedMint(mint);
      window.setTimeout(() => setCopiedMint((c) => (c === mint ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  };

  const QUICK_QUERIES = [
    "CLAWD",
    "JUP",
    "BONK",
    "trending meme coins",
    "Solana DeFi news",
  ];

  const showTokenSection = useMemo(
    () => isOpen && query.trim().length >= 2 && (tokens.length > 0 || tokensLoading || tokenError),
    [isOpen, query, tokens, tokensLoading, tokenError],
  );

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto">
      {/* Input bar */}
      <div className={`flex items-center gap-2 bg-black/60 border rounded-xl px-3 py-2 transition-all duration-200 ${
        isOpen || query
          ? "border-purple-500/60 shadow-lg shadow-purple-500/10"
          : "border-purple-500/30 hover:border-purple-500/50"
      }`}>
        {isLoading
          ? <Loader2 className="h-4 w-4 text-purple-400 animate-spin flex-shrink-0" />
          : <Search className="h-4 w-4 text-purple-400/70 flex-shrink-0" />
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (e.target.value) setIsOpen(true);
            if (!e.target.value) setResponse(null);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Search tokens, web, crypto… powered by Jupiter + Exa + Grok"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-purple-300/40 outline-none min-w-0"
        />
        {query && (
          <button type="button" onClick={clearSearch} className="text-purple-400/60 hover:text-purple-300 flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={!query.trim() || isLoading}
          className="flex-shrink-0 px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 disabled:opacity-40 text-white text-xs font-semibold transition-all"
          title="AI search (Exa + Grok)"
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-black/95 border border-purple-500/30 rounded-xl shadow-2xl shadow-purple-900/40 overflow-hidden">

          {/* Quick suggestions (when no query yet) */}
          {!query && !response && !isLoading && (
            <div className="p-3">
              <div className="text-xs text-purple-400/50 mb-2 font-semibold tracking-wide uppercase">Quick searches</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUERIES.map(q => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => { setQuery(q); handleSearch(q); }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-purple-900/30 border border-purple-500/20 text-purple-300 hover:bg-purple-900/50 hover:border-purple-500/40 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Jupiter Tokens V2 typeahead ───────────────────────────── */}
          {showTokenSection && (
            <div className="border-b border-purple-500/20">
              <div className="px-4 py-2 flex items-center gap-2 bg-gradient-to-r from-amber-900/20 to-purple-900/20">
                <img
                  src="https://static.jup.ag/jup/icon.png"
                  alt=""
                  className="w-3.5 h-3.5 rounded-full"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <span className="text-xs font-bold text-amber-300 tracking-wide uppercase">Jupiter Tokens</span>
                {tokensLoading && <Loader2 className="h-3 w-3 text-amber-400/70 animate-spin" />}
                <span className="ml-auto text-[10px] text-purple-500/50">v2 · organic score</span>
              </div>

              {tokenError && (
                <div className="px-4 py-3 text-xs text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> {tokenError}
                </div>
              )}

              {!tokenError && tokens.length === 0 && !tokensLoading && query.trim().length >= 2 && (
                <div className="px-4 py-3 text-xs text-purple-300/40">
                  No tokens match "{query.trim()}".
                </div>
              )}

              <div className="divide-y divide-purple-500/10">
                {tokens.map((t) => {
                  const change24h = fmtPct(t.stats24h?.priceChange);
                  const isSus = t.audit?.isSus === true;
                  const orgClass = ORGANIC_LABEL_STYLES[t.organicScoreLabel] ?? ORGANIC_LABEL_STYLES.low;
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-purple-900/20 transition-colors group"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black/40 border border-purple-500/20 overflow-hidden flex items-center justify-center mt-0.5">
                        {t.icon ? (
                          <img
                            src={t.icon}
                            alt={t.symbol}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-[10px] text-purple-300/70 font-bold">{t.symbol.slice(0, 2)}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-purple-100 truncate">{t.symbol}</span>
                          {t.isVerified && (
                            <BadgeCheck className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                          )}
                          {isSus && (
                            <span title="Flagged as suspicious" className="flex items-center gap-0.5 text-[10px] text-red-400">
                              <AlertTriangle className="h-3 w-3" /> sus
                            </span>
                          )}
                          <span className="text-xs text-purple-300/50 truncate">{t.name}</span>
                          <span
                            className={`ml-auto text-[10px] px-1.5 py-0.5 rounded border font-mono ${orgClass}`}
                            title={`Organic score: ${t.organicScore.toFixed(1)}/100`}
                          >
                            {t.organicScore.toFixed(0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-purple-300/70 font-mono">
                          <span>{fmtUsd(t.usdPrice, t.usdPrice && t.usdPrice < 1 ? 6 : 4)}</span>
                          <span className={change24h.positive ? "text-green-400" : "text-red-400"}>
                            {change24h.text}
                          </span>
                          <span className="text-purple-300/50">mcap {fmtUsd(t.mcap, 0)}</span>
                          <span className="text-purple-300/50">liq {fmtUsd(t.liquidity, 0)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <button
                            type="button"
                            onClick={(e) => copyMint(t.id, e)}
                            className="text-[10px] text-purple-400/50 hover:text-purple-200 flex items-center gap-1 font-mono"
                            title="Copy mint address"
                          >
                            <Copy className="h-2.5 w-2.5" />
                            {copiedMint === t.id ? "copied!" : shortMint(t.id)}
                          </button>
                          {t.tags?.includes("lst") && (
                            <span className="text-[9px] px-1 py-0 rounded bg-cyan-900/40 border border-cyan-500/30 text-cyan-300">LST</span>
                          )}
                          {t.tags?.includes("stocks") && (
                            <span className="text-[9px] px-1 py-0 rounded bg-emerald-900/40 border border-emerald-500/30 text-emerald-300">STOCK</span>
                          )}
                          {t.holderCount != null && (
                            <span className="text-[10px] text-purple-300/40">
                              {t.holderCount.toLocaleString()} holders
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex shrink-0 items-center gap-2">
                        <ClawdTokenAction
                          mintAddress={t.id}
                          symbol={t.symbol}
                          name={t.name}
                          logoURI={t.icon ?? undefined}
                          price={t.usdPrice}
                        />
                        <a
                          href={`https://jup.ag/tokens/${t.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-500/40 group-hover:text-purple-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loading state for AI search */}
          {isLoading && (
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-purple-300">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Searching with Exa + analyzing with Grok…</span>
              </div>
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* AI search error */}
          {error && !isLoading && (
            <div className="p-4 text-sm text-red-400 flex items-center gap-2">
              <X className="h-4 w-4" /> {error}
            </div>
          )}

          {/* AI Results */}
          {response && !isLoading && (
            <div className="max-h-[70vh] overflow-y-auto">

              {/* AI Summary */}
              {response.aiSummary && (
                <div className="p-4 border-b border-purple-500/20 bg-gradient-to-r from-purple-900/30 to-violet-900/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-purple-400 tracking-wide uppercase">Clawd AI · Grok Analysis</span>
                    <span className="text-xs text-purple-500/50 ml-auto flex items-center gap-1">
                      <Globe className="h-3 w-3" /> {response.sources.total} sources
                    </span>
                  </div>
                  <p className="text-sm text-purple-100 leading-relaxed">{response.aiSummary}</p>
                </div>
              )}

              {/* Source badges */}
              <div className="px-4 py-2 flex items-center gap-2 border-b border-purple-500/10">
                <span className="text-xs text-purple-400/50">Sources:</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-500/30 text-blue-300">
                  🌐 Web ({response.sources.web})
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 border border-green-500/30 text-green-300">
                  ₿ Crypto ({response.sources.crypto})
                </span>
              </div>

              {/* Result list */}
              <div className="divide-y divide-purple-500/10">
                {response.results.map((result, i) => (
                  <a
                    key={result.id || i}
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 px-4 py-3 hover:bg-purple-900/20 transition-colors group"
                  >
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-black/40 border border-purple-500/20 flex items-center justify-center mt-0.5">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${result.source}&sz=16`}
                        alt=""
                        className="w-4 h-4 rounded"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-purple-100 group-hover:text-white line-clamp-1 leading-snug">
                          {result.title}
                        </div>
                        <ExternalLink className="h-3 w-3 text-purple-500/40 flex-shrink-0 mt-0.5 group-hover:text-purple-400" />
                      </div>
                      {result.description && (
                        <p className="text-xs text-purple-300/60 mt-0.5 line-clamp-2 leading-relaxed">
                          {result.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-purple-500/50">{result.source}</span>
                        {result.publishedDate && (
                          <span className="text-xs text-purple-500/40">
                            {new Date(result.publishedDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-purple-500/10 flex items-center justify-between">
                <span className="text-xs text-purple-500/40">Tokens · Jupiter V2 · AI · Exa + XAI Grok</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-purple-400/50 hover:text-purple-300 flex items-center gap-1"
                >
                  Close <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
