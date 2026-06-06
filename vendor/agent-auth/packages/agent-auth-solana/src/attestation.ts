// CAAP attestation — standalone version that accepts explicit opts instead of env vars.
// Implements Helius DAS API calls to verify agent NFT ownership and CLAWD token balance.

import { createHash } from "crypto";

export interface AttestationResult {
  verified: boolean;
  agentNftAddress?: string;
  agentWalletOwner?: string;
  tokenMint?: string;
  tokenBalance?: number;
  attestationHash?: string;
  error?: string;
}

export interface WalletSnapshot {
  walletAddress: string;
  solBalance: number;
  clawdBalance: number;
  tokenAccounts: Array<{ mint: string; amount: number; symbol?: string }>;
  fetchedAt: number;
}

interface RpcOpts {
  heliusRpcUrl: string;
  clawdMint: string;
}

async function rpc<T>(method: string, params: unknown, heliusRpcUrl: string): Promise<T> {
  const res = await fetch(heliusRpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message ?? "unknown"}`);
  return json.result as T;
}

async function findAgentNft(
  walletAddress: string,
  heliusRpcUrl: string,
): Promise<string | undefined> {
  try {
    const result = await rpc<{
      items?: Array<{
        id: string;
        content?: { metadata?: { name?: string } };
      }>;
    }>("getAssetsByOwner", { ownerAddress: walletAddress, page: 1, limit: 100 }, heliusRpcUrl);
    const items = result?.items ?? [];
    const agentNft = items.find((item) => {
      const name = item.content?.metadata?.name ?? "";
      return name.toLowerCase().includes("agent") || name.toLowerCase().includes("clawd");
    });
    return agentNft?.id;
  } catch {
    return undefined;
  }
}

async function getClawdTokenBalance(
  walletAddress: string,
  clawdMint: string,
  heliusRpcUrl: string,
): Promise<number> {
  try {
    const result = await rpc<{
      value?: Array<{
        account?: {
          data?: {
            parsed?: { info?: { tokenAmount?: { uiAmount?: number } } };
          };
        };
      }>;
    }>(
      "getTokenAccountsByOwner",
      [walletAddress, { mint: clawdMint }, { encoding: "jsonParsed" }],
      heliusRpcUrl,
    );
    const accounts = result?.value ?? [];
    if (accounts.length === 0) return 0;
    return accounts[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
  } catch {
    return 0;
  }
}

async function verifyAgentInRegistry(
  agentId: string,
  heliusRpcUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(heliusRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [agentId, { encoding: "jsonParsed" }],
      }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { result?: { value?: unknown } };
    return Boolean(json.result?.value);
  } catch {
    return false;
  }
}

export async function attestAgent(
  agentId: string,
  walletAddress: string,
  opts: RpcOpts,
): Promise<AttestationResult> {
  try {
    const [agentNftAddress, tokenBalance, registryVerified] = await Promise.all([
      findAgentNft(walletAddress, opts.heliusRpcUrl),
      getClawdTokenBalance(walletAddress, opts.clawdMint, opts.heliusRpcUrl),
      verifyAgentInRegistry(agentId, opts.heliusRpcUrl),
    ]);

    const verified = Boolean(agentNftAddress) || registryVerified || tokenBalance > 0;

    const attestationHash = createHash("sha256")
      .update(`${agentId}:${walletAddress}:${opts.clawdMint}:${Date.now()}`)
      .digest("hex");

    return {
      verified,
      agentNftAddress,
      agentWalletOwner: walletAddress,
      tokenMint: opts.clawdMint,
      tokenBalance,
      attestationHash,
    };
  } catch (err) {
    return {
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchWalletSnapshot(
  walletAddress: string,
  opts: RpcOpts,
): Promise<WalletSnapshot> {
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

  const [solResult, tokenResult] = await Promise.allSettled([
    rpc<{ value?: number }>("getBalance", [walletAddress], opts.heliusRpcUrl),
    rpc<{
      value?: Array<{
        account?: {
          data?: {
            parsed?: {
              info?: { mint?: string; tokenAmount?: { uiAmount?: number } };
            };
          };
        };
      }>;
    }>(
      "getTokenAccountsByOwner",
      [walletAddress, { programId: TOKEN_PROGRAM }, { encoding: "jsonParsed" }],
      opts.heliusRpcUrl,
    ),
  ]);

  const lamports =
    solResult.status === "fulfilled" ? (solResult.value?.value ?? 0) : 0;
  const solBalance = lamports / 1_000_000_000;

  const tokenAccounts: WalletSnapshot["tokenAccounts"] = [];
  if (tokenResult.status === "fulfilled") {
    const accounts = tokenResult.value?.value ?? [];
    for (const acc of accounts) {
      const info = acc?.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint ?? "";
      const amount = info.tokenAmount?.uiAmount ?? 0;
      if (mint) tokenAccounts.push({ mint, amount });
    }
  }

  const clawdAccount = tokenAccounts.find((a) => a.mint === opts.clawdMint);
  const clawdBalance = clawdAccount?.amount ?? 0;

  return {
    walletAddress,
    solBalance,
    clawdBalance,
    tokenAccounts,
    fetchedAt: Date.now(),
  };
}
