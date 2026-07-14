import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLeadRoutingOverview, adminForceReassign, runLeadTick } from "@/lib/leads.functions";
import { Clock, RefreshCw, Zap } from "lucide-react";

export function AdminLeadsPanel() {
  const overview = useServerFn(getLeadRoutingOverview);
  const reassign = useServerFn(adminForceReassign);
  const tick = useServerFn(runLeadTick);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-routing"],
    queryFn: () => overview(),
    refetchInterval: 10000,
  });

  const reassignMut = useMutation({
    mutationFn: (requestId: string) => reassign({ data: { requestId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["lead-routing"] }),
  });
  const tickMut = useMutation({
    mutationFn: () => tick(),
    onSettled: () => qc.invalidateQueries({ queryKey: ["lead-routing"] }),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Lead routing</h2>
          <p className="mt-1 text-xs text-muted-foreground">Round-robin per category + zip · 25-min SLA</p>
        </div>
        <button
          onClick={() => tickMut.mutate()}
          disabled={tickMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${tickMut.isPending ? "animate-spin" : ""}`} /> Run tick
        </button>
      </div>

      {tickMut.data && (
        <p className="mt-3 text-xs text-muted-foreground">
          Expired {tickMut.data.expired} · Requeued {tickMut.data.requeued} · Newly routed {tickMut.data.routed}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{(error as Error).message}</p>}
      {isLoading && <p className="mt-3 text-xs text-muted-foreground">Loading…</p>}

      {data && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Section title={`Unrouted (${data.unrouted.length})`} icon={<Zap className="h-3.5 w-3.5" />}>
            {!data.unrouted.length ? <Empty>No unrouted requests.</Empty> : (
              <ul className="space-y-2">
                {data.unrouted.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-border p-3 text-xs">
                    <p className="font-semibold">{r.category}</p>
                    <p className="text-muted-foreground">{[r.city, r.zip].filter(Boolean).join(", ") || "no location"}</p>
                    <button
                      onClick={() => reassignMut.mutate(r.id)}
                      disabled={reassignMut.isPending}
                      className="mt-2 rounded-full gradient-brand px-3 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                    >
                      Route now
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`In flight (${data.liveOffers.length})`} icon={<Clock className="h-3.5 w-3.5" />}>
            {!data.liveOffers.length ? <Empty>No pending offers.</Empty> : (
              <ul className="space-y-2">
                {data.liveOffers.map((o) => {
                  const req = o.service_requests as unknown as { category: string; city: string | null; zip: string | null };
                  const pro = o.pros as unknown as { business_name: string };
                  const ms = new Date(o.expires_at).getTime() - Date.now();
                  const mins = Math.max(0, Math.floor(ms / 60000));
                  return (
                    <li key={o.id} className="rounded-2xl border border-border p-3 text-xs">
                      <p className="font-semibold">{req.category} · {[req.city, req.zip].filter(Boolean).join(", ")}</p>
                      <p className="text-muted-foreground">→ {pro.business_name} · pos {o.position} · {mins}m left</p>
                      <button
                        onClick={() => reassignMut.mutate(o.service_request_id)}
                        disabled={reassignMut.isPending}
                        className="mt-2 rounded-full border border-border px-3 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-50"
                      >
                        Force reassign
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={`Recent claims (${data.recentClaims.length})`}>
            {!data.recentClaims.length ? <Empty>No claims yet.</Empty> : (
              <ul className="space-y-2">
                {data.recentClaims.map((c) => {
                  const req = c.service_requests as unknown as { category: string; city: string | null; zip: string | null };
                  const pro = c.pros as unknown as { business_name: string };
                  return (
                    <li key={c.id} className="rounded-2xl border border-border p-3 text-xs">
                      <p className="font-semibold">{req.category} · {[req.city, req.zip].filter(Boolean).join(", ")}</p>
                      <p className="text-muted-foreground">Claimed by {pro.business_name} · {new Date(c.claimed_at).toLocaleString()}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}
      {reassignMut.error && (
        <p className="mt-3 text-xs text-destructive">{(reassignMut.error as Error).message}</p>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </p>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-background px-3 py-4 text-center text-xs text-muted-foreground">{children}</p>;
}
