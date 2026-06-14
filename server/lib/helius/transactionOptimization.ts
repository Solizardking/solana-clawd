export const HELIUS_FALLBACK_RPC_URL = "https://api.mainnet-beta.solana.com";

export const HELIUS_SENDER_TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
] as const;

export const HELIUS_PRIORITY_LEVELS = ["Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax"] as const;

export type HeliusPriorityLevel = typeof HELIUS_PRIORITY_LEVELS[number];
export type HeliusTransactionEncoding = "base64" | "base58";
export type HeliusLandingMode = "rpc" | "sender";

export interface HeliusRpcOptions {
  requestId?: string;
  timeoutMs?: number;
  rebateAddress?: string;
  headers?: Record<string, string>;
}

export interface HeliusPriorityFeeRequest {
  transaction?: string;
  accountKeys?: string[];
  options?: {
    priorityLevel?: HeliusPriorityLevel;
    includeAllPriorityFeeLevels?: boolean;
    transactionEncoding?: "Base64" | "Base58";
    lookbackSlots?: number;
    includeVote?: boolean;
    recommended?: boolean;
    evaluateEmptySlotAsZero?: boolean;
  };
}

export interface SendOptimizedTransactionOptions {
  mode?: HeliusLandingMode;
  encoding?: HeliusTransactionEncoding;
  skipPreflight?: boolean;
  maxRetries?: number;
  rebateAddress?: string;
  swqosOnly?: boolean;
  requestId?: string;
  timeoutMs?: number;
}

function appendQueryParam(rawUrl: string, key: string, value: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set(key, value);
  return url.toString();
}

function getEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

export function resolveHeliusRpcUrl(opts: { rebateAddress?: string } = {}): string {
  const explicitRpcUrl = getEnv("HELIUS_RPC_URL");
  const apiKey = getEnv("HELIUS_API_KEY");
  let rpcUrl = explicitRpcUrl || (apiKey ? `https://mainnet.helius-rpc.com/?api-key=${apiKey}` : HELIUS_FALLBACK_RPC_URL);

  const rebateAddress = opts.rebateAddress || getEnv("HELIUS_REBATE_ADDRESS");
  if (rebateAddress && rpcUrl.includes("helius-rpc.com")) {
    rpcUrl = appendQueryParam(rpcUrl, "rebate-address", rebateAddress);
  }

  return rpcUrl;
}

export function resolveHeliusSenderEndpoint(opts: { swqosOnly?: boolean } = {}): string {
  const configured = getEnv("HELIUS_SENDER_ENDPOINT") || getEnv("HELIUS_SENDER_URL");
  let endpoint = configured || "http://ewr-sender.helius-rpc.com/fast";

  const senderApiKey = getEnv("HELIUS_SENDER_API_KEY");
  if (senderApiKey) endpoint = appendQueryParam(endpoint, "api-key", senderApiKey);
  if (opts.swqosOnly) endpoint = appendQueryParam(endpoint, "swqos_only", "true");

  return endpoint;
}

export function getHeliusTransactionOptimizationConfig() {
  const rpcUrl = resolveHeliusRpcUrl();
  const defaultLandingMode = getEnv("HELIUS_DEFAULT_LANDING_MODE") === "sender" ? "sender" : "rpc";

  return {
    rpcConfigured: Boolean(getEnv("HELIUS_RPC_URL") || getEnv("HELIUS_API_KEY")),
    rpcProvider: rpcUrl.includes("helius-rpc.com") ? "helius" : "fallback-public-rpc",
    senderEndpoint: resolveHeliusSenderEndpoint(),
    defaultLandingMode,
    rebateConfigured: Boolean(getEnv("HELIUS_REBATE_ADDRESS")),
    senderTipLamports: 200_000,
    senderTipSol: 0.0002,
    senderTipAccounts: HELIUS_SENDER_TIP_ACCOUNTS,
  };
}

