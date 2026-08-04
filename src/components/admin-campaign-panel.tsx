import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listCampaigns, runCampaigns, getCampaignSends } from "@/lib/campaigns.functions";

export function AdminCampaignPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listCampaigns);
  const run = useServerFn(runCampaigns);
  const sendsFn = useServerFn(getCampaignSends);

  const [campaignKey, setCampaignKey] = useState<string>("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof run>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => list() });
  const { data: sends } = useQuery({ queryKey: ["campaign-sends"], queryFn: () => sendsFn() });

  const runMut = useMutation({
    mutationFn: (dryRun: boolean) =>
      run({ data: { dryRun, limit: dryRun ? 5 : 100, ...(campaignKey ? { campaignKey } : {}) } }),
    onSuccess: (r, dryRun) => {
      setPreview(r);
      setMsg(
        dryRun
          ? `Preview: ${r.generated} drafted, ${r.skipped} skipped`
          : `Sent ${r.sent}, skipped ${r.skipped}, errors ${r.errors}`,
      );
      qc.invalidateQueries({ queryKey: ["campaign-sends"] });
    },
    onError: (e) => setMsg((e as Error).message),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Homeowner campaigns</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            SuCasa personalizes the copy · GoHighLevel delivers it
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={campaignKey}
            onChange={(e) => setCampaignKey(e.target.value)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value="">All campaigns</option>
            {(campaigns ?? []).map((c) => (
              <option key={c.id} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => runMut.mutate(true)}
            disabled={runMut.isPending}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {runMut.isPending ? "Working…" : "Preview"}
          </button>
          <button
            onClick={() => runMut.mutate(false)}
            disabled={runMut.isPending}
            className="rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Run now
          </button>
        </div>
      </div>

      {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(campaigns ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl bg-muted px-4 py-3">
            <p className="text-sm font-medium">{c.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {c.cadence} · tag <span className="font-mono">{c.ghl_tag}</span>
            </p>
          </div>
        ))}
      </div>

      {!!preview?.samples?.length && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Latest run
          </p>
          <ul className="space-y-2 text-xs">
            {preview.samples.map((s, i) => (
              <li key={i} className="rounded-xl border border-border px-3 py-2">
                <p className="font-medium">
                  {s.client} · {s.campaign} · <span className="text-muted-foreground">{s.status}</span>
                </p>
                {s.subject && <p className="mt-1 font-medium">{s.subject}</p>}
                {s.body && <p className="mt-1 text-muted-foreground">{s.body}</p>}
                {s.reason && !s.subject && <p className="mt-1 text-muted-foreground">{s.reason}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!sends?.length && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent sends
          </p>
          <ul className="space-y-1 text-xs">
            {sends.slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
                <span className="truncate">
                  {s.recipient_name ?? s.recipient_email} · {s.subject}
                </span>
                <span
                  className={
                    s.status === "sent"
                      ? "text-growth"
                      : s.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
