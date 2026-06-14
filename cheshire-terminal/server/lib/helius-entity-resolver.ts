const BASE58_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,128}\b/g;
const DOMAIN_RE = /\b[a-z0-9][a-z0-9_-]{0,63}\.(?:sol|bonk|poor|abc)\b/gi;
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

type RpcResult<T = any> = { result?: T; error?: { message?: string } };
type ResolvedPastedSolanaContext = {
  context: string;
  directAnswer: string;
  inputs: string[];
};

function heliusRpcUrl() {
  return (
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "")
  );
}

async function rpc<T = any>(method: string, params: any): Promise<T | null> {
  const url = heliusRpcUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await response.json()) as RpcResult<T>;
    if (json.error) return null;
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function heliusApi<T = any>(path: string): Promise<T | null> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return null;
  const separator = path.includes("?") ? "&" : "?";
  try {
    const response = await fetch(`https://api.helius.xyz${path}${separator}api-key=${key}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function extractInputs(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(BASE58_RE)) found.add(match[0]);
  for (const match of text.matchAll(DOMAIN_RE)) found.add(match[0].toLowerCase());
  return Array.from(found).slice(0, 5);
}

function isLikelyDirectLookup(text: string, inputs: string[]) {
  if (!inputs.length) return false;

  const withoutInputs = inputs.reduce((acc, input) => acc.replaceAll(input, " "), text);
  const cleaned = withoutInputs
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:solscan|solanafm|explorer|orbmarkets|helius|birdeye|address|token|tx|transaction)\b/gi, " ")
    .replace(/[^\w\s?]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (text.length <= 180 && words.length <= 12) return true;
  return /^\s*(?:what\s+is|lookup|scan|analy[sz]e|check|who\s+is|show)\b/i.test(cleaned);
}

function formatNumber(value: unknown, decimals = 4) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "unknown";
  return number.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function summarizeAsset(input: string, asset: any) {
  const metadata = asset?.content?.metadata ?? {};
  const tokenInfo = asset?.token_info ?? {};
  const symbol = tokenInfo.symbol || metadata.symbol || "unknown";
  const name = metadata.name || asset?.content?.links?.external_url || "unknown";
  const decimals = tokenInfo.decimals ?? "unknown";
  const supply = tokenInfo.supply != null && tokenInfo.decimals != null
    ? Number(tokenInfo.supply) / Math.pow(10, Number(tokenInfo.decimals))
    : null;
  const price = tokenInfo.price_info?.price_per_token;
  const tokenStandard = metadata.token_standard || asset?.interface || "unknown";
  const program = tokenInfo.token_program || asset?.ownership?.owner || "unknown";

  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: Solana asset / token mint`,
    `Name: ${name}`,
    `Symbol: ${symbol}`,
    `Standard: ${tokenStandard}`,
    `Decimals: ${decimals}`,
    supply != null ? `Supply: ${formatNumber(supply, 2)}` : "",
    price != null ? `Price: $${formatNumber(price, 10)}` : "",
    `Program/owner: ${program}`,
  ].filter(Boolean).join("\n");
}

function summarizeTokenAccount(input: string, account: any) {
  const parsed = account?.value?.data?.parsed;
  const info = parsed?.info;
  const tokenAmount = info?.tokenAmount;
  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: SPL token account`,
    `Mint: ${info?.mint || "unknown"}`,
    `Owner wallet: ${info?.owner || "unknown"}`,
    `Balance: ${formatNumber(tokenAmount?.uiAmount ?? 0, 8)}`,
    `Raw amount: ${tokenAmount?.amount || "0"}`,
    `Decimals: ${tokenAmount?.decimals ?? "unknown"}`,
    `State: ${info?.state || "unknown"}`,
    info?.delegate ? `Delegate: ${info.delegate}` : "",
    info?.isNative ? `Wrapped SOL reserve: ${info.rentExemptReserve?.uiAmountString || "unknown"}` : "",
  ].filter(Boolean).join("\n");
}

function summarizeMint(input: string, account: any, supply: any, largest: any) {
  const parsed = account?.value?.data?.parsed;
  const info = parsed?.info ?? {};
  const supplyValue = supply?.value;
  const program = account?.value?.owner || info?.program || "unknown";
  const topHolder = largest?.value?.[0];
  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: Solana SPL/Token-2022 mint`,
    `Token program: ${program}`,
    `Decimals: ${supplyValue?.decimals ?? info?.decimals ?? "unknown"}`,
    `Current supply: ${supplyValue?.uiAmountString || formatNumber(Number(info?.supply || 0) / Math.pow(10, Number(info?.decimals || 0)), 4)}`,
    `Raw supply: ${supplyValue?.amount || info?.supply || "unknown"}`,
    info?.mintAuthority ? `Mint authority: ${info.mintAuthority}` : "Mint authority: none/renounced",
    info?.freezeAuthority ? `Freeze authority: ${info.freezeAuthority}` : "Freeze authority: none/renounced",
    topHolder ? `Largest token account: ${topHolder.address} (${formatNumber(topHolder.uiAmount, 4)})` : "",
  ].filter(Boolean).join("\n");
}

