import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyHomeProfile, refreshMyHomeProfile } from "@/lib/home-profile.functions";

export const HOME_PROFILE_QUERY_KEY = ["home-profile"] as const;

/**
 * The homeowner's persisted Home Profile — the durable memory of the home
 * (property, mortgage/valuation, condition, behavior) that the Home Agent
 * reasons over. Reads storage; refreshes server-side only when stale.
 */
export function useHomeProfile() {
  const fetchProfile = useServerFn(getMyHomeProfile);
  const doRefresh = useServerFn(refreshMyHomeProfile);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: HOME_PROFILE_QUERY_KEY,
    queryFn: () => fetchProfile(),
    staleTime: 10 * 60_000,
  });

  async function refresh(forceProvider = false) {
    const res = await doRefresh({ data: { forceProvider } });
    qc.setQueryData(HOME_PROFILE_QUERY_KEY, res);
    return res;
  }

  return { ...query, profile: query.data?.profile ?? null, refresh };
}
