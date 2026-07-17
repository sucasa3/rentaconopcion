import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAttomSpend } from "@/lib/property-intel.functions";
import { DollarSign } from "lucide-react";

export function AttomSpendPanel() {
  const fetchSpend = useServerFn(getAttomSpend);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attom-spend"],
    queryFn: () => fetchSpend(),
    staleTime: 60_000,
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">ATTOM spend</h2>
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <DollarSign className="h-4 w-4" />
        </span>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="mt-4 text-sm text-muted-foreground">Admins only.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Calls this month"
              value={`${data?.budget?.calls_used ?? 0} / ${data?.budget?.tier_calls_included ?? 0}`}
            />
            <Stat
              label="Spend"
              value={`$${(((data?.budget?.cost_cents_used ?? 0) as number) / 100).toFixed(2)}`}
            />
            <Stat
              label="Mode"
              value={data?.budget?.cache_only_mode ? "Cache-only" : "Live"}
            />
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent calls
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Endpoint</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Cache</th>
                    <th className="px-3 py-2 font-medium">Cost</th>
                    <th className="px-3 py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent ?? []).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{r.endpoint}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.revenue_source ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.cache_hit ? "hit" : "miss"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        ${((r.cost_cents ?? 0) / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                  {(data?.recent ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No calls yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
