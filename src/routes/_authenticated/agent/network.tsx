import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import { AgentCreditsCard } from "@/components/agent-credits-card";
import {
  endSponsorship,
  getAgentNetwork,
  getSponsorships,
  listCampaignApprovals,
  listIntroductions,
  listMyOrgs,
  respondToCampaignAudience,
  respondToConnectionInvite,
  respondToIntroduction,
} from "@/lib/network.functions";
import {
  addProfessionalToNetwork,
  listMyProfessionalNetwork,
  updateNetworkProfessional,
} from "@/lib/agent-network.functions";
import {
  inviteProfessionalToSucasa,
  listProfessionalInvitations,
  revokeProfessionalInvitation,
} from "@/lib/professional-invitations.functions";
import { INVITATION_STATE_LABEL } from "@/lib/professional-invitations";
import { rankProfessionals } from "@/lib/agent-network";
import { categoryLabel } from "@/lib/opportunities";
import {
  ArrowLeft,
  Check,
  Handshake,
  Mail,
  Sparkles,
  Users,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent/network")({
  head: () => ({
    meta: [
      { title: "Professional Network — SuCasa" },
      {
        name: "description",
        content:
          "The people you work with, and a fast way to complete every client's Home Team.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentNetwork,
});

type Tab = "people" | "intros" | "campaigns" | "connections" | "sponsorships" | "credits";

function AgentNetwork() {
  const orgsFn = useServerFn(listMyOrgs);
  const { data: orgsData } = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const agentOrgs = (orgsData?.orgs ?? []).filter((o: any) => o.org_type === "agent");
  const [orgId, setOrgId] = useState("");
  const activeOrgId = orgId || agentOrgs[0]?.id || "";

  const introsFn = useServerFn(listIntroductions);
  const { data: intros } = useQuery({
    queryKey: ["agent-introductions", activeOrgId],
    queryFn: () => introsFn({ data: { orgId: activeOrgId } }),
    enabled: !!activeOrgId,
  });

  const pending = (intros?.requests ?? []).filter((r: any) => r.status === "pending");
  const [tab, setTab] = useState<Tab>("people");

  return (
    <BusinessShell kind="agent">
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <Link
              to="/agent"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to client lists
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Professional network
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The people you work with, and each client's Home Team. Nothing about a client is
              shared with anyone until you approve it.
            </p>
          </div>


          {agentOrgs.length > 1 && (
            <select
              value={activeOrgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="rounded-full border border-border bg-background px-3 py-2 text-sm"
            >
              {agentOrgs.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}

          {!activeOrgId ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              You're not part of an agent organization yet.
            </div>
          ) : (
            <>
              <nav className="-mx-1 grid grid-cols-2 gap-1 border-b border-border px-1 py-2 sm:flex sm:flex-wrap">
                <TabButton
                  active={tab === "people"}
                  onClick={() => setTab("people")}
                  label="My people"
                />
                <TabButton
                  active={tab === "intros"}
                  onClick={() => setTab("intros")}
                  label="Introductions"
                  count={pending.length}
                />
                <TabButton
                  active={tab === "campaigns"}
                  onClick={() => setTab("campaigns")}
                  label="Campaign approvals"
                />
                <TabButton
                  active={tab === "connections"}
                  onClick={() => setTab("connections")}
                  label="Connections"
                />
                <TabButton
                  active={tab === "sponsorships"}
                  onClick={() => setTab("sponsorships")}
                  label="Sponsorships"
                />
                <TabButton
                  active={tab === "credits"}
                  onClick={() => setTab("credits")}
                  label="Credits"
                />
              </nav>

              {tab === "people" && <MyPeople orgId={activeOrgId} />}
              {tab === "intros" && <Introductions orgId={activeOrgId} rows={intros?.requests ?? []} />}
              {tab === "campaigns" && <CampaignApprovals orgId={activeOrgId} />}
              {tab === "connections" && <Connections agentOrgId={activeOrgId} />}
              {tab === "sponsorships" && <Sponsorships orgId={activeOrgId} />}
              {tab === "credits" && (
                <div className="py-4">
                  <AgentCreditsCard orgId={activeOrgId} />
                </div>
              )}

            </>
          )}
        </div>
      </main>
    </BusinessShell>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {!!count && (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">{children}</div>;
}

function Empty({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border p-8 text-center">
      <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "connected"
      ? "border-status-positive/30 bg-status-positive/10 text-status-positive"
      : status === "pending" || status === "invited" || status === "proposed"
        ? "border-status-attention/30 bg-status-attention/10 text-status-attention"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

// --- Introductions ---------------------------------------------------------

/**
 * The agent's private decision surface.
 *
 * A lender asks about a category, never about a person. Choosing a client here
 * asks THAT CLIENT whether they want the conversation; it discloses nothing to
 * the lender. Declining costs nothing and offering earns nothing — SuCasa pays
 * no credit, capacity, discount or reward for introductions, in either
 * direction.
 */
function Introductions({ orgId, rows }: { orgId: string; rows: any[] }) {
  const respondFn = useServerFn(agentRespondToIntroduction);
  const candidatesFn = useServerFn(introductionCandidates);
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});

  const { data: candidateData, isFetching: loadingCandidates } = useQuery({
    queryKey: ["introduction-candidates", openId],
    queryFn: () => candidatesFn({ data: { introductionId: openId! } }),
    enabled: !!openId,
  });

  const respond = useMutation({
    mutationFn: (v: { id: string; action: "offer" | "not_now" | "decline" }) =>
      respondFn({
        data: {
          introductionId: v.id,
          action: v.action,
          portfolioClientId: v.action === "offer" ? choice[v.id] : undefined,
          note: note[v.id] || undefined,
        },
      }),
    onSuccess: (r: any) => {
      if (r.state === "agent_offered") {
        toast.success(
          r.emailed
            ? "Sent to your client. Nothing is shared with the lender unless they accept."
            : "Offer recorded. Your client could not be emailed — check their email on file.",
        );
      } else if (r.state === "agent_declined") {
        toast.success("Declined. Nothing was shared, and nothing changes for your account.");
      } else {
        toast.success("Left for later. Nothing was shared.");
      }
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["agent-introductions", orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = rows.filter((r) => r.can_respond);
  const answered = rows.filter((r) => !r.can_respond);

  if (!rows.length) {
    return (
      <Empty
        icon={Handshake}
        title="No introduction requests yet"
        hint="SuCasa can identify when clients in your book may benefit from a financing conversation. Connected lenders see only anonymous opportunity counts. If a lender requests a connection, you decide whether to offer the introduction to your client. Their information isn't shared unless they accept."
      />
    );
  }

  const candidates = (candidateData?.candidates ?? []) as any[];

  return (
    <div className="space-y-3">
      {pending.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{r.lender_org_name}</p>
            <span className="rounded-full border border-status-attention/30 bg-status-attention/10 px-2 py-0.5 text-[11px] font-medium text-status-attention">
              Needs your decision
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {r.category_label}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Available for a {String(r.category_label).toLowerCase()} conversation ·{" "}
            {new Date(r.requested_at).toLocaleDateString()}
          </p>
          {r.message && <p className="mt-2 text-sm">{r.message}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            The lender has not been shown any of your clients. If you offer the introduction, SuCasa
            asks that client whether they want the conversation.
          </p>

          {openId !== r.id ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setOpenId(r.id)}
                className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white"
              >
                <Check className="h-3 w-3" /> Offer an introduction
              </button>
              <button
                onClick={() => respond.mutate({ id: r.id, action: "not_now" })}
                disabled={respond.isPending}
                className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                Not now
              </button>
              <button
                onClick={() => respond.mutate({ id: r.id, action: "decline" })}
                disabled={respond.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <X className="h-3 w-3" /> Decline request
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choose one of your clients — only they will be asked
              </p>
              {loadingCandidates && (
                <p className="text-sm text-muted-foreground">Looking at your book…</p>
              )}
              {!loadingCandidates && candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No client in your book matches this type of conversation right now.
                </p>
              )}
              <div className="space-y-2">
                {candidates.map((c) => (
                  <label
                    key={c.portfolio_client_id}
                    className="flex cursor-pointer items-start gap-2 rounded-xl border border-border bg-background p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name={`cand-${r.id}`}
                      className="mt-1"
                      checked={choice[r.id] === c.portfolio_client_id}
                      onChange={() => setChoice({ ...choice, [r.id]: c.portfolio_client_id })}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{c.client_name ?? "Client"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.reason}
                        {!c.has_email && " · no email on file"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <textarea
                value={note[r.id] ?? ""}
                onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
                placeholder="Optional private note for your own records"
                rows={2}
                className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => respond.mutate({ id: r.id, action: "offer" })}
                  disabled={respond.isPending || !choice[r.id]}
                  className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Ask this client
                </button>
                <button
                  onClick={() => setOpenId(null)}
                  className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your client decides. If they say no, ignore it, or change their mind later, the
                lender never receives their information.
              </p>
            </div>
          )}
        </Card>
      ))}

      {answered.length > 0 && (
        <div className="space-y-2">
          <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            History
          </p>
          {answered.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-border p-4 text-sm sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{r.client_name ?? r.lender_org_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.lender_org_name} · {r.category_label}
                  {r.responded_at ? ` · ${new Date(r.responded_at).toLocaleDateString()}` : ""}
                  {r.authorized_channels?.length
                    ? ` · authorized: ${r.authorized_channels.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2 sm:mt-0">
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {AGENT_STATE_LABEL[r.state as IntroductionState] ?? r.state}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Campaign approvals ----------------------------------------------------

function CampaignApprovals({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listCampaignApprovals);
  const respondFn = useServerFn(respondToCampaignAudience);
  const qc = useQueryClient();
  const key = ["agent-campaign-approvals", orgId];

  const { data } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { orgId } }) });

  const respond = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      respondFn({ data: { id: v.id, approve: v.approve } }),
    onSuccess: (r: any) => {
      toast.success(
        r.status === "approved"
          ? `Approved for ${r.approved_count} client${r.approved_count === 1 ? "" : "s"}`
          : "Declined — nothing will send",
      );
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = data?.approvals ?? [];
  if (!rows.length) {
    return (
      <Empty
        icon={Mail}
        title="No campaign audiences proposed"
        hint="Lenders can propose sending a co-branded campaign to part of your book. Nothing sends until you approve it."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r: any) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{r.campaign_name}</p>
            <StatusPill status={r.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.lender_org_name} · {r.proposed_count} proposed recipients
            {r.category ? ` · ${categoryLabel(r.category)}` : ""} ·{" "}
            {new Date(r.created_at).toLocaleDateString()}
          </p>
          {r.note && <p className="mt-2 text-sm">{r.note}</p>}
          {r.status === "approved" && (
            <p className="mt-2 text-xs text-status-positive">
              Approved for {r.approved_count} client{r.approved_count === 1 ? "" : "s"}.
            </p>
          )}

          {r.status === "proposed" || r.status === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => respond.mutate({ id: r.id, approve: true })}
                disabled={respond.isPending}
                className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Check className="h-3 w-3" /> Approve audience
              </button>
              <button
                onClick={() => respond.mutate({ id: r.id, approve: false })}
                disabled={respond.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <X className="h-3 w-3" /> Decline
              </button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

// --- Connections -----------------------------------------------------------

function Connections({ agentOrgId }: { agentOrgId: string }) {
  const netFn = useServerFn(getAgentNetwork);
  const respondFn = useServerFn(respondToConnectionInvite);
  const qc = useQueryClient();
  const key = ["agent-network", agentOrgId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => netFn({ data: { agentOrgId } }),
  });

  const respond = useMutation({
    mutationFn: (v: { connectionId: string; accept: boolean }) =>
      respondFn({ data: { connectionId: v.connectionId, agentOrgId, accept: v.accept } }),
    onSuccess: (r: any) => {
      toast.success(r.status === "connected" ? "Lender connected" : "Invitation declined");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const invites = data?.invites ?? [];
  const partners = data?.partners ?? [];

  return (
    <div className="space-y-4">
      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pending invitations
          </p>
          {invites.map((i: any) => (
            <Card key={i.id}>
              <p className="text-sm font-semibold">{i.lender_org_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Invited you to connect · {new Date(i.created_at).toLocaleDateString()}
              </p>
              {i.message && <p className="mt-2 text-sm">{i.message}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => respond.mutate({ connectionId: i.id, accept: true })}
                  disabled={respond.isPending}
                  className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Check className="h-3 w-3" /> Accept
                </button>
                <button
                  onClick={() => respond.mutate({ connectionId: i.id, accept: false })}
                  disabled={respond.isPending}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  <X className="h-3 w-3" /> Decline
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {partners.length === 0 && invites.length === 0 ? (
        <Empty
          icon={Users}
          title="No lender partners yet"
          hint="When a lender invites you to connect, the invitation appears here."
        />
      ) : (
        <div className="space-y-2">
          {partners.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lender partners
            </p>
          )}
          {partners.map((p: any) => (
            <div
              key={p.connection_id}
              className="rounded-2xl border border-border p-4 sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{p.lender_org_name}</p>
                  <StatusPill status={p.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[p.contact_name, p.contact_phone, p.contact_email].filter(Boolean).join(" · ") ||
                    "No contact details shared"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sponsorships ----------------------------------------------------------

function Sponsorships({ orgId }: { orgId: string }) {
  const listFn = useServerFn(getSponsorships);
  const endFn = useServerFn(endSponsorship);
  const qc = useQueryClient();
  const key = ["agent-sponsorships", orgId];

  const { data } = useQuery({ queryKey: key, queryFn: () => listFn({ data: { orgId } }) });

  const end = useMutation({
    mutationFn: (id: string) => endFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Sponsorship ended — the homeowner profile stays intact");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = data?.sponsorships ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <p className="text-sm font-semibold">Sponsored premium profiles</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A lender partner can cover premium SuCasa for clients in your book. {data?.used ?? 0}{" "}
          active
          {data && data.allocation != null ? ` of ${data.allocation} allocated` : ""}.
        </p>
      </Card>

      {rows.length === 0 ? (
        <Empty
          icon={Sparkles}
          title="No sponsored clients yet"
          hint="Connected lenders can allocate sponsorships from their plan to clients in your book."
        />
      ) : (
        rows.map((s: any) => (
          <div
            key={s.id}
            className="rounded-2xl border border-border p-4 sm:flex sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{s.client_name ?? "Client"}</p>
                <StatusPill status={s.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[s.city, s.state].filter(Boolean).join(", ")} · started{" "}
                {new Date(s.started_at).toLocaleDateString()}
              </p>
            </div>
            {s.status !== "ended" && (
              <button
                onClick={() => end.mutate(s.id)}
                disabled={end.isPending}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60 sm:mt-0"
              >
                End sponsorship
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// --- My people (Professional Network) --------------------------------------

/**
 * The professionals this workspace works with, derived from the canonical
 * `professionals` + `agent_professional_resource` graph. Working with someone
 * says nothing about any client's actual lender.
 */
function MyPeople({ orgId }: { orgId: string }) {
  const listFn = useServerFn(listMyProfessionalNetwork);
  const addFn = useServerFn(addProfessionalToNetwork);
  const updateFn = useServerFn(updateNetworkProfessional);
  const qc = useQueryClient();
  const key = ["my-network", orgId];

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: "", orgNameRaw: "", email: "", phone: "" });

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { orgId } }),
  });

  const reset = () => {
    setForm({ fullName: "", orgNameRaw: "", email: "", phone: "" });
    setAdding(false);
    setEditing(null);
  };

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          orgId,
          fullName: form.fullName,
          orgNameRaw: form.orgNameRaw || null,
          email: form.email || null,
          phone: form.phone || null,
          role: "loan_officer" as const,
        },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r.possibleDuplicates > 0
          ? "Added — a similar person exists, so it's flagged for review"
          : "Added to your network",
      );
      reset();
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (professionalId: string) =>
      updateFn({
        data: {
          orgId,
          professionalId,
          fullName: form.fullName || undefined,
          orgNameRaw: form.orgNameRaw || null,
          email: form.email || null,
          phone: form.phone || null,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      reset();
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const people = rankProfessionals((data?.people ?? []) as any[], { query });

  // Invitation state is a separate lifecycle from the network edge, so it is
  // fetched per professional rather than derived from the roster row.
  const inviteStateFn = useServerFn(listProfessionalInvitations);
  const inviteFn = useServerFn(inviteProfessionalToSucasa);
  const revokeFn = useServerFn(revokeProfessionalInvitation);
  const professionalIds = ((data?.people ?? []) as any[]).map((p) => p.id as string);
  const inviteKey = ["network-invites", orgId, professionalIds.join(",")];

  const { data: inviteData } = useQuery({
    queryKey: inviteKey,
    queryFn: () => inviteStateFn({ data: { orgId, professionalIds } }),
    enabled: professionalIds.length > 0,
  });
  const inviteStates = new Map<string, any>(
    ((inviteData?.states ?? []) as any[]).map((s) => [s.professionalId, s]),
  );

  const refreshInvites = () => qc.invalidateQueries({ queryKey: ["network-invites", orgId] });

  const invite = useMutation({
    mutationFn: (v: { professionalId: string; resend: boolean }) =>
      inviteFn({ data: { orgId, professionalId: v.professionalId, resend: v.resend } }),
    onSuccess: (r: any) => {
      if (r.outcome === "no_email") {
        toast.error("Add an email address for this person first");
      } else if (r.outcome === "already_on_sucasa") {
        toast.success("They're already on SuCasa");
      } else if (r.delivered === false) {
        toast.success("Invitation created — the email will retry shortly");
      } else {
        toast.success("Invitation sent");
      }
      refreshInvites();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) => revokeFn({ data: { orgId, invitationId } }),
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      refreshInvites();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const fields = (
    <div className="space-y-2">
      <input
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        placeholder="Name"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        value={form.orgNameRaw}
        onChange={(e) => setForm({ ...form, orgNameRaw: e.target.value })}
        placeholder="Company (optional)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        placeholder="Email (optional)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        placeholder="Phone (optional)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <Card>
        <div className="sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Complete your clients' Home Teams</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Name each client's loan officer in seconds using the people below.
            </p>
          </div>
          <Link
            to="/agent/home-teams"
            search={{ orgId }}
            className="mt-3 inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white sm:mt-0"
          >
            Start reviewing
          </Link>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search my people"
          className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
        />
        <button
          onClick={() => {
            reset();
            setAdding(true);
          }}
          className="rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted"
        >
          Add professional
        </button>
      </div>

      {adding && (
        <Card>
          <p className="text-sm font-semibold">Add a professional you work with</p>
          <div className="mt-3">{fields}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => add.mutate()}
              disabled={form.fullName.trim().length < 2 || add.isPending}
              className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              Add
            </button>
            <button onClick={reset} className="rounded-full border border-border px-4 py-2 text-xs font-medium">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {people.length === 0 && !adding ? (
        <Empty
          icon={Users}
          title="No people yet"
          hint="Add the loan officers and closing partners you work with, then use them across your clients."
        />
      ) : (
        people.map((p: any) => {
          const inv = inviteStates.get(p.id);
          const state = inv?.state ?? (p.hasSucasaIdentity ? "on_sucasa" : "not_invited");
          return (
          <div key={p.id} className="rounded-2xl border border-border p-4">
            <div className="sm:flex sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{p.full_name}</p>
                  {p.hasSucasaIdentity && (
                    <span className="rounded-full border border-status-positive/30 bg-status-positive/10 px-2 py-0.5 text-[11px] font-medium text-status-positive">
                      On SuCasa
                    </span>
                  )}
                  {p.needsReview && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Needs review
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[p.org_name, ...(p.roles ?? []).map((r: string) => r.replace(/_/g, " "))]
                    .filter(Boolean)
                    .join(" · ") || "Loan officer"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[p.email, p.phone].filter(Boolean).join(" · ") || "No contact details yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.clientCount} of your client{p.clientCount === 1 ? "" : "s"} listed with this
                  person
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 sm:mt-0">
                <Link
                  to="/agent/home-teams"
                  search={{ orgId }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Use for clients
                </Link>
                {state === "not_invited" || state === "declined" || state === "revoked" ? (
                  <button
                    onClick={() => invite.mutate({ professionalId: p.id, resend: false })}
                    disabled={invite.isPending || inv?.hasEmail === false}
                    title={inv?.hasEmail === false ? "Add an email address first" : undefined}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    Invite to SuCasa
                  </button>
                ) : state === "on_sucasa" ? null : (
                  <>
                    <span className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
                      {INVITATION_STATE_LABEL[state as keyof typeof INVITATION_STATE_LABEL]}
                    </span>
                    {inv?.canResend && (
                      <button
                        onClick={() => invite.mutate({ professionalId: p.id, resend: true })}
                        disabled={invite.isPending}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                      >
                        Resend
                      </button>
                    )}
                    {inv?.invitationId && state === "invitation_sent" && (
                      <button
                        onClick={() => revoke.mutate(inv.invitationId)}
                        disabled={revoke.isPending}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                      >
                        Withdraw
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => {
                    setAdding(false);
                    setEditing(p.id);
                    setForm({
                      fullName: p.full_name,
                      orgNameRaw: p.org_name ?? "",
                      email: p.email ?? "",
                      phone: p.phone ?? "",
                    });
                  }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  Edit
                </button>
              </div>

            </div>

            {editing === p.id && (
              <div className="mt-3 border-t border-border pt-3">
                {fields}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => update.mutate(p.id)}
                    disabled={update.isPending}
                    className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    onClick={reset}
                    className="rounded-full border border-border px-4 py-2 text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })
      )}
    </div>
  );
}
