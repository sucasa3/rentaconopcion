import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { TrendingUp, Landmark, Wallet, Hammer, ArrowRight } from "lucide-react";
import { ConnectLenderDialog } from "@/components/connect-lender-dialog";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

export function EquityMortgagePanel() {
  const [lenderOpen, setLenderOpen] = useState(false);
  const fetchIntel = useServerFn(getMyHomeIntel);
  const { data, isLoading } = useQuery({
    queryKey: ["home-intel-equity"],
    queryFn: () =>
      fetchIntel({
        data: {
          classes: ["avm", "sales", "mortgage", "permits"],
          revenueSource: "dashboard_equity",
        },
      }),
    staleTime: 10 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading equity & mortgage…</p>
      </div>
    );
  }
  if (!data?.ok) return null;

  const { equity, mortgage, sales, permits } = data;
  if (!equity && !mortgage && !permits) return null;

  const refiTone =
    equity?.refiSignal === "strong"
      ? "bg-growth/15 text-growth"
      : equity?.refiSignal === "moderate"
        ? "bg-accent text-accent-foreground"
        : equity?.refiSignal === "watch"
          ? "bg-secondary text-muted-foreground"
          : "hidden";

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Equity & mortgage</h2>
          <p className="text-xs text-muted-foreground">
            Estimated balance uses standard amortization from origination data.
          </p>
        </div>
        {equity?.refiSignal && (
          equity.refiSignal === "strong" || equity.refiSignal === "moderate" ? (
            <button
              onClick={() => setLenderOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition hover:opacity-90 ${refiTone}`}
            >
              Refi signal · {equity.refiSignal} · See options
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${refiTone}`}>
              Refi signal · {equity.refiSignal}
            </span>
          )
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Estimated equity"
          primary={fmtMoney(equity?.equityDollars)}
          secondary={equity?.equityPct != null ? `${fmtPct(equity.equityPct)} of value` : "—"}
        />
        <Stat
          icon={Wallet}
          label="Cash-out headroom"
          primary={fmtMoney(equity?.cashOutHeadroom80)}
          secondary="At 80% LTV"
        />
        <Stat
          icon={Landmark}
          label="Loan balance (est.)"
          primary={fmtMoney(equity?.loanBalanceEstimate)}
          secondary={
            mortgage?.interestRate != null
              ? `${mortgage.interestRate}% · ${mortgage.lender ?? "lender"}`
              : mortgage?.lender ?? "—"
          }
        />
        <Stat
          icon={Hammer}
          label="Permits on file"
          primary={String(permits?.events.length ?? 0)}
          secondary={
            permits && permits.events.length > 0
              ? permits.lastPermitDate
                ? `Last ${new Date(permits.lastPermitDate).toLocaleDateString()}`
                : "Recorded"
              : sales?.tenureYears != null
                ? `Owned ~${sales.tenureYears} yr · none on record`
                : "None on record"
          }
        />
      </div>

      {permits && permits.events.length === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No permits found on public record for this address. Permit coverage
          varies by jurisdiction, so local permits may exist without appearing
          here.
        </p>
      )}


      <ConnectLenderDialog
        open={lenderOpen}
        onOpenChange={setLenderOpen}
        equityDollars={equity?.equityDollars ?? null}
        currentRate={mortgage?.interestRate ?? null}
        estSavingsMonthly={(() => {
          const bal = equity?.loanBalanceEstimate;
          const rate = mortgage?.interestRate;
          if (!bal || !rate) return null;
          const term = 360;
          const pay = (p: number, r: number) => {
            const m = r / 100 / 12;
            return (p * m) / (1 - Math.pow(1 + m, -term));
          };
          return Math.max(0, Math.round(pay(bal, rate) - pay(bal, 6.5)));
        })()}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  primary,
  secondary,
}: {
  icon: typeof TrendingUp;
  label: string;
  primary: string;
  secondary: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight">{primary}</p>
      <p className="text-xs text-muted-foreground">{secondary}</p>
    </div>
  );
}
