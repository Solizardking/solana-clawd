import { useQuery } from "@tanstack/react-query";

export interface WalletTransfer {
  signature: string;
  timestamp: number;
  direction: "in" | "out";
  counterparty: string;
  mint: string;
  symbol?: string;
  amount: number;
  amountRaw: string;
  decimals: number;
}

export interface WalletTransfersResult {
  data: WalletTransfer[];
  pagination: { hasMore: boolean; nextCursor?: string };
}

export function useWalletTransfers(
  address: string | null | undefined,
  opts: { limit?: number; cursor?: string } = {}
) {
  return useQuery<WalletTransfersResult>({
    queryKey: ["/api/helius/wallet/transfers", address, opts.limit, opts.cursor],
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.cursor) params.set("cursor", opts.cursor);
      const qs = params.toString();
      const url = `/api/helius/wallet/${address}/transfers${qs ? `?${qs}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Helius transfers ${r.status}`);
      return r.json();
    },
  });
}

export function useWalletTransactions(
  address: string | null | undefined,
  opts: { limit?: number; before?: string; type?: string } = {}
) {
  return useQuery({
    queryKey: ["/api/helius/wallet/transactions", address, opts.limit, opts.before, opts.type],
    enabled: !!address,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.before) params.set("before", opts.before);
      if (opts.type) params.set("type", opts.type);
      const qs = params.toString();
      const url = `/api/helius/wallet/${address}/transactions${qs ? `?${qs}` : ""}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Helius transactions ${r.status}`);
      const json = await r.json();
      return json.data ?? [];
    },
  });
}
