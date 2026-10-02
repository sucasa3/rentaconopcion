import type { SystemValue } from "@/lib/home-maintenance.functions";
import { useT, type TranslationKey } from "@/lib/i18n";

export type HistoryItem = {
  componentKey: string;
  actorRole: string;
  changeKind: string;
  oldValue: SystemValue | null;
  newValue: SystemValue | null;
  createdAt: string;
};

function summary(v: SystemValue | null): string {
  if (!v) return "—";
  const parts = [
    v.installed_year ? String(v.installed_year) : null,
    v.brand ? String(v.brand) : null,
    v.model ? String(v.model) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

/** Who changed which system, when, and old → new. */
export function HomeSystemHistory({ items }: { items: HistoryItem[] }) {
  const t = useT();
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("hs.history.empty")}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((h, i) => (
        <li key={i} className="py-2.5 text-sm">
          <p className="font-medium">
            {h.actorRole === "agent"
              ? `${t("hs.history.by_agent")} ${t(`hs.history.${h.changeKind}` as TranslationKey)}`
              : t(`hs.history.you.${h.changeKind}` as TranslationKey)}{" "}
            {t(`care.system.${h.componentKey}` as TranslationKey)}
          </p>
          <p className="text-muted-foreground">
            {t("hs.history.from_to", { from: summary(h.oldValue), to: summary(h.newValue) })}
          </p>
          <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</p>
        </li>
      ))}
    </ul>
  );
}
