import { useState } from "react";
import { Languages } from "lucide-react";
import { toast } from "sonner";

import { useLanguage, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

/**
 * Segmented English / Español control. Saves to the signed-in profile when
 * there is one, and always switches the interface immediately.
 */
export function LanguageSwitcher({
  className,
  showIcon = true,
  compact = false,
}: {
  className?: string;
  showIcon?: boolean;
  /** Small inline variant for the public site header. */
  compact?: boolean;
}) {
  const { language, setLanguage, t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function pick(next: Language) {
    if (next === language || busy) return;
    setBusy(true);
    try {
      await setLanguage(next);
      toast.success(next === "es" ? "Idioma actualizado" : t("common.language_saved"));
    } catch {
      toast.error(t("common.language_save_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className={cn("flex items-center gap-1", className)} role="group" aria-label={t("common.language")}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={language === o.value}
            disabled={busy}
            className={cn(
              "min-h-9 rounded-full px-2.5 text-xs font-semibold uppercase tracking-wide transition active:scale-[0.97]",
              language === o.value
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.value === "en" ? "EN" : "ES"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showIcon && <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="flex flex-1 items-stretch gap-1 rounded-2xl bg-secondary p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            aria-pressed={language === o.value}
            className={cn(
              "min-h-9 flex-1 rounded-xl px-3 text-sm font-medium transition active:scale-[0.98]",
              language === o.value
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
