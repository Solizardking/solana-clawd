export type DarkNetwork = "devnet" | "mainnet-beta";

export interface DarkRuntimeConfig {
  heliusApiKey?: string;
  heliusRpcUrl?: string;
  solanaRpcUrl?: string;
  xaiApiKey?: string;
  xaiBaseUrl: string;
  xaiModel: string;
  defaultNetwork: DarkNetwork;
}

function readEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNetwork(value?: string | null): DarkNetwork {
  return value === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function formatNetworkLabel(network: DarkNetwork): string {
  return network === "mainnet-beta" ? "Mainnet Beta" : "Devnet";
}

export function getDarkRuntimeConfig(): DarkRuntimeConfig {
  const heliusRpcUrl = readEnv("HELIUS_RPC_URL") || readEnv("VITE_HELIUS_RPC_URL");
  const heliusApiKey = readEnv("HELIUS_API_KEY") || readEnv("VITE_HELIUS_API_KEY");
  const solanaRpcUrl = readEnv("SOLANA_RPC_URL") || readEnv("VITE_SOLANA_RPC_URL");
  const xaiApiKey = readEnv("XAI_API_KEY") || readEnv("VITE_XAI_API_KEY");
  const xaiBaseUrl = readEnv("XAI_BASE_URL") || readEnv("VITE_XAI_BASE_URL") || "https://api.x.ai/v1";
  const xaiModel = readEnv("XAI_MODEL") || readEnv("VITE_XAI_MODEL") || "grok-4.20-beta-latest-non-reasoning";

  const defaultNetwork = normalizeNetwork(
    readEnv("SOLANA_CLUSTER") ||
      readEnv("VITE_SOLANA_CLUSTER") ||
      ((heliusRpcUrl || solanaRpcUrl).includes("mainnet") ? "mainnet-beta" : "devnet"),
  );

  return {
    heliusApiKey: heliusApiKey || undefined,
    heliusRpcUrl: heliusRpcUrl || undefined,
    solanaRpcUrl: solanaRpcUrl || undefined,
    xaiApiKey: xaiApiKey || undefined,
    xaiBaseUrl,
    xaiModel,
    defaultNetwork,
  };
}

export function resolveSolanaRpcUrl(
  network: DarkNetwork,
  config: Pick<DarkRuntimeConfig, "heliusApiKey" | "heliusRpcUrl" | "solanaRpcUrl"> = {},
): string {
  const direct = config.heliusRpcUrl?.trim() || config.solanaRpcUrl?.trim();
  if (direct) {
    return direct;
  }

  const apiKey = config.heliusApiKey?.trim();
  if (apiKey) {
    const base = network === "mainnet-beta"
      ? "https://mainnet.helius-rpc.com"
      : "https://devnet.helius-rpc.com";
    return `${base}/?api-key=${apiKey}`;
  }

  return network === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}
