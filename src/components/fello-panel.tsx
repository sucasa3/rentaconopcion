import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listFelloState, subscribeFelloWebhookFn } from "@/lib/fello.functions";

const EVENTS = [
  "FormSubmission",
  "ContactEnriched",
  "DashboardClick",
  "EmailClick",
  "PostcardScan",
  "ContactUnsubscribed",
  "ContactDetailsUpdated",
  "TagsAdded",
  "TagsRemoved",
  "FelixAIHandoff",
] as const;

export function FelloPanel() {
  const qc = useQueryClient();
  const state = useServerFn(listFelloState);
  const subscribe = useServerFn(subscribeFelloWebhookFn);

  const { data, isLoading, error } = useQuery({
    queryKey: ["fello-state"],
    queryFn: () => state(),
    refetchInterval: 20000,
  });

  const [eventType, setEventType] = useState<(typeof EVENTS)[number]>("ContactEnriched");
  const [msg, setMsg] = useState<string | null>(null);

  const subMut = useMutation({
    mutationFn: () =>
      subscribe({
        data: {
          eventType,
          baseUrl: typeof window !== "undefined" ? window.location.origin : "",
        },
      }),
    onSuccess: (r) => {
      setMsg(`Subscribed ${r.eventType} · ${r.subscriptionId?.slice?.(0, 8) ?? ""}`);
      qc.invalidateQueries({ queryKey: ["fello-state"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Fello.ai integration</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Two-way sync: push homeowners on signup, pull AVM &amp; equity, receive real-time events.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Subscribe to event</span>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as (typeof EVENTS)[number])}
            className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
          >
            {EVENTS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => subMut.mutate()}
          disabled={subMut.isPending}
          className="rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {subMut.isPending ? "Subscribing…" : "Subscribe webhook"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="Active subscriptions" value={isLoading ? "…" : String(data?.subscriptions?.length ?? 0)} />
        <Stat label="Recent events" value={isLoading ? "…" : String(data?.recentEvents?.length ?? 0)} />
      </div>

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
      {error && <p className="mt-3 text-xs text-destructive">{(error as Error).message}</p>}

      {!!data?.subscriptions?.length && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subscriptions</p>
          <ul className="space-y-1 text-xs">
            {data.subscriptions.map((s) => (
              <li key={s.subscription_id} className="truncate rounded-lg bg-muted px-3 py-2">
                <span className="font-semibold">{s.event_type}</span> · {s.status} ·{" "}
                <span className="font-mono opacity-70">{s.subscription_id.slice(0, 12)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!data?.recentEvents?.length && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent events</p>
          <ul className="space-y-1 text-xs">
            {data.recentEvents.slice(0, 8).map((e) => (
              <li key={e.id} className="truncate rounded-lg bg-muted px-3 py-2">
                <span className="font-semibold">{e.event_type}</span>{" "}
                <span className="opacity-70">
                  · {new Date(e.received_at).toLocaleString()}
                  {e.fello_contact_id ? ` · ${e.fello_contact_id.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
