import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Download, Share2, TrendingUp, Info, Sparkles, Lock, Crown, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { HOME_HERO, ZONE_COLOR, ZONE_LABEL, projectHome, type ZoneStatus } from "@/lib/home-hero-data";
import { OCTOBER_REPORT, PRIORITY_META } from "@/lib/report-mock-data";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Home Intelligence Report — SuCasa" },
      { name: "description", content: "Your monthly deep-dive on home value, equity, systems health, and recommended actions." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportPage,
});

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtK = (n: number) => `$${(n / 1000).toFixed(0)}k`;
const fmtPct = (n: number, digits = 1) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

function ReportPage() {
  const r = OCTOBER_REPORT;
  const { isPremium, setPremium, hydrated } = usePremium();

  const projection = useMemo(() => {
    return Array.from({ length: 13 }).map((_, i) => {
      const p = projectHome(HOME_HERO, i);
      return { month: `Y${i}`, value: Math.round(p.value), equity: Math.round(p.equity) };
    });
  }, []);

  const currentValue = r.trend[r.trend.length - 1].value;
  const firstValue = r.trend[0].value;
  const yearDelta = (currentValue - firstValue) / firstValue;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1 px-5 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
              </Link>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-primary">Home Intelligence Report</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{r.monthLabel}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{r.address} · Generated {r.generatedAt}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hydrated && isPremium && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
                  <Crown className="h-3 w-3" /> Premium
                </span>
              )}
              <button
                onClick={() => toast.info("PDF export coming soon")}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" /> PDF
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  toast.success("Report link copied");
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-secondary"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Executive summary */}
          <Card className="overflow-hidden p-0">
            <div className="gradient-brand p-6 text-white">
              <div className="flex items-center gap-2 text-xs opacity-90">
                <Sparkles className="h-3.5 w-3.5" /> Executive summary
              </div>
              <p className="mt-3 text-base leading-relaxed sm:text-lg">{r.summary}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              <DeltaTile label="Value" primary={fmtUSD(r.deltas.value.amount)} secondary={fmtPct(r.deltas.value.pct)} positive />
              <DeltaTile label="Equity" primary={fmtUSD(r.deltas.equity.amount)} secondary={fmtPct(r.deltas.equity.pct)} positive />
              <DeltaTile label="Home Score" primary={`+${r.deltas.homeScore}`} secondary="vs last month" positive />
              <DeltaTile label="ROI (YTD)" primary={fmtUSD(r.deltas.roiYtd)} secondary="upgrades + equity" positive />
            </div>
          </Card>

          {/* Value & equity trend */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Value & equity — 12 months</h2>
                <p className="text-xs text-muted-foreground">Annotated with services, comps, and inspections.</p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</p>
                  <p className="text-sm font-semibold">{fmtUSD(currentValue)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">12-mo</p>
                  <p className="text-sm font-semibold text-growth">{fmtPct(yearDelta)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer>
                <AreaChart data={r.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="valFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as (typeof r.trend)[number];
                      return (
                        <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-soft">
                          <p className="font-semibold">{label}</p>
                          <p className="mt-1">Value: <span className="font-medium">{fmtUSD(p.value)}</span></p>
                          <p>Equity: <span className="font-medium">{fmtUSD(p.equity)}</span></p>
                          {p.event && (
                            <div className="mt-2 border-t border-border pt-2">
                              <p className="font-medium text-primary">{p.event.label}</p>
                              <p className="text-muted-foreground">{p.event.detail}</p>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#valFill)" />
                  <Area type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} fill="url(#eqFill)" />
                  {r.trend.map((pt) =>
                    pt.event ? (
                      <ReferenceDot key={pt.month} x={pt.month} y={pt.value} r={5} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
                    ) : null,
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <LegendDot color="var(--primary)" label="Estimated value" />
              <LegendDot color="#22c55e" label="Equity" />
              <LegendDot color="var(--primary)" label="Event marker" ring />
            </div>
          </Card>

          {hydrated && !isPremium && <UpsellCard onUnlock={() => setPremium(true)} />}

          {(!hydrated || isPremium) ? (
          <>
          {/* Score breakdown + Zones */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <h2 className="text-base font-semibold">Home Score breakdown</h2>
              <div className="mt-4 flex items-center gap-5">
                <ScoreRing score={HOME_HERO.homeScore} />
                <div className="text-xs text-muted-foreground">
                  <p className="text-3xl font-semibold text-foreground">{HOME_HERO.homeScore}<span className="text-base text-muted-foreground">/100</span></p>
                  <p className="mt-1">Up +{r.deltas.homeScore} this month</p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {r.subScores.map((s) => (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{s.score}/100</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${s.score}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{s.note}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              <h2 className="text-base font-semibold">Zone health</h2>
              <p className="text-xs text-muted-foreground">Current status across your four core systems.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(Object.entries(HOME_HERO.zones) as [keyof typeof HOME_HERO.zones, ZoneStatus][]).map(([zone, status]) => (
                  <div key={zone} className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold capitalize">{zone}</p>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                        style={{ borderColor: ZONE_COLOR[status], color: ZONE_COLOR[status] }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONE_COLOR[status] }} />
                        {ZONE_LABEL[status]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{zoneInsight(zone, status)}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Market context */}
          <Card>
            <h2 className="text-base font-semibold">Market context</h2>
            <p className="text-xs text-muted-foreground">78704 · within 1 mile of your home</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatTile label="Median $/sqft" value={`$${r.market.medianPpsf}`} />
              <StatTile label="90-day trend" value={fmtPct(r.market.trend90d)} positive />
              <StatTile label="Active listings" value={String(r.market.activeListings)} />
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Recent sale</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">$/sqft</th>
                    <th className="px-3 py-2 text-right">vs yours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.market.comps.map((c) => (
                    <tr key={c.address}>
                      <td className="px-3 py-2.5 font-medium">{c.address}</td>
                      <td className="px-3 py-2.5">{fmtUSD(c.sold)}</td>
                      <td className="px-3 py-2.5">${c.ppsf}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${c.delta >= 0 ? "text-growth" : "text-destructive"}`}>{fmtPct(c.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Activity + spend */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h2 className="text-base font-semibold">Maintenance activity</h2>
              <p className="text-xs text-muted-foreground">Everything logged this month.</p>
              <ol className="mt-4 space-y-3">
                {r.activity.map((a, i) => (
                  <li key={i} className="flex gap-3 rounded-2xl border border-border p-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-[10px] font-semibold text-primary">
                      {a.date.split(" ")[1]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        {typeof a.amount === "number" && <span className="text-xs font-medium">{fmtUSD(a.amount)}</span>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                    <ActivityChip kind={a.kind} />
                  </li>
                ))}
              </ol>
            </Card>

            <Card>
              <h2 className="text-base font-semibold">Spend</h2>
              <div className="mt-4 space-y-3">
                <StatRow label="This month" value={fmtUSD(r.spend.month)} />
                <StatRow label="Year to date" value={fmtUSD(r.spend.ytd)} />
                <StatRow label="Projected annual" value={fmtUSD(r.spend.projectedAnnual)} muted />
              </div>
              <div className="mt-5 rounded-2xl bg-secondary p-4 text-xs">
                <div className="flex items-center gap-2 font-medium"><TrendingUp className="h-3.5 w-3.5 text-growth" /> Tracking $2,400 under budget</div>
                <p className="mt-1 text-muted-foreground">Compared to homes of similar age in your ZIP.</p>
              </div>
            </Card>
          </div>

          {/* Recommendations */}
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Recommended next actions</h2>
                <p className="text-xs text-muted-foreground">Prioritized from your home profile and this month's diagnostics.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {r.recommendations.map((rec) => {
                const meta = PRIORITY_META[rec.priority];
                return (
                  <div key={rec.id} className="flex flex-col rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>{meta.label}</span>
                      <span className="text-xs font-medium text-muted-foreground">${rec.costLow.toLocaleString()}–${rec.costHigh.toLocaleString()}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold">{rec.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{rec.why}</p>
                    <p className="mt-3 text-xs"><span className="font-medium text-growth">Payoff:</span> {rec.payoff}</p>
                    <Link
                      to={rec.cta.to}
                      className="mt-4 inline-flex items-center justify-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                    >
                      {rec.cta.label} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Projection */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">10-year projection</h2>
                <p className="text-xs text-muted-foreground">Assumes 3.5% market growth and steady equity paydown.</p>
              </div>
              <div className="rounded-full bg-growth/10 px-3 py-1 text-[11px] font-medium text-growth">
                Score → {r.projection.projectedScore} with recommended actions
              </div>
            </div>
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer>
                <LineChart data={projection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} name="Value" />
                  <Line type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} dot={false} name="Equity" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Footer disclaimer */}
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-secondary/50 p-4 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Generated using your home profile, service history, and public market data. All figures are estimates and not appraisals or financial advice.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-border bg-card p-6 shadow-soft ${className}`}>{children}</div>;
}

function DeltaTile({ label, primary, secondary, positive }: { label: string; primary: string; secondary: string; positive?: boolean }) {
  return (
    <div className="bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${positive ? "text-growth" : ""}`}>{primary}</p>
      <p className="text-[11px] text-muted-foreground">{secondary}</p>
    </div>
  );
}

function StatTile({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${positive ? "text-growth" : ""}`}>{value}</p>
    </div>
  );
}

function StatRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={ring ? { border: `2px solid ${color}` } : { background: color }}
      />
      {label}
    </span>
  );
}

function ActivityChip({ kind }: { kind: "completed" | "in_progress" | "external" }) {
  const map = {
    completed: { label: "Done", cls: "bg-growth/15 text-growth" },
    in_progress: { label: "In progress", cls: "bg-accent text-accent-foreground" },
    external: { label: "External", cls: "bg-secondary text-muted-foreground" },
  } as const;
  const m = map[kind];
  return <span className={`shrink-0 self-center rounded-full px-2 py-1 text-[10px] font-medium ${m.cls}`}>{m.label}</span>;
}

function ScoreRing({ score }: { score: number }) {
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        fill="none"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function zoneInsight(zone: string, status: ZoneStatus) {
  const map: Record<string, Record<ZoneStatus, string>> = {
    roof: {
      good: "Passed October inspection. ~8 years of useful life remaining.",
      watch: "Minor granule loss detected. Re-inspect in 6 months.",
      urgent: "Active leak risk. Schedule repair within 2 weeks.",
    },
    hvac: {
      good: "Serviced this year. Filters on schedule.",
      watch: "Last service was 10+ months ago. Book pre-winter tune-up.",
      urgent: "Compressor drawing high current. Service ASAP.",
    },
    plumbing: {
      good: "Water heater flushed August. No leaks reported.",
      watch: "Slow drain flagged in kitchen. Monitor for 30 days.",
      urgent: "Active leak reported. Shut off and call a pro.",
    },
    electrical: {
      good: "Panel healthy, GFCIs tested.",
      watch: "Aging breakers detected. Plan replacement.",
      urgent: "Main breaker tripping intermittently. Replace before winter load.",
    },
  };
  return map[zone]?.[status] ?? "Status normal.";
}
