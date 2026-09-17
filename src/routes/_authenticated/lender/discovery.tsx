import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
              <article
                key={c.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                onClick={() => void track({ data: { action: "lender_discovery_opportunity_opened" } })}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
                  <span className="text-xs text-muted-foreground">{c.address}</span>
                </div>
                {c.whyToday ? (
                  <p className="mt-2 text-sm text-foreground">{c.whyToday}</p>
                ) : null}
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  {money(c.estimatedValueCents) ? (
                    <div>
                      <dt className="inline">Estimated value: </dt>
                      <dd className="inline font-medium text-foreground">
                        {money(c.estimatedValueCents)}
                      </dd>
                    </div>
                  ) : null}
                  {money(c.estimatedEquityCents) ? (
                    <div>
                      <dt className="inline">Estimated equity: </dt>
                      <dd className="inline font-medium text-foreground">
                        {money(c.estimatedEquityCents)}
                      </dd>
                    </div>
                  ) : null}
                  {typeof c.loanAgeYears === "number" ? (
                    <div>
                      <dt className="inline">Loan age: </dt>
                      <dd className="inline font-medium text-foreground">
                        {c.loanAgeYears} yrs
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
                {c.opener ? (
                  <p className="mt-3 rounded-lg bg-surface p-3 text-xs italic text-foreground">
                    “{c.opener}”
                  </p>
                ) : null}
              </article>
            ))}
          </section>

          {data.summary?.locked > 0 ? (
            <section className="rounded-3xl border border-surface-intelligence-border bg-surface-intelligence p-6">
              <Lock className="h-5 w-5 text-intelligence-accent" />
              <h2 className="mt-3 text-lg font-semibold text-surface-intelligence-foreground">
                {data.summary.locked} more are waiting
              </h2>
              <p className="mt-2 text-sm text-surface-intelligence-foreground">
                The 90-day pilot unlocks every opportunity in this list, keeps watching these homes
                as records change, and gives you a daily list of who to call and why.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-surface-intelligence-foreground">
                {[
                  "$447 today for 90 days",
                  "Then $149/month — cancel any time during the pilot",
                  "Continuous monitoring of the homes you already know",
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 shrink-0" /> {line}
                  </li>
                ))}
              </ul>
              <Button className="mt-5" onClick={() => pilot.mutate()} disabled={pilot.isPending}>
                {pilot.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Start my 90-day pilot
              </Button>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
