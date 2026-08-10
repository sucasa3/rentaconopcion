import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listIntroductions,
  recordIntroductionOutcome,
  revealIntroduction,
  withdrawIntroduction,
} from "@/lib/network.functions";
import { categoryLabel } from "@/lib/opportunities";
import { Eye, Handshake, Mail, Phone, MapPin } from "lucide-react";

const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "meeting_set", label: "Meeting set" },
  { value: "closed", label: "Closed" },
  { value: "no_fit", label: "No fit" },
] as const;

/** Lender-side view of every introduction it has requested. */
export function LenderIntroductionsPanel({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listIntroductions);
  const { data, isLoading } = useQuery({
    queryKey: ["introductions", orgId],
    queryFn: () => listFn({ data: { orgId } }),
    enabled: !!orgId,
  });

  const rows = (data?.requests ?? []) as any[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading introductions…</p>;
  if (!rows.length)
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <Handshake className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No introduction requests yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Open a connected agent's book and request an introduction on an opportunity.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <IntroRow key={r.id} row={r} orgId={orgId} />
      ))}
    </div>
  );
}

function IntroRow({ row, orgId }: { row: any; orgId: string }) {
  const qc = useQueryClient();
  const revealFn = useServerFn(revealIntroduction);
  const outcomeFn = useServerFn(recordIntroductionOutcome);
  const withdrawFn = useServerFn(withdrawIntroduction);
  const [contact, setContact] = useState<any>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["introductions", orgId] });

  const reveal = useMutation({
    mutationFn: () => revealFn({ data: { requestId: row.id } }),
    onSuccess: (c: any) => setContact(c),
    onError: (e: any) => toast.error(e.message),
  });

  const setOutcome = useMutation({
    mutationFn: (outcome: string) =>
      outcomeFn({ data: { requestId: row.id, outcome: outcome as any } }),
    onSuccess: () => {
      toast.success("Outcome saved");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawFn({ data: { requestId: row.id } }),
    onSuccess: () => {
      toast.success("Request withdrawn");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{row.agent_org_name}</p>
        <StatusPill status={row.status} />
        {row.category && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {categoryLabel(row.category)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Requested {new Date(row.created_at).toLocaleDateString()}
        {row.responded_at && ` · answered ${new Date(row.responded_at).toLocaleDateString()}`}
      </p>

      {row.status === "pending" && (
        <button
          onClick={() => withdraw.mutate()}
          disabled={withdraw.isPending}
          className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
        >
          Withdraw request
        </button>
      )}

      {row.status === "approved" && (
        <div className="mt-3 space-y-3">
          {!contact ? (
            <button
              onClick={() => reveal.mutate()}
              disabled={reveal.isPending}
              className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Eye className="h-3 w-3" />
              {reveal.isPending ? "Revealing…" : "Reveal contact"}
            </button>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">{contact.name ?? "Homeowner"}</p>
              <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                {contact.email && (
                  <p className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {contact.email}
                  </p>
                )}
                {contact.phone && (
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {contact.phone}
                  </p>
                )}
                {contact.address && (
                  <p className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[contact.address, contact.city, contact.state, contact.zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                This reveal is logged and shared with the agent.
              </p>
            </div>
          )}

          <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
            Outcome
            <select
              value={row.outcome ?? ""}
              disabled={setOutcome.isPending}
              onChange={(e) => e.target.value && setOutcome.mutate(e.target.value)}
              className="mt-1 w-full max-w-xs rounded-full border border-border bg-background px-3 py-1.5 text-sm normal-case tracking-normal text-foreground"
            >
              <option value="">Not recorded</option>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : status === "pending"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}
