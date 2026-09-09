import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCapacity,
  setAgentAllocation,
  setLenderReserve,
  endSponsorship,
} from "@/lib/capacity.functions";
import { cn } from "@/lib/utils";

const PRESETS = [50, 100, 250] as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CapacityWorkspace({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const capacityFn = useServerFn(getCapacity);
  const allocFn = useServerFn(setAgentAllocation);
  const reserveFn = useServerFn(setLenderReserve);
  const endFn = useServerFn(endSponsorship);

  const [editing, setEditing] = useState<{ seatId: string; name: string; current: number } | null>(null);
  const [amount, setAmount] = useState("");
  const [reserveDraft, setReserveDraft] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["capacity", orgId],
    queryFn: () => capacityFn({ data: { orgId } }),
    enabled: Boolean(orgId),
  });

  const summary = (data as any)?.summary;
  const agents = ((data as any)?.agents ?? []) as any[];
  const refresh = () => void qc.invalidateQueries({ queryKey: ["capacity", orgId] });

  const save = useMutation({
    mutationFn: (v: { seatId: string; allocation: number }) =>
      allocFn({ data: { orgId, seatId: v.seatId, allocation: v.allocation } }),
    onSuccess: () => {
      toast.success("Allocation updated");
      setEditing(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveReserve = useMutation({
    mutationFn: (reserve: number) => reserveFn({ data: { orgId, reserve } }),
    onSuccess: () => {
      toast.success("Reserve updated");
      setReserveDraft(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = useMutation({
    mutationFn: (seatId: string) => endFn({ data: { orgId, seatId } }),
    onSuccess: (r: any) => {
      toast.success(
        `Sponsorship ended. The agent keeps their Home Profiles and has ${r.graceDays} days to choose what's next.`,
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bar = useMemo(() => {
    if (!summary?.totalCapacity) return { used: 0, allocated: 0 };
    return {
      used: (summary.lenderUsed / summary.totalCapacity) * 100,
      allocated: (summary.agentAllocated / summary.totalCapacity) * 100,
    };
  }, [summary]);

  if (isLoading || !summary) {
    return <p className="text-sm text-muted-foreground">Loading your capacity…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total capacity" value={summary.totalCapacity.toLocaleString()} />
        <Stat label="Lender used" value={summary.lenderUsed.toLocaleString()} />
        <Stat label="Agent allocated" value={summary.agentAllocated.toLocaleString()} />
        <Stat label="Agent used" value={summary.agentUsed.toLocaleString()} />
        <Stat
          label="Available"
          value={summary.available.toLocaleString()}
          hint={`${summary.agentSeatsUsed} of ${summary.agentSeatsCap} agent seats in use`}
        />
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="flex h-full">
          <div className="bg-primary" style={{ width: `${bar.used}%` }} />
          <div className="bg-growth" style={{ width: `${bar.allocated}%` }} />
        </div>
      </div>

      {(summary.atLimit || summary.approachingLimit) && (
        <Card className={cn(summary.atLimit ? "border-destructive/40" : "border-status-attention/40")}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {summary.atLimit
                ? "You've reached your Home Profile limit. New profiles are paused until you upgrade, add capacity, or archive profiles you no longer work."
                : "You're close to your Home Profile limit."}
            </span>
            <Button asChild size="sm" variant={summary.atLimit ? "default" : "outline"}>
              <a href="/lender/billing">Upgrade or add capacity</a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Lender-owned reserve</CardTitle>
          {reserveDraft == null ? (
            <Button size="sm" variant="outline" onClick={() => setReserveDraft(String((data as any).org.reservedProfiles ?? 0))}>
              Change
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-24"
                inputMode="numeric"
                value={reserveDraft}
                onChange={(e) => setReserveDraft(e.target.value.replace(/\D/g, ""))}
              />
              <Button size="sm" onClick={() => saveReserve.mutate(Number(reserveDraft || 0))}>
                <Check className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Keep some of the pool back for your own imports. Optional — leave it at zero to allocate
          everything freely. Currently {(data as any).org.reservedProfiles ?? 0}.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Sponsored agents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {agents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sponsored agents yet. Sponsor an agent from your network to share capacity.
            </p>
          )}
          {agents.map((a) => (
            <div
              key={a.seatId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
            >
              <div>
                <p className="font-medium">{a.agentName}</p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {a.used.toLocaleString()} / {a.allocated.toLocaleString()} profiles used
                </p>
                {a.status === "grace" && a.graceUntil && (
                  <Badge variant="secondary" className="mt-1">
                    Grace until {new Date(a.graceUntil).toLocaleDateString()}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing({ seatId: a.seatId, name: a.agentName, current: a.allocated });
                    setAmount(String(a.allocated));
                  }}
                >
                  Change allocation
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate(a.seatId)}
                >
                  End sponsorship
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Allocate profiles to {editing?.name}</DialogTitle>
            <DialogDescription>
              {summary.available.toLocaleString()} available in your pool. Lowering an allocation
              never deletes anyone&apos;s records.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(p))}
                className={cn(
                  "rounded-2xl border p-3 text-center text-sm font-semibold transition",
                  amount === String(p) ? "border-primary bg-primary/5" : "border-border",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="Custom amount"
          />
          <Button
            disabled={save.isPending || amount === ""}
            onClick={() => editing && save.mutate({ seatId: editing.seatId, allocation: Number(amount) })}
          >
            {save.isPending ? "Saving…" : "Save allocation"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
