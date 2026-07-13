import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGhlSyncStatus, backfillGhl, drainGhlQueue } from "@/lib/ghl.functions";

export function GhlSyncPanel() {
  const qc = useQueryClient();
  const status = useServerFn(getGhlSyncStatus);
  const drain = useServerFn(drainGhlQueue);
  const backfill = useServerFn(backfillGhl);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ghl-status"],
    queryFn: () => status(),
    refetchInterval: 15000,
  });

  const [msg, setMsg] = useState<string | null>(null);

  const drainMut = useMutation({
    mutationFn: () => drain({ data: { limit: 25 } }),
    onSuccess: (r) => {
      setMsg(`Processed ${r.processed}, errors ${r.errors}`);
      qc.invalidateQueries({ queryKey: ["ghl-status"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });
  const backfillMut = useMutation({
    mutationFn: () => backfill(),
    onSuccess: (r) => {
      setMsg(`Queued ${r.queued} homeowners`);
      qc.invalidateQueries({ queryKey: ["ghl-status"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">GoHighLevel sync</h2>
          <p className="mt-1 text-xs text-muted-foreground">Homeowners lifecycle pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => drainMut.mutate()}
            disabled={drainMut.isPending}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {drainMut.isPending ? "Draining…" : "Drain now"}
          </button>
          <button
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            className="rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {backfillMut.isPending ? "Queuing…" : "Backfill all"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Pending in queue" value={isLoading ? "…" : String(data?.pending ?? 0)} />
        <Stat label="Recent failures" value={isLoading ? "…" : String(data?.failed?.length ?? 0)} />
      </div>

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{(error as Error).message}</p>}

      {!!data?.failed?.length && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent errors
          </p>
          <ul className="space-y-1 text-xs">
            {data.failed.slice(0, 5).map((f) => (
              <li key={f.id} className="truncate rounded-lg bg-muted px-3 py-2">
                <span className="font-mono">{f.entity_id.slice(0, 8)}</span> · attempts {f.attempts} ·{" "}
                <span className="text-destructive">{f.last_error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
