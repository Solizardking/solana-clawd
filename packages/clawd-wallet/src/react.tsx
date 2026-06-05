/**
 * @openclawd/wallet/react — React hooks and Privy provider
 * Privy-powered embedded Solana wallet for the openclawd agent ecosystem
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { PrivyProviderConfig } from "./types.js";

// ─── Privy ────────────────────────────────────────────────────────────────

type PrivyWalletExtra = {
  wallet?: {
    address: string;
    signAndSendTransaction?: (
      input: { transaction: Uint8Array; chain?: string },
      opts?: unknown
    ) => Promise<{ signature: Uint8Array }>;
  };
};

interface ClawdWalletContextValue {
  /** The connected Clawd Wallet (null if no wallet connected) */
  wallet: {
    address: string;
    ready: boolean;
    chain: "mainnet";
  } | null;
  /** Privy auth status */
  authenticated: boolean;
  /** Loading state */
  loading: boolean;
  /** Connect a Solana wallet via Privy */
  connectWallet: () => Promise<void>;
  /** Disconnect the wallet */
  disconnect: () => void;
}

// ─── Context ───────────────────────────────────────────────────────────────

const ClawdWalletContext = createContext<ClawdWalletContextValue | null>(null);

// ─── Provider ──────────────────────────────────────────────────────────────

export interface PrivyProviderConfig {
  appId: string;
  children: ReactNode;
  /** Default Solana chain (default: mainnet) */
  chain?: "mainnet" | "devnet" | "testnet";
  /** Privy theme */
  theme?: "light" | "dark" | "auto";
  /** Custom login methods */
  loginMethods?: Array<"email" | "phone" | "google" | "twitter" | "discord" | "github">;
  /** Enable embedded wallet (default: true) */
  embeddedWallets?: boolean;
}

/**
 * `<PrivyProvider />` — wraps your app with Privy authentication + embedded Solana wallet
 *
 * @example
 * ```tsx
 * import { PrivyProvider } from "@openclawd/wallet/react";
 *
 * <PrivyProvider
 *   appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
 *   loginMethods={["google", "discord"]}
 *   embeddedWallets
 * >
 *   <App />
 * </PrivyProvider>
 * ```
 *
 * Then in any child component:
 * ```tsx
 * import { useClawdWallet } from "@openclawd/wallet/react";
 *
 * function SwapButton() {
 *   const { wallet, authenticated, connectWallet } = useClawdWallet();
 *
 *   if (!wallet) return <button onClick={connectWallet}>Connect Wallet</button>;
 *   return <span>{wallet.address.slice(0, 8)}...</span>;
 * }
 * ```
 */
export function PrivyProvider({
  appId,
  children,
  chain = "mainnet",
  loginMethods = ["email", "google"],
  embeddedWallets = true,
}: PrivyProviderConfig) {
  // Lazily import @privy-io/react-auth to avoid SSR issues
  const [PrivyProviderInner, setPrivy] = React.useState<React.ComponentType<{
    appId: string;
    children: ReactNode;
    config?: Record<string, unknown>;
  }> | null>(null);

  React.useEffect(() => {
    import("@privy-io/react-auth").then(({ PrivyProvider: PP }) => {
      setPrivy(() => PP as React.ComponentType<{
        appId: string;
        children: ReactNode;
        config?: Record<string, unknown>;
      }>);
    });
  }, []);

  const config = useMemo(
    () => ({
      appearance: { walletChain: chain },
      loginMethods,
      embeddedWallets: {
        solana: embeddedWallets,
        createOnLogin: "all-users",
      },
    }),
    [chain, loginMethods, embeddedWallets]
  );

  if (!PrivyProviderInner) {
    return (
      <>
        {children}
      </>
    );
  }

  return (
    <PrivyProviderInner appId={appId} config={config as Record<string, unknown>}>
      <ClawdWalletInner chain={chain}>
        {children}
      </ClawdWalletInner>
    </PrivyProviderInner>
  );
}

