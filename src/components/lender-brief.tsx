import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  generateHomeownerReviewBrief,
  getLenderQuickBrief,
} from "@/lib/lender-workspace.functions";
import { COMPLIANCE_NOTES } from "@/lib/lender-access";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * The 30-Second Brief, with the full Homeowner Review Brief one tap behind it.
 * Both are built only from facts this lender is permitted to see; the full
 * brief keeps its existing compliance checking.
 */
export function LenderBriefDialog({
  clientId,
  name,
  onClose,
}: {
  clientId: string | null;
  name: string | null;
  onClose: () => void;
}) {
  const quickFn = useServerFn(getLenderQuickBrief);
  const fullFn = useServerFn(generateHomeownerReviewBrief);
  const [showFull, setShowFull] = useState(false);

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

  const b = quick.data?.ok ? quick.data.brief : null;

  return (
    <Dialog
      open={Boolean(clientId)}
      onOpenChange={(o) => {
        if (!o) {
          setShowFull(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>30-second brief{name ? `: ${name}` : ""}</DialogTitle>
          <DialogDescription>
            Everything you need to start the conversation, from the information on file.
          </DialogDescription>
        </DialogHeader>

        {quick.isFetching && !b ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
          </p>
        ) : !b ? (
          <p className="text-sm text-muted-foreground">
            {quick.data?.reason ?? "This brief isn't available."}
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <Block title="Why them">{b.whyHere}</Block>
            <Block title="Why today">{b.whyToday}</Block>
            {b.facts.length > 0 && (
              <Block title="What you should know">
                <ul className="space-y-0.5">
                  {b.facts.map((f, i) => (
                    <li key={i}>• {f}</li>
                  ))}
                </ul>
              </Block>
            )}
            <Block title="Relationship">{b.relationship}</Block>
            <Block title="Objective">{b.objective}</Block>
            <Block title="Recommended action">{b.recommendedAction}</Block>
            <Block title="How to open">“{b.opener}”</Block>
            <Block title="Questions to ask">
              <ul className="space-y-0.5">
                {b.questions.map((q, i) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            </Block>
          </div>
        )}

        {!showFull ? (
          <Button variant="secondary" onClick={() => setShowFull(true)}>
            View full review brief
          </Button>
        ) : full.isFetching ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing the full brief…
          </p>
        ) : (
          <pre className="whitespace-pre-wrap border-t border-border/60 pt-3 font-sans text-sm leading-relaxed">
            {full.data?.brief}
          </pre>
        )}

        <div className="rounded-2xl border border-border/70 bg-secondary/40 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Compliance notes
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {COMPLIANCE_NOTES.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>

        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="mt-0.5 leading-relaxed">{children}</div>
    </div>
  );
}
