import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { getBusinessOverview } from "@/lib/business.functions";
import { categoryLabel } from "@/lib/opportunities";
import { SignalCard, StatusPill, EmptyState, SectionHeader } from "@/components/ui-kit";
import { categoryIcon } from "@/components/business-dashboard";
import { cn } from "@/lib/utils";

/** One place for every open signal, filtered by type. */
export function OpportunitiesBoard({ kind }: { kind: "agent" | "lender" }) {
  const overviewFn = useServerFn(getBusinessOverview);
  const [filter, setFilter] = useState<string>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["business-overview", kind],
    queryFn: () => overviewFn({ data: { orgType: kind } }),
    staleTime: 60_000,
  });

  const base = kind === "agent" ? "/agent" : "/lender";
  const all = (data?.opportunities ?? []) as any[];
  const categories = [...new Set(all.map((o) => o.category))];
  const shown = filter === "all" ? all : all.filter((o) => o.category === filter);

  return (
    <div className="space-y-5 px-4 py-6 sm:px-6">
      <SectionHeader title="Opportunities" />
      <p className="-mt-3 text-sm text-muted-foreground">
        Every homeowner worth a conversation right now.
      </p>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {["all", ...categories].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                filter === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {c === "all" ? "All" : categoryLabel(c)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="mx-auto h-7 w-7" />}
          title="No open opportunities"
          hint="Add homeowners and SuCasa will start finding them."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((o) => (
            <SignalCard
              key={o.id}
              icon={categoryIcon(o.category)}
              name={o.clientName}
              signal={o.reason ?? categoryLabel(o.category)}
              pill={
                <StatusPill tone={o.strength === "strong" ? "attention" : "muted"}>
                  {categoryLabel(o.category)}
                </StatusPill>
              }
              actionLabel="View homeowner"
              to={o.portfolioId ? (`${base}/portfolio/$id` as never) : undefined}
              params={o.portfolioId ? { id: o.portfolioId } : undefined}
              search={
                o.portfolioId && (o as any).clientId
                  ? ({ client: (o as any).clientId } as never)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
