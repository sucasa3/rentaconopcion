import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideAgentIdentityReview, listAgentIdentityReviews } from "@/lib/agent-discovery.functions";

/** Admin queue for agent free-allowance reviews (shared phone, matching license). Every decision needs a note and is audited. */
export function AgentIdentityReviewPanel() {
  const listFn = useServerFn(listAgentIdentityReviews);
  const decideFn = useServerFn(decideAgentIdentityReview);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agent-identity-reviews"], queryFn: () => listFn() });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (v: { reviewId: string; decision: "approve_grant" | "deny" | "dismiss" }) =>
      decideFn({ data: { ...v, note: notes[v.reviewId] ?? "" } }),
    onSuccess: () => {
      toast.success("Decision saved");
      qc.invalidateQueries({ queryKey: ["agent-identity-reviews"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const rows = q.data ?? [];
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h2 className="text-base font-semibold">Agent free-allowance reviews</h2>
      <p className="mt-1 text-xs text-muted-foreground">Shared phone numbers or matching licenses. Approving grants the free 100 once.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No reviews.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((r: any) => (
            <li key={r.id} className="rounded-2xl border border-border p-3 text-sm">
              <p className="font-semibold">
                {r.kind} · <span className="text-muted-foreground">{r.status}</span>
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                user {r.user_id}
                {r.related_user_id ? ` · related ${r.related_user_id}` : ""} · {new Date(r.created_at).toLocaleDateString()}
              </p>
              {r.status === "open" ? (
                <div className="mt-2 space-y-2">
                  <input
                    className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Reason (required)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(["approve_grant", "deny", "dismiss"] as const).map((dc) => (
                      <Button
                        key={dc}
                        size="sm"
                        variant={dc === "approve_grant" ? "default" : "outline"}
                        disabled={decide.isPending || (notes[r.id] ?? "").trim().length < 3}
                        onClick={() => decide.mutate({ reviewId: r.id, decision: dc })}
                      >
                        {dc === "approve_grant" ? "Approve grant" : dc === "deny" ? "Deny" : "Dismiss"}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-xs">
                  {r.decision} — {r.decision_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
