import { useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BarChart3, TrendingUp, Wallet, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PhoenixPerpsPanel } from "@/components/PhoenixPerpsPanel";
import { BirdeyePerpsPanel } from "@/components/BirdeyePerpsPanel";
import { PhoenixStrategyDeck } from "@/components/PhoenixStrategyDeck";

type DataSource = "phoenix" | "birdeye";

function DataSourceTabs({
  active,
  onChange,
}: {
  active: DataSource;
  onChange: (value: DataSource) => void;
}) {
  const tabs: Array<{ id: DataSource; label: string; icon: ReactNode }> = [
    { id: "phoenix", label: "Phoenix", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: "birdeye", label: "Birdeye Data", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex gap-1 border-b border-white/10 pb-px">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[11px] font-mono transition-colors ${
            active === tab.id
              ? "border-cyan-400 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default function PhoenixPerpsPage() {
  const { connected, publicKey } = useWallet();
  const [dataSource, setDataSource] = useState<DataSource>("phoenix");
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");
  const authority = publicKey?.toBase58() ?? null;

  return (
    <div className="min-h-[calc(100vh-8rem)] w-full">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_30%),linear-gradient(180deg,rgba(7,10,18,0.96),rgba(3,5,10,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-cyan-500/30 text-cyan-300">
                  Phoenix command deck
                </Badge>
                <Badge variant="outline" className="border-purple-500/30 text-purple-200">
                  DeepSeek + OpenRouter Free
                </Badge>
                <Badge variant="outline" className="border-yellow-500/30 text-yellow-200">
                  Flight builder
                </Badge>
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
                  Phoenix Perpetuals
                </h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                  Live SOL, BTC, and ETH perp execution with builder routing, imported Vulcan agent
                  context, and server-side strategy analysis over the current tape.
                </p>
              </div>
            </div>

            {!connected && (
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-2 py-2 backdrop-blur">
                <span className="hidden items-center gap-1 text-[11px] font-mono text-zinc-500 sm:inline-flex">
                  <Wallet className="h-3.5 w-3.5" />
                  {dataSource === "phoenix"
                    ? "Connect wallet to trade and personalize the risk read"
                    : "Connect wallet to load Birdeye perps positions"}
                </span>
                <WalletMultiButton className="!h-8 !rounded-full !bg-cyan-600 !px-3 !text-xs hover:!bg-cyan-500" />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-cyan-300" />
              SOL · BTC · ETH perps
            </span>
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-yellow-300" />
              Flight builder routing
            </span>
            <span>
              {dataSource === "phoenix"
                ? "Realtime strategy reads refresh automatically and can be forced on demand."
                : "Birdeye keeps the broader perps context and wallet analytics in view."}
            </span>
          </div>

          <DataSourceTabs active={dataSource} onChange={setDataSource} />

          {dataSource === "phoenix" ? (
            <div className="space-y-4">
              <PhoenixStrategyDeck
                symbol={selectedSymbol}
                authority={authority}
              />

              <div className="rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur sm:p-3">
                <PhoenixPerpsPanel
                  selectedSymbol={selectedSymbol}
                  onSelectedSymbolChange={setSelectedSymbol}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-cyan-500/20 bg-black/30 p-2 backdrop-blur sm:p-3">
              <BirdeyePerpsPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
