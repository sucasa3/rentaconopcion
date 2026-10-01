import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, Phone, Sparkles } from "lucide-react";
import { AGENT_RESEND_COOLDOWN_MS, CHECK_MESSAGES } from "@/lib/agent-phone-challenge";
import { z } from "zod";
import { BusinessShell } from "@/components/business-shell";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import {
  claimAgentFree,
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
  // Paid accounts already have capacity; only unclaimed, unpaid accounts see the free-100 flow.
  const needsClaim = d ? !d.capacity.hasFree && d.capacity.total === 0 : false;
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const scrollToUpload = () =>
    setTimeout(() => document.getElementById("discovery-upload")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <header>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-opportunity">
              <Sparkles className="h-3.5 w-3.5" /> Discovery
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t("adisc.v2.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("adisc.v2.sub")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("adisc.v2.signals")}</p>
          </header>

          {d && (
            <div className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <p className="text-sm font-semibold">
                {needsClaim
                  ? t("adisc.v2.free_available")
                  : t("adisc.capacity", { active: d.capacity.active, total: d.capacity.total })}
              </p>
              {!needsClaim && <p className="mt-1 text-xs text-muted-foreground">{t("adisc.capacity_note")}</p>}
            </div>
          )}

          {d && needsClaim && (
            <VerifyPhone
              portfolioId={id}
              smsReady={d.smsReady}
              verified={Boolean(d.identity?.verified)}
              last4={d.identity?.phoneLast4 ?? null}
              phoneUsed={Boolean(d.identity?.phoneUsed)}
              onVerified={refresh}
              onClaimed={() => {
                refresh();
                scrollToUpload();
              }}
            />
          )}
          {d && d.capacity.hasFree && (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-status-positive">
              <CheckCircle2 className="h-4 w-4" />{" "}
              {d.capacity.freeGranted === 100
                ? t("adisc.v2.ready")
                : t("adisc.v2.ready_n", { count: d.capacity.freeGranted })}
            </p>
          )}

          {overCapacity && d && <KeepProfiles portfolioId={id} total={d.capacity.total} onDone={refresh} />}

          <div id="discovery-upload" className="scroll-mt-20 scroll-mb-28">
            <BulkClientUpload
              onCsv={(csv) => upload.mutate(csv)}
              busy={upload.isPending}
              title={t("adisc.upload_cta")}
              hint={t("adisc.v2.upload_hint")}
              columnsLabel={t("adisc.v2.columns")}
              footer={<p className="mt-3 text-xs text-muted-foreground">{t("adisc.consent_note")}</p>}
            />
          </div>

          {upload.isPending && (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("adisc.v2.processing")}
            </p>
          )}

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
                  <div key={k} className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-3 py-2">
                    <dt className="min-w-0 text-muted-foreground">{t(label)}</dt>
                    <dd className="shrink-0 font-semibold tabular-nums">{r[k] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {d && (
            <section className="rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-semibold">{t("adisc.top_title")}</h2>
              {d.top.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t("adisc.top_note")}</p>}
              {d.top.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {d.hasRun || d.capacity.active > 0 ? t("adisc.v2.no_results") : t("adisc.v2.before_upload")}
                </p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {d.top.map((c, i) => (
                    <li key={c.clientId} className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-status-opportunity">
                            {i + 1}. {c.categoryLabel}
                          </p>
                          <p className="mt-0.5 break-words font-semibold">{c.name}</p>
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

function VerifyPhone({
  portfolioId,
  smsReady,
  verified,
  last4,
  phoneUsed,
  onVerified,
  onClaimed,
}: {
  portfolioId: string;
  smsReady: boolean;
  verified: boolean;
  last4: string | null;
  phoneUsed: boolean;
  onVerified: () => void;
  onClaimed: () => void;
}) {
  const t = useT();
  const sendFn = useServerFn(sendAgentPhoneCode);
  const confirmFn = useServerFn(confirmAgentPhone);
  const claimFn = useServerFn(claimAgentFree);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [claimFailed, setClaimFailed] = useState(false);
  const [testOnly, setTestOnly] = useState(false);
  const [usedNow, setUsedNow] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldownUntil <= now) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [cooldownUntil, now]);
  const wait = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const digits = phone.replace(/\D/g, "");
  const masked = `(•••) •••-${digits.slice(-4)}`;

  const send = useMutation({
    mutationFn: () => sendFn({ data: { phone } }),
    onSuccess: (r) => {
      if (r.sent) {
        setSent(true);
        setCode("");
        setCooldownUntil(Date.now() + AGENT_RESEND_COOLDOWN_MS);
        setNow(Date.now());
        setTimeout(() => codeRef.current?.focus(), 50);
      } else toast.error(t(`adisc.send.${r.reason}` as any), { description: (r as any).detail });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { portfolioId } }),
    onSuccess: (r) => {
      if (r.outcome === "granted" || r.outcome === "already_entitled") {
        setClaimFailed(false);
        toast.success(t("adisc.v2.claimed"));
        onClaimed();
      } else if (r.outcome === "verified_only") {
        setTestOnly(true);
      } else if (r.outcome === "phone_used" || r.outcome === "user_used" || r.outcome === "org_used") {
        setUsedNow(true);
        setClaimFailed(false);
        onVerified();
      } else setClaimFailed(true);
    },
    onError: () => setClaimFailed(true),
  });
  const confirm = useMutation({
    mutationFn: () => confirmFn({ data: { portfolioId, phone, code } }),
    onSuccess: () => {
      onVerified();
      claim.mutate();
    },
    onError: (e: any) => {
      const reason = (Object.keys(CHECK_MESSAGES) as (keyof typeof CHECK_MESSAGES)[]).find((k) => CHECK_MESSAGES[k] === e?.message);
      toast.error(reason ? t(`adisc.check.${reason}` as any) : e.message);
    },
  });

  const input = "mt-1 w-full rounded-full border border-border bg-background px-3 py-2 text-base sm:text-sm";

  // Phone already verified server-side; only the claim remains.
  if (verified) {
    return (
      <section className="rounded-3xl border border-primary/30 bg-card p-4 shadow-soft sm:p-5">
        <p className="inline-flex items-center gap-2 text-base font-semibold">
          <CheckCircle2 className="h-4 w-4 text-status-positive" /> {t("adisc.v2.phone_verified")}
          {last4 ? <span className="text-sm font-normal text-muted-foreground">· {last4}</span> : null}
        </p>
        {testOnly ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("adisc.v2.test_account")}</p>
        ) : phoneUsed || usedNow ? (
          <p className="mt-2 text-sm text-destructive">{t("adisc.phone_used")}</p>
        ) : (
          <>
            {claimFailed && <p className="mt-2 text-sm text-destructive">{t("adisc.v2.claim_failed")}</p>}
            <Button className="mt-3 min-h-11 w-full sm:w-auto" disabled={claim.isPending} onClick={() => claim.mutate()}>
              {claim.isPending && <Loader2 className="animate-spin" />}
              {claimFailed ? t("adisc.v2.retry") : t("adisc.v2.unlock")}
            </Button>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-primary/30 bg-card p-4 shadow-soft sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold">
        <Phone className="h-4 w-4 shrink-0 text-primary" /> {t("adisc.verify_title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("adisc.verify_body")}</p>
      {!smsReady && <p className="mt-2 text-sm text-destructive">{t("adisc.sms_unavailable")}</p>}
      {!sent ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="text-xs text-muted-foreground">
            {t("adisc.phone")}
            <input
              className={input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <Button
            className="min-h-11 self-end"
            disabled={!smsReady || digits.length < 10 || send.isPending || wait > 0}
            onClick={() => send.mutate()}
          >
            {send.isPending && <Loader2 className="animate-spin" />}
            {wait > 0 ? t("adisc.v2.resend_in", { s: wait }) : t("adisc.send_code")}
          </Button>
        </div>
      ) : (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6 && !confirm.isPending && !claim.isPending) confirm.mutate();
          }}
        >
          <label className="block text-sm text-muted-foreground">
            {t("adisc.v2.code_sent", { masked })}
            <input
              ref={codeRef}
              className={`${input} tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onPaste={(e) => {
                const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                if (p) {
                  e.preventDefault();
                  setCode(p);
                }
              }}
            />
          </label>
          <Button
            type="submit"
            className="min-h-11 w-full"
            disabled={code.length !== 6 || confirm.isPending || claim.isPending}
          >
            {(confirm.isPending || claim.isPending) && <Loader2 className="animate-spin" />}
            {t("adisc.v2.verify_unlock")}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
            <button
              type="button"
              className="min-h-11 font-medium text-primary"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              {t("adisc.v2.change")}
            </button>
            <button
              type="button"
              className="min-h-11 font-medium text-primary disabled:text-muted-foreground"
              disabled={wait > 0 || send.isPending}
              onClick={() => send.mutate()}
            >
              {wait > 0 ? t("adisc.v2.resend_in", { s: wait }) : t("adisc.v2.resend")}
            </button>
          </div>
        </form>
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
