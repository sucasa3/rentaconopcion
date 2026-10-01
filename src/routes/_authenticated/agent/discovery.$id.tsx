import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Phone, Sparkles } from "lucide-react";
import { z } from "zod";
import { BusinessShell } from "@/components/business-shell";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  confirmAgentPhone,
  getAgentDiscovery,
  importAgentPending,
  keepAgentProfiles,
  listAgentActiveProfiles,
  sendAgentPhoneCode,
  startAgentUpgrade,
  uploadAgentDiscovery,
} from "@/lib/agent-discovery.functions";
import { syncSubscription } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/agent/discovery/$id")({
  validateSearch: z.object({
    checkout: z.enum(["success", "cancelled"]).optional(),
    session_id: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Agent Discovery — SuCasa" },
      { name: "description", content: "Find new reasons to reconnect with your database." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentDiscovery,
});

function AgentDiscovery() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const t = useT();
  const qc = useQueryClient();
  const key = ["agent-discovery", id];
  const getFn = useServerFn(getAgentDiscovery);
  const uploadFn = useServerFn(uploadAgentDiscovery);
  const pendingFn = useServerFn(importAgentPending);
  const upgradeFn = useServerFn(startAgentUpgrade);
  const syncFn = useServerFn(syncSubscription);

  const q = useQuery({ queryKey: key, queryFn: () => getFn({ data: { portfolioId: id } }) });
  const d = q.data;

  // Returning from checkout: sync once; the webhook is the source of truth.
  useEffect(() => {
    if (search.checkout !== "success" || !d?.orgId) return;
    syncFn({ data: { orgId: d.orgId } })
      .catch(() => undefined)
      .finally(() => {
        toast.success(t("adisc.upgraded"));
        qc.invalidateQueries({ queryKey: key });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.checkout, d?.orgId]);

  const upload = useMutation({
    mutationFn: (csv: string) => uploadFn({ data: { portfolioId: id, csv } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });
  const pending = useMutation({
    mutationFn: () => pendingFn({ data: { portfolioId: id } }),
    onSuccess: (r) => {
      toast.success(t("adisc.import_done", { inserted: r.inserted, pending: r.stillPending }));
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const upgrade = useMutation({
    mutationFn: (planKey: "agent" | "agent_growth") =>
      upgradeFn({ data: { portfolioId: id, planKey, returnUrl: `${window.location.origin}/agent/discovery/${id}` } }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
    },
    onError: (e: any) => toast.error(e.message),
  });

  const r = d?.report as Record<string, number> | null | undefined;
  const overCapacity = d ? d.capacity.active > d.capacity.total && d.capacity.hasFree : false;

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <header>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-opportunity">
              <Sparkles className="h-3.5 w-3.5" /> Discovery
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t("adisc.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("adisc.sub")}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("adisc.consent_note")}</p>
          </header>

          {d && (
            <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <p className="text-sm font-semibold">
                {t("adisc.capacity", { active: d.capacity.active, total: d.capacity.total })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("adisc.capacity_note")}</p>
            </div>
          )}

          {d && !d.capacity.hasFree && <VerifyPhone portfolioId={id} smsReady={d.smsReady} onDone={() => qc.invalidateQueries({ queryKey: key })} />}
          {d?.identity?.verified && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-status-positive" />
              {t("adisc.verified_as", { last4: d.identity.phoneLast4 })}
            </p>
          )}

          {overCapacity && d && <KeepProfiles portfolioId={id} total={d.capacity.total} onDone={() => qc.invalidateQueries({ queryKey: key })} />}

          <BulkClientUpload
            onCsv={(csv) => upload.mutate(csv)}
            busy={upload.isPending}
            title={t("adisc.upload_cta")}
          />

          {r && (
            <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-semibold">{t("adisc.report_title")}</h2>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {(
                  [
                    ["imported", "adisc.r.imported"],
                    ["duplicates", "adisc.r.duplicates"],
                    ["sharedContacts", "adisc.r.shared"],
                    ["needsAddress", "adisc.r.needs_address"],
                    ["excluded", "adisc.r.excluded"],
                    ["optedOut", "adisc.r.opted_out"],
                    ["overAllowance", "adisc.r.over"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between rounded-2xl bg-secondary/60 px-3 py-2">
                    <dt className="text-muted-foreground">{t(label)}</dt>
                    <dd className="font-semibold tabular-nums">{r[k] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {d && (
            <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-semibold">{t("adisc.top_title")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("adisc.top_note")}</p>
              {d.top.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("adisc.top_empty")}</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {d.top.map((c, i) => (
                    <li key={c.clientId} className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-status-opportunity">
                            {i + 1}. {c.categoryLabel}
                          </p>
                          <p className="mt-0.5 font-semibold">{c.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{c.why || c.headline}</p>
                        </div>
                        <Link
                          to="/agent/portfolio/$id"
                          params={{ id }}
                          className="shrink-0 text-xs font-semibold text-primary"
                        >
                          {t("adisc.open")}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {d && d.pendingCount > 0 && (
            <section className="rounded-3xl border border-border bg-surface-warm p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-semibold">{t("adisc.over_title", { count: d.pendingCount })}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("adisc.over_body")}</p>
              {d.capacity.remaining > 0 ? (
                <Button className="mt-4 min-h-11" onClick={() => pending.mutate()} disabled={pending.isPending}>
                  {t("adisc.import_pending", { count: Math.min(d.pendingCount, d.capacity.remaining) })}
                </Button>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {d.plans.map((p: any) => (
                    <div key={p.key} className="rounded-2xl border border-border bg-card p-4">
                      <p className="font-semibold">{p.name}</p>
                      <p className="mt-1 text-2xl font-semibold">
                        ${(p.priceCents / 100).toFixed(0)}
                        <span className="text-sm font-normal text-muted-foreground">{t("adisc.per_month")}</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("adisc.plan_profiles", { count: p.profiles.toLocaleString() })}</p>
                      <Button
                        className="mt-3 min-h-11 w-full"
                        disabled={!p.purchasable || upgrade.isPending || d.planKey === p.key}
                        onClick={() => upgrade.mutate(p.key as "agent" | "agent_growth")}
                      >
                        {p.purchasable ? t("adisc.choose", { name: p.name }) : t("adisc.unavailable")} <ArrowRight />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t("adisc.capacity_note")}</p>
            </section>
          )}

          {d && d.needsAddress.length > 0 && (
            <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-semibold">
                {t("adisc.needs_title")} ({d.needsAddress.length})
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("adisc.needs_body")}</p>
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
                {d.needsAddress.slice(0, 100).map((n, i) => (
                  <li key={i} className="break-words">
                    {n.full_name}
                    {n.email ? <span className="text-muted-foreground"> · {n.email}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </BusinessShell>
  );
}

function VerifyPhone({ portfolioId, smsReady, onDone }: { portfolioId: string; smsReady: boolean; onDone: () => void }) {
  const t = useT();
  const sendFn = useServerFn(sendAgentPhoneCode);
  const confirmFn = useServerFn(confirmAgentPhone);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [lic, setLic] = useState("");
  const [licState, setLicState] = useState("");
  const [sent, setSent] = useState(false);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { phone } }),
    onSuccess: (r) => {
      if (r.sent) setSent(true);
      else toast.error(t(`adisc.send.${r.reason}` as any), { description: (r as any).detail });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const confirm = useMutation({
    mutationFn: () =>
      confirmFn({
        data: { portfolioId, phone, code, licenseNumber: lic || undefined, licenseState: licState || undefined },
      }),
    onSuccess: (r) => {
      if (r.outcome === "granted") toast.success(t("adisc.granted"));
      else if (r.outcome === "already_entitled" || r.outcome === "verified_only") toast.success(t("adisc.already"));
      else toast.error(t("adisc.phone_used"));
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const input = "mt-1 w-full rounded-full border border-border bg-background px-3 py-2 text-sm";
  return (
    <section className="rounded-3xl border border-primary/30 bg-card p-4 shadow-soft sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        <Phone className="h-4 w-4 text-primary" /> {t("adisc.verify_title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("adisc.verify_body")}</p>
      {!smsReady && <p className="mt-2 text-sm text-destructive">{t("adisc.sms_unavailable")}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="text-xs text-muted-foreground">
          {t("adisc.phone")}
          <input className={input} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <Button className="min-h-11 self-end" disabled={!smsReady || !phone || send.isPending} onClick={() => send.mutate()}>
          {t("adisc.send_code")}
        </Button>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_6rem]">
        <label className="text-xs text-muted-foreground">
          {t("adisc.license")}
          <input className={input} value={lic} onChange={(e) => setLic(e.target.value)} />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("adisc.license_state")}
          <input className={input} maxLength={2} value={licState} onChange={(e) => setLicState(e.target.value)} />
        </label>
      </div>
      {sent && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="text-xs text-muted-foreground">
            {t("adisc.code")}
            <input className={input} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <Button className="min-h-11 self-end" disabled={!code || confirm.isPending} onClick={() => confirm.mutate()}>
            {t("adisc.confirm")}
          </Button>
        </div>
      )}
    </section>
  );
}

function KeepProfiles({ portfolioId, total, onDone }: { portfolioId: string; total: number; onDone: () => void }) {
  const t = useT();
  const listFn = useServerFn(listAgentActiveProfiles);
  const keepFn = useServerFn(keepAgentProfiles);
  const list = useQuery({ queryKey: ["agent-active-profiles", portfolioId], queryFn: () => listFn({ data: { portfolioId } }) });
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const save = useMutation({
    mutationFn: () => keepFn({ data: { portfolioId, keepIds: [...keep] } }),
    onSuccess: () => onDone(),
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <section className="rounded-3xl border border-destructive/40 bg-card p-4 shadow-soft sm:p-5">
      <h2 className="text-base font-semibold">{t("adisc.keep_title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("adisc.keep_body", { total })}</p>
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {(list.data ?? []).map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keep.has(p.id)}
                disabled={!keep.has(p.id) && keep.size >= total}
                onChange={(e) => {
                  const next = new Set(keep);
                  if (e.target.checked) next.add(p.id);
                  else next.delete(p.id);
                  setKeep(next);
                }}
              />
              <span className="min-w-0 break-words">
                {p.client_name} <span className="text-muted-foreground">· {p.address_line1}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Button className="mt-3 min-h-11" disabled={save.isPending || keep.size === 0} onClick={() => save.mutate()}>
        {t("adisc.keep_save", { count: keep.size })}
      </Button>
    </section>
  );
}
