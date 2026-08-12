import { Home, TrendingUp, Receipt, RefreshCw, MapPin } from "lucide-react";
import { useState } from "react";

import { useActivityLog } from "@/hooks/use-activity-log";
import { useHomeIntel } from "@/hooks/use-home-intel";
import { valueStatusMessage } from "@/lib/home-value";
import { CompleteAddressCard } from "@/components/complete-address-card";

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function HomeIntelPanel() {
  const [editingAddress, setEditingAddress] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const logActivity = useActivityLog();
  const { intel: data, raw, isLoading, isError, refresh } = useHomeIntel();

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading home intelligence…</p>
      </div>
    );
  }

  if (isError || !data) {
    const err = raw && !raw.ok ? raw.error : "Could not load home intelligence.";
    if (err === "incomplete_address") {
      return <CompleteAddressCard />;
    }
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

  const { avm, detail, tax, address, staleClasses, budget, value, valueStatus } = data;


  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Home intelligence</h2>
          <button
            onClick={() => setEditingAddress((v) => !v)}
            className="flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{address}</span>
          </button>
        </div>
        <button
          onClick={() => {
            logActivity("value_refreshed");
            setRefreshTick((t) => t + 1);
            refetch();
          }}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {editingAddress && (
        <div className="mt-4">
          <CompleteAddressCard compact mode="edit" />
        </div>
      )}


      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <IntelCard
          icon={TrendingUp}
          label="Estimated value"
          primary={fmtMoney(avm?.estimate ?? tax?.marketTotal ?? tax?.assessedTotal ?? null)}
          secondary={
            avm?.low != null && avm?.high != null
              ? `${fmtMoney(avm.low)} – ${fmtMoney(avm.high)}`
              : avm?.estimate == null && (tax?.marketTotal ?? tax?.assessedTotal) != null
                ? "From assessor records"
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
