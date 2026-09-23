import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { getLenderWorkspace } from "@/lib/lender-workspace.functions";
import { REVIEW_TYPES, type ReviewType } from "@/lib/lender-access";
import { SectionHeader, EmptyState, StatusPill } from "@/components/ui-kit";
import { formatMoney } from "@/lib/money";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/en";
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

const FILTERS: { key: FilterKey; label: TranslationKey; test: (p: Person) => boolean }[] = [
  { key: "all", label: "biz.lb.f.all", test: () => true },
  { key: "asked", label: "biz.lb.f.asked", test: (p) => p.askedToConnect },
  { key: "hot", label: "biz.lb.f.hot", test: (p) => p.temperature === "hot" },
  {
    key: "equity",
    label: "biz.lb.f.equity",
    test: (p) => p.reviews.some((r) => r.type === "equity_review" || r.type === "equity_milestone"),
  },
  {
    key: "value",
    label: "biz.lb.f.value",
    test: (p) => p.reviews.some((r) => r.type === "value_milestone"),
  },
  { key: "mortgage_age", label: "biz.lb.f.mortgage_age", test: (p) => (p.loanAgeYears ?? 0) >= 5 },
  { key: "engaged", label: "biz.lb.f.engaged", test: (p) => p.engagedRecently },
  { key: "tenure", label: "biz.lb.f.tenure", test: (p) => (p.tenureYears ?? 0) >= 7 },
  {
    key: "property_activity",
    label: "biz.lb.f.property_activity",
    test: (p) => p.reviews.some((r) => r.type === "property_change"),
  },
  {
    key: "projects",
    label: "biz.lb.f.projects",
    test: (p) => p.reviews.some((r) => r.type === "improvement_planning"),
  },
  { key: "annual_review", label: "biz.lb.f.annual_review", test: (p) => p.annualReviewDue },
  { key: "no_recent_contact", label: "biz.lb.f.no_recent_contact", test: (p) => !p.lastContactAt },
];

const TEMP_EMOJI = { hot: "🔥", warm: "🟡", nurture: "🔵" } as const;

/** My Book: monitor the homeowners this lender already knows. */
export function LenderBook() {
  const t = useT();
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
      <SectionHeader title={t("biz.at.my_book")} />
      <p className="-mt-1 text-sm text-muted-foreground">
        {t(data.book.length === 1 ? "biz.lb.sub_one" : "biz.lb.sub_many", {
          count: data.book.length,
        })}
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("biz.lb.search_ph")}
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
            {t(f.label)}
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
          {t("biz.lb.any_type")}
        </button>
        {(Object.keys(REVIEW_TYPES) as ReviewType[]).map((rt) => (
          <button
            key={rt}
            type="button"
            onClick={() => setType(rt)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition",
              type === rt ? "border-primary text-primary" : "border-border text-muted-foreground",
            )}
          >
            {t(`biz.lb.rt.${rt}` as TranslationKey)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="mx-auto h-7 w-7" />}
          title={t("biz.lb.empty_title")}
          hint={t("biz.lb.empty_hint")}
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
                  <StatusPill tone="attention">{t("biz.lt.requested")}</StatusPill>
                ) : (
                  <StatusPill tone="muted">
                    {TEMP_EMOJI[p.temperature ?? "nurture"]}{" "}
                    {t(`biz.temp.${p.temperature ?? "nurture"}` as TranslationKey)}
                  </StatusPill>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("biz.lb.est_equity")} {formatMoney(p.estimatedEquityCents)}
                {p.estimatedLtvPct != null ? ` · ${t("biz.lb.est_ltv")} ${p.estimatedLtvPct}%` : ""}
              </p>
              <p className="mt-2 text-sm">{p.whyToday}</p>
              <p className="mt-1 text-sm font-medium">{t("biz.lb.next")} {p.recommendedAction}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("biz.lb.priority")}: {p.priority} · {p.reviews[0]?.label ?? t("biz.lb.monitored")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
