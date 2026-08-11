import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { Home, TrendingUp, Receipt, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useActivityLog } from "@/hooks/use-activity-log";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function HomeIntelPanel() {
  const [refreshTick, setRefreshTick] = useState(0);
  const logActivity = useActivityLog();
  const fetchIntel = useServerFn(getMyHomeIntel);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["home-intel", refreshTick],
    queryFn: () =>
      fetchIntel({
        data: {
          classes: ["avm", "detail", "tax"],
          forceRefresh: refreshTick > 0,
          revenueSource: "dashboard_view",
        },
      }),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading home intelligence…</p>
      </div>
    );
  }

  if (isError || !data?.ok) {
    const err = data && !data.ok ? data.error : "Could not load home intelligence.";
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">Home intelligence</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {err === "No address on profile"
            ? "Add your home address in your profile to see live valuation, tax, and property details."
            : err}
        </p>
      </div>
    );
  }

  const { avm, detail, tax, address, staleClasses, budget } = data;

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Home intelligence</h2>
          <p className="truncate text-xs text-muted-foreground">{address}</p>
        </div>
        <button
          onClick={() => {
            setRefreshTick((t) => t + 1);
            refetch();
          }}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <IntelCard
          icon={TrendingUp}
          label="Estimated value"
          primary={fmtMoney(avm?.estimate ?? null)}
          secondary={
            avm?.low != null && avm?.high != null
              ? `${fmtMoney(avm.low)} – ${fmtMoney(avm.high)}`
              : avm?.asOf ?? "—"
          }
          stale={staleClasses.includes("avm")}
        />
        <IntelCard
          icon={Home}
          label="Property"
          primary={
            detail?.sqft != null ? `${detail.sqft.toLocaleString()} sqft` : "—"
          }
          secondary={
            detail
              ? `${detail.beds ?? "?"} bd · ${detail.baths ?? "?"} ba${
                  detail.yearBuilt ? ` · ${detail.yearBuilt}` : ""
                }`
              : "—"
          }
          stale={staleClasses.includes("detail")}
        />
        <IntelCard
          icon={Receipt}
          label="Assessed / tax"
          primary={fmtMoney(tax?.assessedTotal ?? null)}
          secondary={
            tax?.taxAmount != null
              ? `${fmtMoney(tax.taxAmount)}/yr${tax.taxYear ? ` (${tax.taxYear})` : ""}`
              : "—"
          }
          stale={staleClasses.includes("tax")}
        />
      </div>

      {budget?.cacheOnly && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Showing cached data — monthly data budget cap reached.
        </p>
      )}
    </div>
  );
}

function IntelCard({
  icon: Icon,
  label,
  primary,
  secondary,
  stale,
}: {
  icon: typeof Home;
  label: string;
  primary: string;
  secondary: string;
  stale?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        {stale && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Cached
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight">{primary}</p>
      <p className="text-xs text-muted-foreground">{secondary}</p>
    </div>
  );
}
