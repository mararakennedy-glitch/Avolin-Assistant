// Resolve the signed-in user's Avolin tier (basic | core | elite) from the
// API server. Backed by React Query so that multiple components calling
// useTier() on the same page share a single in-flight request and a
// single cached result instead of each one issuing its own fetch.

import { useCallback } from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type Tier = "basic" | "core" | "elite";

export type TierState = {
  tier: Tier;
  signedIn: boolean;
  loading: boolean;
  features: {
    hdImage: boolean;
    ultraImage: boolean;
    longMusic: boolean;
    cloudSync: boolean;
  };
  refresh: () => Promise<void>;
};

const DEFAULT_FEATURES = {
  hdImage: false,
  ultraImage: false,
  longMusic: false,
  cloudSync: false,
};

type TierResponse = {
  tier?: Tier;
  features?: Partial<TierState["features"]>;
};

const TIER_QUERY_KEY = ["me", "tier"] as const;

async function fetchTier(): Promise<TierResponse> {
  const res = await fetch("/api/me/tier", { credentials: "include" });
  if (!res.ok) throw new Error("tier fetch failed");
  return res.json();
}

export function useTier(): TierState {
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();

  const enabled = !!isLoaded && !!isSignedIn;

  const query = useQuery({
    queryKey: TIER_QUERY_KEY,
    queryFn: fetchTier,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: TIER_QUERY_KEY });
  }, [queryClient]);

  if (!enabled) {
    return {
      tier: "basic",
      signedIn: false,
      loading: !isLoaded,
      features: DEFAULT_FEATURES,
      refresh,
    };
  }

  const data = query.data;
  return {
    tier: (data?.tier as Tier) || "basic",
    signedIn: true,
    loading: query.isLoading,
    features: {
      hdImage: !!data?.features?.hdImage,
      ultraImage: !!data?.features?.ultraImage,
      longMusic: !!data?.features?.longMusic,
      cloudSync: !!data?.features?.cloudSync,
    },
    refresh,
  };
}
