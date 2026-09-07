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
      setDone(res?.confirmation ?? "Logged.");
      setLogging(false);
      toast.success(res?.confirmation ?? "Logged");
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
      )}
    >
      <div className="p-5">
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

        <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">
          {person.name}
        </h3>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">
          {person.whyToday} {person.urgencyReason}
        </p>

        <div className="mt-4 rounded-2xl bg-secondary/50 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Next best action
          </p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug">
            {person.recommendedAction}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <Quote className="h-3 w-3" /> Suggested opener
          </p>
          <p className="mt-1 text-[15px] leading-relaxed">{person.opener}</p>
        </div>

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
            className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-4 text-sm font-semibold text-primary transition active:scale-[0.98]"
          >
            <FileText className="h-4 w-4" /> 30-second brief
          </button>
          <button
            type="button"
            onClick={() => setLogging((v) => !v)}
            className="min-h-[42px] rounded-full border border-border px-4 text-sm font-semibold text-muted-foreground transition active:scale-[0.98]"
          >
            Log outcome
          </button>
        </div>

        {done && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-growth">
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
