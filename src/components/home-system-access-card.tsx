import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";
import {
  getMyHomeSystemState,
  listHomeSystemAccess,
  setHomeSystemAccess,
} from "@/lib/home-maintenance.functions";
import { HomeSystemHistory } from "@/components/home-system-history";
import { Button } from "@/components/ui/button";
import {
  applyReportProposals,
  previewReportReplacements,
  listPendingAgentReports,
  listReportProposals,
  listMaintenanceProposals,
  respondToAgentReport,
} from "@/lib/inspection-batch.functions";

/** Homeowner-only control: which agent team may view/update home systems. Default off. */
/** Translate a data-driven key, falling back to readable text when no label exists. */
function tl(t: (k: any, v?: any) => string, key: string, fallback: string) {
  const v = t(key as any);
  return v === key ? fallback : v;
}

export function HomeSystemAccessCard() {
  const t = useT();
  const qc = useQueryClient();
  const listFn = useServerFn(listHomeSystemAccess);
  const setFn = useServerFn(setHomeSystemAccess);
  const stateFn = useServerFn(getMyHomeSystemState);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: options } = useQuery({
    queryKey: ["home-system-access"],
    queryFn: () => listFn(),
  });
  const { data: state } = useQuery({
    queryKey: ["home-system-state"],
    queryFn: () => stateFn(),
  });

  async function toggle(orgId: string, orgName: string, enabled: boolean) {
    setBusy(orgId);
    try {
      const res = await setFn({ data: { orgId, enabled } });
      if (!res.ok) throw new Error();
      qc.setQueryData(["home-system-access"], (prev: typeof options) =>
        prev?.map((o) => (o.orgId === orgId ? { ...o, enabled } : o)),
      );
      toast.success(t(enabled ? "hs.access.saved_on" : "hs.access.saved_off", { org: orgName }));
      await qc.invalidateQueries({ queryKey: ["home-system-access"] });
    } catch {
      toast.error(t("hs.save_failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" /> {t("hmh.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hmh.desc")}</p>
        {options && options.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{t("hs.access.none")}</p>
        )}
        <ul className="mt-3 space-y-3">
          {(options ?? []).map((o) => (
            <li key={o.orgId} className="flex items-start justify-between gap-3">
              <label htmlFor={`hsa-${o.orgId}`} className="min-w-0 text-sm">
                <span className="font-medium">{t("hmh.toggle", { org: o.orgName })}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("hs.access.members", { count: o.memberCount })}
                  {o.enabled && o.grantedAt
                    ? ` · ${t("hs.access.on_since", { date: new Date(o.grantedAt).toLocaleDateString() })}`
                    : ""}
                </span>
                {o.enabled && o.connected && !o.documents && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("hmh.legacy")}{" "}
                    <button
                      className="font-medium text-primary underline"
                      disabled={busy === o.orgId}
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(o.orgId, o.orgName, true);
                      }}
                    >
                      {t("hmh.expand")}
                    </button>
                  </span>
                )}
                {!o.connected && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("hs.access.needs_connection")}
                  </span>
                )}
              </label>
              <Switch
                id={`hsa-${o.orgId}`}
                checked={o.enabled && o.connected}
                disabled={busy === o.orgId || (!o.connected && !o.enabled)}
                onCheckedChange={(v) => toggle(o.orgId, o.orgName, v)}
                className="mt-1 shrink-0"
              />
            </li>
          ))}
        </ul>
      </section>

      <AgentReports />

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-base font-semibold">{t("hs.history.title")}</h2>
        <div className="mt-2">
          <HomeSystemHistory items={state?.history ?? []} />
        </div>
      </section>
    </div>
  );
}

