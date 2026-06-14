interface DasOwnerResponse {
  result: {
    nativeBalance?: { lamports: number; price_per_sol?: number };
    items: Array<{
      id: string;
      interface: string;
      token_info?: {
        symbol?: string;
        decimals?: number;
        balance?: number;
        price_info?: { price_per_token?: number };
      };
    }>;
    total: number;
  };
}

export interface DasToken {
  mint: string;
  symbol: string;
  balance: number;
  decimals: number;
  usdValue?: number;
}

export interface DasWalletSummary {
  owner: string;
  nativeSolBalance: number;
  nativeUsdValue?: number;
  tokens: DasToken[];
  nftCount: number;
  totalUsdValue?: number;
}

async function dasPost<T>(rpcUrl: string, method: string, params: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'orelane-das', method, params }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Helius DAS ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getWalletSummary(rpcUrl: string, ownerAddress: string): Promise<DasWalletSummary> {
  const data = await dasPost<DasOwnerResponse>(rpcUrl, 'getAssetsByOwner', {
    ownerAddress,
    page: 1,
    limit: 1000,
    displayOptions: { showFungible: true, showNativeBalance: true },
  });

  const result = data.result;
  const lamports = result.nativeBalance?.lamports ?? 0;
  const nativeSolBalance = lamports / 1e9;
  const pricePerSol = result.nativeBalance?.price_per_sol;
  const nativeUsdValue = pricePerSol !== undefined ? nativeSolBalance * pricePerSol : undefined;

  const tokens: DasToken[] = [];
  let nftCount = 0;

  for (const item of result.items) {
    if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
      const info = item.token_info;
      if (info) {
        const decimals = info.decimals ?? 0;
        const balance = (info.balance ?? 0) / Math.pow(10, decimals);
        tokens.push({
          mint: item.id,
          symbol: info.symbol ?? 'UNKNOWN',
          balance,
          decimals,
          usdValue: info.price_info?.price_per_token !== undefined
            ? balance * info.price_info.price_per_token
            : undefined,
        });
      }
    } else if (item.interface === 'V1_NFT' || item.interface === 'PROGRAMMABLE_NFT') {
      nftCount++;
    }
  }

  const tokenUsdTotal = tokens.reduce((sum, t) => sum + (t.usdValue ?? 0), 0);
  const totalUsdValue = nativeUsdValue !== undefined ? nativeUsdValue + tokenUsdTotal : undefined;

  return { owner: ownerAddress, nativeSolBalance, nativeUsdValue, tokens, nftCount, totalUsdValue };
}

export function formatWalletSummary(summary: DasWalletSummary): string {
  const lines: string[] = [
    `Wallet ${summary.owner.slice(0, 8)}...${summary.owner.slice(-4)}`,
    `SOL=${summary.nativeSolBalance.toFixed(4)}${summary.nativeUsdValue !== undefined ? ` ($${summary.nativeUsdValue.toFixed(2)})` : ''}`,
  ];

  const topTokens = [...summary.tokens]
    .filter((t) => t.balance > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0))
    .slice(0, 10);

  for (const t of topTokens) {
    lines.push(
      `${t.symbol}=${t.balance.toFixed(t.decimals > 4 ? 4 : t.decimals)}${t.usdValue !== undefined ? ` ($${t.usdValue.toFixed(2)})` : ''}`,
    );
  }

  if (summary.nftCount > 0) {
    lines.push(`NFTs=${summary.nftCount}`);
  }

  if (summary.totalUsdValue !== undefined) {
    lines.push(`totalUsd=$${summary.totalUsdValue.toFixed(2)}`);
  }

  return lines.join('\n');
}
