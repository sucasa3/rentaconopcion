import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LenderIntroductionsPanel } from "@/components/lender-introductions-panel";
import { LenderSponsorshipsPanel } from "@/components/lender-sponsorships-panel";
import { LenderCampaignProposalsPanel } from "@/components/lender-campaign-proposals-panel";
import { getLenderNetwork, inviteAgent, listMyOrgs } from "@/lib/network.functions";
import { lenderCategoryLabel } from "@/lib/introductions";
import {
  lenderAggregateOpportunities,
  requestCategoryIntroduction,
} from "@/lib/introductions.functions";
import { ChevronRight, Gift, Handshake, Lock, Mail, Users } from "lucide-react";

/**
 * The full agent-network workspace (agents, introductions, co-branded campaigns,
 * sponsorships). Rendered both as a portfolio tab and on the standalone route.
 */
export function LenderNetworkWorkspace() {
  const orgsFn = useServerFn(listMyOrgs);
  const networkFn = useServerFn(getLenderNetwork);
  const inviteFn = useServerFn(inviteAgent);
  const qc = useQueryClient();

  const { data: orgsData } = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const lenderOrgs = (orgsData?.orgs ?? []).filter((o: any) => o.org_type !== "agent");
  const [orgId, setOrgId] = useState<string>("");
  const activeOrgId = orgId || lenderOrgs[0]?.id || "";

  const { data: net, isLoading } = useQuery({
    queryKey: ["lender-network", activeOrgId],
    queryFn: () => networkFn({ data: { lenderOrgId: activeOrgId } }),
    enabled: !!activeOrgId,
  });

  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [tab, setTab] = useState<"agents" | "introductions" | "campaigns" | "sponsorships">(
    "agents",
  );

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { lenderOrgId: activeOrgId, email: inviteEmail } }),
    onSuccess: (res: any) => {
      if (res?.emailed) toast.success("Invitation sent by email");
      else
        toast.success(
          `Invitation saved${res?.emailError ? " — but the email couldn't be delivered" : ""}`,
        );
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["lender-network", activeOrgId] });
    },

    onError: (e: any) => toast.error(e.message),
  });

  const totals = net?.totals;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Homeowner opportunities inside connected agents' books. Identities stay hidden until the
        agent approves an introduction.
      </p>

      {lenderOrgs.length > 1 && (
        <select
          value={activeOrgId}
          onChange={(e) => setOrgId(e.target.value)}
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        >
          {lenderOrgs.map((o: any) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["agents", "Agents"],
            ["introductions", "Introductions"],
            ["campaigns", "Co-branded campaigns"],
            ["sponsorships", "Sponsorships"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              tab === key
                ? "border-transparent gradient-brand text-white"
                : "border-border hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "introductions" && <LenderIntroductionsPanel orgId={activeOrgId} />}
      {tab === "campaigns" && <LenderCampaignProposalsPanel orgId={activeOrgId} />}
      {tab === "sponsorships" && <LenderSponsorshipsPanel orgId={activeOrgId} />}

      {tab === "agents" && (
        <>
          {totals && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Connected agents" value={totals.agents} />
              <Stat label="Homeowners in network" value={totals.homeowners} />
              <Stat label="Open opportunities" value={totals.opportunities} />
            </div>
          )}

          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <p className="text-sm font-semibold">Invite an agent</p>
            <p className="mt-1 text-xs text-muted-foreground">
              They accept from their own dashboard. You'll only ever see de-identified rows.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="agent@brokerage.com"
                className="rounded-full border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={!inviteEmail || !activeOrgId || invite.isPending}
                onClick={() => invite.mutate()}
                className="inline-flex items-center justify-center gap-1 rounded-full gradient-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Mail className="h-3 w-3" /> {invite.isPending ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Loading network…</p>}

          {net && net.agents.length === 0 && (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <Handshake className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No agent connections yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Invite an agent above to start seeing opportunity volume in their book.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {(net?.agents ?? []).map((a: any) => (
              <AgentCard
                key={a.connection_id}
                agent={a}
                lenderOrgId={activeOrgId}
                open={openAgent === a.connection_id}
                onToggle={() => setOpenAgent(openAgent === a.connection_id ? null : a.connection_id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function AgentCard({
  agent,
  lenderOrgId,
  open,
  onToggle,
}: {
  agent: any;
  lenderOrgId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const connected = agent.status === "connected" && agent.agent_org_id;
  const categories = Object.entries(agent.by_category ?? {}) as [string, number][];

  return (
    <div className="rounded-3xl border border-border bg-card shadow-soft">
      <button
        onClick={() => connected && onToggle()}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{agent.agent_org_name}</p>
            <StatusPill status={agent.status} />
          </div>
          <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {agent.homeowner_count} homeowners
            </span>
            <span>{agent.opportunity_count} open opportunities</span>
          </p>
          {categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categories.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {lenderCategoryLabel(k)} · {v}
                </span>
              ))}
            </div>
          )}
        </div>
        {connected && (
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
      </button>

      {connected && (
        <div className="px-5 pb-4">
          <p className="rounded-2xl bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
            Agent accounts and their Home Profiles come from SuCasa. Your subscription funds
            homeowner memberships and your own intelligence — never an agent&apos;s account.
          </p>
        </div>
      )}


      {open && connected && (
        <OpportunityList lenderOrgId={lenderOrgId} agentOrgId={agent.agent_org_id} />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "connected"
      ? "border-status-positive/30 bg-status-positive/10 text-status-positive"
      : status === "invited"
        ? "border-status-attention/30 bg-status-attention/10 text-status-attention"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

/**
 * Anonymous opportunities inside a connected agent's book.
 *
 * A lender sees a broad category and a count — nothing else. There are no rows
 * to open, no geography, no bands, no scores and no timestamps, so a count can
 * never be narrowed down to a person. Small populations are withheld entirely.
 */
function OpportunityList({
  lenderOrgId,
  agentOrgId,
}: {
  lenderOrgId: string;
  agentOrgId: string;
}) {
  const listFn = useServerFn(lenderAggregateOpportunities);
  const requestFn = useServerFn(requestCategoryIntroduction);
  const qc = useQueryClient();
  const key = ["network-aggregate", lenderOrgId, agentOrgId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { lenderOrgId, agentOrgId } }),
  });

  const ask = useMutation({
    mutationFn: (category: string) =>
      requestFn({ data: { lenderOrgId, agentOrgId, category: category as any } }),
    onSuccess: () => {
      toast.success("The agent has your request. They decide whether to offer an introduction.");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["lender-introductions", lenderOrgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = data?.categories ?? [];

  return (
    <div className="border-t border-border px-5 py-4">
      <p className="flex items-start gap-1 text-[11px] text-muted-foreground">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" /> Anonymous opportunities. You can tell this agent
        you're available for a type of conversation. No homeowner is identified to you unless a
        homeowner accepts an introduction.
      </p>

      {isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading opportunities…</p>}
      {!isLoading && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No anonymous opportunities in this book right now.
        </p>
      )}

      <div className="mt-3 space-y-2">
        {rows.map((o: any) => (
          <div
            key={o.category}
            className="rounded-2xl border border-border p-4 sm:flex sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {o.suppressed
                  ? o.label
                  : `${o.count} ${o.count === 1 ? "client" : "clients"} · ${o.label}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{o.explanation}</p>
              {o.suppressed && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The count is withheld because the group is too small to stay anonymous.
                </p>
              )}
            </div>

            <div className="mt-3 shrink-0 sm:mt-0">
              <button
                onClick={() => ask.mutate(o.category)}
                disabled={ask.isPending}
                className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Handshake className="h-3 w-3" /> Request an introduction
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
