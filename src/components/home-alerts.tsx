import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, ChevronRight, X } from "lucide-react";

import { dismissAlert, listAlertStates, markAlertsSeen } from "@/lib/alerts.functions";
import type { SignalReport } from "@/lib/signals";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ALERTS_KEY = ["homeowner-alerts"] as const;

/**
 * The advisor strip: the two or three things about this home that actually
 * changed or need a decision. Signals come from the one engine; this component
 * only decides what is still worth showing (not dismissed) and how loud it is.
 */
export function HomeAlerts({ report }: { report: SignalReport | null }) {
  const t = useT();
  const qc = useQueryClient();
  const fetchStates = useServerFn(listAlertStates);
  const seenFn = useServerFn(markAlertsSeen);
  const dismissFn = useServerFn(dismissAlert);

  const { data: states } = useQuery({
    queryKey: ALERTS_KEY,
    queryFn: () => fetchStates(),
    staleTime: 60_000,
  });

  const dismissed = useMemo(
    () => new Set((states ?? []).filter((s) => s.dismissed_at).map((s) => s.signal_key)),
    [states],
  );
  const seenKeys = useMemo(
    () => new Set((states ?? []).map((s) => s.signal_key)),
    [states],
  );

  const alerts = useMemo(() => {
    const signals = report?.signals ?? [];
    return signals
      .filter((s) => s.strength !== "low" && !dismissed.has(s.key))
      .slice(0, 3);
  }, [report, dismissed]);

  // Stamp first-seen once per set so "New" means new.
  useEffect(() => {
    if (!states || alerts.length === 0) return;
    const unseen = alerts.filter((a) => !seenKeys.has(a.key));
    if (unseen.length === 0) return;
    void seenFn({
      data: {
        alerts: unseen.map((a) => ({ key: a.key, type: a.type, title: a.title })),
      },
    }).then(() => qc.invalidateQueries({ queryKey: ALERTS_KEY }));
  }, [alerts, states, seenKeys, seenFn, qc]);

  const dismissMutation = useMutation({
    mutationFn: (input: { key: string; type: string; title: string }) =>
      dismissFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
  });

  if (alerts.length === 0) return null;

  return (
    <section aria-label={t("alerts.title")} className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
          {t("alerts.title")}
        </h2>
      </div>

      {alerts.map((a) => {
        const urgent = a.strength === "high";
        const isNew = !seenKeys.has(a.key);
        return (
          <div
            key={a.key}
            className={cn(
              "relative overflow-hidden rounded-3xl border bg-card p-4 shadow-soft",
              urgent ? "border-destructive/30" : "border-border",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-1.5",
                urgent ? "bg-destructive" : "bg-primary",
              )}
              aria-hidden
            />
            <div className="flex items-start gap-3 pl-2">
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                )}
              >
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold leading-snug">{a.title}</p>
                  {isNew ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      {t("alerts.new")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.reason}</p>
                {a.cta ? (
                  <Link
                    to={a.cta.to as never}
                    search={a.cta.search as never}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary"
                  >
                    {a.cta.label} <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={t("alerts.dismiss")}
                onClick={() =>
                  dismissMutation.mutate({ key: a.key, type: a.type, title: a.title })
                }
                className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
