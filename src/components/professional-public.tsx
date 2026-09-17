import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PreviewKind = "agent" | "lender";

const previewCopy = {
  agent: {
    label: "AGENT TODAY",
    person: "Jordan Lee",
    initials: "JL",
    context: "Recent permit + updated property facts",
    why: "A recent permit and updated property facts create a useful reason to reconnect.",
    opener: "“How is the project going? I can share a fresh look at your home’s current picture.”",
    next: "Review facts → Call",
    behind: ["Morgan Chen", "Avery Brooks"],
  },
  lender: {
    label: "LENDER TODAY",
    person: "Riley Ortega",
    initials: "RO",
    context: "Est. value $486K · Est. equity $214K",
    why: "The loan has been in place about six years. A factual review may be useful.",
    opener: "“Would a quick review of where the home and loan stand today be helpful?”",
    next: "Review context → Start conversation",
    behind: ["Cameron Diaz", "Taylor Morgan"],
  },
} as const;

export function ProfessionalPreview({ kind }: { kind: PreviewKind }) {
  const copy = previewCopy[kind];
  return (
    <div className="professional-preview relative mx-auto w-full max-w-[470px] pb-7 pt-3 md:mx-0 md:justify-self-end">
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-muted-foreground">
        <span>{copy.label}</span>
        <span className="rounded-full border border-border bg-card px-2 py-1">ILLUSTRATIVE DEMO</span>
      </div>
      <div aria-hidden="true" className="absolute inset-x-8 bottom-1 top-20 rotate-2 rounded-lg border border-border bg-card/80 shadow-soft" />
      <div aria-hidden="true" className="absolute inset-x-4 bottom-4 top-14 -rotate-1 rounded-lg border border-border bg-surface-warm shadow-soft" />
      <article className="professional-priority-card relative overflow-hidden rounded-lg border border-border bg-card shadow-elevated">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-sucasa-navy px-4 py-3 text-primary-foreground sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-primary-foreground/65">PRIORITY 01</p>
            <p className="mt-1 truncate text-base font-semibold">Start here today</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/10 text-xs font-semibold">{copy.initials}</span>
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-status-opportunity">WHO</p>
          <h2 className="mt-1 text-xl font-semibold">{copy.person}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Fictional homeowner · demo record</p>
          {kind === "lender" && (
            <div className="professional-reveal mt-4 rounded-md border border-border bg-surface-warm p-3">
              <p className="text-[10px] font-semibold text-muted-foreground">PROPERTY / MORTGAGE CONTEXT</p>
              <p className="mt-1 text-sm font-medium">{copy.context}</p>
            </div>
          )}
          <div className="professional-reveal mt-4 border-l-2 border-sucasa-orange pl-3 [animation-delay:120ms]">
            <p className="text-[10px] font-semibold text-muted-foreground">WHY NOW</p>
            <p className="mt-1 text-sm leading-relaxed">{copy.why}</p>
          </div>
          <div className="professional-reveal mt-4 rounded-md bg-surface-intelligence p-3 [animation-delay:240ms]">
            <p className="text-[10px] font-semibold text-surface-intelligence-foreground">WHAT TO SAY</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.opener}</p>
          </div>
          <div className="professional-reveal mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 [animation-delay:360ms]">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground">WHAT TO DO NEXT</p>
              <p className="mt-1 truncate text-sm font-semibold">{copy.next}</p>
            </div>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sucasa-orange text-sucasa-orange-foreground"><ArrowRight className="h-4 w-4" /></span>
          </div>
        </div>
      </article>
      <div className="relative mt-3 flex justify-center gap-2 text-[10px] text-muted-foreground">
        {copy.behind.map((name, index) => <span key={name} className="rounded-full border border-border bg-card px-3 py-1.5 shadow-soft">{String(index + 2).padStart(2, "0")} · {name}</span>)}
      </div>
      <p className="relative mt-3 text-center text-[11px] text-muted-foreground">All displayed people and details are fictional.</p>
    </div>
  );
}

export function FourAnswers({ audience }: { audience: PreviewKind }) {
  const items = audience === "agent"
    ? [
        ["KNOW WHO", "Prioritize the homeowners worth your attention."],
        ["KNOW WHY", "Understand the property or relationship fact behind the conversation."],
        ["KNOW WHAT TO SAY", "Start with relevant context instead of a generic check-in."],
        ["KNOW WHAT TO DO NEXT", "Review, call, text or email from one focused workflow."],
      ]
    : [
        ["FIND THE OPPORTUNITY", "SuCasa organizes useful home and relationship signals."],
        ["UNDERSTAND WHY NOW", "See the actual fact behind the priority."],
        ["KNOW HOW TO APPROACH IT", "Get context and a relevant suggested opener."],
        ["TAKE THE NEXT STEP", "Move from intelligence into a real conversation."],
      ];
  return (
    <section className="border-y border-border bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-5">
        <p className="text-sm font-semibold text-status-opportunity">One focused workflow</p>
        <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">{audience === "agent" ? "Turn your database into a daily plan." : "Turn your book into conversations."}</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([title, copy], index) => (
            <article key={title} className="bg-card p-5">
              <span className="text-xs font-semibold text-status-opportunity">0{index + 1}</span>
              <h3 className="mt-6 text-sm font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TrustStatement({ kind }: { kind: PreviewKind }) {
  return (
    <section className="bg-surface-warm py-9 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-4 px-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
        <ShieldCheck className="h-7 w-7 text-status-positive" />
        <div>
          <h2 className="text-2xl font-semibold">{kind === "agent" ? "Your relationships stay yours." : "Your book stays yours."}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{kind === "agent" ? "Uploading a homeowner gives another professional no automatic access to your client, notes or private workspace." : "SuCasa keeps professional workspaces separate. Uploading a relationship creates no permission to another professional’s private client information or homeowner-private data."}</p>
          {kind === "lender" && <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">SuCasa can also help you bring more value to the agents you already work with—without giving you automatic access to their databases.</p>}
        </div>
      </div>
    </section>
  );
}

export function PlanCard({ name, price, description, features, featured, footer }: { name: string; price: string; description: string; features: string[]; featured?: boolean; footer: ReactNode }) {
  return (
    <article className={cn("flex h-full flex-col rounded-lg border bg-card p-5 shadow-soft", featured ? "border-sucasa-orange" : "border-border")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><h2 className="text-lg font-semibold">{name}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </div>
      <p className="mt-6 text-3xl font-semibold tabular-nums">{price}</p>
      <ul className="mt-5 space-y-2">
        {features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-muted-foreground"><Check className="mt-0.5 h-4 w-4 shrink-0 text-status-positive" />{feature}</li>)}
      </ul>
      <div className="mt-auto pt-6">{footer}</div>
    </article>
  );
}