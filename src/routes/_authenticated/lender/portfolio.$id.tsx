import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { getPortfolio, ingestPortfolioCsv, enrichPortfolioFromAttom } from "@/lib/lender.functions";
import {
  ArrowLeft,
  Upload,
  Lock,
  CheckCircle2,
  TrendingDown,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Loader2,
  Mail,
  Phone,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/lender/portfolio/$id")({
  head: () => ({
    meta: [
      { title: "Portfolio — SuCasa Lender" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortfolioDetail,
});

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString()}`;
}
function moneyCompact(cents: number | null | undefined) {
  if (cents == null) return "—";
  const n = cents / 100;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

type Segment = "all" | "refi-ready" | "rate-and-term" | "cash-out" | "watchlist";

const SEGMENT_META: Record<Exclude<Segment, "all">, { label: string; tone: string }> = {
  "refi-ready": { label: "Refi-ready", tone: "bg-primary/10 text-primary border-primary/30" },
  "rate-and-term": {
    label: "Rate & term",
    tone: "bg-growth/10 text-growth border-growth/30",
  },
  "cash-out": {
    label: "Cash-out",
    tone: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  },
  watchlist: {
    label: "Watchlist",
    tone: "bg-secondary text-muted-foreground border-border",
  },
};

const PAGE_SIZE = 25;

function PortfolioDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getPortfolio);
  const ingestFn = useServerFn(ingestPortfolioCsv);
  const enrichFn = useServerFn(enrichPortfolioFromAttom);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [benchmark, setBenchmark] = useState<number>(6.25);
  const [segment, setSegment] = useState<Segment>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [contact, setContact] = useState<any | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["lender-portfolio", id, benchmark],
    queryFn: () => getFn({ data: { id, benchmarkRate: benchmark } }),
  });

  const ingest = useMutation({
    mutationFn: (csv: string) => ingestFn({ data: { portfolioId: id, csv } }),
    onSuccess: (r: any) => {
      toast.success(`Imported ${r.inserted} clients`);
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const enrich = useMutation({
    mutationFn: () => enrichFn({ data: { portfolioId: id } }),
    onMutate: () => {
      const toastId = toast.loading(
        `Enriching ${missingCount} clients from ATTOM… this can take a minute.`,
      );
      return { toastId };
    },
    onSuccess: (r: any, _v, ctx) => {
      toast.success(
        `Enriched ${r.enriched} of ${r.total} clients from ATTOM${
          r.skipped ? ` · ${r.skipped} no data` : ""
        }${r.failed ? ` · ${r.failed} failed` : ""}`,
        { id: ctx?.toastId },
      );
      qc.invalidateQueries({ queryKey: ["lender-portfolio", id] });
    },
    onError: (e: any, _v, ctx) => toast.error(e.message, { id: ctx?.toastId }),
  });

  async function handleFile(f: File) {
    const text = await f.text();
    ingest.mutate(text);
    if (fileRef.current) fileRef.current.value = "";
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.clients.filter((c: any) => {
      if (segment !== "all" && c.segment !== segment) return false;
      if (!q) return true;
      return (
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.zip ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, segment, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const missingCount = data
    ? data.clients.filter((c: any) => c.missing_loan_data).length
    : 0;


  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            to="/lender"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <ArrowLeft className="h-3 w-3" /> All portfolios
          </Link>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : data ? (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {data.portfolio.orgName}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {data.portfolio.name}
                  </h1>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Assumed rate
                  <input
                    type="number"
                    step="0.125"
                    min={1}
                    max={20}
                    value={benchmark}
                    onChange={(e) => {
                      setBenchmark(Number(e.target.value) || 6.25);
                      setPage(0);
                    }}
                    className="w-20 rounded-full border border-border bg-background px-3 py-1 text-right text-sm text-foreground"
                  />
                  %
                </label>
              </div>

              {/* Summary strip */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <SummaryTile label="Clients" value={data.summary.total.toLocaleString()} />
                <SummaryTile
                  label="Originated"
                  value={moneyCompact(data.summary.total_loan_cents)}
                />
                <SummaryTile
                  label="Est. balance"
                  value={moneyCompact(data.summary.total_balance_cents)}
                />
                <SummaryTile
                  label="Est. equity"
                  value={moneyCompact(data.summary.total_equity_cents)}
                />
                <SummaryTile
                  label="Avg rate"
                  value={`${data.summary.avg_rate.toFixed(2)}%`}
                />
              </div>

              {/* Segment chips */}
              <div className="flex flex-wrap gap-2">
                <SegChip
                  label={`All ${data.summary.total}`}
                  active={segment === "all"}
                  tone="bg-foreground text-background border-foreground"
                  onClick={() => {
                    setSegment("all");
                    setPage(0);
                  }}
                />
                {(Object.keys(SEGMENT_META) as Array<keyof typeof SEGMENT_META>).map((s) => (
                  <SegChip
                    key={s}
                    label={`${SEGMENT_META[s].label} ${data.segments[s] ?? 0}`}
                    active={segment === s}
                    tone={SEGMENT_META[s].tone}
                    onClick={() => {
                      setSegment(s);
                      setPage(0);
                    }}
                  />
                ))}
                <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-growth" />
                    {data.consent_counts.granted ?? 0} consented
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    {data.consent_counts.pending ?? 0} pending
                  </span>
                </span>
              </div>

              {/* Refi opportunities */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold">
                    Top refi opportunities @ {benchmark.toFixed(2)}%
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sorted by estimated monthly savings vs. current note rate. Model only — not a
                  quote.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Client</th>
                        <th className="py-2 pr-3 font-medium">Rate</th>
                        <th className="py-2 pr-3 font-medium">Balance</th>
                        <th className="py-2 pr-3 font-medium">LTV</th>
                        <th className="py-2 pr-3 font-medium">Est. savings / mo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_refi_opportunities.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-muted-foreground">
                            No savings above assumed rate.
                          </td>
                        </tr>
                      ) : (
                        data.top_refi_opportunities.map((c: any) => (
                          <tr key={c.id} className="border-b border-border/60">
                            <td className="py-2.5 pr-3">
                              <button
                                onClick={() => setContact(c)}
                                className="text-left font-medium text-primary hover:underline"
                              >
                                {c.full_name}
                              </button>
                              <div className="text-xs text-muted-foreground">
                                {[c.city, c.state].filter(Boolean).join(", ")}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3">
                              {c.rate_at_close ? `${c.rate_at_close}%` : "—"}
                            </td>
                            <td className="py-2.5 pr-3">{moneyCompact(c.loan_balance_cents)}</td>
                            <td className="py-2.5 pr-3">
                              {c.ltv_pct != null ? `${c.ltv_pct}%` : "—"}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-growth">
                              ${c.savings_per_month_dollars.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Client table with search + pagination */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    Clients ({filtered.length.toLocaleString()})
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        placeholder="Search name, address, zip…"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(0);
                        }}
                        className="w-64 rounded-full border border-border bg-background py-1.5 pl-9 pr-3 text-sm"
                      />
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={ingest.isPending}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary disabled:opacity-60"
                    >
                      <Upload className="h-3 w-3" />{" "}
                      {ingest.isPending ? "Importing…" : "Upload CSV"}
                    </button>
                    {missingCount > 0 && (
                      <button
                        onClick={() => enrich.mutate()}
                        disabled={enrich.isPending}
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                      >
                        {enrich.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}{" "}
                        {enrich.isPending
                          ? `Enriching ${missingCount}…`
                          : `Enrich ${missingCount} from ATTOM`}
                      </button>
                    )}
                  </div>
                </div>
                <div className={`mt-4 overflow-x-auto ${enrich.isPending ? "pointer-events-none opacity-60" : ""}`}>
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Location</th>
                        <th className="py-2 pr-3 font-medium">Loan @ close</th>
                        <th className="py-2 pr-3 font-medium">Rate</th>
                        <th className="py-2 pr-3 font-medium">Balance</th>
                        <th className="py-2 pr-3 font-medium">Equity</th>
                        <th className="py-2 pr-3 font-medium">Age</th>
                        <th className="py-2 pr-3 font-medium">Segment</th>
                        <th className="py-2 pr-3 font-medium">Consent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((c: any, i: number) => (
                        <tr
                          key={c.id}
                          className={`border-b border-border/50 ${
                            i % 2 === 1 ? "bg-surface/40" : ""
                          }`}
                        >
                          <td className="py-2.5 pr-3">
                            <button
                              onClick={() => setContact(c)}
                              className="text-left font-medium text-primary hover:underline"
                            >
                              {c.full_name}
                            </button>
                          </td>
                          <td className="py-2.5 pr-3 text-muted-foreground">
                            {[c.city, c.state].filter(Boolean).join(", ")}
                          </td>
                          <td className="py-2.5 pr-3">{money(c.loan_at_close_cents)}</td>
                          <td className="py-2.5 pr-3">
                            {c.rate_at_close ? `${c.rate_at_close}%` : "—"}
                          </td>
                          <td className="py-2.5 pr-3">{moneyCompact(c.loan_balance_cents)}</td>
                          <td className="py-2.5 pr-3">{moneyCompact(c.equity_cents)}</td>
                          <td className="py-2.5 pr-3 text-muted-foreground">
                            {Math.round(c.months_since_close / 12)}y
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                SEGMENT_META[c.segment as keyof typeof SEGMENT_META]?.tone ??
                                "bg-secondary text-muted-foreground border-border"
                              }`}
                            >
                              {SEGMENT_META[c.segment as keyof typeof SEGMENT_META]?.label ??
                                c.segment}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            <ConsentPill state={c.consent_state} />
                          </td>
                        </tr>
                      ))}
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-muted-foreground">
                            No clients match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {filtered.length > PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing {page * PAGE_SIZE + 1}–
                      {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="px-2">
                        Page {page + 1} / {pageCount}
                      </span>
                      <button
                        disabled={page >= pageCount - 1}
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SegChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? tone : "border-border bg-background text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {label}
    </button>
  );
}

function ConsentPill({ state }: { state: string }) {
  if (state === "granted")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-growth/15 px-2 py-0.5 text-[10px] font-medium text-growth">
        <CheckCircle2 className="h-3 w-3" /> Granted
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Lock className="h-3 w-3" /> {state === "cold-lead" ? "Cold lead" : "Pending"}
    </span>
  );
}
