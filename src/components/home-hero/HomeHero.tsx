import { ChartNoAxesCombined, House, MapPin } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { HomeHeroView } from "@/lib/home-hero-data";
import heroPhoto from "@/assets/home-hero-photo.jpg.asset.json";

function compactMoney(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
  }).format(value);
}

/**
 * The property photo stays the emotional anchor. A single shallow glass strip
 * overlaps its lower edge with three canonical readings — never derived,
 * never invented: missing data renders a neutral dash.
 */
export function HomeHero({ data }: { data: HomeHeroView }) {
  return (
    <section className="relative rounded-[22px] border border-border bg-card pb-3 shadow-elevated sm:rounded-3xl sm:pb-5">
      <div className="relative h-[218px] w-full overflow-hidden rounded-t-[21px] min-[430px]:h-[238px] sm:h-[340px] sm:rounded-t-[calc(var(--radius-3xl)-1px)] lg:h-[390px]">
        <img
          src={heroPhoto.url}
          alt={data.address ? `Photo of ${data.address}` : "Your home"}
          width={1920}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="home-photo-vignette pointer-events-none absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-4 pb-12 sm:p-7 sm:pb-16">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase text-primary-foreground/80 sm:text-xs">
            <MapPin className="h-3.5 w-3.5" /> Your home
          </div>
          <h1 className="mt-1 max-w-[24ch] text-[22px] font-bold leading-[1.08] text-primary-foreground drop-shadow-lg sm:text-4xl lg:text-5xl">
            {data.address ?? "Add your home address"}
          </h1>
          {!data.address && (
            <p className="mt-2 max-w-md text-sm text-primary-foreground/75">
              Add your address to connect your home records.
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-9 mx-2.5 grid grid-cols-3 divide-x divide-surface-intelligence-border rounded-2xl border border-surface-intelligence-border bg-hero-glass px-1 py-3 shadow-elevated backdrop-blur-xl sm:-mt-12 sm:mx-5 sm:px-2 sm:py-4">
        <Link to="/money" aria-label="View value and equity details" className="col-span-2 grid min-h-11 grid-cols-2 divide-x divide-border rounded-lg transition-colors hover:bg-surface-intelligence focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HeroMetric icon={<House />} label="Estimated Value" shortLabel="Value" value={compactMoney(data.value)} />
          <HeroMetric
            icon={<ChartNoAxesCombined />}
            label="Estimated Equity"
            shortLabel="Equity"
            value={compactMoney(data.equity)}
            note={data.equityPct != null ? `${Math.round(data.equityPct * 100)}% of value` : null}
            notePositive
          />
        </Link>
        <HeroMetric
          score={data.homeScore}
          label="Home Score"
          shortLabel="Score"
          value={data.homeScore != null ? String(data.homeScore) : "—"}
        />
      </div>
    </section>
  );
}

function HeroMetric({
  icon,
  score,
  label,
  shortLabel,
  value,
  note,
  notePositive = false,
}: {
  icon?: React.ReactNode;
  score?: number | null;
  label: string;
  shortLabel: string;
  value: string;
  note?: string | null;
  notePositive?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 px-1.5 sm:gap-3 sm:px-3">
      {score != null ? (
        <span className="relative hidden h-10 w-10 shrink-0 place-items-center min-[370px]:grid sm:h-14 sm:w-14">
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" className="text-secondary" />
            <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * (1 - score / 100)} className="home-score-ring text-status-positive" />
          </svg>
          <span className="text-xs font-bold tabular-nums text-sucasa-navy sm:text-sm">{score}</span>
        </span>
      ) : icon ? <span className="hidden text-intelligence-accent min-[370px]:block [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5">{icon}</span> : null}
      <div className="min-w-0 text-left">
       <p className="truncate text-[8px] font-bold uppercase text-intelligence-accent sm:text-[10px]">
        <span className="min-[360px]:hidden">{shortLabel}</span>
        <span className="hidden min-[360px]:inline">{label}</span>
      </p>
       <p className={`${score != null ? "min-[370px]:hidden" : ""} mt-0.5 truncate text-lg font-bold tabular-nums text-sucasa-navy sm:text-2xl`}>{value}</p>
      {note && (
        <p
          className={`truncate text-[8px] sm:text-xs ${notePositive ? "text-status-positive" : "text-muted-foreground"}`}
        >
          {note}
        </p>
      )}
      </div>
    </div>
  );
}
