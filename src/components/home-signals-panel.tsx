import { Link } from "@tanstack/react-router";
import { ArrowRight, Wrench, Landmark, LineChart, ShieldCheck, FileText } from "lucide-react";

import { NETWORK_LABEL, type HomeSignal, type SignalNetwork } from "@/lib/signals";
import type { HomeRecord } from "@/lib/home-record";

const NETWORK_ICON: Record<SignalNetwork, typeof Wrench> = {
  vendor: Wrench,
  lender: Landmark,
  agent: LineChart,
  insurer: ShieldCheck,
  homeowner: FileText,
};

const STRENGTH_CLASS: Record<HomeSignal["strength"], string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-primary/10 text-primary",
  low: "bg-secondary text-muted-foreground",
};

const STRENGTH_LABEL: Record<HomeSignal["strength"], string> = {
  high: "Act now",
  medium: "Worth reviewing",
  low: "Keep in mind",
};

/**
 * "What your home needs" — the signal engine's output, rendered directly.
 * Every card here comes from one evaluator over the Home Record.
 */
export function HomeSignalsPanel({
  signals,
  record,
  limit = 5,
  onGoToTab,
}: {
  signals: HomeSignal[];
  record: HomeRecord;
  limit?: number;
  onGoToTab?: (tab: "home" | "care" | "documents") => void;
}) {
  const shown = signals.slice(0, limit);

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">What your home needs</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read from your home record — condition, financial position and recent activity.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Record {record.completeness.pct}% complete
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          Nothing needs your attention right now. We keep watching your value, equity and system ages
          and will surface the next move the moment something changes.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {shown.map((s) => {
            const Icon = NETWORK_ICON[s.network];
            return (
              <li key={s.key} className="rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STRENGTH_CLASS[s.strength]}`}>
                        {STRENGTH_LABEL[s.strength]}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {NETWORK_LABEL[s.network]}
                      </span>
                      {s.freshness.stale && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                          Cached
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-snug">{s.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.reason}</p>

                    {s.cta && (
                      <div className="mt-3">
                        {s.cta.to === "/dashboard" && s.cta.tab && onGoToTab ? (
                          <button
                            onClick={() => onGoToTab(s.cta!.tab!)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                          >
                            {s.cta.label} <ArrowRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <Link
                            to={s.cta.to}
                            search={s.cta.search as never}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
                          >
                            {s.cta.label} <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
