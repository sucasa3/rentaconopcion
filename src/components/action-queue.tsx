import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Phone,
  MessageSquare,
  Mail,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  Eye,
  ChevronRight,
} from "lucide-react";
import {
  TEMPERATURE_META,
  OUTCOME_STAGES,
  outcomeLabel,
  type Audience,
  type OutcomeStage,
} from "@/lib/next-best-action";
import { getActionQueue, draftOutreach, sendOutreach, logOutcome } from "@/lib/nba.functions";
import { EmptyState } from "@/components/ui-kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Item = Awaited<ReturnType<typeof getActionQueue>>["items"][number];

const channelIcon = {
  call: Phone,
  text: MessageSquare,
  email: Mail,
} as const;

/**
 * The daily work queue: one card per homeowner, ranked by how ready they are
 * to hear from you, each with the single next thing to do.
 */
export function ActionQueue({ kind, limit = 25 }: { kind: Audience; limit?: number }) {
  const qc = useQueryClient();
  const queueFn = useServerFn(getActionQueue);
  const { data, isLoading } = useQuery({
    queryKey: ["action-queue", kind],
    queryFn: () => queueFn({ data: { audience: kind, limit } }),
    staleTime: 30_000,
  });
  const [composing, setComposing] = useState<Item | null>(null);

  const outcomeFn = useServerFn(logOutcome);
  const outcome = useMutation({
    mutationFn: (v: { opportunityId: string; stage: OutcomeStage }) =>
      outcomeFn({ data: { audience: kind, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(`Logged: ${outcomeLabel(v.stage, kind)}`);
      qc.invalidateQueries({ queryKey: ["action-queue", kind] });
      qc.invalidateQueries({ queryKey: ["business-funnel", kind] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading your list…</div>;

  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="mx-auto h-7 w-7" />}
        title="Nothing needs you right now"
        hint="As soon as a homeowner shows a signal, they'll show up here."
      />
    );
  }

  const base = kind === "agent" ? "/agent" : "/lender";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(["hot", "warm", "nurture"] as const).map((t) => (
          <div key={t} className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              {TEMPERATURE_META[t].emoji} {TEMPERATURE_META[t].label}
            </p>
            <p className="text-xl font-semibold">{data.counts[t]}</p>
          </div>
        ))}
      </div>

      {data.yesterday.opened + data.yesterday.clicked + data.yesterday.replied > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" /> In the last day: {data.yesterday.opened} opened,{" "}
          {data.yesterday.clicked} clicked, {data.yesterday.replied} replied.
        </p>
      )}

      <ul className="space-y-3">
        {data.items.map((item) => {
          const meta = TEMPERATURE_META[item.temperature];
          const Icon = channelIcon[item.channel];
          return (
            <li
              key={item.opportunityId}
              className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground">· {item.categoryLabel}</span>
                    {item.shared && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                        Shared
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-base font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.why}</p>
                  {item.engagementLine && (
                    <p className="mt-1 text-sm font-medium text-primary">{item.engagementLine}</p>
                  )}
                </div>
                {item.portfolioId && (
                  <Link
                    to={`${base}/portfolio/$id` as never}
                    params={{ id: item.portfolioId } as never}
                    search={{ client: item.clientId } as never}
                    className="shrink-0 rounded-full border border-border/70 p-2 text-muted-foreground"
                    aria-label={`Open ${item.name}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <p className="mt-3 text-sm font-medium">{item.headline}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                {item.channel === "call" && item.phone && (
                  <a
                    href={`tel:${item.phone}`}
                    onClick={() =>
                      outcome.mutate({
                        opportunityId: item.opportunityId,
                        stage: "attempted",
                        note: "Tapped call",
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
                {item.channel === "text" && item.phone && (
                  <a
                    href={`sms:${item.phone}`}
                    onClick={() =>
                      outcome.mutate({
                        opportunityId: item.opportunityId,
                        stage: "attempted",
                        note: "Tapped text",
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <MessageSquare className="h-4 w-4" /> Text
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setComposing(item)}
                  disabled={!item.email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  <Icon className="h-4 w-4" /> {item.email ? "Write email" : "No email on file"}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <span className="self-center text-xs text-muted-foreground">What happened?</span>
                {OUTCOME_STAGES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => outcome.mutate({ opportunityId: item.opportunityId, stage: s })}
                    disabled={outcome.isPending}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      item.lastOutcome === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 text-muted-foreground"
                    }`}
                  >
                    {outcomeLabel(s, kind)}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <ComposeDialog
        kind={kind}
        item={composing}
        onClose={() => setComposing(null)}
        onSent={() => qc.invalidateQueries({ queryKey: ["action-queue", kind] })}
      />
    </div>
  );
}

function ComposeDialog({
  kind,
  item,
  onClose,
  onSent,
}: {
  kind: Audience;
  item: Item | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [seeded, setSeeded] = useState<string | null>(null);

  if (item && seeded !== item.opportunityId) {
    setSeeded(item.opportunityId);
    setSubject(item.draftSubject ?? "");
    setBody(item.draftBody ?? "");
  }

  const draftFn = useServerFn(draftOutreach);
  const draft = useMutation({
    mutationFn: () => draftFn({ data: { audience: kind, opportunityId: item!.opportunityId } }),
    onSuccess: (r) => {
      setSubject(r.subject);
      setBody(r.body);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendFn = useServerFn(sendOutreach);
  const send = useMutation({
    mutationFn: () =>
      sendFn({ data: { audience: kind, opportunityId: item!.opportunityId, subject, body } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Sent — you'll see opens and clicks here.");
        onSent();
        onClose();
      } else {
        toast.error(r.reason ?? "Could not send.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {item?.name}</DialogTitle>
          <DialogDescription>
            Sent from your own name and reply-to address. Nothing goes out until you press send.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => draft.mutate()}
            disabled={draft.isPending}
          >
            {draft.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {body ? "Rewrite with the assistant" : "Write it for me"}
          </Button>

          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={9}
            placeholder="Your message"
          />

          <Button
            type="button"
            className="w-full"
            onClick={() => send.mutate()}
            disabled={send.isPending || !subject.trim() || !body.trim()}
          >
            {send.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send email
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
