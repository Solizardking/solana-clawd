import { useMemo } from "react";
import { useSession } from "@clerk/react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "";

export function hasSupabase() {
  return supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
}

export function createClerkSupabaseClient(
  accessToken: () => Promise<string | null>,
): SupabaseClient {
  if (!hasSupabase()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken,
  });
}

export function useSupabaseClient(): SupabaseClient | null {
  const { session } = useSession();

  return useMemo(() => {
    if (!hasSupabase()) return null;

    return createClerkSupabaseClient(async () => session?.getToken() ?? null);
  }, [session]);
}
