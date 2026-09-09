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
  Quote,
} from "lucide-react";
import {
  getLenderWorkspace,
  logLenderOutcome,
  setOutreachPermissions,
} from "@/lib/lender-workspace.functions";
import { PRIORITY_LABEL } from "@/lib/lender-access";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { IntelligenceSurface } from "@/components/intelligence-surface";

type Workspace = NonNullable<Awaited<ReturnType<typeof getLenderWorkspace>>>;
export type Person = Workspace["book"][number];

const TEMP = {
  hot: {
    label: "Hot",
    dot: "bg-attention",
    chip: "bg-attention/15 text-attention-foreground",
    card: "border-attention/35",
  },
  warm: {
    label: "Warm",
    dot: "bg-growth",
    chip: "bg-growth/12 text-growth",
    card: "border-growth/30",
  },
  nurture: {
    label: "Nurture",
    dot: "bg-muted-foreground/50",
    chip: "bg-secondary text-muted-foreground",
    card: "border-border/70",
  },
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
 * One homeowner, one screenful of decision. Collapsed it answers who, why now
 * and what to do; the opener, facts and permissions live behind disclosure.
 *
 * `spotlight` is the "Start here" presentation — same data, more room. It never
 * changes ranking; the caller decides who is first.
 */
export function LenderContactCard({
  person,
  rank,
  onBrief,
  spotlight = false,
}: {
  person: Person;
  rank: number;
  onBrief: () => void;
  spotlight?: boolean;
}) {
  const qc = useQueryClient();
  const outcomeFn = useServerFn(logLenderOutcome);
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const [done, setDone] = useState<{ text: string; nextStep?: string | null } | null>(null);

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

  const outcome = useMutation({
    mutationFn: (stage: string) =>
      outcomeFn({ data: { clientId: person.id, stage: stage as never } }),
    onSuccess: (res: any) => {
      setDone({
        text: res?.confirmation ?? "Outcome recorded.",
        nextStep:
          res?.nextStep && res?.dueAt
            ? `${res.nextStep} · due ${new Date(res.dueAt).toLocaleDateString()}`
            : null,
      });
      setLogging(false);
      toast.success(res?.confirmation ?? "Outcome recorded");
      qc.invalidateQueries({ queryKey: ["lender-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = TEMP[person.temperature ?? "nurture"];
  const review = person.reviews[0];

  // The recommended action decides which channel gets visual weight.
  const action = (person.recommendedAction ?? "").toLowerCase();
  const preferred = action.includes("call")
    ? "call"
    : action.includes("text")
      ? "text"
      : action.includes("email") || action.includes("send")
        ? "email"
        : null;

  return (
    <li
      className={cn(
        "overflow-hidden rounded-[28px] border bg-card shadow-soft transition duration-200 active:scale-[0.995]",
        t.card,
        spotlight && "border-border-subtle shadow-elevated",
      )}
    >
      <div className={cn("p-5", spotlight && "sm:p-6")}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                t.chip,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
              {t.label}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {review?.label ?? "Relationship check-in"}
            </span>
          </div>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground/70">
            {rank}
          </span>
        </div>

        <h3
          className={cn(
            "mt-3 font-semibold leading-tight tracking-tight",
            spotlight ? "text-[28px]" : "text-[21px]",
          )}
        >
          {person.name}
        </h3>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          {person.whyToday} {person.urgencyReason}
        </p>

        <div className={cn("rounded-2xl bg-secondary/50 p-3.5", spotlight ? "mt-4" : "mt-3")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Recommended
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug">
            {person.recommendedAction}
          </p>
        </div>

        {spotlight && (
          <IntelligenceSurface
            label="Suggested opener"
            icon={<Quote className="h-3 w-3" />}
            compact
            className="mt-3"
          >
            <p className="text-[15px] leading-relaxed">{person.opener}</p>
          </IntelligenceSurface>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Channel
            allowed={person.channels.call}
            emphasis={preferred === "call"}
            reason={person.channelReasons["call"]!}
            icon={<Phone className="h-4 w-4" />}
            label="Call"
            href={person.phone ? `tel:${person.phone}` : undefined}
          />
          <Channel
            allowed={person.channels.text}
            emphasis={preferred === "text"}
            reason={person.channelReasons["text"]!}
            icon={<MessageSquare className="h-4 w-4" />}
            label="Text"
            href={person.phone ? `sms:${person.phone}` : undefined}
          />
          <Channel
            allowed={person.channels.email}
            emphasis={preferred === "email"}
            reason={person.channelReasons["email"]!}
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            href={person.email ? `mailto:${person.email}` : undefined}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onBrief}
            className="inline-flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-2xl border border-action-primary/30 bg-action-primary/8 px-4 py-1.5 text-action-primary transition active:scale-[0.98]"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-4 w-4" /> Prepare me
            </span>
            <span className="text-[11px] font-medium text-primary/70">
              30-second relationship brief
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLogging((v) => !v)}
            className="min-h-[44px] rounded-2xl border border-border px-4 text-sm font-semibold text-muted-foreground transition active:scale-[0.98]"
          >
            Log outcome
          </button>
        </div>

        {done && (
          <div className="mt-3 rounded-2xl border border-growth/30 bg-growth/8 p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-growth">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Relationship handled
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{done.text}</p>
            {done.nextStep && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {done.nextStep}
              </p>
            )}
          </div>
        )}

        {logging && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {OUTCOMES.map(([stage, label]) => (
              <button
                key={stage}
                type="button"
                disabled={outcome.isPending}
                onClick={() => outcome.mutate(stage)}
                className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition active:scale-95 hover:text-foreground"
              >
                {label}
              </button>
            ))}
            <p className="w-full pt-1 text-xs text-muted-foreground">
              SuCasa schedules the follow-up for you. It never contacts a homeowner on its own.
            </p>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 bg-secondary/30 py-2.5 text-xs font-semibold text-muted-foreground transition active:bg-secondary/60"
      >
        More intelligence
        <ChevronDown className={cn("h-3.5 w-3.5 transition duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/60 px-5 py-4">
          <Field label="Objective">{person.objective}</Field>

          {person.dataGap ? (
            <Field label="Snapshot">
              <span className="text-muted-foreground">{person.dataGap}</span>
            </Field>
          ) : (
            <div>
              <Label>Snapshot</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {person.estimatedValueCents != null && (
                  <Metric label="Est. value" value={formatMoney(person.estimatedValueCents)} />
                )}
                {person.estimatedEquityCents != null && (
                  <Metric
                    label="Est. equity"
                    value={formatMoney(person.estimatedEquityCents)}
                    tone="growth"
                  />
                )}
                {person.estimatedLtvPct != null && (
                  <Metric label="Est. LTV" value={`${person.estimatedLtvPct}%`} />
                )}
                {person.loanAgeYears != null && (
                  <Metric label="Loan age" value={`${person.loanAgeYears} yrs`} />
                )}
              </div>
            </div>
          )}

          {review?.why?.length ? (
            <div>
              <Label>Key signals</Label>
              <ul className="mt-1 space-y-0.5 text-sm">
                {review.why.slice(0, 3).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {person.openNextStep?.dueAt && (
            <Field label="Scheduled">
              {person.openNextStep.label} · due{" "}
              {new Date(person.openNextStep.dueAt).toLocaleDateString()}
            </Field>
          )}

          <div className="rounded-2xl bg-secondary/40 p-3.5">
            <Label>Record what this homeowner agreed to</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
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
                    "rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition active:scale-95",
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
        </div>
      )}
    </li>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-0.5 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "growth";
}) {
  return (
    <div className="rounded-2xl bg-secondary/50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-[15px] font-semibold tabular-nums",
          tone === "growth" && "text-growth",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Channel({
  allowed,
  reason,
  icon,
  label,
  href,
  emphasis,
}: {
  allowed: boolean;
  reason: string;
  icon: React.ReactNode;
  label: string;
  href?: string;
  emphasis?: boolean;
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
      className={cn(
        "inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-5 text-sm font-semibold transition active:scale-95",
        emphasis
          ? "bg-primary text-primary-foreground shadow-soft"
          : "border border-primary/30 bg-primary/8 text-primary",
      )}
    >
      {icon} {label}
    </a>
  );
}
