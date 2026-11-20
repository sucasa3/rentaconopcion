import { useState } from "react";
import { formatLtvPct } from "@/lib/format-loan";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Sparkles, Quote, Mail, Phone, Copy, MapPin, MessageSquare, House } from "lucide-react";
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
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { HomeownerInviteCard } from "@/components/homeowner-invite-card";
import { SignalsPanel } from "@/components/signals-panel";

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
  const { language } = useLanguage();
  const es = language === "es";
  const label = (en: string, spanish: string) => es ? spanish : en;
  const qc = useQueryClient();
  const quickFn = useServerFn(getLenderQuickBrief);
  const fullFn = useServerFn(generateHomeownerReviewBrief);
  const outcomeFn = useServerFn(logLenderOutcome);
  const [tone, setTone] = useState<"default" | "short" | "warm">("default");
  const [logged, setLogged] = useState<string | null>(null);

  const quick = useQuery({
    queryKey: ["lender-quick-brief", clientId],
    queryFn: () => {
      if (!clientId) throw new Error("A homeowner is required.");
      return quickFn({ data: { clientId } });
    },
    enabled: Boolean(clientId),
    staleTime: 5 * 60_000,
  });

  const full = useQuery({
    queryKey: ["lender-brief", clientId],
    queryFn: () => {
      if (!clientId) throw new Error("A homeowner is required.");
      return fullFn({ data: { clientId } });
    },
    enabled: Boolean(clientId) && showFull,
    staleTime: 5 * 60_000,
  });

  const outcome = useMutation({
    mutationFn: (stage: string) => {
      if (!clientId) throw new Error("A homeowner is required.");
      return outcomeFn({ data: { clientId, stage: stage as never } });
    },
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

  const m = b.metrics;
  const hasPropertyInfo = [m.estimatedValueCents, m.estimatedEquityCents, m.estimatedBalanceCents, m.loanAgeYears, m.tenureYears].some(value => value != null);
  const hasReview = b.reviews.length > 0;
  const supported = hasPropertyInfo || hasReview;
  const baseOpener = supported ? b.opener : label("Hi — have your plans for the home changed?", "Hola — ¿han cambiado tus planes para la casa?");
  const opener = tone === "short" ? (baseOpener.split(/(?<=[.?!])\s+/)[0] ?? baseOpener) : tone === "warm" ? `${label("Hi — hope you're doing well.", "Hola — espero que estés bien.")} ${baseOpener}` : baseOpener;
  const nextAction = supported ? b.recommendedAction : label("Ask whether their plans for the home have changed.", "Pregunta si han cambiado sus planes para la casa.");

  return (
    <div>
      <div className="bg-sucasa-navy px-5 pb-4 pt-4 text-primary-foreground sm:px-7">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">{label("Lender client", "Cliente del prestamista")}</p>
            <h2 className="mt-2 truncate text-2xl font-semibold leading-tight">{name ?? b.name}</h2>
            <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-primary-foreground/75"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{subtitle}</span></p>
          </div>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/10"><House className="h-5 w-5" /></span>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4 sm:px-7">
        <Section title={label("Homeowner connection", "Conexión con el propietario")}>
          {clientId && <HomeownerInviteCard clientId={clientId} panel />}
        </Section>

        <Section title={label("Next action", "Próxima acción")}>
          {hasReview && <p className="text-base font-semibold text-foreground">{b.reviews[0]?.label}</p>}
          <p className="mt-1 text-sm text-text-secondary">{nextAction}</p>
          {supported && <Button type="button" onClick={onShowFull} disabled={showFull} className="mt-3 min-h-11 w-full whitespace-normal bg-action-primary text-action-primary-foreground"><Sparkles /> {label(showFull ? "Homeowner review brief" : "View homeowner review brief", showFull ? "Resumen del propietario" : "Ver resumen del propietario")}</Button>}
          {showFull && (full.isFetching ? <div className="mt-3 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div> : <pre className="mt-3 whitespace-pre-wrap border-l-2 border-intelligence-accent pl-4 font-sans text-sm leading-relaxed">{full.data?.brief}</pre>)}
          <QuickContact name={name} email={b.channels.email ? email : null} phone={b.channels.call || b.channels.text ? phone : null} allowCall={b.channels.call} allowText={b.channels.text} />
        </Section>

        <section className="rounded-lg border-l-4 border-intelligence-accent bg-surface-intelligence p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-intelligence-accent"><Quote className="h-3 w-3" /> {label("Suggested conversation", "Conversación sugerida")}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-sucasa-navy">{opener}</p>
          <Button type="button" variant={supported ? "ghost" : "default"} size="sm" onClick={() => { navigator.clipboard.writeText(opener); toast.success(label("Copied", "Copiado")); }} className={supported ? "mt-2 px-0 text-primary hover:bg-transparent" : "mt-3 min-h-11 w-full bg-action-primary text-action-primary-foreground"}><Copy /> {label("Copy conversation", "Copiar conversación")}</Button>
        </section>
        <div className="flex flex-wrap gap-1.5">
          {([ ["default", label("Original", "Original")], ["short", label("Make shorter", "Más breve")], ["warm", label("Make warmer", "Más cálido")] ] as const).map(([k, label]) => (
            <Button key={k} type="button" variant={tone === k ? "secondary" : "ghost"} size="sm" onClick={() => setTone(k)} className="rounded-full">{label}</Button>
          ))}
        </div>

        <Section title={label("Property details", "Detalles de la propiedad")}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <DetailFact label={label("Est. value", "Valor estimado")} value={formatCents(m.estimatedValueCents)} />
            <DetailFact label={label("Equity", "Capital")} value={formatCents(m.estimatedEquityCents)} />
            <DetailFact label={label("Est. LTV", "LTV estimado")} value={formatLtvPct(m.estimatedLtvPct) ?? "—"} />
            <DetailFact label={label("Mortgage age", "Edad de hipoteca")} value={m.loanAgeYears != null ? `${m.loanAgeYears} ${label("years", "años")}` : "—"} />
            <DetailFact label={label("Est. balance", "Saldo estimado")} value={formatCents(m.estimatedBalanceCents)} />
            <DetailFact label={label("Tenure", "Antigüedad")} value={m.tenureYears != null ? `${m.tenureYears} ${label("years", "años")}` : "—"} />
          </div>
          {m.dataGap && <p className="mt-2 text-xs text-muted-foreground">{m.dataGap}</p>}
          <p className="mt-2 text-xs text-muted-foreground">{b.relationship}</p>
          {b.reviews.map(review => <div key={review.id} className="mt-3 border-t border-border pt-2"><p className="text-sm font-medium">{review.label}</p><p className="mt-1 text-xs text-text-secondary">{review.blurb}</p>{review.why.length > 0 && <ul className="mt-1 list-inside list-disc text-xs text-text-secondary">{[...new Set(review.why)].map(reason => <li key={reason}>{reason}</li>)}</ul>}</div>)}
        </Section>

        {clientId && <SignalsPanel audience="lender" clientId={clientId} panel />}

        <Section title={label("Questions to ask", "Preguntas para hacer")}>
          <ol className="space-y-2">{b.questions.map((q, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed text-text-secondary"><span className="font-semibold text-intelligence-accent">{i + 1}.</span>{q}</li>)}</ol>
        </Section>

        <Section title={label("Log the outcome", "Registrar resultado")}>
          {logged ? <p className="text-sm text-status-positive">{logged}</p> : <div className="flex flex-wrap gap-1.5">{QUICK_OUTCOMES.map(([stage, label]) => <Button key={label} type="button" variant="outline" size="sm" disabled={outcome.isPending} onClick={() => outcome.mutate(stage)} className="rounded-full text-xs">{label}</Button>)}</div>}
        </Section>

        <div className="rounded-lg bg-secondary p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Compliance notes</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">{COMPLIANCE_NOTES.map((n) => <li key={n}>• {n}</li>)}</ul>
        </div>

        <Button type="button" onClick={onClose} variant="secondary" className="h-11 w-full rounded-lg">{label("Close", "Cerrar")}</Button>
      </div>
    </div>
  );
}

function formatCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return dollars >= 1_000_000 ? `$${(dollars / 1_000_000).toFixed(1)}M` : dollars >= 1_000 ? `$${Math.round(dollars / 1_000)}k` : `$${Math.round(dollars).toLocaleString()}`;
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-semibold text-sucasa-navy">{value}</p></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-base font-semibold text-foreground">
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
