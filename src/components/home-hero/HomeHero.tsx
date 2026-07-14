import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Home, TrendingUp, Sparkles, Activity } from "lucide-react";
import { HOME_HERO, projectHome, ZONE_COLOR, ZONE_LABEL, type HomeHeroData } from "@/lib/home-hero-data";
import { useCountUp } from "./useCountUp";

const HomeScene = lazy(() => import("./HomeScene"));

function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const cb = () => setReduced(mq.matches);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);
  return reduced;
}

const fmtUsd = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);

export function HomeHero({ data = HOME_HERO }: { data?: HomeHeroData }) {
  const hydrated = useHydrated();
  const reducedMotion = usePrefersReducedMotion();
  const [years, setYears] = useState(0);

  const projected = useMemo(() => (years === 0 ? { value: data.value, equity: data.equity, equityPct: data.equityPct } : projectHome(data, years)), [data, years]);

  const value = useCountUp(projected.value);
  const equity = useCountUp(projected.equity);
  const roi = useCountUp(data.roi);
  const score = useCountUp(data.homeScore);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border shadow-elevated gradient-hero">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-growth/20 blur-3xl" aria-hidden />

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-6 lg:p-7">
        {/* Scene */}
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-primary/80">
            <Home className="h-3.5 w-3.5" /> Your home, live
          </div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{data.address}</h2>

          {/* Value watermark chart behind the scene */}
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white/40 ring-1 ring-white/60 backdrop-blur-sm dark:bg-white/5 dark:ring-white/10 sm:aspect-[16/10]">
            <ValueWatermark series={data.valueSeries} years={years} />
            <div className="absolute inset-0">
              {hydrated ? (
                <Suspense fallback={<SceneFallback />}>
                  <HomeScene data={{ ...data, equityPct: projected.equityPct }} reducedMotion={reducedMotion} />
                </Suspense>
              ) : (
                <SceneFallback />
              )}
            </div>

            {/* Zone legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
              {(Object.keys(data.zones) as Array<keyof typeof data.zones>).map((k) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-1 text-[10px] font-medium capitalize text-foreground shadow-soft dark:bg-black/50 dark:text-white"
                  title={ZONE_LABEL[data.zones[k]]}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ZONE_COLOR[data.zones[k]] }} />
                  {k}
                </span>
              ))}
            </div>

            {/* Projection badge */}
            {years > 0 && (
              <div className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground shadow-soft">
                Projected +{years}y
              </div>
            )}
          </div>

          {/* Projection scrubber */}
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/60 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground/80">Project your home</span>
              <span className="tabular-nums text-muted-foreground">
                {years === 0 ? "Today" : `+${years} year${years === 1 ? "" : "s"}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              aria-label="Projection years"
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-primary via-primary/70 to-growth accent-primary"
            />
            <div className="mt-2 flex gap-1.5">
              {[0, 1, 5, 10].map((y) => (
                <button
                  key={y}
                  onClick={() => setYears(y)}
                  className={`flex-1 rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                    years === y ? "bg-primary text-primary-foreground shadow-soft" : "bg-white/70 text-foreground/70 hover:bg-white dark:bg-white/10 dark:text-white/70"
                  }`}
                >
                  {y === 0 ? "Today" : `${y}yr`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stat rail */}
        <div className="flex flex-col gap-3">
          {/* Home score */}
          <div className="relative overflow-hidden rounded-2xl gradient-brand p-5 text-white shadow-soft">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-80">
              <Activity className="h-3.5 w-3.5" /> Home Score
            </div>
            <div className="mt-2 flex items-end gap-4">
              <ScoreRing value={score} />
              <div className="pb-1">
                <p className="text-5xl font-semibold tabular-nums leading-none">{Math.round(score)}</p>
                <p className="mt-1 text-xs opacity-90">Excellent · top 18% in ZIP</p>
              </div>
            </div>
          </div>

          {/* Value */}
          <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Home className="h-3.5 w-3.5" /> Estimated value
              </span>
              <span className="text-[11px] font-medium text-growth">▲ {fmtUsd(8400)}</span>
            </div>
            <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">{fmtUsd(value)}</p>
            <Sparkline series={data.valueSeries} className="mt-2 h-8 w-full" />
          </div>

          {/* Equity + ROI */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Equity
              </span>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-growth">{fmtUsd(equity, true)}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full gradient-growth transition-all duration-700"
                  style={{ width: `${Math.round(projected.equityPct * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">{Math.round(projected.equityPct * 100)}% of value</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Upgrade ROI
              </span>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{fmtUsd(roi, true)}</p>
              <p className="mt-2 text-[10px] text-muted-foreground">3 smart recommendations</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SceneFallback() {
  return (
    <div className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/10 via-transparent to-growth/15">
      <div className="text-xs text-muted-foreground">Loading home…</div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width={68} height={68} viewBox="0 0 68 68" className="shrink-0">
      <circle cx={34} cy={34} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={6} fill="none" />
      <circle
        cx={34}
        cy={34}
        r={r}
        stroke="white"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 34 34)"
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.2,1)" }}
      />
    </svg>
  );
}

function Sparkline({ series, className }: { series: number[]; className?: string }) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const w = 100;
  const h = 30;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts[0]} L${pts.slice(1).join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--growth)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--growth)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="var(--growth)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ValueWatermark({ series, years }: { series: number[]; years: number }) {
  // extend series with projection at the tail
  const projected = years > 0 ? [...series, ...Array.from({ length: 6 }, (_, i) => series[series.length - 1] * Math.pow(1.035, ((i + 1) / 6) * years))] : series;
  const min = Math.min(...projected);
  const max = Math.max(...projected);
  const w = 100;
  const h = 60;
  const pts = projected.map((v, i) => {
    const x = (i / (projected.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h * 0.7 - 6;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts[0]} L${pts.slice(1).join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="hero-wm" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--growth)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--growth)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hero-wm)" style={{ transition: "d 800ms ease" }} />
      <path d={path} fill="none" stroke="var(--growth)" strokeOpacity={0.55} strokeWidth="0.6" />
    </svg>
  );
}
