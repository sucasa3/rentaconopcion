import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { lenderAcceptedIntroduction, listLenderIntroductions } from "@/lib/introductions.functions";
import { LENDER_STATE_LABEL, type IntroductionState } from "@/lib/introductions";
import { Handshake, Mail, MessageSquare, Phone } from "lucide-react";

/**
 * Lender-side view of every introduction it has asked for.
 *
 * There is no homeowner here until the homeowner says yes. No name, initials,
 * email, phone, address, property or financial detail appears in any row before
 * `Homeowner accepted`, and the server refuses to return one.
 */
export function LenderIntroductionsPanel({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listLenderIntroductions);
  const { data, isLoading } = useQuery({
    queryKey: ["lender-introductions", orgId],
    queryFn: () => listFn({ data: { lenderOrgId: orgId } }),
    enabled: !!orgId,
  });

  const rows = (data?.rows ?? []) as any[];

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading introductions…</p>;
  if (!rows.length)
    return (
      <div className="rounded-3xl border border-dashed border-border p-8 text-center">
        <Handshake className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No introduction requests yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You can tell a connected agent you're available for a type of financing conversation. The
          agent decides whether to offer the introduction, and the homeowner decides whether to
          accept. No homeowner information is shared unless they accept.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <IntroRow key={r.id} row={r} />
      ))}
    </div>
  );
}

const CHANNEL_ICON = { call: Phone, text: MessageSquare, email: Mail } as const;

function IntroRow({ row }: { row: any }) {
  const detailFn = useServerFn(lenderAcceptedIntroduction);
  const [detail, setDetail] = useState<any>(null);

  const load = useMutation({
    mutationFn: () => detailFn({ data: { introductionId: row.id } }),
    onSuccess: (d: any) => setDetail(d),
    onError: (e: any) => toast.error(e.message),
  });

  const accepted = row.state === "homeowner_accepted" || row.state === "connection_active";

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{row.agent_org_name}</p>
        <StatusPill state={row.state} />
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {row.category_label}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Requested {new Date(row.requested_at).toLocaleDateString()}
        {row.accepted_at && ` · accepted ${new Date(row.accepted_at).toLocaleDateString()}`}
      </p>

      {!accepted && (
        <p className="mt-3 text-xs text-muted-foreground">
          {row.state === "lender_requested" &&
            "The agent is reviewing. No homeowner has been identified to you."}
          {row.state === "agent_offered" &&
            "The agent offered the introduction to their client. Nothing is shared until the homeowner accepts."}
          {row.state === "agent_declined" && "The agent did not offer this introduction."}
          {row.state === "homeowner_declined" && "The homeowner chose not to connect."}
          {row.state === "permission_revoked" &&
            "The homeowner withdrew permission. Please stop contacting them about this."}
        </p>
      )}

      {accepted && (
        <div className="mt-3 space-y-3">
          {!detail ? (
            <button
              onClick={() => load.mutate()}
              disabled={load.isPending}
              className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {load.isPending ? "Opening…" : "Open accepted introduction"}
            </button>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">{detail.homeowner_name ?? "Homeowner"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Asked to talk about {String(detail.category_label).toLowerCase()}
              </p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {(detail.authorized_channels as string[]).map((c) => {
                  const Icon = CHANNEL_ICON[c as keyof typeof CHANNEL_ICON];
                  const value = c === "email" ? detail.email : detail.phone;
                  return (
                    <p key={c} className="flex items-center gap-1">
                      <Icon className="h-3 w-3" />
                      <span className="capitalize">{c}</span>: {value ?? "—"}
                    </p>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Only the channels above are authorized. This is not Home Profile access: property,
                equity, mortgage and document information stay with the homeowner.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: IntroductionState }) {
  const tone =
    state === "homeowner_accepted" || state === "connection_active"
      ? "border-status-positive/30 bg-status-positive/10 text-status-positive"
      : state === "lender_requested" || state === "agent_offered"
        ? "border-status-attention/30 bg-status-attention/10 text-status-attention"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {LENDER_STATE_LABEL[state] ?? state}
    </span>
  );
}
