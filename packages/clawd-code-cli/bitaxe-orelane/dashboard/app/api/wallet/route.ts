import { NextResponse } from 'next/server';

const RPC = process.env.RPC ?? process.env.HELIUS_RPC_URL ?? '';
const KEYPAIR_PUBKEY = process.env.WALLET_PUBKEY ?? '';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get('owner') ?? KEYPAIR_PUBKEY;

  if (!owner) {
    return NextResponse.json({ ok: false, error: 'Set WALLET_PUBKEY env var or pass ?owner=...' }, { status: 400 });
  }
  if (!RPC) {
    return NextResponse.json({ ok: false, error: 'RPC not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'dashboard-das',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          displayOptions: { showFungible: true, showNativeBalance: true },
        },
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) throw new Error(`Helius DAS ${res.status}`);
    const data = await res.json() as { result: { nativeBalance?: { lamports: number; price_per_sol?: number }; items: unknown[]; total: number } };
    const result = data.result;
    const nativeSol = (result.nativeBalance?.lamports ?? 0) / 1e9;
    const solUsd = result.nativeBalance?.price_per_sol;

    const tokens: { symbol: string; balance: number; usdValue?: number }[] = [];
    for (const item of result.items as { interface: string; token_info?: { symbol?: string; balance?: number; decimals?: number; price_info?: { price_per_token?: number } } }[]) {
      if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
        const info = item.token_info;
        if (info) {
          const balance = (info.balance ?? 0) / Math.pow(10, info.decimals ?? 0);
          tokens.push({
            symbol: info.symbol ?? '?',
            balance,
            usdValue: info.price_info?.price_per_token !== undefined
              ? balance * info.price_info.price_per_token
              : undefined,
          });
        }
      }
    }

    tokens.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

    return NextResponse.json({
      ok: true,
      data: {
        owner,
        nativeSol: Math.round(nativeSol * 10000) / 10000,
        nativeUsd: solUsd !== undefined ? Math.round(nativeSol * solUsd * 100) / 100 : undefined,
        tokens: tokens.slice(0, 10),
        totalItems: result.total,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 503 });
  }
}
