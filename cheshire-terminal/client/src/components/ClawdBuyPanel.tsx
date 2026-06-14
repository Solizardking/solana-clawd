import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink, Github, Globe, MessageCircle, Twitter } from "lucide-react";
import { ClawdPixelArt } from "@/components/ClawdPixelArt";

export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const SOL_MINT = "So11111111111111111111111111111111111111112";

declare global {
  interface Window {
    Jupiter?: {
      init: (config: Record<string, unknown>) => void;
      syncProps?: (props: Record<string, unknown>) => void;
    };
  }
}

type ClawdBuyPanelProps = {
  compact?: boolean;
  className?: string;
};

const clawdLinks = [
  { label: "Telegram", value: "t.me/clawdtoken", href: "https://t.me/clawdtoken", icon: MessageCircle },
  { label: "GitHub", value: "solizardking/solana-clawd", href: "https://github.com/solizardking/solana-clawd", icon: Github },
  { label: "Site", value: "SolanaClawd.com", href: "https://SolanaClawd.com", icon: Globe },
  { label: "X402", value: "X402.wtf", href: "https://X402.wtf", icon: Globe },
  { label: "CLAWD Devs", value: "x.com/clawddevs", href: "https://x.com/clawddevs", icon: Twitter },
  { label: "Library", value: "x.com/0rdlibrary", href: "https://x.com/0rdlibrary", icon: Twitter },
];

export function ClawdLinkGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
      {clawdLinks.map(({ label, value, href, icon: Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="group flex min-h-12 items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-cyan-300/10"
        >
          <Icon className="h-4 w-4 shrink-0 text-cyan-300 transition group-hover:text-white" />
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</span>
            <span className="block truncate text-xs font-medium text-gray-200">{value}</span>
          </span>
          <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-gray-600 transition group-hover:text-cyan-200" />
        </a>
      ))}
    </div>
  );
}

export function ContractPill({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(CLAWD_MINT)}
      className={`group flex w-full items-center justify-between gap-3 rounded-md border border-yellow-300/20 bg-yellow-300/5 px-3 py-2 text-left font-mono text-[11px] text-yellow-100/80 transition hover:border-yellow-300/50 hover:bg-yellow-300/10 ${className}`}
    >
      <span className="text-yellow-300">CA</span>
      <span className="min-w-0 flex-1 truncate">{CLAWD_MINT}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-yellow-300/50 group-hover:text-yellow-200">copy</span>
    </button>
  );
}

export function JupiterClawdSwap({ compact = false, className = "" }: ClawdBuyPanelProps) {
  const rawId = useId();
  const targetId = useMemo(() => `jupiter-clawd-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`, [rawId]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const init = () => {
      if (cancelled) return;
      if (!window.Jupiter?.init) {
        attempts += 1;
        if (attempts < 80) window.setTimeout(init, 150);
        return;
      }
      window.Jupiter.init({
        displayMode: "integrated",
        integratedTargetId: targetId,
        containerStyles: {
          width: "100%",
          height: compact ? "420px" : "540px",
          borderRadius: "8px",
          overflow: "hidden",
        },
        branding: {
          name: "CLAWD",
          logoUri: `${window.location.origin}/8bit_logo.png`,
        },
        formProps: {
          swapMode: "ExactIn",
          initialInputMint: SOL_MINT,
          initialOutputMint: CLAWD_MINT,
          fixedMint: CLAWD_MINT,
          initialAmount: "0.1",
        },
        onSuccess: ({ txid }: { txid: string }) => {
          window.dispatchEvent(new CustomEvent("clawd-swap-success", { detail: { txid } }));
        },
      });
      setLoaded(true);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [compact, targetId]);

  return (
    <div className={`overflow-hidden rounded-lg border border-cyan-300/20 bg-black/70 shadow-2xl shadow-cyan-950/30 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 bg-cyan-300/[0.04] px-3 py-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/70">Jupiter Ultra</div>
          <div className="text-sm font-semibold text-white">Buy $CLAWD</div>
        </div>
        <ClawdPixelArt state={loaded ? "happy" : "codex"} autoAnimate={false} size={0.22} showLabel={false} />
      </div>
      <div id={targetId} className={compact ? "min-h-[420px]" : "min-h-[540px]"} />
      {!loaded && (
        <div className="px-4 pb-4 text-center text-xs text-cyan-200/60">Loading Jupiter swap...</div>
      )}
    </div>
  );
}

export function ClawdBuyPanel({ compact = false, className = "" }: ClawdBuyPanelProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <ClawdPixelArt autoAnimate size={compact ? 0.25 : 0.32} showLabel={false} />
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/70">CLAWD network</div>
          <h2 className="text-lg font-black tracking-tight text-white">Links, contract, and swap</h2>
        </div>
      </div>
      <ClawdLinkGrid compact={compact} />
      <ContractPill />
      <JupiterClawdSwap compact={compact} />
    </section>
  );
}
