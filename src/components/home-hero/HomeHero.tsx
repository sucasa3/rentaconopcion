import { useMemo, useState } from "react";
import { Home, TrendingUp, Sparkles, Activity, MapPin, Info } from "lucide-react";
import { projectHome, ZONE_COLOR, ZONE_LABEL, type HomeHeroView } from "@/lib/home-hero-data";
import type { HomeScoreResult } from "@/lib/home-score";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCountUp } from "./useCountUp";
import heroPhoto from "@/assets/home-hero-photo.jpg.asset.json";

const fmtUsd = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(n);

export function HomeHero({
  data,
  refiChip,
  scoreDetail,
  scorePending,
}: {
  data: HomeHeroView;
  refiChip?: React.ReactNode;
  scoreDetail?: HomeScoreResult | null;
  scorePending?: boolean;
}) {
  const [years, setYears] = useState(0);
  const hasValue = data.value != null;
  const basePct = data.equityPct ?? 0;
  const projected = useMemo(
    () =>
      data.value == null
        ? { value: null, equity: data.equity, equityPct: data.equityPct }
        : years === 0
          ? { value: data.value, equity: data.equity, equityPct: data.equityPct }
          : projectHome({ value: data.value, equityPct: basePct }, years),
    [data, years, basePct],
  );

  const value = useCountUp(projected.value ?? 0);
  const equity = useCountUp(projected.equity ?? 0);
  const roi = useCountUp(data.roi ?? 0);
  const score = useCountUp(data.homeScore ?? 0);
  const noScore = scorePending || data.homeScore == null;
  const scoreText = noScore ? "—" : String(Math.round(score));


  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border bg-neutral-950 shadow-elevated">
      {/* Photo */}
      <div className="relative h-[520px] w-full sm:h-[560px] lg:h-[620px]">
        <img
          src={heroPhoto.url}
          alt={`Twilight photo of ${data.address}`}
          width={1920}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Cinematic gradients */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/40" aria-hidden />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" aria-hidden />

        {/* Top-left address chip */}
        <div className="absolute left-5 top-5 sm:left-7 sm:top-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/90 backdrop-blur-md ring-1 ring-white/20">
            <MapPin className="h-3.5 w-3.5" /> Your home
          </div>
          <h2 className="mt-3 max-w-[22ch] text-2xl font-semibold leading-tight tracking-tight text-white drop-shadow-lg sm:text-3xl lg:text-4xl">
            {data.address}
          </h2>
          <p className="mt-1.5 text-sm text-white/70">
            Home Score <span className="font-semibold text-white">{scoreText}</span>
            {scoreDetail ? ` · ${scoreDetail.summary}` : ""}
          </p>
        </div>

        {/* Top-right score ring + optional refi chip */}
        <div className="absolute right-5 top-5 flex flex-col items-end gap-2 sm:right-7 sm:top-7">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 text-left backdrop-blur-md ring-1 ring-white/20 transition hover:bg-white/20"
              >
                <ScoreRing value={scorePending ? 0 : score} />
                <div className="pr-1 text-white">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/70">
                    <Activity className="h-3 w-3" /> Score <Info className="h-3 w-3" />
                  </div>
                  <div className="text-lg font-semibold tabular-nums leading-none">{scoreText}</div>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-sm">
              {scoreDetail ? (
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold">Home Score {scoreDetail.score}/100</p>
                    <p className="text-xs text-muted-foreground">{scoreDetail.bandLabel}</p>
                  </div>
                  <ul className="space-y-2">
                    {scoreDetail.breakdown.map((b) => (
                      <li key={b.key} className="text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span>{b.label}</span>
                          <span className="tabular-nums">
                            {b.earned}/{b.max}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{b.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <p className="text-xs font-semibold">Raise your score</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {scoreDetail.topActions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your Home Score combines system condition, inspection findings and how complete
                  your home records are. Add your home details to see it.
                </p>
              )}
            </PopoverContent>
          </Popover>
          {refiChip}
        </div>



        {/* Zone chips */}
        <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2 sm:left-auto sm:right-7 sm:top-auto sm:bottom-[280px] sm:translate-y-0">
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {(Object.keys(data.zones) as Array<keyof typeof data.zones>).map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium capitalize text-white backdrop-blur-md ring-1 ring-white/20"
                title={ZONE_LABEL[data.zones[k]]}
              >
                <PulseDot color={ZONE_COLOR[data.zones[k]]} />
                {k} · {ZONE_LABEL[data.zones[k]]}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom glass stat bar */}
        <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
          <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-xl ring-1 ring-white/20 sm:p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                icon={<Home className="h-3.5 w-3.5" />}
                label="Estimated value"
                value={fmtUsd(value)}
                trend={years === 0 ? "▲ +$8,400 · 30d" : `Projected +${years}y`}
                trendColor="text-emerald-300"
              />
              <Stat
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                label="Equity"
                value={fmtUsd(equity, true)}
                trend={`${Math.round(projected.equityPct * 100)}% of value`}
                bar={projected.equityPct}
              />
              <Stat
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Upgrade ROI"
                value={fmtUsd(roi, true)}
                trend="3 smart picks"
              />
              <div className="col-span-2 flex flex-col justify-between sm:col-span-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-white/70">
                  <span>Project</span>
                  <span className="tabular-nums text-white/90">
                    {years === 0 ? "Today" : `+${years}y`}
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
                  className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
                />
                <div className="mt-2 flex gap-1">
                  {[0, 1, 5, 10].map((y) => (
                    <button
                      key={y}
                      onClick={() => setYears(y)}
                      className={`flex-1 rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                        years === y ? "bg-white text-neutral-900" : "bg-white/10 text-white/80 hover:bg-white/20"
                      }`}
                    >
                      {y === 0 ? "Today" : `${y}y`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  trend,
  trendColor = "text-white/70",
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendColor?: string;
  bar?: number;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/70">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-white sm:text-2xl">
        {value}
      </div>
      {bar !== undefined ? (
        <>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-700"
              style={{ width: `${Math.round(bar * 100)}%` }}
            />
          </div>
          {trend && <p className={`mt-1 text-[10px] ${trendColor}`}>{trend}</p>}
        </>
      ) : (
        trend && <p className={`mt-1 text-[11px] ${trendColor}`}>{trend}</p>
      )}
    </div>
  );
}

function PulseDot({ color }: { color: string }) {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
        style={{ background: color }}
      />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width={52} height={52} viewBox="0 0 52 52" className="shrink-0">
      <circle cx={26} cy={26} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={5} fill="none" />
      <circle
        cx={26}
        cy={26}
        r={r}
        stroke="rgb(74,222,128)"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.2,0.7,0.2,1)" }}
      />
    </svg>
  );
}

