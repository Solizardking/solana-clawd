/**
 * @openclawd/wallet/react — React hooks and Privy provider
 * Privy-powered embedded Solana wallet for the openclawd agent ecosystem
 */

import { usePrivy } from "@privy-io/react-auth";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import React, { createContext, type ReactNode, useContext, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export interface PrivyProviderConfig {
  appId: string;
  children: ReactNode;
  chain?: "mainnet" | "devnet" | "testnet";
  loginMethods?: Array<"email" | "phone" | "google" | "twitter" | "discord" | "github">;
  embeddedWallets?: boolean;
}

interface ClawdWalletContextValue {
  wallet: { address: string; ready: boolean; chain: "mainnet" } | null;
  authenticated: boolean;
  loading: boolean;
  connectWallet: () => Promise<void>;
  disconnect: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

const ClawdWalletContext = createContext<ClawdWalletContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────

/**
 * `<PrivyProvider />` — wraps your app with Privy authentication + embedded Solana wallet.
 *
 * @example
 * ```tsx
 * import { PrivyProvider } from "@openclawd/wallet/react";
 *
 * <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}>
 *   <App />
 * </PrivyProvider>
 * ```
 */
export function PrivyProvider({
  appId,
  children,
  chain = "mainnet",
  loginMethods = ["email", "google"],
  embeddedWallets = true,
}: PrivyProviderConfig) {
  const [Inner, setInner] = React.useState<React.ComponentType<{
    appId: string;
    children: ReactNode;
    config?: Record<string, unknown>;
  }> | null>(null);

  React.useEffect(() => {
    import("@privy-io/react-auth").then(({ PrivyProvider: PP }) => {
      setInner(() => PP as React.ComponentType<{
        appId: string;
        children: ReactNode;
        config?: Record<string, unknown>;
      }>);
    });
  }, []);

  const privyConfig = useMemo(() => ({
    appearance: { walletChain: chain },
    loginMethods,
    embeddedWallets: { solana: embeddedWallets, createOnLogin: "all-users" },
  }), [chain, loginMethods, embeddedWallets]);

  if (!Inner) return <>{children}</>;

  return (
    <Inner appId={appId} config={privyConfig as Record<string, unknown>}>
      <ClawdWalletInner chain={chain}>{children}</ClawdWalletInner>
    </Inner>
  );
}

// ─── Inner context ────────────────────────────────────────────────────────

interface InnerProps { chain: "mainnet" | "devnet" | "testnet"; children: ReactNode }

function ClawdWalletInner({ chain, children }: InnerProps) {
  // Hooks called unconditionally at top level — rules of hooks satisfied
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = (useSolanaWallets as () => {
    wallets: Array<{ address: string; type?: string; signAndSendTransaction?: unknown }>;
  })();

  const raw = wallets.find((w) => w.type === "privy_solana" || w.type === "solana");

  const ctx = useMemo<ClawdWalletContextValue>(() => ({
    wallet: raw
      ? { address: raw.address, ready: typeof raw.signAndSendTransaction === "function", chain: chain as "mainnet" }
      : null,
    authenticated,
    loading: false,
    connectWallet: async () => { login(); },
    disconnect: () => { void logout(); },
  }), [raw, authenticated, chain, login, logout]);

  return (
    <ClawdWalletContext.Provider value={ctx}>
      {children}
    </ClawdWalletContext.Provider>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

/**
 * `useClawdWallet()` — access the connected Privy Solana wallet.
 * Must be used inside `<PrivyProvider>`.
 */
export function useClawdWallet(): ClawdWalletContextValue {
  const ctx = useContext(ClawdWalletContext);
  if (!ctx) throw new Error("useClawdWallet must be used inside <PrivyProvider> from @openclawd/wallet/react");
  return ctx;
}

/**
 * `useClawdWalletBalance()` — fetch SOL balance for the connected wallet.
 */
export function useClawdWalletBalance(): { balance: bigint | null; loading: boolean; refetch: () => void } {
  const { wallet } = useClawdWallet();
  const [balance, setBalance] = React.useState<bigint | null>(null);
  const [loading, setLoading] = React.useState(false);

  const refetch = React.useCallback(async () => {
    if (!wallet?.address) return;
    setLoading(true);
    try {
      const { address, createSolanaRpc } = await import("@solana/kit");
      const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
      const result = await rpc.getBalance(address(wallet.address)).send();
      setBalance(BigInt(result.value));
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [wallet?.address]);

  React.useEffect(() => { void refetch(); }, [refetch]);

  return { balance, loading, refetch };
}
