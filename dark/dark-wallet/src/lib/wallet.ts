import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export type DarkNetwork = "devnet" | "testnet" | "mainnet-beta";

export interface InjectedSolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey: { toBase58: () => string } | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toBase58: () => string };
  }>;
  disconnect?: () => Promise<void>;
}

type ProviderWindow = Window & {
  solana?: InjectedSolanaProvider;
  phantom?: { solana?: InjectedSolanaProvider };
  solflare?: InjectedSolanaProvider;
};

export function createConnection(network: DarkNetwork = "devnet"): Connection {
  return new Connection(clusterApiUrl(network), "confirmed");
}

export function getInjectedSolanaProvider(): InjectedSolanaProvider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const providerWindow = window as ProviderWindow;
  return providerWindow.solana ?? providerWindow.phantom?.solana ?? providerWindow.solflare ?? null;
}

export function providerLabel(provider: InjectedSolanaProvider | null): string {
  if (!provider) {
    return "Demo vault";
  }

  if (provider.isPhantom) {
    return "Phantom";
  }

  if (provider.isSolflare) {
    return "Solflare";
  }

  return "Injected wallet";
}

export async function connectInjectedWallet(
  provider: InjectedSolanaProvider,
  onlyIfTrusted = false,
): Promise<string> {
  const response = await provider.connect(
    onlyIfTrusted ? { onlyIfTrusted: true } : undefined,
  );
  return response.publicKey.toBase58();
}

export async function disconnectInjectedWallet(
  provider: InjectedSolanaProvider | null,
): Promise<void> {
  if (provider?.disconnect) {
    await provider.disconnect();
  }
}

export async function fetchTransparentBalance(
  connection: Connection,
  publicKey: string,
): Promise<number> {
  const balance = await connection.getBalance(new PublicKey(publicKey));
  return balance / 1_000_000_000;
}

export function shortenAddress(address: string, size = 4): string {
  if (address.length <= size * 2 + 3) {
    return address;
  }

  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function createDemoBalance(seed = "dark-wallet"): number {
  const chars = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Number((12 + (chars % 700) / 100).toFixed(4));
}