export async function heliusRpc<T = unknown>(
  method: string,
  params: unknown,
  opts: HeliusRpcOptions = {},
): Promise<T> {
  const response = await fetch(resolveHeliusRpcUrl({ rebateAddress: opts.rebateAddress }), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: opts.requestId || `helius-${method}`,
      method,
      params,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });

  const text = await response.text();
  let data: { error?: { message?: string }; result?: T };
  try {
    data = JSON.parse(text) as { error?: { message?: string }; result?: T };
  } catch {
    throw new Error(`Helius ${method} returned non-JSON response (${response.status})`);
  }

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Helius ${method} failed (${response.status})`);
  }

  return data.result as T;
}

export async function getHeliusPriorityFeeEstimate(request: HeliusPriorityFeeRequest) {
  if (!request.transaction && (!request.accountKeys || request.accountKeys.length === 0)) {
    throw new Error("transaction or accountKeys is required for priority fee estimation");
  }

  const hasSpecificFeeOptions = Boolean(
    request.options?.priorityLevel ||
    request.options?.includeAllPriorityFeeLevels ||
    request.options?.lookbackSlots ||
    request.options?.includeVote != null ||
    request.options?.evaluateEmptySlotAsZero != null
  );
  const options: Record<string, unknown> = {};
  if (request.options?.includeAllPriorityFeeLevels) {
    options.includeAllPriorityFeeLevels = true;
  } else if (request.options?.priorityLevel) {
    options.priorityLevel = request.options.priorityLevel;
  }
  if (request.options?.transactionEncoding) options.transactionEncoding = request.options.transactionEncoding;
  if (request.options?.lookbackSlots) options.lookbackSlots = request.options.lookbackSlots;
  if (request.options?.includeVote != null) options.includeVote = request.options.includeVote;
  if (request.options?.evaluateEmptySlotAsZero != null) options.evaluateEmptySlotAsZero = request.options.evaluateEmptySlotAsZero;
  if ((request.options?.recommended ?? true) && !hasSpecificFeeOptions) {
    options.recommended = true;
  }

  return heliusRpc("getPriorityFeeEstimate", [{
    ...(request.transaction ? { transaction: request.transaction } : {}),
    ...(request.accountKeys?.length ? { accountKeys: request.accountKeys } : {}),
    options,
  }], { requestId: "helius-priority-fee" });
}

export async function sendViaHeliusRpc(transaction: string, opts: SendOptimizedTransactionOptions = {}) {
  const signature = await heliusRpc<string>("sendTransaction", [
    transaction,
    {
      encoding: opts.encoding || "base64",
      skipPreflight: opts.skipPreflight ?? false,
      maxRetries: opts.maxRetries ?? 3,
    },
  ], {
    requestId: opts.requestId || "helius-send-rpc",
    timeoutMs: opts.timeoutMs ?? 30_000,
    rebateAddress: opts.rebateAddress,
  });

  return {
    mode: "rpc" as const,
    signature,
    optimizedBy: "helius-rpc",
  };
}

export async function sendViaHeliusSender(transaction: string, opts: SendOptimizedTransactionOptions = {}) {
  const endpoint = resolveHeliusSenderEndpoint({ swqosOnly: opts.swqosOnly });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: opts.requestId || "helius-send-sender",
      method: "sendTransaction",
      params: [
        transaction,
        {
          encoding: opts.encoding || "base64",
          skipPreflight: true,
          maxRetries: 0,
        },
      ],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });

  const text = await response.text();
  let data: { error?: { message?: string }; result?: string };
  try {
    data = JSON.parse(text) as { error?: { message?: string }; result?: string };
  } catch {
    throw new Error(`Helius Sender returned non-JSON response (${response.status})`);
  }

  if (!response.ok || data.error || !data.result) {
    throw new Error(data.error?.message || `Helius Sender failed (${response.status})`);
  }

  return {
    mode: "sender" as const,
    signature: data.result,
    optimizedBy: "helius-sender",
    senderEndpoint: endpoint,
    note: "Sender requires the signed transaction to already include a priority fee and required Helius tip instruction.",
  };
}

export async function sendOptimizedTransaction(transaction: string, opts: SendOptimizedTransactionOptions = {}) {
  const mode = opts.mode || (getEnv("HELIUS_DEFAULT_LANDING_MODE") === "sender" ? "sender" : "rpc");
  if (mode === "sender") {
    return sendViaHeliusSender(transaction, opts);
  }
  return sendViaHeliusRpc(transaction, opts);
}

export function rawTransactionToBase64(raw: Uint8Array | Buffer): string {
  return Buffer.from(raw).toString("base64");
}

export async function sendOptimizedRawTransaction(raw: Uint8Array | Buffer, opts: SendOptimizedTransactionOptions = {}) {
  return sendOptimizedTransaction(rawTransactionToBase64(raw), { ...opts, encoding: "base64" });
}

export async function sendJitoBundleViaHelius(transactions: string[], region?: string) {
  return heliusRpc("sendBundle", [transactions], {
    requestId: "helius-send-bundle",
    timeoutMs: 30_000,
    headers: region ? { "jito-region": region } : undefined,
  });
}

export async function getJitoBundleStatusesViaHelius(bundleIds: string[]) {
  return heliusRpc("getBundleStatuses", [bundleIds], {
    requestId: "helius-bundle-statuses",
    timeoutMs: 15_000,
  });
}

export async function simulateJitoBundleViaHelius(transactions: string[]) {
  return heliusRpc("simulateBundle", [transactions], {
    requestId: "helius-simulate-bundle",
    timeoutMs: 30_000,
  });
}
