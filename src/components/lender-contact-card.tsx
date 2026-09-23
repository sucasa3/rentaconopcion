import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, FileText, CheckCircle2, Mic } from "lucide-react";
import {
  getLenderWorkspace,
  logLenderOutcome,
  setOutreachPermissions,
} from "@/lib/lender-workspace.functions";
import { PRIORITY_LABEL } from "@/lib/lender-access";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { markCallInitiated } from "@/lib/post-call";
import { IntelligenceSurface, OpportunityDot } from "@/components/intelligence-surface";
import { ChannelActions } from "@/components/channel-actions";
import { PostCallNoteDialog } from "@/components/post-call-note";
import { Button } from "@/components/ui/button";
import type { ChannelOption, ContactChannel } from "@/lib/contact-channels";

function markLenderCall(person: { id: string; name: string }) {
  markCallInitiated({
    clientId: person.id,
    name: person.name,
    audience: "lender",
    opportunityId: null,
  });
}

type Workspace = NonNullable<Awaited<ReturnType<typeof getLenderWorkspace>>>;
export type Person = Workspace["book"][number];

/** Temperature is quiet supporting metadata — the canonical band, restyled only. */
const TEMP = {
  hot: { label: "Hot", dot: "bg-sucasa-orange", text: "text-status-opportunity" },
  warm: { label: "Warm", dot: "bg-status-attention", text: "text-status-attention" },
  nurture: { label: "Nurture", dot: "bg-status-nurture/60", text: "text-text-secondary" },
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

/**
 * Presentation of the server's channel decision. The booleans and reasons are
 * server-authoritative; the recommended action only decides visual emphasis.
 */
function channelOptions(person: Person): ChannelOption[] {
  const action = (person.recommendedAction ?? "").toLowerCase();
  const preferred: ContactChannel | null = action.includes("call")
    ? "call"
    : action.includes("text")
      ? "text"
      : action.includes("email") || action.includes("send")
        ? "email"
        : null;

  const detail: Record<ContactChannel, string | null> = {
    call: person.phone,
    text: person.phone,
    email: person.email,
  };

  return (["call", "text", "email"] as const).map((channel): ChannelOption => {
    const available = Boolean(person.channels[channel]) && Boolean(detail[channel]);
    return {
      channel,
      available,
      recommended: available && preferred === channel,
      reason:
        person.channels[channel] && !detail[channel]
          ? "No contact detail on file."
          : (person.channelReasons[channel] ?? "Not permitted yet."),
    };
  });
}

/**
 * Up to three supporting facts that the workspace already permits. Facts the
 * canonical reason already states are skipped so the reason stays the story.
 */
function supportingFacts(person: Person): string[] {
  const said = (person.whyToday ?? "").toLowerCase();
  const facts: string[] = [];
  if (person.askedToConnect) facts.push("Asked to connect");
  if (person.estimatedEquityCents != null && !said.includes("equity"))
    facts.push(
      `${formatMoney(person.estimatedEquityCents)} est. equity${
        person.estimatedLtvPct != null ? ` · ${person.estimatedLtvPct}% est. LTV` : ""
      }`,
    );
  else if (person.estimatedLtvPct != null && !said.includes("ltv"))
    facts.push(`${person.estimatedLtvPct}% est. LTV`);
  if (person.loanAgeYears != null && !said.includes("mortgage is"))
    facts.push(`Mortgage about ${person.loanAgeYears} yrs old`);
  if (person.annualReviewDue) facts.push("Annual review due");
  if (person.engagementLine) facts.push(person.engagementLine);
  if (person.tenureYears != null && !said.includes("years in the home"))
    facts.push(`${Math.round(person.tenureYears)} yrs in home`);
  if (!facts.length && person.dataGap) facts.push(person.dataGap);
  return facts.slice(0, 3);
}

function useOutcome(person: Person, onDone: (d: { text: string; nextStep?: string | null }) => void) {
  const qc = useQueryClient();
  const outcomeFn = useServerFn(logLenderOutcome);
  return useMutation({
    mutationFn: (stage: string) =>
      outcomeFn({ data: { clientId: person.id, stage: stage as never } }),
    onSuccess: (res: any) => {
      onDone({
        text: res?.confirmation ?? "Outcome recorded.",
        nextStep:
          res?.nextStep && res?.dueAt
            ? `${res.nextStep} · due ${new Date(res.dueAt).toLocaleDateString()}`
            : null,
      });
      toast.success(res?.confirmation ?? "Outcome recorded");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function ViewHomeowner({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  return (
    <Link
      to={"/lender/portfolio/$id" as never}
      params={{ id: person.portfolioId } as never}
      search={{ client: person.id } as never}
      className={cn(
        "inline-flex items-center font-semibold text-primary",
        size === "sm"
          ? "min-h-[38px] rounded-md border border-border px-3 text-sm"
          : "min-h-[44px] rounded-full border border-border-subtle px-5 text-sm",
      )}
    >
      View homeowner
    </Link>
  );
}

/**
 * Start here — the highest-priority relationship, with everything the lender
 * needs to decide and act. Ranking, permissions and outcomes are unchanged.
 */
export function LenderSpotlightCard({ person, onBrief }: { person: Person; onBrief: () => void }) {
  const tr = useT();
  const [noteOpen, setNoteOpen] = useState(false);
  const [showOutcomes, setShowOutcomes] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ text: string; nextStep?: string | null } | null>(null);
  const outcome = useOutcome(person, setDone);
  const qc = useQueryClient();
  const permissionFn = useServerFn(setOutreachPermissions);
  const permission = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      permissionFn({ data: { clientId: person.id, ...fields } as never }),
    onSuccess: () => {
      toast.success("Permission recorded");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = TEMP[person.temperature ?? "nurture"];
  const review = person.reviews[0];
  const facts = supportingFacts(person);
  const options = channelOptions(person);

  return (
    <section className="animate-in fade-in overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
      <div className="h-[3px] w-full bg-sucasa-orange" aria-hidden />
      <div className="bg-surface-warm px-5 py-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-status-opportunity">
          <OpportunityDot /> {review?.label ?? "Relationship check-in"}
        </p>
        <h2 className="mt-1 text-[25px] font-semibold leading-tight tracking-tight">
          {person.name}
        </h2>
        <p className={cn("mt-1 flex items-center gap-1.5 text-[11px] font-medium", t.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
          {t.label}
        </p>
        {facts.length > 0 && (
          <p className="mt-2 text-[13px] leading-snug text-text-secondary">{facts.join(" · ")}</p>
        )}
      </div>

      <div className="space-y-3.5 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Why now
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-primary">
            {person.whyToday}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Recommended next step
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{person.recommendedAction}</p>
        </div>

        {person.opener && (
          <IntelligenceSurface label="Suggested opener" compact>
            <p className="text-sm leading-relaxed">{person.opener}</p>
          </IntelligenceSurface>
        )}

        {person.lastConversation && (
          <IntelligenceSurface label={tr("biz.pc.last_conv")} compact>
            <div className="space-y-1 text-sm leading-relaxed">
              {person.lastConversation.reason && (
                <p>
                  <span className="font-semibold">{tr("biz.pc.why_now")}:</span>{" "}
                  {person.lastConversation.reason}
                </p>
              )}
              <p>{person.lastConversation.summary}</p>
              {person.lastConversation.opener && (
                <p>
                  <span className="font-semibold">{tr("biz.pc.suggested_opener")}:</span>{" "}
                  &ldquo;{person.lastConversation.opener}&rdquo;
                </p>
              )}
            </div>
          </IntelligenceSurface>
        )}

        <ChannelActions
          options={options}
          phone={person.phone}
          email={person.email}
          onAct={(channel) => {
            if (channel === "call") markLenderCall(person);
          }}
        >
          <ViewHomeowner person={person} />
          <button
            type="button"
            onClick={onBrief}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border-subtle px-5 text-sm font-semibold text-primary"
          >
            <FileText className="h-4 w-4" /> Prepare me
          </button>
        </ChannelActions>

        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition hover:text-foreground"
        >
          <Mic className="h-3.5 w-3.5" /> {tr("biz.pc.cta")}
        </button>

        <PostCallNoteDialog
          kind="lender"
          clientId={person.id}
          name={person.name}
          opportunityId={null}
          open={noteOpen}
          onOpenChange={setNoteOpen}
          onSaved={() => qc.invalidateQueries({ queryKey: ["lender-workspace"] })}
        />

        {done && (
          <div className="rounded-xl border border-status-positive/30 bg-status-positive/[0.07] p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-status-positive">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Relationship handled
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">{done.text}</p>
            {done.nextStep && (
              <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                {done.nextStep}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-border pt-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowOutcomes((v) => !v)}
            aria-expanded={showOutcomes}
            className="px-0 text-text-secondary hover:bg-transparent hover:text-primary"
          >
            Log outcome
            <ChevronDown
              className={cn("transition-transform", showOutcomes && "rotate-180")}
            />
          </Button>
          {showOutcomes && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {OUTCOMES.map(([stage, label]) => (
                <Button
                  key={stage}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={outcome.isPending}
                  onClick={() => outcome.mutate(stage)}
                  className="rounded-full text-text-secondary shadow-none"
                >
                  {label}
                </Button>
              ))}
              <p className="w-full pt-1 text-xs text-text-secondary">
                SuCasa schedules the follow-up for you. It never contacts a homeowner on its own.
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-border bg-secondary/40 py-2.5 text-xs font-semibold text-text-secondary"
        aria-expanded={open}
      >
        Record permissions &amp; details
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Objective
            </p>
            <p className="mt-0.5 text-sm leading-relaxed">{person.objective}</p>
          </div>

          {person.openNextStep?.dueAt && (
            <p className="text-[13px] text-text-secondary">
              Scheduled: {person.openNextStep.label} · due{" "}
              {new Date(person.openNextStep.dueAt).toLocaleDateString()}
            </p>
          )}

          <div className="rounded-xl bg-secondary/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Record what this homeowner agreed to
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Recorded permission also allows campaign sending. Without it, contact stays manual and
              one to one.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(
                [
                  ["phone_allowed", "Calls OK"],
                  ["sms_allowed", "Texts OK"],
                  ["email_allowed", "Emails OK"],
                  ["do_not_call", "Do not call"],
                  ["do_not_text", "Do not text"],
                  ["do_not_email", "Do not email"],
                ] as const
              ).map(([field, label]) => (
                <button
                  key={field}
                  type="button"
                  disabled={permission.isPending}
                  onClick={() =>
                    permission.mutate({
                      [field]: true,
                      ...(field.startsWith("do_not")
                        ? {}
                        : { consent_basis: "recorded by the loan officer" }),
                    })
                  }
                  className={cn(
                    "rounded-full border bg-background px-3 py-1.5 text-xs font-medium",
                    field.startsWith("do_not")
                      ? "border-border text-text-secondary"
                      : "border-primary/40 text-primary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-text-secondary">
            {PRIORITY_LABEL}: {person.priority} · not a credit, approval or qualification score
          </p>
        </div>
      )}
    </section>
  );
}

/** A dense queue row for the relationships after Start here. */
export function LenderQueueRow({
  person,
  rank,
  onBrief,
}: {
  person: Person;
  rank: number;
  onBrief: () => void;
}) {
  const t = TEMP[person.temperature ?? "nurture"];
  const tr = useT();
  const qc = useQueryClient();
  const [noteOpen, setNoteOpen] = useState(false);
  const review = person.reviews[0];
  const fact = supportingFacts(person)[0];
  const options = channelOptions(person);

  return (
    <li className="rounded-xl border border-border bg-card p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[16px] font-semibold leading-tight">{person.name}</p>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} aria-hidden />
          </div>
          <p className="mt-0.5 text-xs font-medium text-status-opportunity">
            {review?.label ?? "Relationship check-in"}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text-secondary">
            {fact ?? person.whyToday}
          </p>
        </div>
      </div>
      <div className="mt-2.5 border-t border-border pt-2.5">
        <ChannelActions
          options={options}
          phone={person.phone}
          email={person.email}
          size="sm"
          onAct={(channel) => {
            if (channel === "call") markLenderCall(person);
          }}
        >
          <ViewHomeowner person={person} size="sm" />
          <button
            type="button"
            onClick={onBrief}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold text-text-secondary"
          >
            Prepare me
          </button>
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            aria-label={tr("biz.pc.cta")}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-border px-3 text-sm font-semibold text-text-secondary"
          >
            <Mic className="h-4 w-4" />
          </button>
        </ChannelActions>
        <PostCallNoteDialog
          kind="lender"
          clientId={person.id}
          name={person.name}
          opportunityId={null}
          open={noteOpen}
          onOpenChange={setNoteOpen}
          onSaved={() => qc.invalidateQueries({ queryKey: ["lender-workspace"] })}
        />
      </div>
    </li>
  );
}
