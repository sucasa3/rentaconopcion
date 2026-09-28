import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSignalHistory, submitSignalFeedback } from "@/lib/signal-history.functions";
import { useT } from "@/lib/i18n";
import type { EvidenceFact, Signal, SignalType, Confidence } from "@/lib/signal-evidence";

type Audience = "agent" | "lender";
type TFn = ReturnType<typeof useT>;

const usd = (n: unknown) =>
  typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "—";

function fmtDate(d: string | null, t: TFn) {
  if (!d) return t("sig.no_date");
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? t("sig.no_date") : x.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function factText(f: EvidenceFact, t: TFn): string {
  const v = f.values as Record<string, any>;
  switch (f.kind) {
    case "valuation":
      return t("sig.f.valuation", { value: usd(v.value) });
    case "equity":
      return t("sig.f.equity", { value: usd(v.equity) });
    case "value_change": {
      const pct = Number(v.pct ?? 0);
      return t(pct >= 0 ? "sig.f.value_up" : "sig.f.value_down", { pct: Math.abs(pct).toFixed(1), days: v.days ?? "—" });
    }
    case "permit":
      return t("sig.f.permit", { count: v.count ?? 1, date: fmtDate(v.date ?? null, t) });
    case "sale":
      return t("sig.f.sale", { price: usd(v.price) });
    case "listing":
      return t("sig.f.listing", { status: String(v.status ?? "—") });
    case "tax_change":
      return t("sig.f.tax", { pct: Number(v.pct ?? 0).toFixed(1) });
    case "call_outcome":
      return v.nextStep ? `${t("sig.f.outcome", { stage: String(v.stage) })} · ${t("sig.f.next_step", { step: String(v.nextStep) })}` : t("sig.f.outcome", { stage: String(v.stage) });
    case "conversation":
      return v.summary ? t("sig.f.conversation", { summary: String(v.summary) }) : t("sig.f.conversation_empty");
    case "connection_request":
      return t("sig.f.request");
  }
}

export function FactLine({ f, t }: { f: EvidenceFact; t: TFn }) {
  const tags: string[] = [];
  if (f.noActiveLoan) tags.push(t("sig.no_loan"));
  else if (f.estimated) tags.push(t("sig.estimate"));
  if (f.stale) tags.push(t("sig.stale"));
  return (
    <li className="py-2">
      <p className="text-sm text-foreground">{factText(f, t)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {t(`sig.src.${f.source}` as any)} · {fmtDate(f.observedAt, t)}
        {tags.length > 0 && <> · {tags.join(" · ")}</>}
      </p>
    </li>
  );
}

const CONF_CLASS: Record<Confidence, string> = {
  high: "bg-primary/10 text-primary",
  medium: "bg-secondary text-foreground",
  low: "bg-muted text-muted-foreground",
};

export function SignalsPanel({ audience, clientId }: { audience: Audience; clientId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const historyFn = useServerFn(getSignalHistory);
  const feedbackFn = useServerFn(submitSignalFeedback);
  const [type, setType] = useState<SignalType | "all">("all");
  const [conf, setConf] = useState<Confidence | "all">("all");
  const [days, setDays] = useState<0 | 30 | 90>(0);

  const q = useQuery({
    queryKey: ["signal-history", audience, clientId],
    queryFn: () => historyFn({ data: { audience, clientId } }),
    staleTime: 60_000,
  });

  const fb = useMutation({
    mutationFn: (v: { signalType: SignalType; action: "dismiss" | "not_accurate" }) =>
      feedbackFn({ data: { audience, clientId, ...v } }),
    onSuccess: () => {
      toast.success(t("sig.saved"));
      qc.invalidateQueries({ queryKey: ["signal-history", audience, clientId] });
      qc.invalidateQueries({ queryKey: ["supporting-facts"] });
    },
    onError: () => toast.error(t("sig.save_failed")),
  });

  const shown = useMemo(() => {
    const list = (q.data?.signals ?? []) as Signal[];
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    return list.filter(
      (s) =>
        (type === "all" || s.type === type) &&
        (conf === "all" || s.confidence === conf) &&
        (!cutoff || (s.latestObservedAt && new Date(s.latestObservedAt).getTime() >= cutoff)),
    );
  }, [q.data, type, conf, days]);

  const sel = "h-9 rounded-lg border border-border bg-card px-2 text-xs";

  return (
    <section aria-label={t("sig.title")} className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-base font-semibold">{t("sig.title")}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{t("sig.subtitle")}</p>

      {q.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("sig.loading")}</p>
      ) : !q.data?.allowed ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("sig.no_access")}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="type" className={sel} value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="all">{t("sig.filter.all")}</option>
              {(["request", "conversation", "property_record", "value"] as const).map((k) => (
                <option key={k} value={k}>{t(`sig.type.${k}`)}</option>
              ))}
            </select>
            <select aria-label="confidence" className={sel} value={conf} onChange={(e) => setConf(e.target.value as any)}>
              <option value="all">{t("sig.filter.any_conf")}</option>
              {(["high", "medium", "low"] as const).map((k) => (
                <option key={k} value={k}>{t(`sig.conf.${k}`)}</option>
              ))}
            </select>
            <select aria-label="time" className={sel} value={days} onChange={(e) => setDays(Number(e.target.value) as any)}>
              <option value={0}>{t("sig.filter.any_time")}</option>
              <option value={30}>{t("sig.filter.30")}</option>
              <option value={90}>{t("sig.filter.90")}</option>
            </select>
          </div>

          {q.data.engagementSummary && (
            <p className="mt-3 rounded-xl bg-secondary/50 px-3 py-2 text-xs">
              <span className="font-semibold">{t("sig.engagement")}:</span> {q.data.engagementSummary}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("sig.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {shown.map((s) => (
                <li key={s.type} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{t(`sig.type.${s.type}`)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CONF_CLASS[s.confidence]}`}>
                      {t(`sig.conf.${s.confidence}`)}
                    </span>
                    {s.limited && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t("sig.limited")}</span>}
                    {s.conflicting && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">{t("sig.conflicting")}</span>}
                  </div>
                  {s.recordOnly && <p className="mt-1 text-[11px] text-muted-foreground">{t("sig.record_only")}</p>}
                  <ul className="mt-1 divide-y divide-border">
                    {s.facts.map((f) => <FactLine key={f.id} f={f} t={t} />)}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    {(["dismiss", "not_accurate"] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        disabled={fb.isPending}
                        onClick={() => fb.mutate({ signalType: s.type, action: a })}
                        className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold hover:border-primary disabled:opacity-50"
                      >
                        {t(`sig.${a}`)}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {q.data.hiddenCount > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">{t("sig.hidden", { count: q.data.hiddenCount })}</p>
          )}
        </>
      )}
    </section>
  );
}

/** Batched supporting facts for Today cards. Never reorders cards. */
export function useSupportingFacts(audience: Audience, clientIds: string[]) {
  const { getSupportingFacts } = supportingMod;
  const fn = useServerFn(getSupportingFacts);
  const ids = [...new Set(clientIds.filter(Boolean))].slice(0, 40);
  return useQuery({
    queryKey: ["supporting-facts", audience, ids.join(",")],
    queryFn: () => fn({ data: { audience, clientIds: ids } }),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

export function SupportingFacts({ entry }: { entry: { facts: EvidenceFact[] } | null | undefined }) {
  const t = useT();
  if (!entry || !entry.facts.length) return null;
  return (
    <div className="mt-2 rounded-lg bg-secondary/40 px-3 py-1">
      <p className="pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("sig.supporting")}</p>
      <ul className="divide-y divide-border">
        {entry.facts.map((f) => <FactLine key={f.id} f={f} t={t} />)}
      </ul>
    </div>
  );
}

import * as supportingMod from "@/lib/signal-history.functions";
