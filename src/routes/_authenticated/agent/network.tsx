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
      { title: "Lender Network & Approvals — SuCasa" },
      {
        name: "description",
        content:
          "Approve lender introductions, campaign audiences, and sponsorships for your client book.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentNetwork,
});

type Tab = "intros" | "campaigns" | "connections" | "sponsorships" | "credits";

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
  const [tab, setTab] = useState<Tab>("intros");

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
              Lender network
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing about your clients is shared until you approve it here. Lenders see only
              de-identified opportunity volume in your book.
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
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : status === "pending" || status === "invited" || status === "proposed"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}

// --- Introductions ---------------------------------------------------------

function Introductions({ orgId, rows }: { orgId: string; rows: any[] }) {
  const respondFn = useServerFn(respondToIntroduction);
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});

  const respond = useMutation({
    mutationFn: (v: { requestId: string; approve: boolean }) =>
      respondFn({
        data: { requestId: v.requestId, approve: v.approve, responseNote: note[v.requestId] || undefined },
      }),
    onSuccess: (r: any) => {
      toast.success(
        r.status === "approved"
          ? "Approved — the lender can now see this client's contact details"
          : "Declined — nothing was shared",
      );
      qc.invalidateQueries({ queryKey: ["agent-introductions", orgId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = rows.filter((r) => r.status === "pending");
  const answered = rows.filter((r) => r.status !== "pending");

  if (!rows.length) {
    return (
      <Empty
        icon={Handshake}
        title="No introduction requests yet"
        hint="When a connected lender spots an opportunity in your book, the request lands here for your approval."
      />
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((r) => (
        <Card key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{r.client_name ?? "Your client"}</p>
            <StatusPill status={r.status} />
            {r.category && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {categoryLabel(r.category)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.lender_org_name} asked for an introduction ·{" "}
            {new Date(r.created_at).toLocaleDateString()}
          </p>
          {r.message && <p className="mt-2 text-sm">{r.message}</p>}

          <textarea
            value={note[r.id] ?? ""}
            onChange={(e) => setNote({ ...note, [r.id]: e.target.value })}
            placeholder="Optional note back to the lender"
            rows={2}
            className="mt-3 w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => respond.mutate({ requestId: r.id, approve: true })}
              disabled={respond.isPending}
              className="inline-flex items-center gap-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              <Check className="h-3 w-3" /> Approve introduction
            </button>
            <button
              onClick={() => respond.mutate({ requestId: r.id, approve: false })}
              disabled={respond.isPending}
              className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              <X className="h-3 w-3" /> Decline
            </button>
          </div>
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
                <p className="font-medium">{r.client_name ?? "Your client"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.lender_org_name}
                  {r.category ? ` · ${categoryLabel(r.category)}` : ""}
                  {r.responded_at ? ` · ${new Date(r.responded_at).toLocaleDateString()}` : ""}
                </p>
                {r.outcome_note && (
                  <p className="mt-1 text-xs text-muted-foreground">{r.outcome_note}</p>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 sm:mt-0">
                {r.outcome && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {r.outcome}
                  </span>
                )}
                <StatusPill status={r.status} />
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
            <p className="mt-2 text-xs text-emerald-700">
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