async function summarizeAddress(input: string) {
  const [asset, account, tokenBalance, supply, largest, identity, balances, assets, txs] = await Promise.all([
    rpc<any>("getAsset", { id: input, options: { showFungible: true }, displayOptions: { showFungibleTokens: true } }),
    rpc<any>("getAccountInfo", [input, { encoding: "jsonParsed" }]),
    rpc<any>("getTokenAccountBalance", [input]),
    rpc<any>("getTokenSupply", [input]),
    rpc<any>("getTokenLargestAccounts", [input]),
    heliusApi<any>(`/v1/wallet/${encodeURIComponent(input)}/identity`),
    heliusApi<any>(`/v1/wallet/${encodeURIComponent(input)}/balances?limit=10&showZeroBalance=false`),
    rpc<any>("searchAssets", {
      ownerAddress: input,
      tokenType: "all",
      limit: 10,
      page: 1,
      displayOptions: { showNativeBalance: true },
    }),
    rpc<any>("getTransactionsForAddress", [
      input,
      {
        transactionDetails: "signatures",
        sortOrder: "desc",
        limit: 5,
        filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
      },
    ]),
  ]);

  if (asset?.id || asset?.content || asset?.token_info) {
    const base = summarizeAsset(input, asset);
    const supplyLine = supply?.value?.uiAmountString ? `On-chain current supply: ${supply.value.uiAmountString}` : "";
    const holderLine = largest?.value?.length ? `Largest holder account: ${largest.value[0]?.address} (${formatNumber(largest.value[0]?.uiAmount, 4)})` : "";
    return [base, supplyLine, holderLine].filter(Boolean).join("\n");
  }

  if (supply?.value || account?.value?.data?.parsed?.type === "mint") {
    return summarizeMint(input, account, supply, largest);
  }

  if (tokenBalance?.value || account?.value?.data?.parsed?.type === "account") {
    return summarizeTokenAccount(input, account);
  }

  const lamports = Number(account?.value?.lamports ?? 0);
  const owner = account?.value?.owner ?? "unknown";
  const executable = Boolean(account?.value?.executable);
  const assetItems = Array.isArray(assets?.items) ? assets.items : [];
  const topBalances = (balances?.balances || [])
    .slice(0, 5)
    .map((item: any) => `${item.symbol || item.mint?.slice(0, 6) || "token"} ${formatNumber(item.balance, 4)}${item.usdValue ? ` ($${formatNumber(item.usdValue, 2)})` : ""}`)
    .join(", ");
  const topAssets = assetItems
    .slice(0, 5)
    .map((item: any) => {
      const metadata = item?.content?.metadata ?? {};
      const tokenInfo = item?.token_info ?? {};
      const label = tokenInfo.symbol || metadata.symbol || metadata.name || item.id?.slice(0, 6) || "asset";
      const balance = tokenInfo.balance != null && tokenInfo.decimals != null
        ? Number(tokenInfo.balance) / Math.pow(10, Number(tokenInfo.decimals))
        : null;
      return balance != null ? `${label} ${formatNumber(balance, 4)}` : label;
    })
    .join(", ");
  const latestTx = txs?.data?.[0];
  const nativeLamports = assets?.nativeBalance?.lamports ?? assets?.nativeBalance?.lamportsPerSol;

  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: Solana ${executable ? "program account" : account?.value ? "wallet/account" : assetItems.length ? "wallet with indexed assets" : "address"}`,
    identity ? `Identity: ${identity.name || "unknown"} (${identity.category || identity.type || "unclassified"})` : "",
    `Owner program: ${owner}`,
    `SOL: ${formatNumber((nativeLamports ?? lamports) / 1e9, 6)}`,
    balances?.totalUsdValue != null ? `Total wallet value: $${formatNumber(balances.totalUsdValue, 2)}` : "",
    topBalances ? `Top holdings: ${topBalances}` : "",
    topAssets ? `Helius DAS assets: ${topAssets}` : "",
    assets?.total != null ? `Indexed asset count: ${assets.total}` : "",
    latestTx ? `Latest successful tx: ${latestTx.signature || "unknown"} at slot ${latestTx.slot || "unknown"}` : "",
    !account?.value && !assetItems.length && !latestTx ? "Status: Helius did not find an on-chain account, asset, or recent indexed activity for this address." : "",
  ].filter(Boolean).join("\n");
}

async function summarizeSignature(input: string) {
  const tx = await rpc<any>("getTransaction", [
    input,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
  if (!tx) return `Input: ${input}\nHelius lookup: completed\nType: possible Solana transaction signature\nStatus: not found by Helius yet`;
  const accountKeys = tx.transaction?.message?.accountKeys || [];
  const signer = accountKeys.find((key: any) => key.signer)?.pubkey || accountKeys.find((key: any) => key.signer)?.toString?.();
  const writableAccounts = accountKeys
    .filter((key: any) => key.writable)
    .slice(0, 8)
    .map((key: any) => key.pubkey?.toString?.() || key.toString?.() || String(key))
    .join(", ");
  const tokenChanges = [
    ...(tx.meta?.preTokenBalances || []),
    ...(tx.meta?.postTokenBalances || []),
  ]
    .map((b: any) => b.mint)
    .filter(Boolean);
  const uniqueMints = Array.from(new Set(tokenChanges)).slice(0, 6).join(", ");

  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: Solana transaction signature`,
    `Status: ${tx.meta?.err ? "failed" : "succeeded"}`,
    `Slot: ${tx.slot}`,
    tx.blockTime ? `Time: ${new Date(tx.blockTime * 1000).toISOString()}` : "",
    signer ? `Primary signer: ${signer}` : "",
    `Fee SOL: ${formatNumber(Number(tx.meta?.fee || 0) / 1e9, 9)}`,
    `Instructions: ${tx.transaction?.message?.instructions?.length ?? 0}`,
    writableAccounts ? `Writable accounts: ${writableAccounts}` : "",
    uniqueMints ? `Token mints touched: ${uniqueMints}` : "",
  ].filter(Boolean).join("\n");
}

