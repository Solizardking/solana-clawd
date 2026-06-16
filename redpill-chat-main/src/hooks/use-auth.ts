"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { indexedDBStorage } from "@/services/storage/indexed-db";
import type { CurrentUser } from "@/types/auth";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  user: CurrentUser | null;
  status: AuthStatus;
  fetchCurrentUser: (options?: { force?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  async fetchCurrentUser({ force = false } = {}) {
    const { status } = get();

    if (!force && (status === "loading" || status === "authenticated")) {
      return;
    }

    set({ status: "loading" });

    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (!response.ok) {
        set({ user: null, status: "unauthenticated" });
        return;
      }

      const data = (await response.json()) as CurrentUser;
      set({ user: data, status: "authenticated" });
    } catch {
      set({ user: null, status: "unauthenticated" });
    }
  },
  async logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      try {
        await indexedDBStorage.clearAll();
      } catch (error) {
        console.error("Failed to clear chat storage on logout", error);
      }
      set({ user: null, status: "unauthenticated" });
    }
  },
}));

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const fetchCurrentUser = useAuthStore((state) => state.fetchCurrentUser);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (status === "idle") {
      void fetchCurrentUser();
    }
  }, [status, fetchCurrentUser]);

  return {
    user,
    status,
    refresh: () => fetchCurrentUser({ force: true }),
    logout,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading" || status === "idle",
  };
}
