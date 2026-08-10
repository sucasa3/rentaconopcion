import { useQuery, useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Star, ArrowRight } from "lucide-react";
import { getMyHomeIntel } from "@/lib/property-intel.functions";
import { getMyComponentServiceLog } from "@/lib/home-maintenance.functions";
import { listInspectionFindings } from "@/lib/inspection.functions";
import { getRecommendedPros } from "@/lib/pros.functions";
import { buildMaintenanceTimeline } from "@/lib/maintenance-rules";
import { toCategorySlug } from "@/lib/mock-data";

type Need = { category: string; reason: string; rank: number };

/** Pros for what the home actually needs right now — never filler vendors. */
export function RecommendedProsCard() {
  const fetchIntel = useServerFn(getMyHomeIntel);
  const fetchLog = useServerFn(getMyComponentServiceLog);
  const fetchFindings = useServerFn(listInspectionFindings);
  const fetchPros = useServerFn(getRecommendedPros);

  const { data: intel } = useQuery({
    queryKey: ["home-intel-maintenance"],
    queryFn: () =>
      fetchIntel({
        data: { classes: ["detail", "permits"], revenueSource: "dashboard_maintenance" },
      }),
    staleTime: 30 * 60_000,
  });
  const { data: serviceLog } = useQuery({
    queryKey: ["component-service-log"],
    queryFn: () => fetchLog(undefined),
    staleTime: 60_000,
  });
  const { data: findings } = useQuery({
    queryKey: ["inspection-findings"],
    queryFn: () => fetchFindings({ data: {} }),
    staleTime: 5 * 60_000,
  });

  const ok = intel?.ok ? intel : null;
  const yearBuilt = ok?.detail?.yearBuilt ?? null;
  const permitEvents = ok?.permits?.events ?? [];
  const timeline =
    yearBuilt || permitEvents.length
      ? buildMaintenanceTimeline(yearBuilt, permitEvents, new Date(), serviceLog ?? [])
      : [];

  const needs: Need[] = [];
  for (const i of timeline) {
    if (i.status === "overdue")
      needs.push({
        category: i.category,
        reason: `${i.label} — ${Math.abs(i.yearsLeft)} yr past expected life`,
        rank: 0,
      });
  }
  for (const f of (findings ?? []) as any[]) {
    if ((f.urgency ?? "").toLowerCase() === "high")
      needs.push({
        category: f.recommended_category || f.system || "General",
        reason: `${f.system ?? "Inspection finding"} — flagged high urgency in your report`,
        rank: 1,
      });
  }
  for (const i of timeline) {
    if (i.status === "due_soon")
      needs.push({
        category: i.category,
        reason: `${i.label} — due within ${Math.max(i.yearsLeft, 0)} yr`,
        rank: 2,
      });
  }

  const seen = new Set<string>();
  const topNeeds = needs
    .sort((a, b) => a.rank - b.rank)
    .filter((n) => {
      const k = n.category.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 3);

  const proQueries = useQueries({
    queries: topNeeds.map((n) => ({
      queryKey: ["recommended-pros", n.category],
      queryFn: () => fetchPros({ data: { category: n.category, limit: 2 } }),
      staleTime: 10 * 60_000,
    })),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Recommended professionals</h2>
          <p className="text-xs text-muted-foreground">
            Matched to what your home needs right now.
          </p>
        </div>
        <Link to="/services" className="text-xs font-medium text-primary">
          Browse
        </Link>
      </div>

      {topNeeds.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Nothing is due right now — we'll surface vetted pros here the moment one of your systems
          needs attention. You can always{" "}
          <Link to="/services" className="font-medium text-primary">
            browse the directory
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {topNeeds.map((need, idx) => {
            const pros = (proQueries[idx]?.data ?? []) as Array<{
              id: string;
              businessName: string;
              category: string;
              serviceArea: string | null;
              rating: number | null;
              reviewsCount: number;
              isFoundingPartner: boolean;
            }>;
            return (
              <li key={need.category} className="rounded-2xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                    {need.category}
                  </span>
                  <p className="text-xs text-muted-foreground">{need.reason}</p>
                </div>

                {pros.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {pros.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-border p-3"
                      >
                        <p className="text-sm font-semibold">{p.businessName}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.serviceArea ?? p.category}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs">
                          {p.rating != null && (
                            <>
                              <Star className="h-3 w-3 fill-current text-primary" /> {p.rating} ·{" "}
                              {p.reviewsCount} reviews
                            </>
                          )}
                          {p.isFoundingPartner && (
                            <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                              Founding partner
                            </span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    We'll match you with a vetted {need.category.toLowerCase()} pro in your area.
                  </p>
                )}

                <Link
                  to="/request"
                  search={{ category: toCategorySlug(need.category) }}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  Request quotes <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
