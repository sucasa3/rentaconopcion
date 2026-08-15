import { useEffect, useRef, useState, type ReactNode } from "react";
import logoAsset from "@/assets/sucasa-logo.png.asset.json";

/**
 * Every slide is authored at 1920x1080 and scaled to fit whatever container it
 * lands in (deck view, print sheet, fullscreen). One scaling primitive, used
 * everywhere.
 */
export function ScaledSlide({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setScale(Math.min(width / 1920, height / 1080));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2 origin-center"
        style={{
          width: 1920,
          height: 1080,
          marginLeft: -960,
          marginTop: -540,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function SlideLayout({
  kicker,
  title,
  lead,
  children,
  tone = "light",
  footer = "SuCasa · Lender Partnership",
}: {
  kicker?: string;
  title?: string;
  lead?: string;
  children?: ReactNode;
  tone?: "light" | "dark" | "brand";
  footer?: string;
}) {
  const shell =
    tone === "dark"
      ? "bg-[oklch(0.19_0.03_255)] text-[oklch(0.98_0.005_250)]"
      : tone === "brand"
        ? "gradient-brand text-white"
        : "gradient-hero text-foreground";

  const muted = tone === "light" ? "text-muted-foreground" : "text-white/70";

  return (
    <div className={`slide-content flex flex-col px-[110px] py-[64px] ${shell}`}>
      <div className="flex items-start justify-between">
        <div className="max-w-[1400px]">
          {kicker && (
            <p className={`slide-kicker font-semibold ${tone === "light" ? "text-primary" : "text-white/80"}`}>
              {kicker}
            </p>
          )}
          {title && <h2 className="slide-title mt-6 font-semibold">{title}</h2>}
          {lead && <p className={`slide-body-lg mt-6 max-w-[1250px] ${muted}`}>{lead}</p>}
        </div>
        <img src={logoAsset.url} alt="SuCasa" className="h-[56px] w-auto opacity-90" />
      </div>

      <div className="mt-[36px] flex-1">{children}</div>

      <div className={`slide-footer mt-[30px] flex items-center justify-between ${muted}`}>
        <span>{footer}</span>
        <span>sucasa</span>
      </div>
    </div>
  );
}

/** Neutral card used throughout the deck. */
export function DeckCard({
  children,
  tone = "light",
  className = "",
}: {
  children: ReactNode;
  tone?: "light" | "dark" | "brand";
  className?: string;
}) {
  const skin =
    tone === "light"
      ? "border-border/70 bg-card/90"
      : "border-white/15 bg-white/10 backdrop-blur";
  return (
    <div className={`rounded-[34px] border p-9 shadow-soft ${skin} ${className}`}>{children}</div>
  );
}

export function NumberedPoint({
  n,
  title,
  body,
  tone = "light",
}: {
  n: number | string;
  title: string;
  body: string;
  tone?: "light" | "dark" | "brand";
}) {
  return (
    <DeckCard tone={tone} className="flex gap-6">
      <span
        className={`grid h-[70px] w-[70px] shrink-0 place-items-center rounded-2xl text-[30px] font-semibold ${
          tone === "light" ? "bg-primary/10 text-primary" : "bg-white/15 text-white"
        }`}
      >
        {n}
      </span>
      <div>
        <p className="slide-body-lg font-semibold">{title}</p>
        {body && (
          <p className={`slide-body mt-3 ${tone === "light" ? "text-muted-foreground" : "text-white/75"}`}>
            {body}
          </p>
        )}
      </div>
    </DeckCard>
  );
}
