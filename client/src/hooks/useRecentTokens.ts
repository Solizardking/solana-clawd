import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

export type RecentToken = {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
  price?: number;
  priceChange24hPercent?: number;
  marketCap?: number;
  liquidity?: number;
  viewedAt: number;
};

const KEY = "clawd-recent-tokens";
const MAX = 20;

export function useRecentTokens() {
  const [recent, setRecent] = useLocalStorage<RecentToken[]>(KEY, []);

  const addToken = useCallback(
    (token: Omit<RecentToken, "viewedAt">) => {
      setRecent((prev) => {
        const without = prev.filter((t) => t.address !== token.address);
        return [{ ...token, viewedAt: Date.now() }, ...without].slice(0, MAX);
      });
    },
    [setRecent]
  );

  const removeToken = useCallback(
    (address: string) => {
      setRecent((prev) => prev.filter((t) => t.address !== address));
    },
    [setRecent]
  );

  const clearRecent = useCallback(() => setRecent([]), [setRecent]);

  return { recent, addToken, removeToken, clearRecent };
}
