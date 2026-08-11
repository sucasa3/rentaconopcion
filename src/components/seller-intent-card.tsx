import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Home, TrendingUp, Loader2, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { submitSellerIntent } from "@/lib/activity.functions";

const TIMEFRAMES = [
  { key: "now", label: "Ready now" },
  { key: "3_6_months", label: "3–6 months" },
  { key: "12_months", label: "About a year" },
  { key: "curious", label: "Just curious" },
] as const;

/**
 * Homeowner-facing intent capture. Framed as help, not lead capture — but the
 * submission is the strongest signal in the agent's move-intent model, so we
 * say so plainly right in the card.
 */
export function SellerIntentCard() {
  const [open, setOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<"value" | "selling" | null>(null);
  const qc = useQueryClient();

  const submitFn = useServerFn(submitSellerIntent);

  const submit = useMutation({
    mutationFn: (input: { kind: "value_request" | "selling_interest"; timeframe?: string; note?: string }) =>
      submitFn({ data: input as never }),
    onSuccess: (_r, vars) => {
      setSent(vars.kind === "value_request" ? "value" : "selling");
      setOpen(false);
      setNote("");
      toast.success(
        vars.kind === "value_request"
          ? "We'll refresh your home value and follow up."
          : "Thanks — we'll line up the right help for your timeline.",
      );
      qc.invalidateQueries({ queryKey: ["my-activity"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not send that"),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-primary/10 p-2 text-primary">
          <Home className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Thinking about your next move?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get a fresh read on what your home could sell for, or tell us your timeline and
            we'll get you the right help.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submit.mutate({ kind: "value_request" })}
          disabled={submit.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-60"
        >
          {submit.isPending && submit.variables?.kind === "value_request" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : sent === "value" ? (
            <Check className="h-4 w-4" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          What's my home worth?
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:border-foreground/30"
        >
          {sent === "selling" && <Check className="h-4 w-4 text-growth" />}
          Thinking about selling?
        </button>
      </div>

      {open && (
        <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your timeline
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeframe(t.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  timeframe === t.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything we should know? (optional)"
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!timeframe || submit.isPending}
            onClick={() =>
              submit.mutate({
                kind: "selling_interest",
                timeframe: timeframe ?? undefined,
                note: note || undefined,
              })
            }
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {submit.isPending && submit.variables?.kind === "selling_interest" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Send to my SuCasa team
          </button>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        Your agent partner can see how engaged you are with your home value and equity — never
        your documents, notes, or personal details.
      </p>
    </div>
  );
}
