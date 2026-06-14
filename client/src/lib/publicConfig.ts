export interface PublicConfig {
  solanaNetwork: "mainnet-beta";
  walletRpcUrl: string;
  features: {
    backroomAvailable: boolean;
    clawdrouterAvailable: boolean;
  };
}

import { FALLBACK_SOLANA_RPC_URL, resolveBrowserRpcUrl } from "./runtimeConfig";

const buildTimeConfig: PublicConfig = {
  solanaNetwork: "mainnet-beta",
  walletRpcUrl: resolveBrowserRpcUrl(),
  features: {
    backroomAvailable: false,
    clawdrouterAvailable: false,
  },
};

let configPromise: Promise<PublicConfig> | null = null;

export function getBuildTimePublicConfig(): PublicConfig {
  return buildTimeConfig;
}

export async function getPublicConfig(): Promise<PublicConfig> {
  if (!configPromise) {
    const promise: Promise<PublicConfig> = fetch("/api/public-config", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`public config failed: ${response.status}`);
        const data = await response.json();
        return {
          solanaNetwork: "mainnet-beta",
          walletRpcUrl: typeof data.walletRpcUrl === "string" && data.walletRpcUrl
            ? data.walletRpcUrl
            : buildTimeConfig.walletRpcUrl,
          features: {
            backroomAvailable: Boolean(data?.features?.backroomAvailable),
            clawdrouterAvailable: Boolean(data?.features?.clawdrouterAvailable),
          },
        } satisfies PublicConfig;
      })
      .catch((error) => {
        console.warn("[public-config] falling back to build-time Solana RPC", error);
        return buildTimeConfig;
      });
    configPromise = promise;
    return promise;
  }

  return configPromise;
}

export async function getWalletRpcUrl(): Promise<string> {
  return (await getPublicConfig()).walletRpcUrl;
}
