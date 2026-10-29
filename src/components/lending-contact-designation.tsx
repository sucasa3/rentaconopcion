import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLendingDesignation, setLendingDesignation } from "@/lib/lending-partner.functions";

/**
 * Agent-only: choose (or remove) the loan officer homeowners see as "your
 * agent's lending contact" on their Value & Equity page. Lenders cannot set
 * or override this.
 */
export function LendingContactDesignation({ agentOrgId }: { agentOrgId: string }) {
  const getFn = useServerFn(getLendingDesignation);
  const setFn = useServerFn(setLendingDesignation);
  const qc = useQueryClient();
  const key = ["lending-designation", agentOrgId];
  const { data } = useQuery({ queryKey: key, queryFn: () => getFn({ data: { agentOrgId } }) });

  const save = useMutation({
    mutationFn: (connectionId: string | null) => setFn({ data: { agentOrgId, connectionId } }),
    onSuccess: (_r, id) => {
      toast.success(id ? "Lending contact confirmed" : "Lending contact removed");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!data || data.options.length === 0) return null;
  const current = data.current;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-primary/10 p-2 text-primary">
          <Landmark className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your lending contact for homeowners</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Homeowners who connected their account with you will see this loan officer on
            their Value &amp; Equity page, with a note that they're free to choose any lender.
            Nothing is shared unless the homeowner asks for a conversation. This is your
            choice alone — it isn't tied to any plan, sponsorship or payment, and you can
            change or remove it anytime.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {data.options.map((o) => {
          const selected = current?.connectionId === o.connectionId;
          return (
            <div
              key={o.connectionId}
              className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{o.name ?? "Loan officer"}</p>
                <p className="text-xs text-muted-foreground">
                  {[o.company, o.nmls ? `NMLS #${o.nmls}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {selected ? (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    Your lending contact
                  </span>
                  <Button variant="outline"
                    onClick={() => save.mutate(null)}
                    disabled={save.isPending}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button variant="outline"
                  onClick={() => save.mutate(o.connectionId)}
                  disabled={save.isPending || !o.name}
                  className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                >
                  {current ? "Switch to this contact" : "Confirm as my lending contact"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
