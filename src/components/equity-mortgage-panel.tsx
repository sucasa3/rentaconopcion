import { useState } from "react";
import { useHomeIntel } from "@/hooks/use-home-intel";
import { valueStatusMessage } from "@/lib/home-value";
import { TrendingUp, Landmark, Wallet, Hammer, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { ConnectLenderDialog } from "@/components/connect-lender-dialog";
import { BENCHMARK_REFI_RATE, estimateRefiSavings } from "@/lib/refi";
import { useActivityLog, useLogOnMount } from "@/hooks/use-activity-log";


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
  const [refreshing, setRefreshing] = useState(false);
  const logActivity = useActivityLog();
  useLogOnMount("equity_opened");
  const { intel: data, raw, isLoading, refresh } = useHomeIntel();

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">Loading equity & mortgage…</p>
      </div>
    );
  }
  if (!data) {
    // Never disappear silently — say why and offer a retry.
    const status = raw && !raw.ok ? raw.valueStatus : "no_coverage";
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">Equity & mortgage</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {valueStatusMessage(status ?? "no_coverage")}
        </p>
      </div>
    );
  }

  const { equity, mortgage, sales, permits, value, valueStatus } = data;


  const refiTone =
    equity?.refiSignal === "watch"
      ? "bg-secondary text-muted-foreground"
      : "hidden";

  const savings = estimateRefiSavings(
    equity?.loanBalanceEstimate,
    mortgage?.interestRate,
  );
  const isHotRefi =
    equity?.refiSignal === "strong" || equity?.refiSignal === "moderate";

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Equity & mortgage</h2>
          <p className="text-xs text-muted-foreground">
            {value?.value == null
              ? "Waiting on a value for your home."
              : value.source === "assessed"
                ? `Based on assessor market value (${fmtMoney(value.value)}) — no automated estimate on record for this address.`
                : `Based on an automated estimate of ${fmtMoney(value.value)}.`}
          </p>

        </div>
        {equity?.refiSignal && (
          isHotRefi ? (
            <button
              onClick={() => {
                logActivity("refi_opened");
                setLenderOpen(true);
              }}
              className="group relative inline-flex items-center gap-2 rounded-full gradient-brand px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-growth opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-growth" />
              </span>
              <Sparkles className="h-4 w-4" />
              <span className="text-left leading-tight">
                Refi signal · {equity.refiSignal}
                <span className="block text-[11px] font-medium opacity-90">
                  {savings?.monthlySavings
                    ? `Could save ~${fmtMoney(savings.monthlySavings)}/mo · See options`
                    : "See your lending options"}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${refiTone}`}>
              Refi signal · {equity.refiSignal}
            </span>
          )
        )}
      </div>


      {value?.value == null && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {valueStatusMessage(valueStatus)} Equity and cash-out headroom need a
            value to calculate.
          </p>
          <button
            onClick={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Retry
          </button>
        </div>
      )}


      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Estimated equity"
          primary={fmtMoney(equity?.equityDollars)}
          secondary={
            equity?.equityPct != null
              ? `${fmtPct(equity.equityPct)} of ${equity.valueSource === "assessed" ? "assessed value" : "value"}`
              : "No valuation on record"
          }
        />

        <Stat
          icon={Wallet}
          label="Cash-out headroom"
          primary={fmtMoney(equity?.cashOutHeadroom80)}
          secondary={
            equity?.cashOutHeadroom80 == null
              ? "Needs a valuation"
              : equity.valueSource === "assessed"
                ? "At 80% LTV · assessed value"
                : "At 80% LTV"
          }
        />

        <Stat
          icon={Landmark}
          label="Loan balance (est.)"
          primary={equity?.noMortgageOnRecord ? "None on record" : fmtMoney(equity?.loanBalanceEstimate)}
          secondary={
            equity?.noMortgageOnRecord
              ? "No open mortgage in public records"
              : mortgage?.interestRate != null
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
        loanBalance={equity?.loanBalanceEstimate ?? null}
        cashOutHeadroom={equity?.cashOutHeadroom80 ?? null}
        benchmarkRate={BENCHMARK_REFI_RATE}
        estSavingsMonthly={savings?.monthlySavings ?? null}
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
