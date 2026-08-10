import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { endSponsorship, getSponsorships } from "@/lib/network.functions";
import { Gift } from "lucide-react";

/** Sponsored premium profile capacity and live sponsorships for a sponsoring org. */
export function LenderSponsorshipsPanel({ orgId }: { orgId: string }) {
  const listFn = useServerFn(getSponsorships);
  const endFn = useServerFn(endSponsorship);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sponsorships", orgId],
    queryFn: () => listFn({ data: { orgId } }),
    enabled: !!orgId,
  });

  const end = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Sponsorship ended");
      qc.invalidateQueries({ queryKey: ["sponsorships", orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading sponsorships…</p>;

  const rows = (data?.sponsorships ?? []) as any[];
  const active = rows.filter((r) => r.status !== "ended");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Allocation" value={data?.unlimited ? "Unlimited" : String(data?.allocation ?? 0)} />
        <Stat label="In use" value={String(data?.used ?? 0)} />
        <Stat
          label="Remaining"
          value={data?.unlimited ? "Unlimited" : String(data?.remaining ?? 0)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        You fund premium capacity; the agent chooses which of their clients receives it. Homeowner
        identities stay with the agent.
      </p>

      {active.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center">
          <Gift className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No active sponsorships</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Connected agents can allocate from your capacity in their Network center.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">Sponsored profile</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Started {new Date(r.started_at).toLocaleDateString()} · {r.status}
                </p>
              </div>
              <button
                onClick={() => end.mutate(r.id)}
                disabled={end.isPending}
                className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
              >
                End
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
