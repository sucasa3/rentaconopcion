import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { buildMaintenanceTimeline, type TimelineItem } from "@/lib/maintenance-rules";
import { computeHomeScore, type HomeScoreResult } from "@/lib/home-score";

/**
 * Shared source of truth for the maintenance timeline + computed Home Score.
 * Reuses the same query keys as the maintenance panel so nothing is fetched twice.
 */
export function useHomeScore(hasAddress: boolean): {
  timeline: TimelineItem[];
  score: HomeScoreResult | null;
  isLoading: boolean;
} {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const fetchFindings = useServerFn(listInspectionFindings);
  const fetchDocs = useServerFn(listHomeDocuments);

  const { data: intel, isLoading } = useQuery({
    queryKey: ["home-intel-maintenance"],
    queryFn: () =>
      fetchIntel({
        data: { classes: ["detail", "permits"], revenueSource: "dashboard_maintenance" },
      }),
    staleTime: 30 * 60_000,
  });

  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
  });

  const { data: findings } = useQuery({
    queryKey: ["inspection-findings"],
    queryFn: () => fetchFindings({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const { data: docs } = useQuery({
    queryKey: ["home-documents"],
    queryFn: () => fetchDocs(undefined),
    staleTime: 5 * 60_000,
  });

  const ok = intel?.ok ? intel : null;
  const yearBuilt = ok?.detail?.yearBuilt ?? null;
  const permitEvents = ok?.permits?.events ?? [];

  if (isLoading || (!yearBuilt && permitEvents.length === 0)) {
    return { timeline: [], score: null, isLoading };
  }

  const timeline = buildMaintenanceTimeline(
    yearBuilt,
    permitEvents,
    new Date(),
    serviceLog ?? [],
  );

  const score = computeHomeScore({
    timeline,
    findings: findings ?? [],
    hasDocuments: (docs ?? []).length > 0,
    hasAddress,
    hasLogs: (serviceLog ?? []).length > 0,
  });

  return { timeline, score, isLoading: false };
}
