import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Users,
  Sparkles,
  HandHeart,
  Activity,
  CheckCircle2,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  Loader2,
  ShieldCheck,
  Lock,
} from "lucide-react";
import {
  getLenderWorkspace,
  generateHomeownerReviewBrief,
  logLenderOutcome,
} from "@/lib/lender-workspace.functions";
import { COMPLIANCE_NOTES, PRIORITY_LABEL } from "@/lib/lender-access";
import { StatCard, SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Workspace = NonNullable<Awaited<ReturnType<typeof getLenderWorkspace>>>;
type Person = Workspace["book"][number];

const BAND = {
  hot: { emoji: "🔥", label: "Hot", cls: "border-attention/40 bg-attention/5" },
  warm: { emoji: "🟡", label: "Warm", cls: "border-growth/40 bg-growth/5" },
  nurture: { emoji: "🔵", label: "Nurture", cls: "border-border/70 bg-card" },
} as const;

const OUTCOMES = [
  ["no_answer", "No answer"],
  ["talked", "Talked"],
  ["appointment", "Review scheduled"],
  ["application", "Application started"],
  ["in_process", "Loan in process"],
  ["closed", "Closed"],
  ["not_interested", "Not interested"],
  ["follow_up", "Follow up later"],
] as const;

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function opener(p: Person) {
  const first = p.name.split(" ")[0] ?? "there";
  const review = p.reviews[0];
  if (p.askedToConnect) {
    return `Hi ${first} — thanks for reaching out through SuCasa. I've pulled up the latest information on your home so we can pick up right where your question left off.`;
  }
  if (review?.type === "equity_review" || review?.type === "equity_milestone") {
    return `Hi ${first} — I was reviewing the updated information on your home and it looks like your estimated equity has increased meaningfully. I thought it might be useful to send you the update and see if anything has changed with your plans for the home.`;
  }
  if (review?.type === "ownership_anniversary") {
    return `Hi ${first} — congratulations on another year in the home. I put together your updated home and estimated equity snapshot in case it's useful for your planning.`;
  }
  return `Hi ${first} — your latest Home Intelligence update is ready. Nothing you need to do, but I thought it might be a good time for a no-pressure homeownership check-in.`;
}

export function LenderToday() {
  const wsFn = useServerFn(getLenderWorkspace);
  const { data, isLoading } = useQuery({
    queryKey: ["lender-workspace"],
    queryFn: () => wsFn({ data: {} }),
    staleTime: 60_000,
  });
  const [briefFor, setBriefFor] = useState<Person | null>(null);

  if (isLoading) return <div className="px-4 py-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return null;

  const { metrics, counts, askedToConnectList, queue, aggregateOnly, serviceDelivery } = data;

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          {data.org.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Today</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Homeowners monitored"
          value={metrics.homeownersMonitored}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Changes detected"
          value={metrics.changesDetected}
          tone="info"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Review opportunities"
          value={metrics.reviewOpportunities}
          tone="attention"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Asked to connect"
          value={metrics.askedToConnect}
          tone={metrics.askedToConnect ? "attention" : "growth"}
          icon={<HandHeart className="h-4 w-4" />}
        />
        <StatCard
          label="Engaged this month"
          value={metrics.engagedThisMonth}
          tone="growth"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {/* ASKED TO CONNECT — consumer-initiated, always first. */}
      <section className="space-y-3">
        <SectionHeader title="Homeowners who asked to connect" />
        <p className="-mt-1 text-sm text-muted-foreground">
          These people asked for help themselves. Work these before anything the system detected.
        </p>
        {askedToConnectList.length === 0 ? (
          <EmptyState
            icon={<HandHeart className="mx-auto h-7 w-7" />}
            title="No requests right now"
            hint="Homeowners appear here the moment they ask to talk to you."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {askedToConnectList.map((r) => (
              <div
                key={r.clientId}
                className="rounded-3xl border border-attention/40 bg-attention/5 p-4 shadow-soft"
              >
                <StatusPill tone="attention">Requested contact</StatusPill>
                <p className="mt-2 text-lg font-semibold">{r.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">Asked about: {r.askedAbout}</p>
                {r.note && <p className="mt-1 text-sm">{r.note}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  Authorized to share: {r.authorized.length ? r.authorized.join(", ") : "contact only"}
                </p>
                <Link
                  to={"/lender/portfolio/$id" as never}
                  params={{ id: r.portfolioId } as never}
                  search={{ client: r.clientId } as never}
                  className="mt-3 inline-flex min-h-[40px] items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  Review &amp; contact
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* WHO TO CONTACT TODAY */}
      <section id="work-queue" className="scroll-mt-6 space-y-3">
        <SectionHeader title="Who to contact today" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Ranked by {PRIORITY_LABEL.toLowerCase()} — how timely a relationship check-in is. This is
          not a credit, approval or qualification score.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["hot", "warm", "nurture"] as const).map((b) => (
            <div key={b} className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                {BAND[b].emoji} {BAND[b].label}
              </p>
              <p className="text-xl font-semibold">{counts[b]}</p>
            </div>
          ))}
        </div>

        {queue.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="mx-auto h-7 w-7" />}
            title="Nothing needs you right now"
            hint="Homeowners you have a relationship with show up here when something changes."
          />
        ) : (
          <ul className="space-y-3">
            {queue.map((p) => (
              <QueueCard key={p.id} person={p} onBrief={() => setBriefFor(p)} />
            ))}
          </ul>
        )}
      </section>

      {/* SERVICE DELIVERY — aggregate only. */}
      <section className="space-y-3">
        <SectionHeader title="What SuCasa delivered" />
        <p className="-mt-1 text-sm text-muted-foreground">
          Sponsored homeowners with no separate relationship are counted here only, never named.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Sponsored, aggregate only" value={aggregateOnly.sponsoredOnly} />
          {Object.entries(serviceDelivery)
            .slice(0, 3)
            .map(([k, n]) => (
              <StatCard key={k} label={k.replace(/_/g, " ")} value={n as number} />
            ))}
        </div>
      </section>

      <BriefDialog person={briefFor} onClose={() => setBriefFor(null)} />
    </div>
  );
}

function QueueCard({ person, onBrief }: { person: Person; onBrief: () => void }) {
  const qc = useQueryClient();
  const outcomeFn = useServerFn(logLenderOutcome);
  const outcome = useMutation({
    mutationFn: (stage: string) => outcomeFn({ data: { clientId: person.id, stage: stage as never } }),
    onSuccess: () => {
      toast.success("Logged");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const review = person.reviews[0];
  const band = BAND[person.band];

  return (
    <li className={`rounded-3xl border p-4 shadow-soft ${band.cls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={person.band === "hot" ? "attention" : person.band === "warm" ? "growth" : "muted"}>
          {band.emoji} {band.label} · {review?.label ?? "Homeowner review"}
        </StatusPill>
        <span className="text-xs text-muted-foreground">
          {PRIORITY_LABEL}: {person.priority}
        </span>
      </div>

      <p className="mt-2 text-lg font-semibold">{person.name}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
        {person.estimatedEquityCents != null && (
          <span>Estimated equity: {money(person.estimatedEquityCents)}</span>
        )}
        {person.estimatedLtvPct != null && <span>Estimated LTV: {person.estimatedLtvPct}%</span>}
        {person.loanAgeYears != null && <span>Loan age: {person.loanAgeYears} yrs</span>}
      </div>

      {review && (
        <div className="mt-3 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Why now
          </p>
          {review.why.slice(0, 2).map((w, i) => (
            <p key={i} className="text-sm">
              {w}
            </p>
          ))}
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Next best action
          </p>
          <p className="text-sm">{review.action}</p>
        </div>
      )}

      <div className="mt-3 rounded-2xl bg-background/70 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Suggested opener
        </p>
        <p className="mt-1 text-sm leading-relaxed">{opener(person)}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ChannelButton
          allowed={person.channels.email}
          reason={person.channelReasons["email"]!}
          icon={<Mail className="h-4 w-4" />}
          label="Write email"
          href={person.email ? `mailto:${person.email}` : undefined}
        />
        <ChannelButton
          allowed={person.channels.call}
          reason={person.channelReasons["call"]!}
          icon={<Phone className="h-4 w-4" />}
          label="Call"
          href={person.phone ? `tel:${person.phone}` : undefined}
        />
        <ChannelButton
          allowed={person.channels.text}
          reason={person.channelReasons["text"]!}
          icon={<MessageSquare className="h-4 w-4" />}
          label="Text"
          href={person.phone ? `sms:${person.phone}` : undefined}
        />
        <button
          type="button"
          onClick={onBrief}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold"
        >
          <FileText className="h-4 w-4" /> Generate review brief
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {OUTCOMES.map(([stage, label]) => (
          <button
            key={stage}
            type="button"
            disabled={outcome.isPending}
            onClick={() => outcome.mutate(stage)}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            {label}
          </button>
        ))}
      </div>
    </li>
  );
}

function ChannelButton({
  allowed,
  reason,
  icon,
  label,
  href,
}: {
  allowed: boolean;
  reason: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
}) {
  if (!allowed || !href) {
    return (
      <span
        title={reason}
        className="inline-flex min-h-[40px] cursor-not-allowed items-center gap-1.5 rounded-full border border-dashed border-border px-4 text-sm font-medium text-muted-foreground"
      >
        <Lock className="h-3.5 w-3.5" /> {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
    >
      {icon} {label}
    </a>
  );
}

function BriefDialog({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const briefFn = useServerFn(generateHomeownerReviewBrief);
  const { data, isFetching } = useQuery({
    queryKey: ["lender-brief", person?.id],
    queryFn: () => briefFn({ data: { clientId: person!.id } }),
    enabled: Boolean(person),
    staleTime: 5 * 60_000,
  });

  return (
    <Dialog open={Boolean(person)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Homeowner Review Brief{person ? `: ${person.name}` : ""}</DialogTitle>
          <DialogDescription>
            Talking points built only from the information on file for this relationship.
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing the brief…
          </p>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{data?.brief}</pre>
        )}

        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Compliance notes
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {COMPLIANCE_NOTES.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>

        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
