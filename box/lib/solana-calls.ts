export interface SolanaCallConfig {
  rpcUrl: string;
  heliusApiKey?: string;
  jupiterQuoteUrl: string;
  phoenixApiUrl: string;
}

export interface SolanaCallPlan {
  rpc: {
    health: RpcCall;
    latestBlockhash: RpcCall;
  };
  jupiter: {
    solUsdcQuote: HttpCall;
  };
  helius?: {
    assetsByOwner: RpcCall;
  };
  phoenix: {
    market: HttpCall;
    traderState?: HttpCall;
  };
}

export interface RpcCall {
  method: "POST";
  url: string;
  body: Record<string, unknown>;
}

export interface HttpCall {
  method: "GET";
  url: string;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function loadSolanaCallConfig(env: NodeJS.ProcessEnv = process.env): SolanaCallConfig {
  return {
    rpcUrl: env.HELIUS_RPC_URL ?? env.SOLANA_RPC_URL ?? env.RPC_URL ?? buildHeliusRpcUrl(env.HELIUS_API_KEY) ?? "https://api.mainnet-beta.solana.com",
    heliusApiKey: env.HELIUS_API_KEY,
    jupiterQuoteUrl: env.JUPITER_QUOTE_URL ?? "https://quote-api.jup.ag/v6/quote",
    phoenixApiUrl: env.PHOENIX_API_URL ?? "https://api.phoenix.trade",
  };
}

export function buildSolanaCallPlan(
  config: SolanaCallConfig,
  input: { ownerPublicKey?: string; symbol?: string } = {},
): SolanaCallPlan {
  const owner = input.ownerPublicKey;
  const symbol = encodeURIComponent(input.symbol ?? "SOL");
  const quote = new URL(config.jupiterQuoteUrl);
  quote.searchParams.set("inputMint", SOL_MINT);
  quote.searchParams.set("outputMint", USDC_MINT);
  quote.searchParams.set("amount", "10000000");
  quote.searchParams.set("slippageBps", "50");

  return {
    rpc: {
      health: rpcCall(redactSensitiveUrl(config.rpcUrl), "getHealth"),
      latestBlockhash: rpcCall(redactSensitiveUrl(config.rpcUrl), "getLatestBlockhash", [{ commitment: "processed" }]),
    },
    jupiter: {
      solUsdcQuote: { method: "GET", url: quote.toString() },
    },
    helius: config.heliusApiKey && owner
      ? {
          assetsByOwner: rpcCall(redactSensitiveUrl(buildHeliusRpcUrl(config.heliusApiKey)!), "getAssetsByOwner", [
            { ownerAddress: owner, page: 1, limit: 10 },
          ]),
        }
      : undefined,
    phoenix: {
      market: { method: "GET", url: `${trimSlash(config.phoenixApiUrl)}/exchange/market/${symbol}` },
      traderState: owner
        ? { method: "GET", url: `${trimSlash(config.phoenixApiUrl)}/trader/${owner}/state` }
        : undefined,
    },
  };
}

function rpcCall(url: string, method: string, params: unknown[] = []): RpcCall {
  return {
    method: "POST",
    url,
    body: {
      jsonrpc: "2.0",
      id: "box-agent",
      method,
      params,
    },
  };
}

function buildHeliusRpcUrl(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  return `https://rpc.helius.xyz/?api-key=${apiKey}`;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function redactSensitiveUrl(value: string): string {
  const url = new URL(value);
  if (url.searchParams.has("api-key")) {
    url.searchParams.set("api-key", "redacted");
  }
  return url.toString();
}
