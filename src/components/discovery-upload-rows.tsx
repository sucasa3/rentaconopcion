import { useLanguage } from "@/lib/i18n";
import type { DiscoveryRowResult } from "@/lib/discovery-rows";

const LABEL: Record<string, [string, string]> = {
  property_saved: ["Home saved", "Casa guardada"],
  contact_saved: ["Contact saved", "Contacto guardado"],
  duplicate: ["Already in book", "Ya en la cartera"],
  suppressed: ["Do not contact", "No contactar"],
  over_allowance: ["Beyond allowance", "Fuera del límite"],
  unusable: ["Unusable", "No utilizable"],
  failed: ["Failed", "Falló"],
};

/** Every row of the latest upload with its outcome and reason. */
export function DiscoveryUploadRows({ rows }: { rows: DiscoveryRowResult[] }) {
  const { language } = useLanguage();
  const es = language === "es";
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-primary">
        {es ? `Ver las ${rows.length} filas` : `See all ${rows.length} rows`}
      </summary>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <li key={r.row} className="flex flex-col gap-0.5 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3">
            <span className="w-12 shrink-0 text-muted-foreground">{es ? "Fila" : "Row"} {r.row}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{r.name ?? (es ? "(sin nombre)" : "(no name)")}</span>
            <span className={r.outcome === "failed" ? "font-medium text-destructive" : "font-medium text-foreground"}>
              {(LABEL[r.outcome] ?? [r.outcome, r.outcome])[es ? 1 : 0]}
            </span>
            <span className="text-muted-foreground sm:w-1/2">{r.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
