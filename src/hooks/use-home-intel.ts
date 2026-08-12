import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHomeIntel } from "@/lib/property-intel.functions";

/**
 * Single property-intel fetch per dashboard load.
 *
 * Previously each card (hero, intelligence, equity, maintenance, pros) ran its
 * own request with a different class list and cache window, so cards could
 * disagree with one another and the same load logged four times the calls.
 * All of them now read from this one query.
 */
export const HOME_INTEL_CLASSES = [
  "avm",
  "detail",
  "tax",
  "sales",
  "mortgage",
  "permits",
] as const;

export const HOME_INTEL_QUERY_KEY = ["home-intel"] as const;

export function useHomeIntel() {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: HOME_INTEL_QUERY_KEY,
    queryFn: () =>
      fetchIntel({
        data: {
          classes: [...HOME_INTEL_CLASSES],
          revenueSource: "dashboard",
        },
      }),
    staleTime: 10 * 60_000,
  });

  async function refresh() {
    await qc.fetchQuery({
      queryKey: HOME_INTEL_QUERY_KEY,
      queryFn: () =>
        fetchIntel({
          data: {
            classes: [...HOME_INTEL_CLASSES],
            forceRefresh: true,
            revenueSource: "dashboard_refresh",
          },
        }),
      staleTime: 0,
    });
  }

  const ok = query.data?.ok ? query.data : null;

  return { ...query, intel: ok, raw: query.data, refresh };
}
