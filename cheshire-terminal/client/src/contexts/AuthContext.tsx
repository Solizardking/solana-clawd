import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

interface AuthUser {
  userId: number | null;
  walletAddress: string | null;
  role: string;
  clawdBalance: number;
  isTokenGated: boolean;
  createdAt?: string;
  onboardingCompleted?: boolean;
  profile?: {
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    twitterUsername?: string | null;
    githubUsername?: string | null;
    agentName?: string | null;
  };
  agents?: Array<Record<string, unknown>>;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInStatus: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  saveProfile: (input: NonNullable<AuthUser["profile"]>) => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  signInStatus: null,
  signIn: async () => {},
  signOut: async () => {},
  refreshMe: async () => {},
  saveProfile: async () => {},
  error: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected } = useWallet();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signInStatus, setSignInStatus] = useState<string | null>(null);
  const signInInFlight = useRef<Promise<void> | null>(null);

  const loadMe = useCallback(async () => {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    const data = await response.json();
    if (data.authenticated && data.walletAddress) {
      setUser({
        userId: data.userId ?? null,
        walletAddress: data.walletAddress,
        role: data.role ?? "user",
        clawdBalance: data.clawdBalance ?? 0,
        isTokenGated: data.isTokenGated ?? false,
        createdAt: data.createdAt,
        onboardingCompleted: data.onboardingCompleted ?? false,
        profile: data.profile ?? undefined,
        agents: data.agents ?? [],
      });
      return;
    }
    setUser(null);
  }, []);

  // On mount, check existing session
  useEffect(() => {
    loadMe()
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [loadMe]);

  const signIn = useCallback(async () => {
    if (signInInFlight.current) return signInInFlight.current;

    if (!publicKey || !signMessage) {
      const msg = "Please connect a wallet that supports message signing first.";
      setError(msg);
      throw new Error(msg);
    }

    const walletAddress = publicKey.toBase58();

    const run = (async () => {
      setError(null);

      // 1. Get challenge
      setSignInStatus("Preparing wallet challenge");
      const challengeRes = await fetch(
        `/api/auth/challenge?wallet=${encodeURIComponent(walletAddress)}`,
        { credentials: "include" }
      );
      if (!challengeRes.ok) throw new Error("Failed to get challenge");
      const { message } = await challengeRes.json();

      // 2. Sign the message
      setSignInStatus("Approve the login signature");
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // 3. Verify with server
      setSignInStatus("Opening terminal");
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, message }),
      });

      const data = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(data.error || "Verification failed");

      setUser({
        userId: data.userId ?? null,
        walletAddress: data.walletAddress,
        role: data.role ?? "user",
        clawdBalance: data.clawdBalance ?? 0,
        isTokenGated: data.isTokenGated ?? false,
        onboardingCompleted: data.onboardingCompleted ?? false,
        profile: data.profile ?? undefined,
        agents: data.agents ?? [],
      });
      setSignInStatus(null);
    })();

    signInInFlight.current = run;
    try {
      await run;
    } catch (err: any) {
      const msg = err?.message ?? "Sign-in failed";
      setError(msg);
      setSignInStatus(null);
      throw err;
    } finally {
      signInInFlight.current = null;
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    setUser(null);
    setError(null);
  }, []);

  const saveProfile = useCallback(async (profile: NonNullable<AuthUser["profile"]>) => {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to save profile");
    }
    await loadMe();
  }, [loadMe]);

  // Auto-sign-out when wallet disconnects
  useEffect(() => {
    if (!connected && user?.walletAddress) {
      signOut();
    }
  }, [connected, user?.walletAddress, signOut]);

  useEffect(() => {
    const connectedWallet = publicKey?.toBase58();
    if (connectedWallet && user?.walletAddress && connectedWallet !== user.walletAddress) {
      signOut();
    }
  }, [publicKey, user?.walletAddress, signOut]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        signInStatus,
        signIn,
        signOut,
        refreshMe: loadMe,
        saveProfile,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
