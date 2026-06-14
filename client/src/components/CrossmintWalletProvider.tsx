import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const CROSSMINT_CLIENT_API_KEY = import.meta.env.VITE_CROSSMINT_CLIENT_SIDE_API_KEY;

type CrossmintModule = typeof import("@crossmint/client-sdk-react-ui");

type CrossmintWalletContextType = {
  isConnected: boolean;
  walletAddress: string | null;
  status: "loading" | "in-progress" | "loading-error" | "loaded" | "disconnected";
  error: Error | null;
  login: () => void;
  logout: () => void;
};

const CrossmintWalletContext = createContext<CrossmintWalletContextType>({
  isConnected: false,
  walletAddress: null,
  status: "disconnected",
  error: null,
  login: () => {},
  logout: () => {},
});

export const useCrossmintWallet = () => useContext(CrossmintWalletContext);

function CrossmintWalletState({
  children,
  crossmint,
}: {
  children: ReactNode;
  crossmint: CrossmintModule;
}) {
  const { login, logout, jwt } = crossmint.useAuth();
  const { wallet, status: walletStatus, error: walletError } = crossmint.useWallet();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) {
      setWalletAddress(null);
      return;
    }

    const walletAny = wallet as any;
    if (walletAny.pubkey) {
      setWalletAddress(walletAny.pubkey.toString());
      return;
    }
    if (walletAny.address) {
      setWalletAddress(walletAny.address.toString());
      return;
    }

    setWalletAddress(null);
  }, [wallet]);

  const status = useMemo<CrossmintWalletContextType["status"]>(() => {
    switch (walletStatus) {
      case "in-progress":
        return "in-progress";
      case "loading-error":
        return "loading-error";
      case "loaded":
        return "loaded";
      case "not-loaded":
      case undefined:
        return "disconnected";
      default:
        return "disconnected";
    }
  }, [walletStatus]);

  return (
    <CrossmintWalletContext.Provider
      value={{
        isConnected: Boolean(jwt && wallet),
        walletAddress,
        status,
        error: walletError ? new Error(walletError) : null,
        login,
        logout,
      }}
    >
      {children}
    </CrossmintWalletContext.Provider>
  );
}

function LoadedCrossmintProvider({
  children,
  crossmint,
}: {
  children: ReactNode;
  crossmint: CrossmintModule;
}) {
  const { CrossmintProvider, CrossmintAuthProvider } = crossmint;

  return (
    <CrossmintProvider apiKey={CROSSMINT_CLIENT_API_KEY}>
      <CrossmintAuthProvider
        embeddedWallets={{
          type: "solana-smart-wallet",
          createOnLogin: "all-users",
        }}
      >
        <CrossmintWalletState crossmint={crossmint}>{children}</CrossmintWalletState>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}

export function CrossmintWalletProvider({ children }: { children: ReactNode }) {
  const [crossmint, setCrossmint] = useState<CrossmintModule | null>(null);

  useEffect(() => {
    if (!CROSSMINT_CLIENT_API_KEY) {
      return;
    }

    let cancelled = false;

    import("@crossmint/client-sdk-react-ui")
      .then((module) => {
        if (!cancelled) {
          setCrossmint(module);
        }
      })
      .catch((error) => {
        console.error("Failed to load Crossmint client SDK", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!CROSSMINT_CLIENT_API_KEY || !crossmint) {
    return <>{children}</>;
  }

  return <LoadedCrossmintProvider crossmint={crossmint}>{children}</LoadedCrossmintProvider>;
}
