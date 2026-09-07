import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ChevronDown,
  FileText,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { getLenderWorkspace, logLenderOutcome } from "@/lib/lender-workspace.functions";
import { PRIORITY_LABEL } from "@/lib/lender-access";
import { StatusPill } from "@/components/ui-kit";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Workspace = NonNullable<Awaited<ReturnType<typeof getLenderWorkspace>>>;
export type Person = Workspace["book"][number];

const TEMP = {
  hot: { emoji: "🔥", label: "Hot", cls: "border-attention/40 bg-attention/5", tone: "attention" },
  warm: { emoji: "🟡", label: "Warm", cls: "border-growth/40 bg-growth/5", tone: "growth" },
  nurture: { emoji: "🔵", label: "Nurture", cls: "border-border/70 bg-card", tone: "muted" },
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
 * One homeowner, one screenful of decision. Collapsed it answers who, why now,
 * what to do and what to say; everything else lives behind the disclosure.
 */
export function LenderContactCard({
  person,
  rank,
  onBrief,
}: {
  person: Person;
  rank: number;
  onBrief: () => void;
}) {
  const qc = useQueryClient();
  const outcomeFn = useServerFn(logLenderOutcome);
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const outcome = useMutation({
    mutationFn: (stage: string) => outcomeFn({ data: { clientId: person.id, stage: stage as never } }),
    onSuccess: (res: any) => {
      setDone(res?.confirmation ?? "Logged.");
      setLogging(false);
      toast.success(res?.confirmation ?? "Logged");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = TEMP[person.temperature ?? "nurture"];
  const review = person.reviews[0];

  return (
    <li className={cn("rounded-3xl border p-4 shadow-soft", t.cls)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={t.tone as never}>
            {t.emoji} {t.label}
          </StatusPill>
          <span className="text-xs text-muted-foreground">
            {review?.label ?? "Relationship check-in"}
          </span>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">#{rank}</span>
      </div>

      <p className="mt-2 text-lg font-semibold leading-tight">{person.name}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {person.whyToday} · {person.urgencyReason}
      </p>

      <p className="mt-2 text-sm">
        <span className="font-semibold">Next: </span>
        {person.recommendedAction}
      </p>

      <p className="mt-2 rounded-2xl bg-background/70 p-3 text-sm leading-relaxed">
        “{person.opener}”
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Channel
          allowed={person.channels.call}
          reason={person.channelReasons["call"]!}
          icon={<Phone className="h-4 w-4" />}
          label="Call"
          href={person.phone ? `tel:${person.phone}` : undefined}
        />
        <Channel
          allowed={person.channels.text}
          reason={person.channelReasons["text"]!}
          icon={<MessageSquare className="h-4 w-4" />}
          label="Text"
          href={person.phone ? `sms:${person.phone}` : undefined}
        />
        <Channel
          allowed={person.channels.email}
          reason={person.channelReasons["email"]!}
          icon={<Mail className="h-4 w-4" />}
          label="Email"
          href={person.email ? `mailto:${person.email}` : undefined}
        />
        <button
          type="button"
          onClick={() => setLogging((v) => !v)}
          className="ml-auto min-h-[40px] rounded-full border border-border px-4 text-sm font-semibold"
        >
          Log outcome
        </button>
      </div>

      {done && (
        <p className="mt-2 flex items-start gap-1.5 text-sm text-growth">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {done}
        </p>
      )}

      {logging && (
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
          <p className="w-full pt-1 text-xs text-muted-foreground">
            SuCasa schedules the follow-up for you. It never contacts a homeowner on its own.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
      >
        More intelligence
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-3">
          <p className="text-sm">
            <span className="font-semibold">Objective: </span>
            {person.objective}
          </p>
          {person.dataGap ? (
            <p className="text-sm text-muted-foreground">{person.dataGap}</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              {person.estimatedValueCents != null && (
                <span>Estimated value {formatMoney(person.estimatedValueCents)}</span>
              )}
              {person.estimatedEquityCents != null && (
                <span>Estimated equity {formatMoney(person.estimatedEquityCents)}</span>
              )}
              {person.estimatedLtvPct != null && <span>Estimated LTV {person.estimatedLtvPct}%</span>}
              {person.loanAgeYears != null && <span>Loan age {person.loanAgeYears} yrs</span>}
            </div>
          )}
          {review?.why?.length ? (
            <ul className="space-y-0.5 text-sm">
              {review.why.slice(0, 3).map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          ) : null}
          {person.openNextStep?.dueAt && (
            <p className="text-xs text-muted-foreground">
              Scheduled: {person.openNextStep.label} · due{" "}
              {new Date(person.openNextStep.dueAt).toLocaleDateString()}
            </p>
          )}
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="text-xs font-semibold">Record what this homeowner agreed to</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Recorded permission also allows campaign sending. Without it, contact stays manual and
              one to one.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    field.startsWith("do_not")
                      ? "border-border/70 text-muted-foreground"
                      : "border-primary/40 text-primary",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {PRIORITY_LABEL}: {person.priority} · not a credit, approval or qualification score
          </p>
          <button
            type="button"
            onClick={onBrief}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold"
          >
            <FileText className="h-4 w-4" /> 30-second brief
          </button>

        </div>
      )}
    </li>
  );
}

function Channel({
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
        className="inline-flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-1 text-xs font-medium text-muted-foreground"
      >
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">{label}</span>
        <span className="truncate">· {!href && allowed ? "No contact detail on file." : reason}</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
    >
      {icon} {label}
    </a>
  );
}
