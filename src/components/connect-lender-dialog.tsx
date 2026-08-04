import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Phone, Mail, Loader2, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMatchedLenderForMe, createRefiIntent } from "@/lib/lender.functions";
import { BENCHMARK_REFI_RATE, estimateRefiSavings } from "@/lib/refi";

export function ConnectLenderDialog({
  open,
  onOpenChange,
  equityDollars,
  currentRate,
  estSavingsMonthly,
  loanBalance = null,
  cashOutHeadroom = null,
  benchmarkRate = BENCHMARK_REFI_RATE,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equityDollars: number | null;
  currentRate: number | null;
  estSavingsMonthly: number | null;
  loanBalance?: number | null;
  cashOutHeadroom?: number | null;
  benchmarkRate?: number;
}) {

  const [sent, setSent] = useState(false);
  const fetchMatch = useServerFn(getMatchedLenderForMe);
  const createIntent = useServerFn(createRefiIntent);

  const savings = estimateRefiSavings(loanBalance, currentRate, benchmarkRate);
  const monthly = savings?.monthlySavings ?? (estSavingsMonthly ?? 0);


  const { data: match, isLoading } = useQuery({
    queryKey: ["matched-lender-me"],
    queryFn: () => fetchMatch(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const intent = useMutation({
    mutationFn: (orgId: string) =>
      createIntent({
        data: {
          orgId,
          estSavingsMonthly:
            estSavingsMonthly != null ? Math.round(estSavingsMonthly) : undefined,
        },
      }),
    onSuccess: () => {
      setSent(true);
      toast.success("Your matched lender was notified");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send refi request"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect with lender</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding a lender…
          </div>
        )}

        {!isLoading && !match && (
          <p className="py-4 text-sm text-muted-foreground">
            No lender is available in your area yet. We'll notify you when one joins.
          </p>
        )}

        {!isLoading && match && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-sm font-semibold">{match.name}</p>
              {match.licenseNumber && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  NMLS #{match.licenseNumber}
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {match.matchType === "portfolio"
                  ? "Your loan originator"
                  : "SuCasa founding lender partner"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat
                label="Equity"
                value={equityDollars != null ? `$${Math.round(equityDollars).toLocaleString()}` : "—"}
              />
              <Stat
                label="Your rate"
                value={currentRate != null ? `${currentRate}%` : "—"}
              />
              <Stat
                label="Est. savings"
                value={monthly > 0 ? `$${monthly.toLocaleString()}/mo` : "—"}
              />
            </div>

            {currentRate != null ? (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs font-semibold">Estimated savings breakdown</p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <Row
                    label="Your rate (origination)"
                    value={`${currentRate}%`}
                  />
                  <Row label="Today's benchmark rate" value={`${benchmarkRate}%`} />
                  {loanBalance != null && (
                    <Row
                      label="Loan balance (est.)"
                      value={`$${Math.round(loanBalance).toLocaleString()}`}
                    />
                  )}
                  {savings && (
                    <>
                      <Row
                        label="Current payment (P&I)"
                        value={`$${savings.currentPayment.toLocaleString()}/mo`}
                      />
                      <Row
                        label="New payment (est.)"
                        value={`$${savings.newPayment.toLocaleString()}/mo`}
                      />
                    </>
                  )}
                </dl>
                {monthly > 0 ? (
                  <p className="mt-3 border-t border-border pt-3 text-sm font-semibold">
                    Estimated savings: ${monthly.toLocaleString()}/mo
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · about ${(monthly * 12).toLocaleString()}/yr
                    </span>
                  </p>
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    Your current rate is at or below the benchmark, so a rate-and-term
                    refinance likely won't lower your payment today — a lender can still
                    review cash-out or term options.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-xs font-semibold">Cash-out / HELOC options</p>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <Row
                    label="Available equity"
                    value={
                      equityDollars != null
                        ? `$${Math.round(equityDollars).toLocaleString()}`
                        : "—"
                    }
                  />
                  <Row
                    label="Headroom at 80% LTV"
                    value={
                      cashOutHeadroom != null
                        ? `$${Math.round(cashOutHeadroom).toLocaleString()}`
                        : "—"
                    }
                  />
                </dl>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  No origination interest rate is on record for your property, so we
                  can't estimate monthly rate savings. A lender quote will confirm your
                  exact options.
                </p>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Estimates use public property records and standard amortization over a
              30-year term. Principal & interest only — taxes, insurance, and closing
              costs are not included. Actual terms come from your lender.
            </p>


            <div className="flex gap-2">
              {match.contactPhone && (
                <a
                  href={`tel:${match.contactPhone}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-xs font-semibold hover:bg-secondary"
                >
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              )}
              {match.contactEmail && (
                <a
                  href={`mailto:${match.contactEmail}?subject=Refinance%20interest%20via%20SuCasa`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2.5 text-xs font-semibold hover:bg-secondary"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
              )}
            </div>

            <button
              onClick={() => !sent && intent.mutate(match.orgId)}
              disabled={intent.isPending || sent}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {sent ? (
                <>
                  <Check className="h-4 w-4" /> Lender notified
                </>
              ) : intent.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                </>
              ) : (
                <>Connect me with {match.name.split(" ")[0]}</>
              )}
            </button>

            <p className="text-[11px] text-muted-foreground">
              By connecting, you agree to share your address and equity summary
              with {match.name} to prepare refinance options.
            </p>

            <Link
              to="/report"
              className="flex items-center justify-center gap-1 text-xs font-medium text-primary"
            >
              See full refi readiness report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
