export const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

export class ClawdBalanceError extends Error {
  constructor(public readonly code: number | undefined, message: string) {
    super(message);
    this.name = "ClawdBalanceError";
  }
}

export async function getClawdBalance(wallet: string): Promise<number> {
  const apiKey = process.env.HELIUS_API_KEY || "";
  if (!apiKey) return 0;
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "clawd-balance",
      method: "getTokenAccountsByOwner",
      params: [wallet, { mint: CLAWD_MINT }, { encoding: "jsonParsed" }],
    }),
  });
  const data = (await r.json()) as { error?: { code?: number; message?: string }; result?: { value?: unknown[] } };
  if (data.error) {
    throw new ClawdBalanceError(data.error.code, data.error.message ?? "RPC error");
  }
  const accounts = data.result?.value ?? [];
  let raw = 0;
  let decimals = 6;
  for (const acc of accounts) {
    const info = (acc as { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } } } }).account?.data?.parsed?.info;
    if (info) {
      raw += Number(info.tokenAmount?.amount ?? 0);
      decimals = info.tokenAmount?.decimals ?? decimals;
    }
  }
  return raw / 10 ** decimals;
}
