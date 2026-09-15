import { MapPin } from "lucide-react";
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
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-elevated sm:rounded-3xl">
      <div className="relative h-[176px] w-full min-[430px]:h-[196px] sm:h-[340px] lg:h-[390px]">
        <img
          src={heroPhoto.url}
          alt={data.address ? `Photo of ${data.address}` : "Your home"}
          width={1920}
          height={1200}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="home-photo-vignette pointer-events-none absolute inset-0" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-3.5 pb-9 sm:p-7 sm:pb-14">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-foreground/80 sm:text-xs">
            <MapPin className="h-3.5 w-3.5" /> Your home
          </div>
          <h1 className="mt-0.5 max-w-[28ch] text-xl font-semibold leading-tight text-primary-foreground drop-shadow-lg sm:mt-1 sm:text-4xl lg:text-5xl">
            {data.address ?? "Add your home address"}
          </h1>
          {!data.address && (
            <p className="mt-2 max-w-md text-sm text-primary-foreground/75">
              Add your address to connect your home records.
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 -mt-7 mx-2.5 mb-2.5 grid grid-cols-3 divide-x divide-white/15 rounded-xl border border-white/12 bg-hero-glass px-1 py-2 shadow-elevated backdrop-blur-md sm:-mt-11 sm:mx-5 sm:mb-5 sm:rounded-2xl sm:px-2 sm:py-3.5">
        <HeroMetric
          label="Estimated Value"
          value={compactMoney(data.value)}
        />
        <HeroMetric
          label="Estimated Equity"
          value={compactMoney(data.equity)}
          note={data.equityPct != null ? `${Math.round(data.equityPct * 100)}% of value` : null}
          notePositive
        />
        <HeroMetric
          label="Home Score"
          value={data.homeScore != null ? String(data.homeScore) : "—"}
        />
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  note,
  notePositive = false,
}: {
  label: string;
  value: string;
  note?: string | null;
  notePositive?: boolean;
}) {
  return (
    <div className="min-w-0 px-2 text-center sm:px-3">
      <p className="truncate text-[9px] font-medium uppercase tracking-[0.08em] text-white/60 sm:text-[11px] sm:tracking-[0.1em]">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-white sm:text-2xl">{value}</p>
      {note && (
        <p
          className={`truncate text-[9px] sm:text-xs ${notePositive ? "text-hero-glass-positive" : "text-white/55"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}
