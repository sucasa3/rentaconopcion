import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Lock,
  Loader2,
  Phone,
  MessageSquare,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LenderBriefDialog } from "@/components/lender-brief";
import { BulkClientUpload } from "@/components/bulk-client-upload";
import { Button } from "@/components/ui/button";
import { DISCOVERY_ALLOWANCE } from "@/lib/discovery";
import {
  advanceDiscovery,
  getDiscovery,
  startPilotCheckout,
  uploadDiscoveryCsv,
} from "@/lib/discovery.functions";
import { recordAuthenticatedAgentEvent } from "@/lib/agent-funnel.functions";

export const Route = createFileRoute("/_authenticated/lender/discovery")({
  component: DiscoveryPage,
});

function money(cents: number | null | undefined) {
  if (typeof cents !== "number") return null;
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function DiscoveryPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscovery);
  const uploadFn = useServerFn(uploadDiscoveryCsv);
  const advanceFn = useServerFn(advanceDiscovery);
  const pilotFn = useServerFn(startPilotCheckout);
  const track = useServerFn(recordAuthenticatedAgentEvent);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const polling = useRef(false);
  const [brief, setBrief] = useState<any>(null);
  const [checkoutOk, setCheckoutOk] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      setCheckoutOk(true);
      void track({ data: { action: "lender_activation_completed" } });
    }
  }, []);

  const snapshot = useQuery({
    queryKey: ["lender-discovery"],
    queryFn: () => getFn({}),
  });

  const data = snapshot.data as any;
  const status: string = data?.status ?? "awaiting_upload";

  const upload = useMutation({
    mutationFn: (csv: string) => uploadFn({ data: { csv } }),
    onSuccess: async (r: any) => {
      toast.success(`${r.accepted} properties accepted`);
      await qc.invalidateQueries({ queryKey: ["lender-discovery"] });
      void runProcessing();
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function runProcessing() {
    if (polling.current) return;
    polling.current = true;
    void track({ data: { action: "lender_discovery_processing_viewed" } });
    try {
      for (let i = 0; i < 400; i += 1) {
        const tick: any = await advanceFn({});
        if (tick.status === "awaiting_upload") break;
        setProgress({ done: tick.done, total: tick.total });
        if (tick.status === "complete") {
          void track({ data: { action: "lender_discovery_completed" } });
          break;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Processing stopped");
    } finally {
      polling.current = false;
      setProgress(null);
      await qc.invalidateQueries({ queryKey: ["lender-discovery"] });
    }
  }

  useEffect(() => {
    if (status === "processing" && !polling.current) void runProcessing();
  }, [status]);

  useEffect(() => {
    if (status !== "complete") return;
    const revealed = (data?.revealed ?? []).length;
    void track({
      data: {
        action: revealed ? "lender_discovery_revealed" : "lender_discovery_empty_result",
      },
    });
    void track({ data: { action: "lender_pilot_offer_viewed" } });
    void track({ data: { action: "lender_discovery_results_viewed" } });
  }, [status, data?.revealed?.length]);

  const pilot = useMutation({
    mutationFn: () => pilotFn({ data: { returnUrl: window.location.href } }),
    onSuccess: (r: any) => {
      if (r?.url) window.open(r.url, "_blank");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (snapshot.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lockedMix: { key: string; label: string; count: number }[] = (data?.groups ?? [])
    .map((g: any) => ({
      key: g.key,
      label: g.label,
      count:
        g.count - (data?.revealed ?? []).filter((r: any) => r.primaryGroup === g.key).length,
    }))
    .filter((g: any) => g.count > 0);

  const busy = upload.isPending || progress !== null || status === "processing";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-16">
      <header>
        <p className="text-sm font-semibold text-status-opportunity">Opportunity Discovery</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {status === "complete"
            ? (data?.headline ?? "Your Discovery is ready")
            : "See what's inside your past-client database"}
        </h1>
        {status === "complete" && data?.supporting ? (
          <p className="mt-2 text-sm text-muted-foreground">{data.supporting}</p>
        ) : null}
      </header>

      {busy ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Reading property records</p>
              <p className="text-xs text-muted-foreground">
                {progress
                  ? `${progress.done} of ${progress.total} properties reviewed`
                  : "Getting started"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            You can leave this page open. Nothing is sent to any homeowner.
          </p>
        </section>
      ) : null}

      {!busy && status !== "complete" ? (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h2 className="text-base font-semibold text-foreground">
            Upload up to {DISCOVERY_ALLOWANCE} past clients
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A CSV or Excel export from your CRM. Name and property address are what matter —
            everything else is optional. Rows without a usable address, and repeats of the same
            property, don't count against your {DISCOVERY_ALLOWANCE}.
          </p>
          <div className="mt-4">
            <BulkClientUpload
              onCsv={(csv) => upload.mutate(csv)}
              busy={upload.isPending}
              title="Upload your past-client list"
              hint="CSV or Excel, up to 2 MB"
            />
          </div>
          <div className="mt-5 flex gap-3 rounded-lg border border-surface-intelligence-border bg-surface-intelligence p-4 text-xs text-surface-intelligence-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-intelligence-accent" />
            <span>
              Your list stays inside your own workspace. Uploading creates no relationship, no
              permission and no access to any homeowner.
            </span>
          </div>
        </section>
      ) : null}

      {status === "complete" ? (
        <>
          {data.excluded?.submitted ? (
            <p className="text-xs text-muted-foreground">
              {data.excluded.submitted} rows submitted · {data.summary?.analyzed ?? 0} unique
              properties analyzed
              {data.excluded.invalid ? ` · ${data.excluded.invalid} without a usable address` : ""}
              {data.excluded.duplicate ? ` · ${data.excluded.duplicate} repeat properties` : ""}
              {data.excluded.overAllowance
                ? ` · ${data.excluded.overAllowance} beyond your ${data.allowance}`
                : ""}
            </p>
          ) : null}

          {(() => {
            const found = data.summary?.clientsWithOpportunities ?? 0;
            const analyzed = data.summary?.analyzed ?? 0;
            return (
              <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <p className="text-sm text-muted-foreground">We analyzed {analyzed} homeowners.</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {found === 0
                    ? "None has a reason worth reviewing today."
                    : `${found} ${found === 1 ? "has a reason" : "have a reason"} worth reviewing.`}
                </p>
                {data.revealed.length ? (
                  <p className="mt-1 text-sm text-foreground">
                    You can explore {data.revealed.length} below.
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  SuCasa looks for changes in mortgage, equity and property signals that may give
                  you a reason to reconnect. These are signals worth reviewing — not a statement
                  that anyone qualifies for or needs a loan.
                </p>
              </section>
            );
          })()}


          {data.groups?.length ? (
            <section className="grid gap-3 sm:grid-cols-2">
              {data.groups.map((g: any) => (
                <div key={g.key} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-2xl font-semibold text-foreground">{g.count}</p>
                  <p className="text-sm font-medium text-foreground">{g.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{g.blurb}</p>
                </div>
              ))}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              {data.revealed.length
                ? `Your top ${data.revealed.length} unlocked now`
                : "Nothing meets the bar yet"}
            </h2>
            {data.revealed.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
                We won't lower the bar to fill five slots. Nothing in this list has enough
                confirmed record detail to justify a call today. Add more of your past clients, or
                come back as records update.
              </p>
            ) : null}
            {data.revealed.map((c: any) => (
              <DiscoveryCard
                key={c.id}
                onView={() => void track({ data: { action: "lender_discovery_opportunity_opened" } })}
                c={c}
                onBrief={() => {
                  setBrief(c);
                  void track({ data: { action: "lender_discovery_brief_opened" } });
                }}
              />
            ))}
          </section>

          {data.activated || checkoutOk ? (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <p className="text-sm font-semibold text-status-positive">SuCasa is active</p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                Now let SuCasa analyze the rest of your book.
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You found opportunities in your Discovery sample. Upload your complete database and
                SuCasa will analyze it with the same intelligence. The {data.summary?.analyzed ?? 0}{" "}
                homes already here stay in place — repeats aren't counted twice.
              </p>
              <Button asChild className="mt-5">
                <Link to="/lender/portfolio/$id/import" params={{ id: data.portfolioId }}>
                  <ArrowRight className="mr-2 h-4 w-4" /> Upload My Full Database
                </Link>
              </Button>
            </section>
          ) : (
            <section className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                {data.revealed.length ? `You've seen ${data.revealed.length}.` : "There's more to find."}
              </h2>
              {data.summary?.previewOnly > 0 ? (
                <p className="mt-1 text-base font-semibold text-foreground">
                  SuCasa found {data.summary.previewOnly} additional{" "}
                  {data.summary.previewOnly === 1 ? "homeowner" : "homeowners"} worth reviewing.
                </p>
              ) : null}
              <p className="mt-2 text-sm text-muted-foreground">
                Activate SuCasa to unlock the rest of this Discovery and begin monitoring your
                database for new opportunities.
              </p>
              {lockedMix.length ? (
                <ul className="mt-4 space-y-1 text-sm text-foreground">
                  {lockedMix.map((g) => (
                    <li key={g.key} className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      {g.count} {g.label}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                className="mt-6"
                onClick={() => {
                  void track({ data: { action: "lender_activation_clicked" } });
                  pilot.mutate();
                }}
                disabled={pilot.isPending}
              >
                {pilot.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Unlock My Database
              </Button>
              <p className="mt-2 text-sm text-muted-foreground">
                Unlock the remaining Discovery opportunities and let SuCasa continuously analyze your
                database for meaningful reasons to reconnect.
              </p>
              {money(data.pricing?.pilotCents) && money(data.pricing?.growthCents) ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  90-day pilot: {money(data.pricing.pilotCents)} today, then{" "}
                  {money(data.pricing.growthCents)}/month. Cancel any time during the pilot.
                </p>
              ) : null}
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-foreground">After activation</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Unlock the remaining opportunities from this Discovery</li>
                  <li>Upload your complete past-client database</li>
                  <li>SuCasa creates and watches a Home Profile for each home</li>
                  <li>Your daily list shows the people who deserve attention</li>
                  <li>SuCasa explains why they matter and helps prepare the conversation</li>
                </ol>
              </div>
            </section>
          )}
        </>
      ) : null}
      <LenderBriefDialog
        clientId={brief?.id ?? null}
        name={brief?.name ?? null}
        subtitle={brief?.address ?? null}
        email={brief?.email ?? null}
        phone={brief?.phone ?? null}
        onClose={() => setBrief(null)}
      />
    </div>
  );
}

function pct(n: number | null | undefined, digits = 0) {
  return typeof n === "number" ? `${n.toFixed(digits)}%` : null;
}

function DiscoveryCard({ c, onBrief, onView }: { c: any; onBrief: () => void; onView: () => void }) {
  const reasons: string[] = (c.reasons ?? []).slice(0, 3);
  const metrics = [
    { label: "Estimated value", value: money(c.estimatedValueCents) },
    {
      label: c.equityInferredNoLien ? "Estimated equity (no active loan found)" : "Estimated equity",
      value: money(c.estimatedEquityCents),
    },
    { label: "Estimated balance", value: c.equityInferredNoLien ? null : money(c.estimatedBalanceCents) },
    { label: "Estimated LTV", value: c.equityInferredNoLien ? null : pct(c.estimatedLtvPct) },
    { label: "Recorded rate", value: pct(c.recordedRatePct, 2) },
    {
      label: "Mortgage age",
      value: typeof c.loanAgeYears === "number" ? `${c.loanAgeYears} yrs` : null,
    },
  ].filter((m) => m.value);
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-soft" onClick={onView}>
      {c.categoryLabel ? (
        <span className="inline-flex rounded-full bg-surface-intelligence px-2.5 py-1 text-xs font-semibold text-intelligence-accent">
          {c.categoryLabel}
        </span>
      ) : null}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
        <span className="text-xs text-muted-foreground">{c.address}</span>
      </div>
      {c.whyToday ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why now</p>
          <p className="mt-1 text-sm text-foreground">{c.whyToday}</p>
        </div>
      ) : null}
      {reasons.length ? (
        <ul className="mt-3 space-y-1 text-sm text-foreground">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-intelligence-accent" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {metrics.length ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-[11px] text-muted-foreground">{m.label}</dt>
              <dd className="text-sm font-semibold text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {c.objective ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What to accomplish
          </p>
          <p className="mt-1 text-sm text-foreground">{c.objective}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { key: "call", label: "Call", Icon: Phone },
            { key: "text", label: "Text", Icon: MessageSquare },
            { key: "email", label: "Email", Icon: Mail },
          ].map(({ key, label, Icon }) => {
            const allowed = Boolean(c.channels?.[key]);
            return (
              <span
                key={key}
                title={c.channelReasons?.[key] ?? undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
                  allowed
                    ? "border-status-positive/40 text-status-positive"
                    : "border-border text-muted-foreground"
                }`}
              >
                <Icon className="h-3 w-3" /> {label}
              </span>
            );
          })}
        </div>
        <Button size="sm" variant="outline" onClick={onBrief}>
          30-Second Brief <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