// ─── Inner context (reads from Privy context) ─────────────────────────────

interface ClawdWalletInnerProps {
  chain: "mainnet" | "devnet" | "testnet";
  children: ReactNode;
}

function ClawdWalletInner({ chain, children }: ClawdWalletInnerProps) {
  const [wallet, setWallet] = React.useState<{
    address: string;
    ready: boolean;
    chain: "mainnet";
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Lazily get Privy hooks
  const [privy, setPrivy] = React.useState<{
    usePrivy: () => { user: Record<string, unknown> | null; authenticated: boolean };
    useWallets: () => { wallets: Array<{ address: string; type: string; [key: string]: unknown }> };
  } | null>(null);

  React.useEffect(() => {
    import("@privy-io/react-auth/solana").then((solana) => {
      import("@privy-io/react-auth").then((main) => {
        setPrivy({
          usePrivy: main.usePrivy as () => { user: Record<string, unknown> | null; authenticated: boolean },
          useWallets: solana.useWallets as () => { wallets: Array<{ address: string; type: string; [key: string]: unknown }> },
        });
        setLoading(false);
      });
    });
  }, []);

  // Re-read wallets whenever Privy state changes
  const walletValue = React.useMemo<ClawdWalletContextValue>(() => {
    if (!privy) {
      return {
        wallet: null,
        authenticated: false,
        loading: true,
        connectWallet: async () => {},
        disconnect: () => {},
      };
    }

    const { user, authenticated } = privy.usePrivy();
    const { wallets } = privy.useWallets();

    // Find the first Solana embedded wallet (privy type)
    const solanaWallet = wallets.find(
      (w) => w.type === "privy_solana" || w.type === "solana"
    );

    const connectedWallet = solanaWallet
      ? {
          address: solanaWallet.address,
          ready: !!(
            (solanaWallet as { signAndSendTransaction?: unknown }).signAndSendTransaction
          ),
          chain: chain as "mainnet",
        }
      : null;

    return {
      wallet: connectedWallet,
      authenticated,
      loading: false,
      connectWallet: async () => {
        // Trigger Privy's modal to connect/create a wallet
        const { useConnectWallet } = await import("@privy-io/react-auth/solana");
        const { connectWallet } = useConnectWallet();
        await connectWallet({});
      },
      disconnect: async () => {
        const { useDisconnect } = await import("@privy-io/react-auth");
        const { disconnect } = useDisconnect();
        await disconnect();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privy?.usePrivy, privy?.useWallets, chain]);

  if (loading || !privy) return <>{children}</>;

  return (
    <ClawdWalletContext.Provider value={walletValue}>
      {children}
    </ClawdWalletContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

/**
 * `useClawdWallet()` — access the connected Privy Solana wallet
 *
 * Must be used inside `<PrivyProvider>`.
 */
export function useClawdWallet(): ClawdWalletContextValue {
  const ctx = useContext(ClawdWalletContext);
  if (!ctx) {
    throw new Error(
      "useClawdWallet must be used inside <PrivyProvider> from @openclawd/wallet/react"
    );
  }
  return ctx;
}

/**
 * `useClawdWalletBalance()` — fetch SOL balance for the connected wallet
 */
export function useClawdWalletBalance(): {
  balance: bigint | null;
  loading: boolean;
  refetch: () => void;
} {
  const { wallet } = useClawdWallet();
  const [balance, setBalance] = React.useState<bigint | null>(null);
  const [loading, setLoading] = React.useState(false);

  const fetch = React.useCallback(async () => {
    if (!wallet?.address) return;
    setLoading(true);
    try {
      const { createSolanaRpc } = await import("@solana/kit");
      const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
      const { address } = await import("@solana/kit");
      const result = await rpc.getBalance(address(wallet.address)).send();
      setBalance(BigInt(result.value));
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [wallet?.address]);

  React.useEffect(() => { fetch(); }, [fetch]);

  return { balance, loading, refetch: fetch };
}
