import type { ReactNode } from "react";

/**
 * Dark, premium deck primitives for the agent presentation.
 * Same brand tokens as the lender deck — navy ground, accent highlights,
 * product-shaped cards rather than illustrations.
 */

export const INK = "bg-[oklch(0.16_0.025_255)]";

/** Full-bleed dark slide with a soft brand aurora behind the content. */
export function DarkSlide({
  children,
  footer = "SuCasa · Agent Partnership",
  page,
  className = "",
}: {
  children: ReactNode;
  footer?: string | null;
  page?: string;
  className?: string;
}) {
  return (
    <div className={`slide-content ${INK} text-[oklch(0.98_0.005_250)]`}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(1100px 640px at 8% -12%, oklch(0.45 0.14 255 / 0.55), transparent 62%), radial-gradient(900px 560px at 96% 8%, oklch(0.5 0.12 165 / 0.32), transparent 62%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage: "radial-gradient(1200px 700px at 50% 40%, black, transparent 78%)",
        }}
      />
      <div className={`relative flex h-full flex-col px-[120px] py-[64px] ${className}`}>
        <div className="min-h-0 flex-1">{children}</div>
        {footer !== null && (
          <div className="slide-footer mt-8 flex items-center justify-between text-white/45">
            <span>{footer}</span>
            <span>{page ?? "sucasa"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="slide-kicker deck-fade font-semibold text-[oklch(0.78_0.14_165)]">{children}</p>
  );
}

/** Glass surface used for every product-like card in the deck. */
export function Glass({
  children,
  className = "",
  style,
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] border backdrop-blur-sm ${
        accent
          ? "border-[oklch(0.78_0.14_165_/_0.45)] bg-[oklch(0.78_0.14_165_/_0.10)]"
          : "border-white/12 bg-white/[0.055]"
      } ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function SignalChip({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: "accent" | "blue" | "amber" | "muted";
}) {
  const tones: Record<string, string> = {
    accent: "bg-[oklch(0.78_0.14_165_/_0.16)] text-[oklch(0.85_0.13_165)]",
    blue: "bg-[oklch(0.7_0.14_255_/_0.18)] text-[oklch(0.84_0.09_255)]",
    amber: "bg-[oklch(0.8_0.15_75_/_0.16)] text-[oklch(0.87_0.12_75)]",
    muted: "bg-white/8 text-white/60",
  };
  return (
    <span
      className={`slide-chrome inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-5 py-2 font-semibold uppercase tracking-[0.12em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A homeowner row exactly as it appears in the agent product. */
export function HomeownerCard({
  name,
  property,
  signal,
  why,
  action,
  tone = "accent",
  className = "",
  style,
}: {
  name: string;
  property: string;
  signal: string;
  why?: string;
  action?: string;
  tone?: "accent" | "blue" | "amber";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Glass className={`p-8 ${className}`} style={style}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="slide-subtitle whitespace-nowrap font-semibold tracking-tight">{name}</p>
          <p className="slide-caption mt-2 text-white/50">{property}</p>
        </div>
        <SignalChip tone={tone}>{signal}</SignalChip>
      </div>
      {why && <p className="slide-body mt-6 text-white/72">{why}</p>}
      {action && (
        <div className="mt-7 flex items-center gap-4">
          <span className="slide-chrome font-semibold uppercase tracking-[0.14em] text-white/40">
            Suggested
          </span>
          <span className="slide-body font-semibold text-[oklch(0.85_0.13_165)]">{action}</span>
        </div>
      )}
    </Glass>
  );
}

/** Tiny abstract contact tile — the atom of the database visuals. */
export function ContactTile({
  active = false,
  delay = 0,
  dim = false,
}: {
  active?: boolean;
  delay?: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`${dim ? "deck-dim" : "deck-fade"} flex h-[52px] items-center gap-2 rounded-[10px] border px-2 ${
        active
          ? "border-[oklch(0.78_0.14_165_/_0.6)] bg-[oklch(0.78_0.14_165_/_0.18)]"
          : "border-white/10 bg-white/[0.05]"
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        className={`h-6 w-6 shrink-0 rounded-md ${
          active ? "bg-[oklch(0.78_0.14_165)]" : "bg-white/18"
        }`}
      />
      <span className="flex-1 space-y-1.5">
        <span className={`block h-1.5 rounded-full ${active ? "bg-white/60" : "bg-white/20"}`} />
        <span className="block h-1.5 w-2/3 rounded-full bg-white/12" />
      </span>
    </div>
  );
}

/** Grid of contact tiles with a highlighted subset. */
export function ContactField({
  count = 120,
  activeIndexes = [],
  dimRest = false,
  columns = 12,
}: {
  count?: number;
  activeIndexes?: number[];
  dimRest?: boolean;
  columns?: number;
}) {
  const active = new Set(activeIndexes);
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <ContactTile
          key={i}
          active={active.has(i)}
          dim={dimRest && !active.has(i)}
          delay={(i % columns) * 22 + Math.floor(i / columns) * 30}
        />
      ))}
    </div>
  );
}

export function BigStat({
  value,
  label,
  tone = "accent",
}: {
  value: string;
  label: string;
  tone?: "accent" | "white";
}) {
  return (
    <div>
      <p
        className={`slide-title-lg font-semibold tracking-tight ${
          tone === "accent" ? "text-[oklch(0.82_0.14_165)]" : ""
        }`}
      >
        {value}
      </p>
      <p className="slide-body mt-3 text-white/55">{label}</p>
    </div>
  );
}
