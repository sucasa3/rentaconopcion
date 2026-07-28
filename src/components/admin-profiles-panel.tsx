import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, X, RefreshCw, Zap, Shield, Eye, Sparkles } from "lucide-react";
import {
  getProfileDetail,
  listAllProfiles,
  recomputeLifecycleStage,
  resyncProfileToGhl,
  setUserRole,
} from "@/lib/admin.functions";
import { extractInspectionReport, listInspectionFindings } from "@/lib/inspection.functions";
import { DocumentViewerDialog } from "@/components/document-viewer-dialog";

const STAGES = [
  "new_signup",
  "onboarding",
  "active_homeowner",
  "needs_reengagement",
  "premium_member",
  "inactive",
] as const;

const ROLES = ["admin", "homeowner", "pro", "lender"] as const;
type Role = (typeof ROLES)[number];

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function stageTone(stage: string): string {
  if (stage === "active_homeowner" || stage === "premium_member") return "bg-growth/15 text-growth";
  if (stage === "onboarding" || stage === "new_signup") return "bg-primary/10 text-primary";
  if (stage === "needs_reengagement") return "bg-accent text-accent-foreground";
  return "bg-secondary text-muted-foreground";
}

export function AdminProfilesPanel() {
  const listFn = useServerFn(listAllProfiles);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profiles", search, stage, role],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          stage: stage || undefined,
          role: (role || undefined) as Role | undefined,
          limit: 100,
        },
      }),
    staleTime: 15_000,
  });

  const profiles = data?.profiles ?? [];

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">All profiles</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Search, inspect, and take ops actions on any account.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {isLoading ? "…" : `${profiles.length} shown`}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name, or city"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role | "")}
          className="rounded-full border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Roles</th>
              <th className="px-3 py-2 font-medium">Reqs</th>
              <th className="px-3 py-2 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p: any) => (
              <tr
                key={p.id}
                onClick={() => setOpenId(p.id)}
                className="cursor-pointer border-t border-border hover:bg-muted/60"
              >
                <td className="px-3 py-3 font-medium">{p.full_name || "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{p.email || "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageTone(p.lifecycle_stage)}`}
                  >
                    {p.lifecycle_stage.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{p.roles.join(", ") || "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{p.request_count}</td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDate(p.last_activity_at)}</td>
              </tr>
            ))}
            {!isLoading && profiles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No profiles match those filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && <ProfileDrawer userId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ProfileDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getProfileDetail);
  const resyncFn = useServerFn(resyncProfileToGhl);
  const recomputeFn = useServerFn(recomputeLifecycleStage);
  const roleFn = useServerFn(setUserRole);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profile", userId],
    queryFn: () => detailFn({ data: { userId } }),
  });

  const resync = useMutation({
    mutationFn: () => resyncFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Queued for GHL resync");
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const recompute = useMutation({
    mutationFn: () => recomputeFn({ data: { userId } }),
    onSuccess: (r: any) => {
      toast.success(`Lifecycle → ${r.stage}`);
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const role = useMutation({
    mutationFn: (v: { role: Role; action: "grant" | "revoke" }) =>
      roleFn({ data: { userId, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(`${v.action === "grant" ? "Granted" : "Revoked"} ${v.role}`);
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const p = data?.profile;
  const currentRoles: Role[] = (data?.roles ?? []).map((r: any) => r.role);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Profile</p>
            <h3 className="mt-0.5 text-xl font-semibold">{p?.full_name || "—"}</h3>
            <p className="text-sm text-muted-foreground">{p?.email || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-border hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading || !p ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => resync.mutate()}
                disabled={resync.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw className="h-3 w-3" /> Resync to GHL
              </button>
              <button
                onClick={() => recompute.mutate()}
                disabled={recompute.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
              >
                <Zap className="h-3 w-3" /> Recompute lifecycle
              </button>
            </div>

            <Section title="Details">
              <Field label="Phone" value={p.phone} />
              <Field label="Address" value={p.address} />
              <Field label="City/State" value={[p.city, p.state, p.zip].filter(Boolean).join(", ")} />
              <Field label="Stage" value={p.lifecycle_stage} />
              <Field label="Joined" value={fmtDate(p.created_at)} />
              <Field label="Last activity" value={fmtDate(p.last_activity_at)} />
              <Field label="GHL synced" value={fmtDate(p.ghl_last_synced_at)} />
              <Field label="Fello synced" value={fmtDate(p.fello_last_synced_at)} />
            </Section>

            <Section title="Roles">
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const has = currentRoles.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() =>
                        role.mutate({ role: r, action: has ? "revoke" : "grant" })
                      }
                      disabled={role.isPending}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
                        has
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Shield className="h-3 w-3" />
                      {r}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title={`Service requests (${data.requests.length})`}>
              {data.requests.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.requests.slice(0, 10).map((r: any) => (
                    <li key={r.id} className="rounded-lg bg-muted px-3 py-2">
                      <span className="font-medium">{r.category}</span> ·{" "}
                      <span className="text-muted-foreground">{r.status}</span> ·{" "}
                      <span className="text-muted-foreground">{fmtDate(r.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Lender consents (${data.consents.length})`}>
              {data.consents.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.consents.map((c: any) => (
                    <li key={c.id} className="rounded-lg bg-muted px-3 py-2">
                      <span className="font-medium">{c.lender_orgs?.name ?? c.lender_org_id}</span> ·{" "}
                      {c.revoked_at ? "revoked" : c.granted_at ? "granted" : "pending"} · {c.scope}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Documents (${data.documents.length})`}>
              {data.documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">None uploaded.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.documents.map((d: any) => (
                    <li key={d.id} className="truncate rounded-lg bg-muted px-3 py-2">
                      <span className="font-medium">{d.kind}</span> · {d.original_filename ?? "file"}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="GHL">
              {data.ghl ? (
                <>
                  <Field label="Contact ID" value={data.ghl.ghl_contact_id} mono />
                  <Field label="Opportunity ID" value={data.ghl.ghl_opportunity_id} mono />
                  <Field label="Last synced" value={fmtDate(data.ghl.last_synced_at)} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Not yet synced.</p>
              )}
            </Section>
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</span>
    </div>
  );
}
