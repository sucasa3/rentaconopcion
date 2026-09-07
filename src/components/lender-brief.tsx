import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Sparkles, Quote, Mail, Phone } from "lucide-react";
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

  const title = `30-second brief${name ? `: ${name}` : ""}`;
  const subtitle =
    subtitleLine ||
    "Everything you need to start the conversation, based on the information on file.";
  const body = (
    <>
      <QuickContact name={name} email={email ?? null} phone={phone ?? null} />
      <BriefBody
        clientId={clientId}
        showFull={showFull}
        onShowFull={() => setShowFull(true)}
        onClose={onClose}
      />
    </>
  );


  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={close}>
        <DrawerContent className="max-h-[92vh] rounded-t-[28px] border-border/60">
          <DrawerHeader className="px-5 pb-2 text-left">
            <DrawerTitle className="text-[22px] font-semibold tracking-tight">{title}</DrawerTitle>
            <DrawerDescription className="text-[13px]">{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-5 pb-8">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[86vh] overflow-y-auto rounded-3xl border-border/60 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-tight">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function BriefBody({
  clientId,
  showFull,
  onShowFull,
  onClose,
}: {
  clientId: string | null;
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

  return (
    <div className="space-y-5 pt-1">
      <Section title="Why them">
        <p className="text-[15px] leading-relaxed">{b.whyHere}</p>
      </Section>

      <Section title="Why today">
        <p className="text-[15px] leading-relaxed">{b.whyToday}</p>
      </Section>

      {b.facts.length > 0 && (
        <Section title="What you should know">
          <ul className="space-y-1.5">
            {b.facts.map((f, i) => (
              <li
                key={i}
                className="rounded-2xl bg-secondary/50 px-3.5 py-2.5 text-[15px] leading-snug"
              >
                {f}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Relationship">
        <p className="text-[15px] leading-relaxed text-muted-foreground">{b.relationship}</p>
      </Section>

      <Section title="Objective">
        <p className="text-[15px] leading-relaxed">{b.objective}</p>
      </Section>

      <Section title="Recommended action">
        <p className="rounded-2xl bg-primary/8 px-3.5 py-3 text-[15px] font-semibold leading-snug text-primary">
          {b.recommendedAction}
        </p>
      </Section>

      <Section title="How to open">
        <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-soft">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Quote className="h-3 w-3" /> Suggested conversation
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed">{opener}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              ["default", "Original"],
              ["short", "Make shorter"],
              ["warm", "Make warmer"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTone(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95",
                tone === k
                  ? "border-primary/40 bg-primary/8 text-primary"
                  : "border-border/70 text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Questions to ask">
        <ul className="space-y-1.5">
          {b.questions.map((q, i) => (
            <li key={i} className="flex gap-2 text-[15px] leading-snug">
              <span className="text-muted-foreground">{i + 1}.</span>
              {q}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Log the outcome">
        {logged ? (
          <p className="text-sm text-growth">{logged}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_OUTCOMES.map(([stage, label]) => (
              <button
                key={label}
                type="button"
                disabled={outcome.isPending}
                onClick={() => outcome.mutate(stage)}
                className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition active:scale-95 hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Section>

      {!showFull ? (
        <button
          type="button"
          onClick={onShowFull}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card text-sm font-semibold transition active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4" /> View full review brief
        </button>
      ) : full.isFetching ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-5/6 rounded-full" />
          <Skeleton className="h-4 w-2/3 rounded-full" />
        </div>
      ) : (
        <pre className="whitespace-pre-wrap border-t border-border/60 pt-4 font-sans text-[15px] leading-relaxed">
          {full.data?.brief}
        </pre>
      )}

      <div className="rounded-2xl bg-secondary/50 p-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Compliance notes
        </p>
        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          {COMPLIANCE_NOTES.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] w-full rounded-full bg-secondary text-sm font-semibold transition active:scale-[0.99]"
      >
        Close
      </button>
    </div>
  );
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
}: {
  name: string | null;
  email: string | null;
  phone: string | null;
}) {
  if (!email && !phone) return null;
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  const mailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent("Following up on your home")}&body=${encodeURIComponent(`Hi ${first},\n\n`)}`
    : null;
  const telHref = phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : null;

  return (
    <div className="mb-4 space-y-2">
      {mailHref && (
        <a
          href={mailHref}
          className="flex min-h-[44px] items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary"
        >
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="font-medium">{email}</span>
          </span>
          <span className="text-xs text-primary">Email</span>
        </a>
      )}
      {telHref && (
        <a
          href={telHref}
          className="flex min-h-[44px] items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5 text-sm transition hover:border-primary"
        >
          <span className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="font-medium">{phone}</span>
          </span>
          <span className="text-xs text-primary">Call</span>
        </a>
      )}
    </div>
  );
}
