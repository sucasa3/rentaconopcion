import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useHomeIntel } from "@/hooks/use-home-intel";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { listHomeDocuments } from "@/lib/home-documents.functions";
import { listMyRequests } from "@/lib/service-requests.functions";
import { assembleHomeRecord, type HomeRecord } from "@/lib/home-record";
import { evaluateHome, type SignalReport } from "@/lib/signals";

/**
 * The homeowner's Home Record + signal report.
 *
 * Reuses the exact query keys the dashboard panels already use, so this adds
 * no fetches and no extra property-record spend — it just assembles what is
 * already loaded into the one canonical shape and runs the signal engine over
 * it.
 */
export function useHomeRecord(profileAddress?: string | null): {
  record: HomeRecord | null;
  report: SignalReport | null;
  isLoading: boolean;
} {
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const fetchFindings = useServerFn(listInspectionFindings);
  const fetchDocs = useServerFn(listHomeDocuments);
  const fetchRequests = useServerFn(listMyRequests);

  const { intel, isLoading } = useHomeIntel();

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
  const { data: requests } = useQuery({
    queryKey: ["my-requests"],
    queryFn: () => fetchRequests(),
    staleTime: 60_000,
  });

  const address = intel?.address ?? profileAddress ?? null;
  const reqs = (requests ?? []) as { status?: string | null }[];

  const equity = intel?.equity ?? null;

  const record = assembleHomeRecord({
    address,
    avm: intel?.avm ?? null,
    detail: intel?.detail ?? null,
    tax: intel?.tax ?? null,
    sales: {
      lastSalePrice: intel?.sales?.lastSale?.amount ?? null,
      lastSaleDate: intel?.sales?.lastSale?.date ?? null,
    },
    mortgage: { rate: intel?.mortgage?.interestRate ?? null },
    equity: equity
      ? {
          estimatedValue: equity.estimatedValue,
          loanBalance: equity.loanBalanceEstimate,
          equityDollars: equity.equityDollars,
          equityPct: equity.equityPct,
          cashOutHeadroom: equity.cashOutHeadroom80,
          refiSignal: equity.refiSignal,
          rate: intel?.mortgage?.interestRate ?? null,
        }
      : null,
    permits: intel?.permits?.events ?? [],
    valueStatus: intel?.valueStatus,
    staleClasses: intel?.staleClasses ?? [],
    findings: (findings ?? []) as never,
    serviceLog: (serviceLog ?? []) as never,
    documentCount: (docs ?? []).length,
    openRequests: reqs.filter((r) => r.status !== "Completed" && r.status !== "completed").length,
    totalRequests: reqs.length,
  });

  return { record, report: evaluateHome(record), isLoading };
}
