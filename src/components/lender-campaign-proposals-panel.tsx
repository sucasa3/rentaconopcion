import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Megaphone, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import {
  getLenderNetwork,
  listCampaignApprovals,
  proposeCampaignAudience,
} from "@/lib/network.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { OPPORTUNITY_CATEGORIES, categoryLabel } from "@/lib/opportunities";

/**
 * Lender half of agent-approved campaigns: propose a co-branded campaign to a
 * connected agent's homeowners in one opportunity category. Nothing sends until
 * the agent approves the audience — the lender never sees who is in it.
 */
export function LenderCampaignProposalsPanel({ orgId }: { orgId: string }) {
  const networkFn = useServerFn(getLenderNetwork);
  const approvalsFn = useServerFn(listCampaignApprovals);
  const campaignsFn = useServerFn(listCampaigns);
  const proposeFn = useServerFn(proposeCampaignAudience);
  const qc = useQueryClient();

  const { data: net } = useQuery({
    queryKey: ["lender-network", orgId],
    queryFn: () => networkFn({ data: { lenderOrgId: orgId } }),
    enabled: !!orgId,
  });
  const { data: approvals, isLoading } = useQuery({
    queryKey: ["campaign-approvals", orgId],
    queryFn: () => approvalsFn({ data: { orgId } }),
    enabled: !!orgId,
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-catalog"],
    queryFn: () => campaignsFn(),
  });

  const connectedAgents = (net?.agents ?? []).filter(
    (a: any) => a.status === "connected" && a.agent_org_id,
  );

  const [agentOrgId, setAgentOrgId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const propose = useMutation({
    mutationFn: () =>
      proposeFn({
        data: {
          lenderOrgId: orgId,
          agentOrgId,
          campaignId,
          category: category || null,
          note: note || undefined,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r.proposed_count
          ? `Proposed to ${r.proposed_count} homeowner${r.proposed_count === 1 ? "" : "s"} — awaiting agent approval`
          : "Proposed — the agent has no matching homeowners right now",
      );
      setNote("");
      qc.invalidateQueries({ queryKey: ["campaign-approvals", orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canPropose = !!orgId && !!agentOrgId && !!campaignId && !propose.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Propose a co-branded campaign</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a connected agent and an opportunity segment. The agent reviews the audience and the
          exact email, and can approve everyone, a subset, or decline. Nothing sends without their
          approval on record.
        </p>

        {connectedAgents.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Connect with an agent first — proposals go to connected agents only.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={agentOrgId}
                onChange={(e) => setAgentOrgId(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select agent…</option>
                {connectedAgents.map((a: any) => (
                  <option key={a.agent_org_id} value={a.agent_org_id}>
                    {a.agent_org_name ?? a.name ?? "Agent"}
                  </option>
                ))}
              </select>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select campaign…</option>
                {(campaigns ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">All open opportunities</option>
                {OPPORTUNITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={600}
              placeholder="Note for the agent (optional) — why this segment, what the email offers."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              disabled={!canPropose}
              onClick={() => propose.mutate()}
              className="inline-flex items-center gap-1.5 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              {propose.isPending ? "Sending…" : "Send for approval"}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <p className="text-sm font-semibold">Proposal history</p>
        {isLoading && <p className="mt-2 text-xs text-muted-foreground">Loading proposals…</p>}
        {!isLoading && (approvals?.approvals ?? []).length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No campaign proposals yet.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {(approvals?.approvals ?? []).map((a: any) => (
            <li
              key={a.id}
              className="rounded-2xl border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.campaign_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {a.agent_org_name} · {a.category ? categoryLabel(a.category) : "All opportunities"}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {a.status === "approved"
                  ? `${a.approved_count} of ${a.proposed_count} homeowners approved`
                  : `${a.proposed_count} homeowners proposed`}
              </p>
              {a.note && <p className="mt-1 text-xs italic text-muted-foreground">"{a.note}"</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { icon: any; className: string; label: string }> = {
    pending: {
      icon: Clock,
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      label: "Awaiting agent",
    },
    approved: {
      icon: CheckCircle2,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      label: "Approved",
    },
    declined: {
      icon: XCircle,
      className: "border-border bg-muted text-muted-foreground",
      label: "Declined",
    },
  };
  const meta = map[status] ?? map.pending;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}
