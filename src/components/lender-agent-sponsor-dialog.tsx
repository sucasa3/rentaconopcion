import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSponsoredSeats, sponsorAgent } from "@/lib/credits.functions";
import { cn } from "@/lib/utils";

/**
 * A sponsored seat is the lender's contribution to the flywheel: the agent
 * gets homeowner capacity, the lender gets a place in that agent's network.
 */
export function LenderAgentSponsorDialog({
  lenderOrgId,
  agentOrgId,
  agentName,
  open,
  onOpenChange,
}: {
  lenderOrgId: string;
  agentOrgId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const seatsFn = useServerFn(getSponsoredSeats);
  const sponsorFn = useServerFn(sponsorAgent);
  const [credits, setCredits] = useState<25 | 50>(25);

  const { data } = useQuery({
    queryKey: ["sponsored-seats", lenderOrgId],
    queryFn: () => seatsFn({ data: { lenderOrgId } }),
    enabled: open && !!lenderOrgId,
  });

  const existing = (data?.seats ?? []).find(
    (s: any) => s.agent_org_id === agentOrgId && s.status === "active",
  );
  const remaining = data?.allowance?.remaining ?? null;

  const sponsor = useMutation({
    mutationFn: () => sponsorFn({ data: { lenderOrgId, agentOrgId, credits } }),
    onSuccess: () => {
      toast.success(`${agentName} now has ${credits} sponsored homeowner profiles.`);
      void qc.invalidateQueries({ queryKey: ["sponsored-seats", lenderOrgId] });
      void qc.invalidateQueries({ queryKey: ["lender-network"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not sponsor this agent"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Sponsor {agentName}</DialogTitle>
          <DialogDescription>
            Gift homeowner profiles this agent can hand to past clients and prospects. You stay
            their financing partner as those homeowners activate.
          </DialogDescription>
        </DialogHeader>

        {existing ? (
          <p className="rounded-2xl bg-growth/10 p-4 text-sm text-foreground">
            Already sponsored with {existing.credits_granted} homeowner profiles.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {([25, 50] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCredits(n)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    credits === n ? "border-primary bg-primary/6" : "border-border bg-card",
                  )}
                >
                  <span className="block text-2xl font-semibold tabular-nums">{n}</span>
                  <span className="block text-xs text-muted-foreground">homeowner profiles</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {remaining == null
                ? "Unlimited sponsored seats on your plan."
                : `${remaining} sponsored seats left on your plan.`}
            </p>
            <button
              type="button"
              disabled={sponsor.isPending || (remaining != null && remaining <= 0)}
              onClick={() => sponsor.mutate()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Gift className="h-4 w-4" />
              {sponsor.isPending ? "Sponsoring…" : `Sponsor ${credits} profiles`}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
