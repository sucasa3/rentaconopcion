import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ChevronRight, ListChecks, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { getMyBusinessTasks, setBusinessTaskDone } from "@/lib/tasks.functions";
import { SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

type Task = {
  key: string;
  orgId: string;
  title: string;
  who: string | null;
  why: string;
  urgency: "now" | "later";
  actionLabel: string;
  to: string | null;
  params: Record<string, string> | null;
  search: Record<string, string> | null;
  done: boolean;
  completedAt: string | null;
};

function TaskCard({
  task,
  onToggle,
  busy,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  busy: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border/70 bg-card p-4 shadow-soft transition",
        task.done && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(task)}
          aria-label={task.done ? "Reopen task" : "Mark task done"}
          className="mt-0.5 shrink-0 text-muted-foreground transition hover:text-growth disabled:opacity-50"
        >
          {task.done ? (
            <CheckCircle2 className="h-6 w-6 text-growth" />
          ) : (
            <Circle className="h-6 w-6" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-sm font-semibold leading-snug",
                task.done && "line-through decoration-muted-foreground/60",
              )}
            >
              {task.title}
            </p>
            {!task.done && task.urgency === "now" && (
              <StatusPill tone="attention">Do now</StatusPill>
            )}
          </div>
          {task.who && <p className="mt-0.5 text-sm text-muted-foreground">{task.who}</p>}
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{task.why}</p>
          {task.to && task.actionLabel && !task.done && (
            <Link
              to={task.to as never}
              params={task.params as never}
              search={task.search as never}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
            >
              {task.actionLabel} <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** The shared "what's on my plate" list for agents and lenders. */
export function TasksWorkspace({ kind }: { kind: "agent" | "lender" }) {
  const listFn = useServerFn(getMyBusinessTasks);
  const doneFn = useServerFn(setBusinessTaskDone);
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["business-tasks", kind],
    queryFn: () => listFn({ data: { orgType: kind } }),
    staleTime: 30_000,
  });

  const tasks = (data?.tasks ?? []) as Task[];
  const { now, later, done } = useMemo(
    () => ({
      now: tasks.filter((t) => !t.done && t.urgency === "now"),
      later: tasks.filter((t) => !t.done && t.urgency === "later"),
      done: tasks.filter((t) => t.done),
    }),
    [tasks],
  );

  const toggle = async (t: Task) => {
    setBusyKey(t.key);
    try {
      const res = await doneFn({
        data: { orgId: t.orgId, taskKey: t.key, done: !t.done },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (!t.done) toast.success("Nice — that's off your plate.");
      await qc.invalidateQueries({ queryKey: ["business-tasks", kind] });
    } catch {
      toast.error("Could not update that task");
    } finally {
      setBusyKey(null);
    }
  };

  if (isLoading) {
    return <div className="p-5 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tasks</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          What needs you today
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We build this list from what's happening in your book. Check something off and it moves
          out of your way.
        </p>
      </header>

      <section className="space-y-3">
        <SectionHeader title="Do now" />
        {now.length === 0 ? (
          <EmptyState
            icon={<PartyPopper className="mx-auto h-7 w-7" />}
            title="You're all caught up"
            hint="New tasks appear the moment something changes in your book."
          />
        ) : (
          <div className="space-y-3">
            {now.map((t) => (
              <TaskCard key={t.key} task={t} onToggle={toggle} busy={busyKey === t.key} />
            ))}
          </div>
        )}
      </section>

      {later.length > 0 && (
        <section className="space-y-3">
          <SectionHeader title="When you have time" />
          <div className="space-y-3">
            {later.map((t) => (
              <TaskCard key={t.key} task={t} onToggle={toggle} busy={busyKey === t.key} />
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"
          >
            <ListChecks className="h-4 w-4" />
            {showDone ? "Hide" : "Show"} completed ({done.length})
          </button>
          {showDone && (
            <div className="space-y-3">
              {done.map((t) => (
                <TaskCard key={t.key} task={t} onToggle={toggle} busy={busyKey === t.key} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
