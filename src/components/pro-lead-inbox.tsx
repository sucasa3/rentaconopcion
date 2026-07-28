import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMyOffers, claimLead, declineLead } from "@/lib/leads.functions";
import {
  proMarkScheduled,
  proMarkInProgress,
  proMarkCompleted,
} from "@/lib/service-requests.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  Clock,
  MapPin,
  DollarSign,
  CheckCircle2,
  XCircle,
  Calendar,
  Wrench,
  Upload,
} from "lucide-react";

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function ProLeadInbox() {
  const list = useServerFn(listMyOffers);
  const claim = useServerFn(claimLead);
  const decline = useServerFn(declineLead);
  const scheduleFn = useServerFn(proMarkScheduled);
  const inProgressFn = useServerFn(proMarkInProgress);
  const completeFn = useServerFn(proMarkCompleted);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-offers"],
    queryFn: () => list(),
    refetchInterval: 15000,
  });

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const claimMut = useMutation({
    mutationFn: (offerId: string) => claim({ data: { offerId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-offers"] }),
  });
  const declineMut = useMutation({
    mutationFn: (offerId: string) => decline({ data: { offerId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-offers"] }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-offers"] });

  if (isLoading) {
    return <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-soft">Loading opportunities…</div>;
  }
  if (error) {
    return <div className="rounded-3xl border border-border bg-card p-6 text-sm text-destructive shadow-soft">{(error as Error).message}</div>;
  }
  if (!data?.pro) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">Not yet a SuCasa Pro</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your account isn't linked to a pro profile yet. Contact SuCasa to activate your Founding Partner spot.</p>
      </div>
    );
  }

  const pro = data.pro;
  const offers = data.offers;
  const claims = data.claims;
  void tick; // rerender for countdown

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{pro.business_name}</p>
            <p className="text-xs text-muted-foreground">
              {pro.is_founding_partner ? "Founding Partner · $297/mo" : `$${(pro.monthly_price_cents ?? 39700) / 100}/mo`} · {pro.accepting_leads ? "Accepting leads" : "Paused"}
            </p>
          </div>
          <Bell className="h-5 w-5 text-primary" />
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Live opportunities</h2>
        </div>
        {!offers.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No live offers right now — you'll get one as soon as it routes to you.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {offers.map((o) => {
              const req = o.service_requests as unknown as {
                category: string; city: string | null; state: string | null; zip: string | null;
                timeline: string | null; budget_min: number | null; budget_max: number | null; description: string | null;
              };
              const countdown = formatCountdown(o.expires_at);
              const urgent = new Date(o.expires_at).getTime() - Date.now() < 5 * 60_000;
              return (
                <li key={o.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{req.category}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {[req.city, req.state, req.zip].filter(Boolean).join(", ")}
                      </p>
                      {(req.budget_min || req.budget_max) && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" /> ${req.budget_min ?? 0} – ${req.budget_max ?? "?"}
                        </p>
                      )}
                      {req.timeline && <p className="mt-0.5 text-xs text-muted-foreground">{req.timeline}</p>}
                      {req.description && <p className="mt-2 line-clamp-2 text-xs text-foreground/80">{req.description}</p>}
                    </div>
                    <div className={`shrink-0 rounded-xl px-3 py-2 text-center ${urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      <Clock className="mx-auto h-3.5 w-3.5" />
                      <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{countdown}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => claimMut.mutate(o.id)}
                      disabled={claimMut.isPending}
                      className="flex-1 rounded-full gradient-brand px-4 py-2 text-xs font-semibold text-white shadow-soft disabled:opacity-50"
                    >
                      {claimMut.isPending ? "Claiming…" : "Claim lead"}
                    </button>
                    <button
                      onClick={() => declineMut.mutate(o.id)}
                      disabled={declineMut.isPending}
                      className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    >
                      Pass
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-growth" />
          <h2 className="text-base font-semibold">Claimed jobs</h2>
        </div>
        {!claims.length ? (
          <p className="mt-4 text-sm text-muted-foreground">Claim your first lead to see homeowner contact details here.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {claims.map((c) => {
              const req = c.service_requests as unknown as {
                id: string; category: string; city: string | null; zip: string | null; description: string | null;
                status?: string; scheduled_at?: string | null; invoice_path?: string | null;
                profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
              };
              return (
                <ClaimedJobCard
                  key={c.id}
                  requestId={req.id}
                  category={req.category}
                  location={[req.city, req.zip].filter(Boolean).join(", ")}
                  homeownerName={req.profiles?.full_name}
                  phone={req.profiles?.phone}
                  email={req.profiles?.email}
                  status={req.status ?? "claimed"}
                  scheduledAt={req.scheduled_at ?? null}
                  invoicePath={req.invoice_path ?? null}
                  claimedAt={c.claimed_at}
                  proUserId={pro.user_id ?? undefined}
                  onSchedule={(iso) => scheduleFn({ data: { requestId: req.id, scheduledAt: iso } }).then(invalidate)}
                  onInProgress={() => inProgressFn({ data: { requestId: req.id } }).then(invalidate)}
                  onComplete={(payload) => completeFn({ data: { requestId: req.id, ...payload } }).then(invalidate)}
                />
              );
            })}
          </ul>
        )}
        {(claimMut.error || declineMut.error) && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 text-xs text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{((claimMut.error ?? declineMut.error) as Error).message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimedJobCard(props: {
  requestId: string;
  category: string;
  location: string;
  homeownerName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  scheduledAt: string | null;
  invoicePath: string | null;
  claimedAt: string;
  proUserId?: string;
  onSchedule: (iso: string) => Promise<unknown>;
  onInProgress: () => Promise<unknown>;
  onComplete: (payload: { invoicePath?: string; invoiceCents?: number; proNotes?: string }) => Promise<unknown>;
}) {
  const [scheduleDate, setScheduleDate] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [invoicePath, setInvoicePath] = useState<string | null>(props.invoicePath);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const s = (props.status || "").toLowerCase();
  const done = s === "completed";

  const uploadInvoice = async (file: File) => {
    if (!props.proUserId) {
      setErr("Missing pro user id");
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const path = `${props.proUserId}/${props.requestId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("service-invoices").upload(path, file);
      if (error) throw error;
      setInvoicePath(path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submitComplete = async () => {
    setBusy(true);
    setErr(null);
    try {
      const amt = invoiceAmount ? Math.round(Number(invoiceAmount) * 100) : undefined;
      await props.onComplete({
        invoicePath: invoicePath ?? undefined,
        invoiceCents: amt,
        proNotes: notes || undefined,
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const schedule = async () => {
    if (!scheduleDate) return;
    setBusy(true);
    setErr(null);
    try {
      await props.onSchedule(new Date(scheduleDate).toISOString());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {props.homeownerName || "Homeowner"} · {props.category}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.location}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {props.phone && <a href={`tel:${props.phone}`} className="font-medium text-primary">{props.phone}</a>}
            {props.email && <a href={`mailto:${props.email}`} className="font-medium text-primary">{props.email}</a>}
          </div>
        </div>
        <StatusChip status={s} />
      </div>

      {!done && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          {s === "claimed" && (
            <div className="flex items-end gap-2">
              <label className="text-xs">
                <span className="mb-1 block text-muted-foreground">Schedule for</span>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
              </label>
              <button
                onClick={schedule}
                disabled={busy || !scheduleDate}
                className="inline-flex items-center gap-1 rounded-full gradient-brand px-3 py-1.5 text-xs font-semibold text-white shadow-soft disabled:opacity-50"
              >
                <Calendar className="h-3 w-3" /> Set schedule
              </button>
            </div>
          )}
          {s === "scheduled" && (
            <>
              {props.scheduledAt && (
                <p className="text-xs text-muted-foreground">
                  Scheduled {new Date(props.scheduledAt).toLocaleString()}
                </p>
              )}
              <button
                onClick={() => { setBusy(true); props.onInProgress().finally(() => setBusy(false)); }}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
              >
                <Wrench className="h-3 w-3" /> Start job
              </button>
            </>
          )}
          {(s === "scheduled" || s === "in_progress" || s === "claimed") && (
            <div className="flex flex-1 flex-col gap-2 rounded-xl border border-dashed border-border p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Complete job</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs">
                  <Upload className="h-3 w-3" />
                  {invoicePath ? "Invoice attached" : uploading ? "Uploading…" : "Attach invoice"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadInvoice(e.target.files[0])}
                  />
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Amount $"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notes for homeowner (optional)"
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={submitComplete}
                disabled={busy}
                className="self-start inline-flex items-center gap-1 rounded-full gradient-growth px-3 py-1.5 text-xs font-semibold text-white shadow-soft disabled:opacity-50"
              >
                <CheckCircle2 className="h-3 w-3" /> Mark completed
              </button>
            </div>
          )}
        </div>
      )}

      {done && (
        <p className="mt-2 text-xs text-growth">Job completed. Homeowner will be notified.</p>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Claimed {new Date(props.claimedAt).toLocaleDateString()}
      </p>
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    claimed: { label: "Claimed", cls: "bg-primary/10 text-primary" },
    scheduled: { label: "Scheduled", cls: "bg-blue-500/10 text-blue-600" },
    in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-600" },
    completed: { label: "Completed", cls: "bg-growth/15 text-growth" },
  };
  const m = map[status] ?? map.claimed;
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>;
}
