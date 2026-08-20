import { useState } from "react";
import { useHomeIntel } from "@/hooks/use-home-intel";
import type { ValueStatus } from "@/lib/home-value";
import { TrendingUp, Landmark, Wallet, Hammer, ArrowRight, Sparkles, RefreshCw } from "lucide-react";
import { ConnectLenderDialog } from "@/components/connect-lender-dialog";
import { BENCHMARK_REFI_RATE, estimateRefiSavings } from "@/lib/refi";
import { useActivityLog, useLogOnMount } from "@/hooks/use-activity-log";
import { useLanguage, type TranslationKey } from "@/lib/i18n";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Value-status copy lives in the dictionary so this panel reads in one language. */
function valueStatusKey(status: ValueStatus): TranslationKey {
  return `value.status.${status}` as TranslationKey;
}

function refiSignalKey(signal: string): TranslationKey | null {
  return signal === "strong" || signal === "moderate" || signal === "watch"
    ? (`money.refi.${signal}` as TranslationKey)
    : null;
}

export function EquityMortgagePanel() {
  const { t, language } = useLanguage();
  const [lenderOpen, setLenderOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const logActivity = useActivityLog();
  useLogOnMount("equity_opened");
  const { intel: data, raw, isLoading, refresh } = useHomeIntel();

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <p className="text-sm text-muted-foreground">{t("money.loading")}</p>
      </div>
    );
  }
  if (!data) {
    // Never disappear silently — say why and offer a retry.
    const status = raw && !raw.ok ? raw.valueStatus : "no_coverage";
    return (
      <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">{t("money.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(valueStatusKey((status ?? "no_coverage") as ValueStatus))}
        </p>
      </div>
    );
  }

  const { equity, mortgage, sales, permits, value, valueStatus } = data;

  const refiTone =
    equity?.refiSignal === "watch" ? "bg-secondary text-muted-foreground" : "hidden";

  const savings = estimateRefiSavings(equity?.loanBalanceEstimate, mortgage?.interestRate);
  const isHotRefi = equity?.refiSignal === "strong" || equity?.refiSignal === "moderate";
  const signalKey = equity?.refiSignal ? refiSignalKey(equity.refiSignal) : null;
  const signalWord = signalKey ? t(signalKey) : (equity?.refiSignal ?? "");

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("money.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {value?.value == null
              ? t("money.basis.waiting")
              : value.source === "assessed"
                ? t("money.basis.assessed", { amount: fmtMoney(value.value) })
                : t("money.basis.avm", { amount: fmtMoney(value.value) })}
          </p>
        </div>
        {equity?.refiSignal &&
          (isHotRefi ? (
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
                {t("money.refi.signal")} · {signalWord}
                <span className="block text-[11px] font-medium opacity-90">
                  {savings?.monthlySavings
                    ? t("money.refi.savings", { amount: fmtMoney(savings.monthlySavings) })
                    : t("money.refi.see_options")}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${refiTone}`}>
              {t("money.refi.signal")} · {signalWord}
            </span>
          ))}
      </div>

      {value?.value == null && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t(valueStatusKey(valueStatus))} {t("money.needs_value")}
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
            {t("money.retry")}
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label={t("money.stat.equity")}
          primary={fmtMoney(equity?.equityDollars)}
          secondary={
            equity?.equityPct != null
              ? equity.valueSource === "assessed"
                ? t("money.stat.equity_pct_assessed", { pct: fmtPct(equity.equityPct) })
                : t("money.stat.equity_pct", { pct: fmtPct(equity.equityPct) })
              : t("money.stat.no_valuation")
          }
        />

        <Stat
          icon={Wallet}
          label={t("money.stat.cash_out")}
          primary={fmtMoney(equity?.cashOutHeadroom80)}
          secondary={
            equity?.cashOutHeadroom80 == null
              ? t("money.stat.needs_valuation")
              : equity.valueSource === "assessed"
                ? t("money.stat.ltv_assessed")
                : t("money.stat.ltv")
          }
        />

        <Stat
          icon={Landmark}
          label={t("money.stat.loan")}
          primary={
            equity?.noMortgageOnRecord
              ? t("money.stat.no_mortgage")
              : fmtMoney(equity?.loanBalanceEstimate)
          }
          secondary={
            equity?.noMortgageOnRecord
              ? t("money.stat.no_mortgage_detail")
              : mortgage?.interestRate != null
                ? t("money.stat.rate_lender", {
                    rate: mortgage.interestRate,
                    lender: mortgage.lender ?? t("money.stat.lender_word"),
                  })
                : (mortgage?.lender ?? "—")
          }
        />

        <Stat
          icon={Hammer}
          label={t("money.stat.permits")}
          primary={String(permits?.events.length ?? 0)}
          secondary={
            permits && permits.events.length > 0
              ? permits.lastPermitDate
                ? t("money.stat.permit_last", {
                    date: new Date(permits.lastPermitDate).toLocaleDateString(
                      language === "es" ? "es-US" : "en-US",
                    ),
                  })
                : t("money.stat.permit_recorded")
              : sales?.tenureYears != null
                ? t("money.stat.owned_no_permits", { years: sales.tenureYears })
                : t("money.stat.none_on_record")
          }
        />
      </div>

      {permits && permits.events.length === 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">{t("money.permits.note")}</p>
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
