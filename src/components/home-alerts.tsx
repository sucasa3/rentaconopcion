import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { dismissAlert, listAlertStates, markAlertsSeen } from "@/lib/alerts.functions";
import type { SignalReport } from "@/lib/signals";
import { useT } from "@/lib/i18n";

const ALERTS_KEY = ["homeowner-alerts"] as const;

/**
 * One calm row: the Home Assistant raising a hand about the single thing that
 * matters right now. Signals still come from the one engine — this only picks
 * the leader and hands the conversation to the assistant.
 */
export function HomeAlerts({
  report,
  hasInspection = true,
}: {
  report: SignalReport | null;
  hasInspection?: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
  const seenKeys = useMemo(() => new Set((states ?? []).map((s) => s.signal_key)), [states]);

  const alerts = useMemo(() => {
    const signals = report?.signals ?? [];
    return signals.filter((s) => s.strength !== "low" && !dismissed.has(s.key)).slice(0, 3);
  }, [report, dismissed]);

  const lead = alerts[0] ?? null;

  // Stamp first-seen once per set so nothing re-announces itself forever.
  useEffect(() => {
    if (!states || alerts.length === 0) return;
    const unseen = alerts.filter((a) => !seenKeys.has(a.key));
    if (unseen.length === 0) return;
    void seenFn({
      data: { alerts: unseen.map((a) => ({ key: a.key, type: a.type, title: a.title })) },
    }).then(() => qc.invalidateQueries({ queryKey: ALERTS_KEY }));
  }, [alerts, states, seenKeys, seenFn, qc]);

  const dismissMutation = useMutation({
    mutationFn: (input: { key: string; type: string; title: string }) => dismissFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
  });

  // Nothing urgent and no inspection on file → invite instead of alarm.
  const invite = !lead && !hasInspection;
  if (!lead && !invite) return null;

  const headline = lead ? lead.title : t("nudge.inspection.headline");
  const topic = lead ? lead.title : t("nudge.inspection.topic");
  const extra = Math.max(0, alerts.length - 1);

  const open = () => {
    if (lead) {
      dismissMutation.mutate({ key: lead.key, type: lead.type, title: lead.title });
      // Maintenance signals land on the Home Plan (with cost + action);
      // everything else still hands off to the assistant.
      if (
        lead.type === "component_overdue" ||
        lead.type === "component_due_soon" ||
        lead.type === "inspection_findings"
      ) {
        void navigate({ to: "/home-plan" });
        return;
      }
    }
    void navigate({ to: "/assistant", search: { topic } });
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={headline}
      className="w-full rounded-3xl border border-border bg-card p-4 text-left shadow-soft transition active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-xl">
            👋
          </span>
          <span className="assistant-pulse absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-card" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {t("assistant.title")}
          </p>
          <p className="truncate text-sm font-semibold leading-snug">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("nudge.tap")}
            {extra > 0 ? ` · ${t("nudge.more", { count: extra })}` : ""}
          </p>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    </button>
  );
}
