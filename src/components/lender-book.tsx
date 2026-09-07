import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { PRIORITY_LABEL, REVIEW_TYPES, type ReviewType } from "@/lib/lender-access";
import { SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Workspace = NonNullable<Awaited<ReturnType<typeof getLenderWorkspace>>>;
type Person = Workspace["book"][number];

type FilterKey =
  | "all"
  | "asked"
  | "equity"
  | "value"
  | "mortgage_age"
  | "engaged"
  | "tenure"
  | "property_activity"
  | "projects"
  | "annual_review"
  | "no_recent_contact"
  | "hot";

const FILTERS: { key: FilterKey; label: string; test: (p: Person) => boolean }[] = [
  { key: "all", label: "Everyone", test: () => true },
  { key: "asked", label: "Asked to connect", test: (p) => p.askedToConnect },
  { key: "hot", label: "Needs attention", test: (p) => p.temperature === "hot" },
  {
    key: "equity",
    label: "Equity change",
    test: (p) => p.reviews.some((r) => r.type === "equity_review" || r.type === "equity_milestone"),
  },
  {
    key: "value",
    label: "Value milestone",
    test: (p) => p.reviews.some((r) => r.type === "value_milestone"),
  },
  { key: "mortgage_age", label: "Mortgage age", test: (p) => (p.loanAgeYears ?? 0) >= 5 },
  { key: "engaged", label: "Engaged", test: (p) => p.engagedRecently },
  { key: "tenure", label: "Long tenure", test: (p) => (p.tenureYears ?? 0) >= 7 },
  {
    key: "property_activity",
    label: "Property activity",
    test: (p) => p.reviews.some((r) => r.type === "property_change"),
  },
  {
    key: "projects",
    label: "Projects & maintenance",
    test: (p) => p.reviews.some((r) => r.type === "improvement_planning"),
  },
  { key: "annual_review", label: "Annual review due", test: (p) => p.annualReviewDue },
  { key: "no_recent_contact", label: "No recent contact", test: (p) => !p.lastContactAt },
];

const TEMP_LABEL = { hot: "🔥 Hot", warm: "🟡 Warm", nurture: "🔵 Nurture" } as const;

/** My Book: monitor the homeowners this lender already knows. */
export function LenderBook() {
  const wsFn = useServerFn(getLenderWorkspace);
  const { data } = useQuery({
    queryKey: ["lender-workspace"],
    queryFn: () => wsFn({ data: {} }),
    staleTime: 60_000,
  });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [type, setType] = useState<ReviewType | "any">("any");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const all = data?.book ?? [];
    const f = FILTERS.find((x) => x.key === filter)!;
    const needle = q.trim().toLowerCase();
    return all
      .filter(f.test)
      .filter((p) => type === "any" || p.reviews.some((r) => r.type === type))
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          (p.address ?? "").toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => b.priority - a.priority);
  }, [data, filter, type, q]);

  if (!data) return null;

  return (
    <section className="space-y-3 px-4 py-6 sm:px-6">
      <SectionHeader title="My Book" />
      <p className="-mt-1 text-sm text-muted-foreground">
        Who changed, who needs attention, and what to say. {data.book.length} homeowner
        {data.book.length === 1 ? "" : "s"} you have a documented relationship with.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or address"
        className="min-h-[44px] w-full rounded-full border border-border bg-card px-4 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setType("any")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition",
            type === "any" ? "border-primary text-primary" : "border-border text-muted-foreground",
          )}
        >
          Any review type
        </button>
        {(Object.keys(REVIEW_TYPES) as ReviewType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition",
              type === t ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {REVIEW_TYPES[t].label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="mx-auto h-7 w-7" />}
          title="Nobody matches that filter"
          hint="Try a different filter, or add homeowners you already work with."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Link
              key={p.id}
              to={"/lender/portfolio/$id" as never}
              params={{ id: p.portfolioId } as never}
              search={{ client: p.id } as never}
              className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{p.name}</p>
                {p.askedToConnect ? (
                  <StatusPill tone="attention">Requested contact</StatusPill>
                ) : (
                  <StatusPill tone="muted">{TEMP_LABEL[p.temperature ?? "nurture"]}</StatusPill>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Est. equity {formatMoney(p.estimatedEquityCents)}
                {p.estimatedLtvPct != null ? ` · Est. LTV ${p.estimatedLtvPct}%` : ""}
              </p>
              <p className="mt-2 text-sm">{p.whyToday}</p>
              <p className="mt-1 text-sm font-medium">Next: {p.recommendedAction}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {PRIORITY_LABEL}: {p.priority} · {p.reviews[0]?.label ?? "Monitored"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
