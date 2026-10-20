import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBookOwnerGroups } from "@/lib/enrichment.functions";
import { HOUSEHOLD_IMPORT_ENABLED } from "@/lib/household-import";
import { useLanguage } from "@/lib/i18n";

/** Each owner once, with every linked home. Hidden while the feature flag is off. */
export function OwnerGroups({ portfolioId }: { portfolioId: string }) {
  const { language } = useLanguage();
  const es = language === "es";
  const fetchGroups = useServerFn(getBookOwnerGroups);
  const { data } = useQuery({
    queryKey: ["owner-groups", portfolioId],
    queryFn: () => fetchGroups({ data: { portfolioId } }),
    enabled: HOUSEHOLD_IMPORT_ENABLED,
  });
  if (!HOUSEHOLD_IMPORT_ENABLED || !data?.owners.length) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {es ? "Propietarios con varias casas" : "Owners with several homes"}
      </h3>
      <ul className="mt-3 space-y-3">
        {data.owners.map((o) => (
          <li key={o.contactId}>
            <details>
              <summary className="cursor-pointer text-sm text-foreground">
                {o.name} · <span className="text-muted-foreground">{o.homes.length} {es ? "casas" : "homes"}</span>
              </summary>
              <ul className="mt-2 space-y-1 pl-4 text-sm text-muted-foreground">
                {o.homes.map((h) => <li key={h.id}>{h.address}</li>)}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