async function summarizeDomain(input: string) {
  const identity = await heliusApi<any>(`/v1/wallet/${encodeURIComponent(input)}/identity`);
  if (!identity) return `Input: ${input}\nHelius lookup: completed\nType: Solana domain-style input\nStatus: could not resolve through Helius identity`;
  return [
    `Input: ${input}`,
    `Helius lookup: completed`,
    `Type: resolved Solana domain/wallet identity`,
    `Resolved address: ${identity.address}`,
    `Identity: ${identity.name || "unknown"} (${identity.category || identity.type || "unclassified"})`,
    identity.tags?.length ? `Tags: ${identity.tags.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

export async function resolvePastedSolanaContextDetails(text: string): Promise<ResolvedPastedSolanaContext> {
  const inputs = extractInputs(text);
  if (!inputs.length) return { context: "", directAnswer: "", inputs: [] };
  if (!heliusRpcUrl() && !process.env.HELIUS_API_KEY) return { context: "", directAnswer: "", inputs };

  const summaries = await Promise.all(inputs.map(async (input) => {
    if (input.includes(".")) return summarizeDomain(input);
    if (SIGNATURE_RE.test(input) && input.length > 44) return summarizeSignature(input);
    if (ADDRESS_RE.test(input)) return summarizeAddress(input);
    return "";
  }));

  const useful = summaries.filter(Boolean);
  if (!useful.length) return { context: "", directAnswer: "", inputs };

  const body = useful.join("\n\n---\n");
  const context = `\n[Helius pasted-input context]\n${body}\n`;
  const directAnswer = isLikelyDirectLookup(text, inputs)
    ? `Helius lookup result:\n\n${body}`
    : "";

  return { context, directAnswer, inputs };
}

export async function resolvePastedSolanaContext(text: string) {
  const resolved = await resolvePastedSolanaContextDetails(text);
  return resolved.context;
}