/** Homeowner review of agent-contributed inspection reports: pending permission + suggested updates. */
function AgentReports() {
  const t = useT();
  const qc = useQueryClient();
  const pendingFn = useServerFn(listPendingAgentReports);
  const propsFn = useServerFn(listReportProposals);
  const respondFn = useServerFn(respondToAgentReport);
  const applyFn = useServerFn(applyReportProposals);
  const previewFn = useServerFn(previewReportReplacements);
  const [busy, setBusy] = useState<string | null>(null);
  const [replace, setReplace] = useState<Record<string, string[]>>({});
  const [choices, setChoices] = useState<Record<string, Record<string, Choice>>>({});
  const maintFn = useServerFn(listMaintenanceProposals);
  const pending = useQuery({ queryKey: ["agent-reports-pending"], queryFn: () => pendingFn() });
  const proposals = useQuery({ queryKey: ["agent-report-proposals"], queryFn: () => propsFn() });
  const refresh = () =>
    Promise.all(
      [["agent-reports-pending"], ["agent-report-proposals"], ["home-system-access"], ["home-system-state"], ["home-predicted-actions"], ["maint-proposals"]].map((k) =>
        qc.invalidateQueries({ queryKey: k }),
      ),
    );

  async function respond(fileId: string, choice: "add_once" | "add_and_allow" | "decline") {
    setBusy(fileId);
    try {
      const r = await respondFn({ data: { fileId, choice } });
      if (!r.ok) throw new Error();
      await refresh();
    } catch {
      toast.error(t("hs.save_failed"));
    } finally {
      setBusy(null);
    }
  }
  async function apply(documentId: string, yes: boolean) {
    setBusy(documentId);
    try {
      const actions = Object.entries(choices[documentId] ?? {}).map(([key, c]) => ({ key, ...c }));
      const r: any = await applyFn({ data: { documentId, apply: yes, replace: replace[documentId] ?? [], actions } });
      if (!r.ok) throw new Error();
      if (yes && r.plan)
        toast.success(t("mp.result", { created: r.plan.created.length, updated: r.plan.updated.length, kept: r.plan.kept.length }));
      else if (yes) toast.success(t("hmh.prop.applied"));
      await refresh();
    } catch {
      toast.error(t("hs.save_failed"));
    } finally {
      setBusy(null);
    }
  }

  const p: Array<{ id: string; filename: string; orgName: string }> = pending.data ?? [];
  const pr: Array<{ id: string; filename: string | null; inspectionDate: string | null; findings: any[] }> = proposals.data ?? [];
  if (!p.length && !pr.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      {p.length > 0 && (
        <>
          <h2 className="text-base font-semibold">{t("hmh.pending.title")}</h2>
          <ul className="mt-3 space-y-4">
            {p.map((r) => (
              <li key={r.id} className="text-sm">
                <p>{t("hmh.pending.desc", { org: r.orgName, file: r.filename })}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy === r.id} onClick={() => respond(r.id, "add_once")}>
                    {t("hmh.pending.add_once")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => respond(r.id, "add_and_allow")}>
                    {t("hmh.pending.add_allow")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => respond(r.id, "decline")}>
                    {t("hmh.pending.decline")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {pr.length > 0 && (
        <>
          <h2 className={`text-base font-semibold ${p.length ? "mt-6" : ""}`}>{t("hmh.prop.title")}</h2>
          <ul className="mt-3 space-y-4">
            {pr.map((d) => (
              <li key={d.id} className="text-sm">
                <p className="text-xs font-medium text-muted-foreground">{t("hmh.added_by_agent")}</p>
                <p>{t("hmh.prop.desc", { file: d.filename ?? "", date: d.inspectionDate ?? "—" })}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {d.findings.slice(0, 8).map((f: any, i: number) => (
                    <li key={i}>
                      <span className="font-medium">{tl(t, `insp.sys.${f.system}`, String(f.system ?? "").replace(/_/g, " "))}</span>
                      {f.condition ? ` · ${tl(t, `insp.cond.${f.condition}`, String(f.condition).replace(/_/g, " "))}` : ""}
                      {f.installed_year ? ` · ${f.installed_year}` : ""}
                      {f.recommended_action ? ` — ${f.recommended_action}` : ""}
                      {f.source_pages?.length ? ` (${t("mp.page", { pages: f.source_pages.join(", ") })})` : ""}
                    </li>
                  ))}
                </ul>
                <MaintenanceReview
                  documentId={d.id}
                  filename={d.filename ?? ""}
                  inspectionDate={d.inspectionDate}
                  fetchFn={maintFn}
                  value={choices[d.id] ?? {}}
                  onChange={(v) => setChoices((c) => ({ ...c, [d.id]: v }))}
                />
                <Replacements
                  documentId={d.id}
                  previewFn={previewFn}
                  selected={replace[d.id] ?? []}
                  onChange={(keys) => setReplace((r) => ({ ...r, [d.id]: keys }))}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy === d.id} onClick={() => apply(d.id, true)}>
                    {t("hmh.prop.apply")}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => apply(d.id, false)}>
                    {t("hmh.prop.dismiss")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Populated values a report would replace: shown side by side, opt-in per system. */
function Replacements({ documentId, previewFn, selected, onChange }: { documentId: string; previewFn: any; selected: string[]; onChange: (k: string[]) => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["report-replacements", documentId], queryFn: () => previewFn({ data: { documentId } }) });
  const rows: Array<{ key: string; current: number; proposed: number }> = q.data?.needsApproval ?? [];
  const fills: string[] = q.data?.fills ?? [];
  if (!rows.length && !fills.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
      {fills.length > 0 && <p className="text-muted-foreground">{t("hmh.prop.fill_note")}</p>}
      {rows.length > 0 && (
        <>
          <p className={`font-medium ${fills.length ? "mt-2" : ""}`}>{t("hmh.prop.replace_title")}</p>
          <ul className="mt-2 space-y-2">
            {rows.map((r) => (
              <li key={r.key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={selected.includes(r.key)}
                    onChange={(e) => onChange(e.target.checked ? [...selected, r.key] : selected.filter((k) => k !== r.key))}
                  />
                  <span>
                    {t("hmh.prop.replace_check")} — {t("hmh.prop.replace_row", { system: r.key, current: String(r.current), proposed: String(r.proposed) })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type Choice = { selected: boolean; title?: string; dueBy?: string | null; acceptChange: boolean };

/** Homeowner review of proposed maintenance tasks: select, edit, and accept changes to existing tasks. */
function MaintenanceReview({ documentId, filename, inspectionDate, fetchFn, value, onChange }: {
  documentId: string; filename: string; inspectionDate: string | null; fetchFn: any;
  value: Record<string, Choice>; onChange: (v: Record<string, Choice>) => void;
}) {
  const t = useT();
  const q = useQuery({ queryKey: ["maint-proposals", documentId], queryFn: () => fetchFn({ data: { documentId } }) });
  const rows: any[] = q.data?.proposals ?? [];
  if (!rows.length) return null;
  const get = (k: string): Choice => value[k] ?? { selected: false, acceptChange: false };
  const set = (k: string, patch: Partial<Choice>) => onChange({ ...value, [k]: { ...get(k), ...patch } });
  return (
    <div className="mt-3 rounded-lg border border-border p-3 text-xs">
      <p className="text-sm font-medium">{t("mp.title")}</p>
      <p className="text-muted-foreground">{t("mp.desc")}</p>
      <p className="mt-1 text-muted-foreground">{t("mp.source", { file: filename, date: inspectionDate ?? "—" })}</p>
      <ul className="mt-2 space-y-3">
        {rows.map((r) => {
          const c = get(r.key);
          const locked = r.kind === "same" || r.kind === "kept";
          return (
            <li key={r.key} className="rounded-md bg-muted/40 p-2">
              <div className="flex items-start gap-2">
                <input type="checkbox" aria-label={t("mp.select", { title: r.title })} className="mt-0.5 h-4 w-4 accent-primary" disabled={locked}
                  checked={!locked && c.selected} onChange={(e) => set(r.key, { selected: e.target.checked })} />
                <span className="min-w-0 flex-1">
                  {c.selected && !locked ? (
                    <input aria-label={r.title} className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                      value={c.title ?? r.title} maxLength={200} onChange={(e) => set(r.key, { title: e.target.value })} />
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                  <span className="mt-0.5 block text-muted-foreground">
                    {r.urgency ? t(`mp.urgency.${r.urgency}` as any) : t("pa.u.none")}
                    {r.sourcePages?.length ? ` · ${t("mp.page", { pages: r.sourcePages.join(", ") })}` : ""}
                  </span>
                  {r.needsConfirmation && <span className="mt-0.5 block font-medium text-status-attention">{t("mp.confirm")}</span>}
                  {c.selected && !locked && (
                    <span className="mt-1 flex items-center gap-2">
                      <span className="text-muted-foreground">{t("mp.due")}</span>
                      <input type="date" className="rounded border border-border bg-background px-2 py-0.5"
                        value={(c.dueBy === undefined ? r.dueBy : c.dueBy) ?? ""}
                        onChange={(e) => set(r.key, { dueBy: e.target.value || null })} />
                    </span>
                  )}
                  {r.kind === "update" && (
                    <span className="mt-1 block">
                      {t("mp.kind.update")}
                      {r.existing.urgency !== (r.urgency ?? r.existing.urgency) && (
                        <span className="block">{t("mp.change", { field: t("mp.urgency_field"), from: t(`pa.u.${r.existing.urgency}` as any), to: t(`pa.u.${r.urgency}` as any) })}</span>
                      )}
                      {r.existing.dueBy !== (r.dueBy ?? r.existing.dueBy) && (
                        <span className="block">{t("mp.change", { field: t("mp.due"), from: r.existing.dueBy ?? "—", to: r.dueBy })}</span>
                      )}
                      <label className="mt-1 flex items-center gap-2">
                        <input type="checkbox" className="h-4 w-4 accent-primary" checked={c.acceptChange}
                          onChange={(e) => set(r.key, { acceptChange: e.target.checked, selected: e.target.checked || c.selected })} />
                        {t("mp.accept_change")}
                      </label>
                    </span>
                  )}
                  {r.kind === "same" && <span className="mt-1 block text-muted-foreground">{t("mp.kind.same")}</span>}
                  {r.kind === "kept" && <span className="mt-1 block text-muted-foreground">{t("mp.kind.kept")}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
