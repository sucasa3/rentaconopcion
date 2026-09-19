import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Sparkles, Quote, Mail, Phone, Copy, MapPin, Landmark, MessageSquare, CheckCircle2 } from "lucide-react";
import {
  generateHomeownerReviewBrief,
  getLenderQuickBrief,
  logLenderOutcome,
} from "@/lib/lender-workspace.functions";
import { COMPLIANCE_NOTES } from "@/lib/lender-access";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const QUICK_OUTCOMES = [
  ["talked", "Connected"],
  ["no_answer", "Left voicemail"],
  ["talked", "Texted"],
  ["talked", "Email sent"],
  ["appointment", "Review scheduled"],
  ["follow_up", "Follow up later"],
  ["not_interested", "Not interested"],
] as const;

/**
 * The 30-Second Brief, presented as a native-feeling sheet on mobile and a
 * centered intelligence panel on desktop. Every fact comes from the gated
 * server brief; the full Homeowner Review Brief stays one tap behind it.
 */
export function LenderBriefDialog({
  clientId,
  name,
  subtitle: subtitleLine,
  email,
  phone,
  onClose,
}: {
  clientId: string | null;
  name: string | null;
  /** Optional line under the title, e.g. the property address. */
  subtitle?: string | null;
  /** Optional quick-contact rows shown above the brief. */
  email?: string | null;
  phone?: string | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const open = Boolean(clientId);
  const [showFull, setShowFull] = useState(false);

  const close = (o: boolean) => {
    if (!o) {
      setShowFull(false);
      onClose();
    }
  };

  const title = name ?? "Homeowner detail";
  const subtitle =
    subtitleLine ||
    "Everything you need to start the conversation, based on the information on file.";
  const body = (
    <>
      <BriefBody
        clientId={clientId}
        name={name}
        subtitle={subtitle}
        email={email ?? null}
        phone={phone ?? null}
        showFull={showFull}
        onShowFull={() => setShowFull(true)}
        onClose={onClose}
      />
    </>
  );


  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={close}>
        <DrawerContent className="professional-detail max-h-[94vh] overflow-hidden rounded-t-[28px] border-border/60 bg-background">
          <DrawerHeader className="sr-only"><DrawerTitle>{title}</DrawerTitle><DrawerDescription>{subtitle}</DrawerDescription></DrawerHeader>
          <div className="overflow-y-auto">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="professional-detail max-h-[92vh] overflow-y-auto border-border/60 bg-background p-0 sm:max-w-2xl sm:rounded-xl">
        <DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>{subtitle}</DialogDescription></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function BriefBody({
  clientId,
  name,
  subtitle,
  email,
  phone,
  showFull,
  onShowFull,
  onClose,
}: {
  clientId: string | null;
  name: string | null;
  subtitle: string;
  email: string | null;
  phone: string | null;
  showFull: boolean;
  onShowFull: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const quickFn = useServerFn(getLenderQuickBrief);
  const fullFn = useServerFn(generateHomeownerReviewBrief);
  const outcomeFn = useServerFn(logLenderOutcome);
  const [tone, setTone] = useState<"default" | "short" | "warm">("default");
  const [logged, setLogged] = useState<string | null>(null);

  const quick = useQuery({
    queryKey: ["lender-quick-brief", clientId],
    queryFn: () => quickFn({ data: { clientId: clientId! } }),
    enabled: Boolean(clientId),
    staleTime: 5 * 60_000,
  });

  const full = useQuery({
    queryKey: ["lender-brief", clientId],
    queryFn: () => fullFn({ data: { clientId: clientId! } }),
    enabled: Boolean(clientId) && showFull,
    staleTime: 5 * 60_000,
  });

  const outcome = useMutation({
    mutationFn: (stage: string) =>
      outcomeFn({ data: { clientId: clientId!, stage: stage as never } }),
    onSuccess: (res: any) => {
      setLogged(res?.confirmation ?? "Logged.");
      toast.success(res?.confirmation ?? "Logged");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const b = quick.data?.ok ? quick.data.brief : null;

  if (quick.isFetching && !b) {
    return (
      <div className="space-y-4 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-3/4 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!b) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {quick.data?.reason ?? "This brief isn't available."}
      </p>
    );
  }

  const opener =
    tone === "short"
      ? (b.opener.split(/(?<=[.?!])\s+/)[0] ?? b.opener)
      : tone === "warm"
        ? `Hi — hope you're doing well. ${b.opener}`
        : b.opener;

  const m = b.metrics;
  const headline = b.reviews?.[0]?.label ?? (m.annualReviewDue ? "Annual review opportunity" : "Homeowner review opportunity");
  const whyRows = [...(b.reviews ?? []).flatMap((review: any) => review.why ?? []), b.whyToday].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).slice(0, 5);

  return (
    <div>
      <div className="bg-sucasa-navy px-5 pb-5 pt-7 text-primary-foreground sm:px-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">Homeowner finance review</p>
        <h2 className="mt-2 pr-8 text-2xl font-semibold leading-tight">{name ?? b.name}</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-primary-foreground/75"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{subtitle}</p>
        <div className="mt-5 grid grid-cols-4 divide-x divide-primary-foreground/15 border-t border-primary-foreground/15 pt-4">
          <HeroMetric label="Est. value" value={formatCents(m.estimatedValueCents)} />
          <HeroMetric label="Equity" value={formatCents(m.estimatedEquityCents)} />
          <HeroMetric label="Est. LTV" value={m.estimatedLtvPct != null ? `${m.estimatedLtvPct}%` : "—"} />
          <HeroMetric label="Mortgage age" value={m.loanAgeYears != null ? `${m.loanAgeYears} yr` : "—"} />
        </div>
      </div>

      <div className="space-y-7 px-5 py-6 sm:px-7">
        <section className="border-l-4 border-sucasa-orange pl-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-opportunity">Opportunity summary</p>
          <h3 className="mt-1 text-xl font-semibold text-sucasa-navy">{headline}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{b.whyHere}</p>
        </section>

        <Section title="Why now">
          <div className="divide-y divide-border">
            {whyRows.map((row: string, i: number) => <SignalRow key={`${row}-${i}`} text={row} primary={i === 0} />)}
          </div>
        </Section>

        <section className="rounded-lg bg-secondary p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-intelligence-accent">Lender intelligence</p><h3 className="mt-1 text-lg font-semibold text-sucasa-navy">Finance &amp; homeowner review</h3></div>
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 divide-y divide-border">
            {(b.reviews ?? []).map((review: any) => <div key={review.id} className="py-3"><p className="text-sm font-semibold text-sucasa-navy">{review.label}</p><p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{review.blurb}</p></div>)}
            <div className="py-3"><p className="text-sm font-semibold text-sucasa-navy">Relationship context</p><p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{b.relationship}</p></div>
            {m.dataGap && <div className="py-3"><p className="text-sm font-semibold text-sucasa-navy">Information status</p><p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{m.dataGap}</p></div>}
          </div>
        </section>

        <section className="rounded-lg border-l-4 border-intelligence-accent bg-surface-intelligence p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-intelligence-accent"><Quote className="h-3 w-3" /> Suggested conversation</p>
          <p className="mt-2 text-[15px] leading-relaxed text-sucasa-navy">{opener}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(opener); toast.success("Copied"); }} className="mt-2 px-0 text-primary hover:bg-transparent"><Copy /> Copy</Button>
        </section>
        <div className="flex flex-wrap gap-1.5">
          {([ ["default", "Original"], ["short", "Make shorter"], ["warm", "Make warmer"] ] as const).map(([k, label]) => (
            <Button key={k} type="button" variant={tone === k ? "secondary" : "ghost"} size="sm" onClick={() => setTone(k)} className="rounded-full">{label}</Button>
          ))}
        </div>

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What to do next</p>
          <p className="mt-1.5 text-sm font-semibold text-sucasa-navy">{b.recommendedAction}</p>
          <Button type="button" onClick={onShowFull} disabled={showFull} className="mt-3 h-12 w-full rounded-lg bg-action-primary text-action-primary-foreground"><Sparkles /> {showFull ? "Homeowner review brief" : "Generate homeowner review brief"}</Button>
          {showFull && (full.isFetching ? <div className="mt-3 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div> : <pre className="mt-3 whitespace-pre-wrap border-l-2 border-intelligence-accent pl-4 font-sans text-sm leading-relaxed">{full.data?.brief}</pre>)}
          <QuickContact name={name} email={b.channels.email ? email : null} phone={b.channels.call || b.channels.text ? phone : null} allowCall={b.channels.call} allowText={b.channels.text} />
        </section>

        <Section title="Supporting details">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <DetailFact label="Est. balance" value={formatCents(m.estimatedBalanceCents)} />
            <DetailFact label="Tenure" value={m.tenureYears != null ? `${m.tenureYears} years` : "—"} />
            <DetailFact label="Review timing" value={m.annualReviewDue ? "Review due" : "Current"} />
            <DetailFact label="Value source" value={m.valueSource === "property_record" ? "Property records" : "Loan estimate"} />
          </div>
        </Section>

        <Section title="Questions to ask">
          <ol className="space-y-2">{b.questions.map((q, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary"><span className="font-semibold text-intelligence-accent">{i + 1}.</span>{q}</li>)}</ol>
        </Section>

        <Section title="Log the outcome">
          {logged ? <p className="text-sm text-status-positive">{logged}</p> : <div className="flex flex-wrap gap-1.5">{QUICK_OUTCOMES.map(([stage, label]) => <Button key={label} type="button" variant="outline" size="sm" disabled={outcome.isPending} onClick={() => outcome.mutate(stage)} className="rounded-full text-xs">{label}</Button>)}</div>}
        </Section>

        <div className="rounded-lg bg-secondary p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Compliance notes</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">{COMPLIANCE_NOTES.map((n) => <li key={n}>• {n}</li>)}</ul>
        </div>

        <Button type="button" onClick={onClose} variant="secondary" className="h-11 w-full rounded-lg">Close</Button>
      </div>
    </div>
  );
}

function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return dollars >= 1_000_000 ? `$${(dollars / 1_000_000).toFixed(1)}M` : dollars >= 1_000 ? `$${Math.round(dollars / 1_000)}k` : `$${Math.round(dollars).toLocaleString()}`;
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0"><p className="text-[9px] leading-tight text-primary-foreground/60">{label}</p><p className="mt-1 truncate text-sm font-semibold text-primary-foreground">{value}</p></div>;
}

function SignalRow({ text, primary }: { text: string; primary: boolean }) {
  return <div className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", primary ? "bg-sucasa-orange/10 text-status-opportunity" : "bg-status-positive/10 text-status-positive")}>{primary ? <Sparkles className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span><p className="text-sm leading-relaxed text-sucasa-navy">{text}</p></div>;
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-sucasa-navy">{value}</p></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

/** Tap-to-email / tap-to-call rows, shown when the caller passes details. */
function QuickContact({
  name,
  email,
  phone,
  allowCall,
  allowText,
}: {
  name: string | null;
  email: string | null;
  phone: string | null;
  allowCall: boolean;
  allowText: boolean;
}) {
  if (!email && !phone) return null;
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  const mailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent("Following up on your home")}&body=${encodeURIComponent(`Hi ${first},\n\n`)}`
    : null;
  const phoneValue = phone ? phone.replace(/[^0-9+]/g, "") : null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {mailHref && (
        <a
          href={mailHref}
          className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:border-primary"
        >
          <Mail className="h-4 w-4 text-primary" /> Email
        </a>
      )}
      {allowCall && phoneValue && (
        <a
          href={`tel:${phoneValue}`}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:border-primary"
        >
          <Phone className="h-4 w-4 text-primary" /> Call
        </a>
      )}
      {allowText && phoneValue && <a href={`sms:${phoneValue}`} className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:border-primary"><MessageSquare className="h-4 w-4 text-primary" /> Text</a>}
    </div>
  );
}
