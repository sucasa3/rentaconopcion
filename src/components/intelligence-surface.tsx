import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE SuCasa intelligence surface.
 *
 * Any place where SuCasa is interpreting data rather than reporting it — the
 * Daily Read, a Suggested Opener, an AI summary, a generated brief — uses this
 * one component so the pattern becomes recognisable: soft blue tone, subtle
 * blue border, small sparkle from the existing icon family, navy text.
 * Differentiated by tone and border, never by shadow.
 */
export function IntelligenceSurface({
  label,
  children,
  className,
  compact = false,
  icon,
}: {
  /** Short eyebrow, e.g. "SuCasa daily read" or "Suggested opener". */
  label?: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-surface-intelligence-border bg-surface-intelligence",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      {label && (
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-intelligence-foreground">
          {icon ?? <Sparkles className="h-3.5 w-3.5" />} {label}
        </p>
      )}
      <div className={cn(label && "mt-2.5", "text-foreground")}>{children}</div>
    </div>
  );
}

/** Small brand marker for a relationship moment. Orange stays physically small. */
export function OpportunityDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sucasa-orange", className)}
    />
  );
}
