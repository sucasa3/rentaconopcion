import { useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import { AgentCoveragePanel } from "@/components/agent-coverage-panel";
import { GuidedOnboarding } from "@/components/guided-onboarding";
import { CopilotSearch } from "@/components/copilot-search";
import { useUserId } from "@/hooks/use-user-id";
import { useIsMobile } from "@/hooks/use-mobile";
import { readOnboarding } from "@/lib/onboarding";
import { useT } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAgentPortfolio,
  enrichAgentPortfolio,
  setListingStatus,
  generateAgentBrief,
  getRecordsBudget,
  markAgentFeedSeen,
  setAgentFeedReviewed,

} from "@/lib/agent.functions";
import { useAutoEnrich } from "@/hooks/use-auto-enrich";
import { OpportunityCard, PersonCard, PriorityCard, StatusPill } from "@/components/ui-kit";
import {
  ArrowLeft,
  Search,
  Sparkles,
  Loader2,
  Mail,
  Phone,
  X,
  Flame,
  Copy,
  ChevronLeft,
  ChevronRight,
  Home,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Link2,
  Info,
  Hammer,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";


const SOURCE_KEY: Record<string, TranslationKey> = {
  inspection: "biz.apd.src.inspection",
  property_records: "biz.apd.src.property_records",
  recent_permit: "biz.apd.src.recent_permit",
};

function NewPill({ count }: { count?: number }) {
  const t = useT();
  return (
    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
      {count ? t("biz.apd.new_count", { count }) : t("biz.apd.new")}
    </span>
  );
}

function SourceBadge({ source }: { source?: string }) {
  const t = useT();
  const label = t(SOURCE_KEY[source ?? "inspection"] ?? "biz.apd.src.inspection");
  return (
    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/agent/portfolio/$id")({
  validateSearch: (s: Record<string, unknown>): { client?: string; status?: "activated" } => ({
    ...(typeof s.client === "string" ? { client: s.client } : {}),
    ...(s.status === "activated" ? { status: "activated" as const } : {}),
  }),

  head: () => ({
    meta: [
      { title: "Sphere intelligence — SuCasa Agent" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentPortfolio,
});

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const moneyCompact = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n).toLocaleString()}`;
};

const BAND_META: Record<string, { labelKey: TranslationKey; tone: string }> = {
  high: { labelKey: "biz.apd.bd.high", tone: "bg-sucasa-orange/12 text-status-opportunity border-sucasa-orange/40" },
  hot: { labelKey: "biz.apd.bd.hot", tone: "bg-sucasa-orange/10 text-status-opportunity border-sucasa-orange/30" },
  warm: { labelKey: "biz.apd.bd.warm", tone: "bg-status-attention/10 text-status-attention border-status-attention/40" },
  nurture: { labelKey: "biz.apd.bd.nurture", tone: "bg-status-nurture/10 text-status-nurture border-status-nurture/30" },
  hold: { labelKey: "biz.apd.bd.hold", tone: "bg-secondary text-muted-foreground border-border" },
};

const READINESS_META: Record<string, { labelKey: TranslationKey; tone: string }> = {
  "list-ready": { labelKey: "biz.apd.rd.list-ready", tone: "bg-status-positive/12 text-status-positive" },
  "prep-needed": { labelKey: "biz.apd.rd.prep-needed", tone: "bg-status-attention/10 text-status-attention" },
  "not-ready": { labelKey: "biz.apd.rd.not-ready", tone: "bg-secondary text-muted-foreground" },
};

/** Tap-to-open explainer for the three listing-readiness bands. */
function ReadinessInfo() {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("biz.apd.rd_aria")}
          className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl border border-border bg-popover p-4 text-xs shadow-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("biz.apd.rd_title")}
        </p>
        <p className="mt-1 text-muted-foreground">{t("biz.apd.rd_body")}</p>

        <ul className="mt-3 space-y-1.5">
          {(["list-ready", "prep-needed", "not-ready"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  k === "list-ready"
                    ? "bg-growth"
                    : k === "prep-needed"
                      ? "bg-status-attention"
                      : "bg-muted-foreground/40"
                }`}
              />
              <span>
                <span className="font-medium">{t(READINESS_META[k].labelKey)}</span>
                <span className="block text-muted-foreground">
                  {t(`biz.apd.rd_d.${k}` as TranslationKey)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Tap-to-open explainer for the four move-intent bands. */
function IntentInfo() {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("biz.apd.in_aria")}
          className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl border border-border bg-popover p-4 text-xs shadow-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("biz.apd.in_title")}
        </p>
        <p className="mt-1 text-muted-foreground">{t("biz.apd.in_body")}</p>
        <p className="mt-2 text-muted-foreground">{t("biz.apd.in_note")}</p>
        <ul className="mt-3 space-y-1.5">
          {(["high", "hot", "warm", "nurture", "hold"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  k === "high"
                    ? "bg-sucasa-orange"
                    : k === "hot"
                    ? "bg-sucasa-orange/70"
                    : k === "warm"
                      ? "bg-status-attention"
                      : k === "nurture"
                        ? "bg-status-nurture"
                        : "bg-muted-foreground/40"
                }`}
              />
              <span>
                <span className="font-medium">{t(BAND_META[k].labelKey)}</span>
                <span className="block text-muted-foreground">
                  {t(`biz.apd.bd_d.${k}` as TranslationKey)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Tap-to-open explainer for the modeled net proceeds figure. */
function NetProceedsInfo({ sellCostPct }: { sellCostPct: number }) {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("biz.apd.np_aria")}
          className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl border border-border bg-popover p-4 text-xs shadow-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("biz.apd.np_title")}
        </p>
        <p className="mt-1 text-muted-foreground">{t("biz.apd.np_body")}</p>
        <div className="mt-3 rounded-lg bg-secondary/60 p-2 font-mono text-[11px] leading-relaxed">
          {t("biz.apd.np_f_value")}
          <br />
          {t("biz.apd.np_f_cost", { pct: sellCostPct })}
          <br />
          {t("biz.apd.np_f_mortgage")}
          <br />
          <span className="font-semibold">{t("biz.apd.np_f_net")}</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">{t("biz.apd.np_li1_t")}</span>{" "}
            {t("biz.apd.np_li1", { pct: sellCostPct })}
          </li>
          <li>
            <span className="font-medium text-foreground">{t("biz.apd.np_li2_t")}</span>{" "}
            {t("biz.apd.np_li2")}
          </li>
          <li>{t("biz.apd.np_li3")}</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Tap-to-open explainer for the permit dollar value shown on a homeowner record. */
function PermitsInfo() {
  const t = useT();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("biz.apd.pm_aria")}
          className="rounded-full p-0.5 text-muted-foreground transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 rounded-xl border border-border bg-popover p-4 text-xs shadow-soft"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("biz.apd.pm_title")}
        </p>
        <p className="mt-1 text-muted-foreground">{t("biz.apd.pm_body1")}</p>
        <p className="mt-3 text-muted-foreground">{t("biz.apd.pm_body2")}</p>
      </PopoverContent>
    </Popover>
  );
}

const STATUSES = ["off_market", "active", "pending", "sold", "expired", "withdrawn"] as const;
const PAGE_SIZE = 25;

function AgentPortfolio() {
  const t = useT();
  const { id } = Route.useParams();
  const { client: clientParam, status: statusParam } = Route.useSearch();
  const getFn = useServerFn(getAgentPortfolio);
  const enrichFn = useServerFn(enrichAgentPortfolio);
  const listingFn = useServerFn(setListingStatus);
  const briefFn = useServerFn(generateAgentBrief);
  const markSeenFn = useServerFn(markAgentFeedSeen);
  const reviewFn = useServerFn(setAgentFeedReviewed);
  const qc = useQueryClient();


  const [sellCost, setSellCost] = useState(8);
  const [band, setBand] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);
  const [brief, setBrief] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-portfolio", id, sellCost],
    queryFn: () => getFn({ data: { id, sellCostPct: sellCost } }),
  });

  // Deep link: /agent/portfolio/$id?client=<clientId> opens that homeowner directly.
  const openedParam = useRef<string | null>(null);
  useEffect(() => {
    if (!clientParam || !data || openedParam.current === clientParam) return;
    const match = (data as any).clients?.find((c: any) => c.id === clientParam);
    if (match) {
      openedParam.current = clientParam;
      setSelected(match);
    }
  }, [clientParam, data]);


  const enrich = useMutation({
    // Runs batch after batch until every mappable home in the book is covered
    // (or a batch stops making progress), so one click finishes the portfolio.
    mutationFn: async () => {
      let enriched = 0;
      let failed = 0;
      let unmappable = 0;
      let remaining = 0;
      for (let pass = 0; pass < 20; pass++) {
        const r: any = await enrichFn({ data: { portfolioId: id, limit: 25 } });
        enriched += r.enriched;
        failed += r.failed;
        unmappable = r.unmappable;
        remaining = r.remaining;
        if (r.remaining === 0 || r.enriched === 0) break;
      }
      return { enriched, failed, unmappable, remaining };
    },
    onMutate: () => ({ toastId: toast.loading(t("biz.apd.enrich_loading")) }),
    onSuccess: (r: any, _v, ctx) => {
      const extra = r.unmappable ? t("biz.apd.no_address", { count: r.unmappable }) : "";
      const left = r.remaining ? t("biz.apd.enrich_left", { count: r.remaining }) : "";
      toast.success(t("biz.apd.enrich_success", { count: r.enriched }) + extra + left, {
        id: ctx?.toastId,
      });
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
    },
    onError: (e: any, _v, ctx) => toast.error(e.message, { id: ctx?.toastId }),
  });

  // Records fill in continuously via the background engine; the coverage panel
  // shows live progress. Nothing is pulled on page load.



  const saveListing = useMutation({
    mutationFn: (v: any) => listingFn({ data: v }),
    onSuccess: () => {
      toast.success(t("biz.apd.listing_saved"));
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const makeBrief = useMutation({
    mutationFn: (clientId: string) => briefFn({ data: { clientId, language: "en" as const } }),
    onSuccess: (r: any) => setBrief(r.brief),
    onError: (e: any) => toast.error(e.message),
  });

  // --- Client activity: new markers + manual review -------------------------
  const [activityTab, setActivityTab] = useState("recommendations");
  const userId = useUserId();
  const focusApplied = useRef(false);
  useEffect(() => {
    if (focusApplied.current || userId === undefined) return;
    focusApplied.current = true;
    const saved = readOnboarding("agent", userId);
    if (saved && ["high_intent", "recommendations", "referrals"].includes(saved.focus)) {
      setActivityTab(saved.focus);
    }
  }, [userId]);
  const [showReviewed, setShowReviewed] = useState(false);
  const seenSent = useRef<Set<string>>(new Set());

  const recFeedAll = ((data as any)?.recommendation_feed ?? []) as any[];
  const refFeed = ((data as any)?.referral_feed ?? []) as any[];
  const highIntentFeed = ((data as any)?.high_intent_feed ?? []) as any[];
  const recFeed = showReviewed ? recFeedAll : recFeedAll.filter((r) => !r.reviewed_at);
  const reviewedCount = recFeedAll.filter((r) => r.reviewed_at).length;
  const newRecCount = recFeedAll.filter((r) => r.is_new && !r.reviewed_at).length;
  const newRefCount = refFeed.filter((r) => r.is_new).length;

  const markSeen = useMutation({
    mutationFn: (items: { itemKey: string; kind: "recommendation" | "referral" }[]) =>
      markSeenFn({ data: { portfolioId: id, items } }),
  });

  useEffect(() => {
    if (!data) return;
    const rows =
      activityTab === "recommendations"
        ? recFeedAll.map((r) => ({ key: r.item_key, kind: "recommendation" as const }))
        : activityTab === "referrals"
          ? refFeed.map((r) => ({ key: r.item_key, kind: "referral" as const }))
          : [];
    const pending = rows.filter((r) => r.key && !seenSent.current.has(r.key));
    if (!pending.length) return;
    for (const p of pending) seenSent.current.add(p.key);
    markSeen.mutate(pending.map((p) => ({ itemKey: p.key, kind: p.kind })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activityTab]);

  const setReviewed = useMutation({
    mutationFn: (v: { itemKey: string; reviewed: boolean }) =>
      reviewFn({ data: { portfolioId: id, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(v.reviewed ? t("biz.apd.marked_reviewed") : t("biz.apd.restored"));
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
    },
    onError: (e: any) => toast.error(e.message),
  });


  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.clients.filter((c: any) => {
      if (statusParam === "activated" && !c.linked) return false;
      if (band !== "all" && c.band !== band) return false;
      if (!q) return true;
      return (
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.address ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.zip ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, band, search, statusParam]);


  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Surface the single most actionable homeowner at the top of the view.
  const priority = useMemo(() => {
    if (!data) return null;
    const topHigh = (data.high_intent_feed ?? [])[0];
    if (topHigh) {
      return {
        kind: "high_intent" as const,
        client: data.clients?.find((c: any) => c.id === topHigh.client_id),
        title: t("biz.apd.pri_high_intent", {
          name: topHigh.client_name ?? t("biz.apd.pri_anon"),
        }),
        subtitle: topHigh.reason,
        next: (data.high_intent_feed ?? []).slice(1, 4).map((h: any) => ({
          client: data.clients?.find((c: any) => c.id === h.client_id),
          label: t("biz.apd.pri_next", {
            name: h.client_name ?? t("biz.apd.pri_household"),
            reason: h.reason,
          }),
        })),
      };
    }
    const topListing = data.top_listing_opportunities?.[0];
    if (topListing) {
      return {
        kind: "listing" as const,
        client: topListing,
        title: t("biz.apd.pri_listing", { name: topListing.name }),
        subtitle: t("biz.apd.pri_listing_sub", {
          score: topListing.readiness_score,
          amount: moneyCompact(topListing.net_proceeds),
        }),
        next: data.top_listing_opportunities.slice(1, 4).map((c: any) => ({
          client: c,
          label: t("biz.apd.pri_next_readiness", { name: c.name, score: c.readiness_score }),
        })),
      };
    }
    const missing = data.clients?.filter((c: any) => !c.has_intel);
    if (missing?.length > 0) {
      return {
        kind: "enrich" as const,
        client: null,
        title: t(missing.length === 1 ? "biz.apd.pri_enrich_one" : "biz.apd.pri_enrich_many", {
          count: missing.length,
        }),
        subtitle: t("biz.apd.pri_enrich_sub"),
        next: [],
      };
    }
    return null;
  }, [data, t]);

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/agent"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              <ArrowLeft className="h-3 w-3" /> {t("biz.apd.all_lists")}
            </Link>
            <Link
              to="/agent/network"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              {t("biz.apd.lender_network")}
            </Link>
          </div>


          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : data ? (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {data.portfolio.orgName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                      {data.portfolio.name}
                    </h1>
                    <GuidedOnboarding
                      role="agent"
                      userId={userId}
                      signals={{
                        clientCount: (data as any)?.clients?.length ?? 0,
                        highIntentCount: highIntentFeed.length,
                        recommendationsDue: (data as any)?.summary?.recommendations_due ?? 0,
                      }}
                      onFocusChange={(f) => setActivityTab(f)}
                    />
                  </div>
                </div>
                <Link
                  to="/agent/network"
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {t("biz.apd.lender_network")}
                </Link>
              </div>

              {/* 1. What to do now */}
              {priority && (
                <PriorityCard
                  title={priority.title}
                  subtitle={priority.subtitle}
                  primaryAction={() => {
                    if (priority.client) {
                      setSelected(priority.client);
                      setBrief("");
                    } else if (priority.kind === "enrich") {
                      enrich.mutate();
                    }
                  }}
                  primaryActionLabel={
                    priority.kind === "enrich"
                      ? t("biz.apd.pull_property_records")
                      : t("biz.at.view_homeowner")
                  }
                  tone={priority.kind === "high_intent" ? "attention" : "opportunity"}
                  secondaryActions={priority.next?.map((n: any) => ({
                    label: n.label,
                    onClick: () => {
                      setSelected(n.client);
                      setBrief("");
                    },
                  }))}
                />
              )}

              {/* 2. Opportunities */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">
                      {t("biz.apd.opps_title", { pct: sellCost })}
                    </h2>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {t("biz.apd.cost_to_sell")}
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={20}
                      value={sellCost}
                      onChange={(e) => {
                        setSellCost(Number(e.target.value) || 8);
                        setPage(0);
                      }}
                      className="w-20 rounded-full border border-border bg-background px-3 py-1 text-right text-sm text-foreground"
                    />
                    %
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("biz.apd.opps_note")}
                </p>

                <div className="mt-4 space-y-3 md:hidden">
                  {data.top_listing_opportunities.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t("biz.apd.none_yet")}
                    </p>
                  ) : (
                    data.top_listing_opportunities.map((c: any) => (
                      <OpportunityCard
                        key={c.id}
                        pill={<BandPill band={c.band} score={c.move_score} />}
                        name={c.name}
                        subtitle={[c.city, c.state].filter(Boolean).join(", ")}
                        heroLabel={t("biz.apd.th_net_proceeds")}
                        heroValue={moneyCompact(c.net_proceeds)}
                        metrics={[
                          { label: t("biz.apd.th_est_value"), value: moneyCompact(c.estimated_value) },
                          {
                            label: t("biz.apd.th_readiness"),
                            value: c.readiness_label
                              ? t(READINESS_META[c.readiness_label]?.labelKey ?? "biz.apd.th_readiness")
                              : c.readiness_score,
                          },
                        ]}
                        extra={
                          <ReadinessBar score={c.readiness_score} label={c.readiness_label} />
                        }
                        signal={c.signals?.[0]?.label}
                        onAction={() => {
                          setSelected(c);
                          setBrief("");
                        }}
                      />
                    ))
                  )}
                </div>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_household")}</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_intent")}
                            <IntentInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_readiness")}
                            <ReadinessInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_est_value")}</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_net_proceeds")}
                            <NetProceedsInfo sellCostPct={sellCost} />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_top_signal")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_listing_opportunities.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            {t("biz.apd.none_yet_table")}
                          </td>
                        </tr>
                      ) : (
                        data.top_listing_opportunities.map((c: any) => (
                          <tr key={c.id} className="border-b border-border/60">
                            <td className="py-2.5 pr-3">
                              <button
                                onClick={() => {
                                  setSelected(c);
                                  setBrief("");
                                }}
                                className="text-left font-medium text-primary hover:underline"
                              >
                                {c.name}
                              </button>
                              <div className="text-xs text-muted-foreground">
                                {[c.city, c.state].filter(Boolean).join(", ")}
                              </div>
                            </td>
                            <td className="py-2.5 pr-3">
                              <BandPill band={c.band} score={c.move_score} />
                            </td>
                            <td className="py-2.5 pr-3">
                              <ReadinessBar score={c.readiness_score} label={c.readiness_label} />
                            </td>
                            <td className="py-2.5 pr-3">{moneyCompact(c.estimated_value)}</td>
                            <td className="py-2.5 pr-3 font-semibold text-growth">
                              {moneyCompact(c.net_proceeds)}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                              {c.signals[0]?.label ?? "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Agent widgets: readiness mix + referral visibility */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6">

                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    {t("biz.apd.mix_title")}
                    <ReadinessInfo />
                  </h3>
                  <div className="mt-4 space-y-3">
                    {(["list-ready", "prep-needed", "not-ready"] as const).map((k) => {
                      const n = data.summary.readiness[k] ?? 0;
                      const pct = data.summary.total ? (n / data.summary.total) * 100 : 0;
                      return (
                        <div key={k}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{t(READINESS_META[k].labelKey)}</span>
                            <span className="text-muted-foreground">{n}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-secondary">
                            <div
                              className={`h-2 rounded-full ${
                                k === "list-ready"
                                  ? "bg-growth"
                                  : k === "prep-needed"
                                    ? "bg-status-attention"
                                    : "bg-muted-foreground/40"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {t("biz.apd.mix_note")}
                  </p>

                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Wrench className="h-4 w-4 shrink-0 text-primary" />
                      <h3 className="truncate text-sm font-semibold">{t("biz.apd.act_title")}</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t("biz.apd.act_counts", {
                        open: data.summary.active_referrals,
                        due: data.summary.recommendations_due ?? 0,
                        touches: data.summary.touches_30d ?? 0,
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("biz.apd.act_note")}</p>
                  <Tabs
                    value={activityTab}
                    onValueChange={setActivityTab}
                    className="mt-4 min-w-0"
                  >
                    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:h-9 sm:w-auto sm:grid-cols-none">
                      <TabsTrigger value="high_intent" className="gap-1.5">
                        {t("biz.apd.tab_high_intent")}
                        {highIntentFeed.length > 0 && <NewPill count={highIntentFeed.length} />}
                      </TabsTrigger>
                      <TabsTrigger value="recommendations" className="gap-1.5">
                        <span className="truncate">{t("biz.apd.tab_recs")}</span>
                        {newRecCount > 0 && <NewPill count={newRecCount} />}
                      </TabsTrigger>
                      <TabsTrigger value="communicated">{t("biz.apd.tab_communicated")}</TabsTrigger>
                      <TabsTrigger value="referrals" className="gap-1.5">
                        {t("biz.apd.tab_referrals")}
                        {newRefCount > 0 && <NewPill count={newRefCount} />}
                      </TabsTrigger>
                    </TabsList>


                    <TabsContent value="high_intent" className="mt-4 space-y-2">
                      {highIntentFeed.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          {t("biz.apd.hi_empty")}
                        </p>
                      ) : (
                        highIntentFeed.map((h: any) => (
                          <button
                            key={h.client_id}
                            onClick={() =>
                              setSelected(
                                (data.clients ?? []).find((c: any) => c.id === h.client_id) ?? null,
                              )
                            }
                            className="flex w-full items-start justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-left transition hover:border-destructive"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-medium">
                                <Flame className="h-3.5 w-3.5 text-destructive" />
                                {h.client_name ?? h.address ?? t("biz.apd.client")}
                              </p>
                              <p className="text-xs text-muted-foreground">{h.reason}</p>
                              {h.detail && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {h.detail}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full border border-destructive/40 bg-background px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              {h.score} · {t("biz.apd.hi_high")}
                            </span>
                          </button>
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="recommendations" className="mt-4 space-y-2">
                      {reviewedCount > 0 && (
                        <button
                          onClick={() => setShowReviewed((v) => !v)}
                          className="text-[11px] font-medium text-primary"
                        >
                          {showReviewed
                            ? t("biz.apd.recs_hide")
                            : t("biz.apd.recs_show", { count: reviewedCount })}
                        </button>
                      )}
                      {recFeed.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          {t("biz.apd.recs_empty")}
                        </p>
                      ) : (
                        recFeed.map((r: any) => (
                          <div
                            key={r.id}
                            className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-2.5 ${
                              r.reviewed_at
                                ? "border-border bg-secondary/40 opacity-70"
                                : r.is_new
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-border bg-background"
                            }`}
                          >
                            <div>
                              <p className="flex items-center gap-1.5 text-sm font-medium capitalize">
                                {String(r.system).replace(/_/g, " ")}
                                {r.recommended_category ? ` · ${r.recommended_category}` : ""}
                                {r.is_new && !r.reviewed_at && <NewPill />}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.client_name}
                                {r.recommended_action ? ` — ${r.recommended_action}` : ""}
                              </p>
                              <button
                                onClick={() =>
                                  setReviewed.mutate({
                                    itemKey: r.item_key,
                                    reviewed: !r.reviewed_at,
                                  })
                                }
                                disabled={setReviewed.isPending}
                                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {r.reviewed_at ? t("biz.apd.undo_reviewed") : t("biz.apd.mark_reviewed")}
                              </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <SourceBadge source={r.source} />
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                                  r.urgency === "high"
                                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                                    : r.urgency === "medium"
                                      ? "border-status-attention/40 bg-status-attention/10 text-status-attention"
                                      : "border-border bg-secondary text-muted-foreground"
                                }`}
                              >
                                {r.urgency}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </TabsContent>

                    <TabsContent value="referrals" className="mt-4 space-y-2">
                      {refFeed.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          {t("biz.apd.ref_empty")}
                        </p>
                      ) : (
                        refFeed.map((r: any) => (
                          <div
                            key={r.id}
                            className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 ${
                              r.is_new ? "border-primary/40 bg-primary/5" : "border-border bg-background"
                            }`}
                          >
                            <div>
                              <p className="flex items-center gap-1.5 text-sm font-medium capitalize">
                                {String(r.category).replace(/_/g, " ")}
                                {r.is_new && <NewPill />}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {r.client_name}
                                {r.city ? ` · ${r.city}` : ""} ·{" "}
                                {new Date(r.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                              {String(r.status).replace(/_/g, " ")}
                            </span>
                          </div>
                        ))
                      )}
                    </TabsContent>


                    <TabsContent value="communicated" className="mt-4 space-y-2">
                      {(data.touch_feed ?? []).length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          {t("biz.apd.comm_empty")}
                        </p>
                      ) : (
                        data.touch_feed.map((t: any) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-2.5"
                          >
                            <div>
                              <p className="text-sm font-medium">{t.campaign_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t.client_name} · {t.channel} ·{" "}
                                {new Date(
                                  t.sent_at ?? t.scheduled_for ?? t.created_at,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                t.status === "sent"
                                  ? "bg-growth/15 text-growth"
                                  : t.status === "failed"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {String(t.status).replace(/_/g, " ")}
                            </span>
                          </div>
                        ))
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

              </div>

              {/* 3. Your book */}
              <CopilotSearch
                portfolioId={id}
                detailPath={(r) => ({
                  to: "/agent/portfolio/$id",
                  params: { id: r.portfolio_id },
                  search: { client: r.id },
                })}
              />

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-base font-semibold">{t("biz.apd.book_title")}</h2>
                  <div className="flex items-center gap-3">
                    <span
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                      title={t("biz.apd.valued_title")}
                    >
                      {t("biz.apd.valued", {
                        count: data.summary.with_value ?? 0,
                        total: data.summary.total,
                      })}
                      {data.summary.unmappable
                        ? t("biz.apd.no_address", { count: data.summary.unmappable })
                        : ""}
                    </span>
                    <button
                      onClick={() => enrich.mutate()}
                      disabled={enrich.isPending}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary disabled:opacity-50"
                    >
                      {enrich.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-growth" />
                      )}
                      {t("biz.apd.pull_records")}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <SummaryTile label={t("biz.apd.st_households")} value={data.summary.total.toLocaleString()} />
                  <SummaryTile label={t("biz.apd.st_list_ready")} value={String(data.summary.readiness["list-ready"])} />
                  <SummaryTile label={t("biz.apd.st_hot")} value={String(data.summary.bands.hot)} />
                  <SummaryTile label={t("biz.apd.st_equity")} value={moneyCompact(data.summary.total_equity)} />
                  <SummaryTile label={t("biz.apd.st_gci")} value={moneyCompact(data.summary.total_gci_potential)} />
                </div>

                <AgentCoveragePanel portfolioId={id} />

                <div className="flex flex-wrap gap-2">
                  <SegChip
                    label={t("biz.apd.all_chip", { count: data.summary.total })}
                    active={band === "all"}
                    tone="bg-foreground text-background border-foreground"
                    onClick={() => {
                      setBand("all");
                      setPage(0);
                    }}
                  />
                  {(["high", "hot", "warm", "nurture", "hold"] as const).map((b) => (
                    <SegChip
                      key={b}
                      label={`${t(BAND_META[b].labelKey)} ${data.summary.bands[b] ?? 0}`}
                      active={band === b}
                      tone={BAND_META[b].tone}
                      onClick={() => {
                        setBand(b);
                        setPage(0);
                      }}
                    />
                  ))}
                  <span className="flex w-full items-center gap-3 text-xs text-muted-foreground sm:ml-auto sm:w-auto">
                    <span className="inline-flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-growth" />
                      {t("biz.apd.expired", { count: data.summary.expired })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      {t("biz.apd.linked", { count: data.summary.linked })}
                    </span>
                  </span>
                </div>
              </section>


              {/* Client table */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    {t("biz.apd.households_count", { count: filtered.length.toLocaleString() })}
                  </h2>
                  <div className="relative w-full sm:w-auto">
                    <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      placeholder={t("biz.apd.search_ph")}
                      className="w-full rounded-full border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary sm:w-64"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3 md:hidden">
                  {pageRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t("biz.apd.no_match")}
                    </p>
                  ) : (
                    pageRows.map((c: any) => (
                      <PersonCard
                        key={c.id}
                        name={c.name ?? "—"}
                        subtitle={[c.address, c.city].filter(Boolean).join(", ")}
                        pills={
                          <>
                            <BandPill band={c.band} score={c.move_score} />
                            <StatusPill tone="muted">
                              {c.listing
                                ? t(`biz.apd.ls.${c.listing.status}` as TranslationKey)
                                : t("biz.apd.off_market")}
                            </StatusPill>
                          </>
                        }
                        metrics={[
                          { label: t("biz.apd.th_est_value"), value: moneyCompact(c.estimated_value) },
                          {
                            label: t("biz.apd.th_intent"),
                            value: c.move_score
                              ? `${c.move_score} · ${BAND_META[c.band] ? t(BAND_META[c.band].labelKey) : c.band}`
                              : "—",
                          },
                        ]}
                        extra={<ReadinessBar score={c.readiness_score} label={c.readiness_label} />}
                        onAction={() => {
                          setSelected(c);
                          setBrief("");
                        }}
                      />
                    ))
                  )}
                </div>

                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_household")}</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_intent")}
                            <IntentInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_readiness")}
                            <ReadinessInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_value")}</th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_equity")}</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            {t("biz.apd.th_net_proceeds")}
                            <NetProceedsInfo sellCostPct={sellCost} />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_tenure")}</th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_listing")}</th>
                        <th className="py-2 pr-3 font-medium">{t("biz.apd.th_referrals")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((c: any) => (
                        <tr
                          key={c.id}
                          onClick={() => {
                            setSelected(c);
                            setBrief("");
                          }}
                          className="cursor-pointer border-b border-border/60 hover:bg-secondary/40"
                        >
                          <td className="py-2.5 pr-3">
                            <p className="font-medium text-primary">{c.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">
                              {[c.address, c.city].filter(Boolean).join(", ")}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <BandPill band={c.band} score={c.move_score} />
                          </td>
                          <td className="py-2.5 pr-3">
                            <ReadinessBar score={c.readiness_score} label={c.readiness_label} />
                          </td>
                          <td className="py-2.5 pr-3">{moneyCompact(c.estimated_value)}</td>
                          <td className="py-2.5 pr-3">{moneyCompact(c.equity_dollars)}</td>
                          <td
                            className={`py-2.5 pr-3 font-semibold ${
                              c.net_proceeds == null
                                ? "text-muted-foreground"
                                : c.net_proceeds > 0
                                  ? "text-growth"
                                  : "text-destructive"
                            }`}
                          >
                            {moneyCompact(c.net_proceeds)}
                          </td>
                          <td className="py-2.5 pr-3">
                            {c.tenure_years ? t("biz.apd.yr", { count: c.tenure_years.toFixed(1) }) : "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs capitalize text-muted-foreground">
                            {c.listing
                              ? t(`biz.apd.ls.${c.listing.status}` as TranslationKey)
                              : t("biz.apd.off_market")}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {c.referral_count || "—"}
                          </td>
                        </tr>
                      ))}
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-muted-foreground">
                            {t("biz.apd.no_match")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filtered.length > PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t("biz.lpd.showing", {
                        from: page * PAGE_SIZE + 1,
                        to: Math.min((page + 1) * PAGE_SIZE, filtered.length),
                        total: filtered.length,
                      })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span className="px-2">
                        {t("biz.lpd.page", { page: page + 1, pages: pageCount })}
                      </span>
                      <button
                        disabled={page >= pageCount - 1}
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border disabled:opacity-40"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </main>

      {selected && (
        <ClientDrawer
          client={selected}
          sellCostPct={sellCost}
          brief={brief}
          briefLoading={makeBrief.isPending}
          onBrief={() => makeBrief.mutate(selected.id)}
          onClose={() => setSelected(null)}
          onSaveListing={(v: any) => saveListing.mutate({ clientId: selected.id, ...v })}
          saving={saveListing.isPending}
        />
      )}
    </BusinessShell>

  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SegChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? tone : "border-border bg-background text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {label}
    </button>
  );
}

function BandPill({ band, score }: { band: string; score: number }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${BAND_META[band]?.tone}`}
    >
      {(band === "hot" || band === "high") && <Flame className="h-3 w-3" />}
      {score} · {BAND_META[band] ? t(BAND_META[band].labelKey) : band}
    </span>
  );
}

function ReadinessBar({ score, label }: { score: number; label: string }) {
  const t = useT();
  return (
    <div className="w-28">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`rounded-full px-1.5 py-0.5 font-medium ${READINESS_META[label]?.tone}`}>
          {READINESS_META[label] ? t(READINESS_META[label].labelKey) : label}
        </span>
        <span className="text-muted-foreground">{score}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-secondary">
        <div
          className={`h-1.5 rounded-full ${
            label === "list-ready"
              ? "bg-growth"
              : label === "prep-needed"
                ? "bg-status-attention"
                : "bg-muted-foreground/40"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function ClientDrawer({
  client,
  sellCostPct,
  brief,
  briefLoading,
  onBrief,
  onClose,
  onSaveListing,
  saving,
}: {
  client: any;
  sellCostPct: number;
  brief: string;
  briefLoading: boolean;
  onBrief: () => void;
  onClose: () => void;
  onSaveListing: (v: any) => void;
  saving: boolean;
}) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<string>(client.listing?.status ?? "off_market");
  const [otherAgent, setOtherAgent] = useState<boolean>(
    client.listing?.listed_with_other_agent ?? false,
  );
  const [agentName, setAgentName] = useState<string>(client.listing?.listing_agent_name ?? "");

  const opportunityHeadline =
    client.band === "high" || client.band === "hot"
      ? "Worth a conversation"
      : client.readiness_label === "list-ready"
        ? "Strong listing position"
        : client.readiness_label === "prep-needed"
          ? "Prep likely needed"
          : "Future-plans opportunity";
  const opportunityDetail =
    client.signals?.[0]?.detail ??
    client.readiness_checks?.find((check: any) => !check.ok)?.detail ??
    "Review the supported property facts and relationship status before reaching out.";
  const whyNow = (client.signals ?? []).slice(0, 5);
  const prepRows = (client.recommendations ?? []).slice(0, 4);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-foreground/40",
        isMobile ? "items-end justify-center" : "justify-end",
      )}
      onClick={onClose}
    >
      <aside
        className={cn(
          "professional-detail w-full overflow-y-auto bg-background shadow-soft",
          isMobile
            ? "max-h-[94vh] rounded-t-3xl sm:max-w-2xl"
            : "h-full max-w-xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden bg-sucasa-navy px-5 pb-5 pt-6 text-primary-foreground sm:px-7">
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"><X /></Button>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 pr-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/65">Agent home review</p>
              <h2 className="mt-2 truncate text-2xl font-semibold leading-tight">{client.name ?? "Household"}</h2>
              <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-primary-foreground/75"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0">{[client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")}</span></p>
            </div>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-foreground/10"><Home className="h-5 w-5" /></span>
          </div>
          <div className="mt-4 grid grid-cols-4 divide-x divide-primary-foreground/15 border-t border-primary-foreground/15 pt-3">
            <HeroMetric label="Est. value" value={moneyCompact(client.estimated_value)} />
            <HeroMetric label="Net proceeds" value={moneyCompact(client.net_proceeds)} info={<NetProceedsInfo sellCostPct={sellCostPct} />} />
            <HeroMetric label="Tenure" value={client.tenure_years ? `${client.tenure_years.toFixed(1)} yr` : "—"} />
            <HeroMetric label="Readiness" value={`${client.readiness_score ?? "—"}`} />
          </div>
        </div>

        <div className="space-y-7 px-5 py-6 sm:px-7">
          <section className="border-l-4 border-sucasa-orange pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-opportunity">Opportunity summary</p>
            <h3 className="mt-1 text-xl font-semibold text-sucasa-navy">{opportunityHeadline}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{opportunityDetail}</p>
          </section>

          <DetailSection title="Why now">
            {whyNow.length ? whyNow.map((s: any, i: number) => (
              <SignalRow key={`${s.label}-${i}`} icon={i === 0 ? <Sparkles /> : <CheckCircle2 />} title={s.label} detail={s.detail} tone={i === 0 ? "opportunity" : "positive"} />
            )) : <p className="text-sm text-text-secondary">{client.has_intel ? "No movement signals yet." : "No property records pulled for this address yet."}</p>}
          </DetailSection>

          <section className="rounded-lg bg-surface-warm p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-attention">Agent intelligence</p><h3 className="mt-1 text-lg font-semibold text-sucasa-navy">Home Prep &amp; Listing Readiness</h3></div>
              <Hammer className="h-5 w-5 text-sucasa-orange" />
            </div>
            <div className="mt-3 divide-y divide-surface-warm-border">
              {(prepRows.length ? prepRows : (client.readiness_checks ?? []).filter((c: any) => !c.ok).slice(0, 4)).map((r: any, i: number) => (
                <div key={r.id ?? r.key ?? i} className="flex items-start justify-between gap-4 py-3">
                  <div><p className="text-sm font-semibold capitalize text-sucasa-navy">{String(r.system ?? r.label ?? "Property review").replace(/_/g, " ")}</p><p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{r.recommended_action ?? r.detail}</p></div>
                  <span className="shrink-0 text-xs font-semibold text-status-attention">{r.urgency === "medium" ? "Review due" : r.urgency === "high" ? "Worth checking" : "Prep likely"}</span>
                </div>
              ))}
              {!prepRows.length && !(client.readiness_checks ?? []).some((c: any) => !c.ok) && <p className="py-3 text-sm text-text-secondary">No preparation items are currently supported by the information on file.</p>}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Property Records and homeowner-provided records</p>
          </section>

        <div className="rounded-lg border-l-4 border-intelligence-accent bg-surface-intelligence p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Suggested opener
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-sucasa-navy">{client.opener}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(client.opener);
              toast.success("Copied");
            }}
            className="mt-2 px-0 text-primary hover:bg-transparent"
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>

        <Button
          onClick={onBrief}
          disabled={briefLoading}
          className="h-12 w-full rounded-lg bg-action-primary text-action-primary-foreground"
        >
          {briefLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate listing brief
        </Button>
        {brief && (
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-border bg-card p-3 text-sm">
            {brief}
          </pre>
        )}

        <div className="grid grid-cols-2 gap-2">
          {client.phone && (
            <a
              href={`tel:${String(client.phone).replace(/[^0-9+]/g, "")}`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary"
            >
              <Phone className="h-4 w-4 text-primary" /> Call
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary"
            >
              <Mail className="h-4 w-4 text-primary" /> Email
            </a>
          )}
        </div>

        <DetailSection title="Property details">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <DetailFact label="Equity" value={money(client.equity_dollars)} />
            <DetailFact label="Beds / baths" value={client.beds ? `${client.beds} / ${client.baths ?? "—"}` : "—"} />
            <DetailFact label="Square feet" value={client.sqft ? client.sqft.toLocaleString() : "—"} />
            <DetailFact label="Year built" value={client.year_built ?? "—"} />
            <DetailFact label="Permitted work" value={money(client.permit_total_value)} info={<PermitsInfo />} />
            <DetailFact label="Last permit" value={client.last_permit_date ? new Date(client.last_permit_date).toLocaleDateString() : "—"} />
          </div>
        </DetailSection>

        {(client.referrals?.length > 0 || client.touches?.length > 0) && (
          <DetailSection title="Supporting activity">
            {client.referrals?.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium capitalize text-sucasa-navy">{String(r.category).replace(/_/g, " ")}</span>
                <span className="text-xs capitalize text-text-secondary">{String(r.status).replace(/_/g, " ")}</span>
              </div>
            ))}
            {client.touches?.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium text-sucasa-navy">{t.campaign_name}</span>
                <span className="text-xs text-text-secondary">{new Date(t.sent_at ?? t.scheduled_for ?? t.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </DetailSection>
        )}

        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Listing status
        </h3>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={otherAgent}
            onChange={(e) => setOtherAgent(e.target.checked)}
          />
          Listed with another agent
        </label>
        {otherAgent && (
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Listing agent name"
            className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
        )}
        <Button
          onClick={() =>
            onSaveListing({
              status,
              listedWithOtherAgent: otherAgent,
              listingAgentName: agentName || null,
            })
          }
          disabled={saving}
          variant="outline"
          className="mt-3 w-full rounded-lg"
        >
          {saving ? "Saving…" : "Save listing status"}
        </Button>
        </div>
      </aside>
    </div>
  );
}

function HeroMetric({ label, value, info }: { label: string; value: string; info?: ReactNode }) {
  return <div className="min-w-0 px-2 first:pl-0 last:pr-0"><p className="flex items-center gap-1 text-[9px] leading-tight text-primary-foreground/60">{label}{info}</p><p className="mt-1 truncate text-sm font-semibold text-primary-foreground">{value}</p></div>;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3><div className="mt-3 divide-y divide-border">{children}</div></section>;
}

function SignalRow({ icon, title, detail, tone }: { icon: ReactNode; title: string; detail: string; tone: "opportunity" | "positive" }) {
  return <div className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&_svg]:h-4 [&_svg]:w-4", tone === "opportunity" ? "bg-sucasa-orange/10 text-status-opportunity" : "bg-status-positive/10 text-status-positive")}>{icon}</span><div><p className="text-sm font-semibold text-sucasa-navy">{title}</p><p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{detail}</p></div></div>;
}

function DetailFact({
  label,
  value,
  info,
  tone,
}: {
  label: string;
  value: any;
  info?: ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <p className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
        {info}
      </p>
      <p className={`mt-0.5 text-sm font-semibold text-sucasa-navy ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
