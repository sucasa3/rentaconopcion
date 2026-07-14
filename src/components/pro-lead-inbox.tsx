import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMyOffers, claimLead, declineLead } from "@/lib/leads.functions";
import { Bell, Clock, MapPin, DollarSign, CheckCircle2, XCircle } from "lucide-react";

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{pro.business_name}</h2>
              {pro.is_founding_partner && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Founding Partner</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              ${(pro.monthly_price_cents / 100).toFixed(0)}/mo · {pro.accepting_leads ? "Accepting leads" : "Paused"}
            </p>
          </div>
          <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-foreground">Live</span>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Active opportunities</h2>
          </div>
          <span className="text-xs text-muted-foreground">{offers.length} pending · 25-min SLA</span>
        </div>
        {!offers.length ? (
          <p className="mt-4 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            No live offers right now. New leads in your service area appear here instantly.
          </p>
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
          <h2 className="text-base font-semibold">Claimed leads</h2>
        </div>
        {!claims.length ? (
          <p className="mt-4 text-sm text-muted-foreground">Claim your first lead to see homeowner contact details here.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
            {claims.map((c) => {
              const req = c.service_requests as unknown as {
                category: string; city: string | null; zip: string | null; description: string | null;
                profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
              };
              return (
                <li key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{req.profiles?.full_name || "Homeowner"} · {req.category}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{[req.city, req.zip].filter(Boolean).join(", ")}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {req.profiles?.phone && <a href={`tel:${req.profiles.phone}`} className="font-medium text-primary">{req.profiles.phone}</a>}
                        {req.profiles?.email && <a href={`mailto:${req.profiles.email}`} className="font-medium text-primary">{req.profiles.email}</a>}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(c.claimed_at).toLocaleDateString()}</span>
                  </div>
                </li>
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
