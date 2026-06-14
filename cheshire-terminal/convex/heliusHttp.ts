import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Public Helius-backed endpoints. Currently exposes `$CLAWD` balance
 * verification for the gating flow.
 */

const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const PRIMARY_ADMIN_WALLET = "Becdrh2JbLt8qcLXpNbNF8w4Z5W1AQXJhGYMDigjcJr3";
const LEGACY_ADMIN_WALLET = "EFH1ouVP6ikYgyHm9zaLXSPHJDXsfVcaVLFPjtzw6BbF";

const RPC_BASE = "https://mainnet.helius-rpc.com";
const FALLBACK_RPC_URL = "https://api.mainnet-beta.solana.com";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonError(message: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function isAdmin(wallet: string): boolean {
  const admins = [
    PRIMARY_ADMIN_WALLET,
    LEGACY_ADMIN_WALLET,
    process.env.ADMIN_WALLET ?? "",
    process.env.ADMINWALLET ?? "",
    ...(process.env.ADMIN_WALLETS ?? "").split(","),
    ...(process.env.ADMINWALLETS ?? "").split(","),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return admins.includes(wallet);
}

function resolveRpcUrl() {
  const explicitRpcUrl = process.env.HELIUS_RPC_URL?.trim();
  if (explicitRpcUrl) return explicitRpcUrl;

  const apiKey = process.env.HELIUS_API_KEY?.trim();
  return apiKey ? `${RPC_BASE}/?api-key=${apiKey}` : FALLBACK_RPC_URL;
}

function shouldFallbackFromHelius(message: string, rpcUrl: string) {
  return (
    rpcUrl.includes("helius") &&
    /(max usage reached|429|rate limit)/i.test(message)
  );
}

async function fetchClawdBalance(wallet: string, rpcUrl: string) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawd-verify",
      method: "getTokenAccountsByOwner",
      params: [wallet, { mint: CLAWD_MINT }, { encoding: "jsonParsed" }],
    }),
  });

  const data = (await response.json()) as {
    error?: { message: string };
    result?: {
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: {
                tokenAmount?: { amount?: number | string; decimals?: number };
              };
            };
          };
        };
      }>;
    };
  };

  return data;
}

// GET /api/helius/verify-clawd?wallet=...
export const verifyClawd = httpAction(async (ctx, req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const wallet = new URL(req.url).searchParams.get("wallet")?.trim() ?? "";
  if (!wallet) return jsonError("wallet address required", 400, cors);

  // Admin wallet always passes
  if (isAdmin(wallet)) {
    return new Response(
      JSON.stringify({
        success: true,
        wallet,
        token: CLAWD_MINT,
        balance: 1_000_000,
        decimals: 6,
        rawBalance: 1_000_000_000_000,
        isHolder: true,
        isAdmin: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...cors } },
    );
  }

  try {
    const rpcUrl = resolveRpcUrl();
    let data = await fetchClawdBalance(wallet, rpcUrl);
    if (data.error && shouldFallbackFromHelius(data.error.message, rpcUrl)) {
      data = await fetchClawdBalance(wallet, FALLBACK_RPC_URL);
    }

    if (data.error) return jsonError(data.error.message, 500, cors);

    let raw = 0;
    let decimals = 6;
    for (const acc of data.result?.value ?? []) {
      const info = acc.account?.data?.parsed?.info;
      if (info) {
        raw += Number(info.tokenAmount?.amount ?? 0);
        decimals = info.tokenAmount?.decimals ?? decimals;
      }
    }

    const balance = raw / Math.pow(10, decimals);
    const isHolder = balance >= 1;

    // Persist verification for analytics / future gating decisions
    await ctx.runMutation(internal.walletAuth.recordHolderVerification, {
      walletAddress: wallet,
      tokenMint: CLAWD_MINT,
      rawBalance: raw,
      balance,
      isHolder,
    });

    return new Response(
      JSON.stringify({
        success: true,
        wallet,
        token: CLAWD_MINT,
        balance,
        decimals,
        rawBalance: raw,
        isHolder,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...cors } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Verification failed", 500, cors);
  }
});
