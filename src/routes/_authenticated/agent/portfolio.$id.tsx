import { useMemo, useState, useRef, useEffect, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BusinessShell } from "@/components/business-shell";
import { AgentCoveragePanel } from "@/components/agent-coverage-panel";
import { GuidedOnboarding } from "@/components/guided-onboarding";
import { useUserId } from "@/hooks/use-user-id";
import { useIsMobile } from "@/hooks/use-mobile";
import { readOnboarding } from "@/lib/onboarding";

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
} from "lucide-react";


const SOURCE_LABEL: Record<string, string> = {
  inspection: "Inspection",
  property_records: "Property records",
  recent_permit: "Permit",
};

function NewPill({ count }: { count?: number }) {
  return (
    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-foreground">
      {count ? `${count} new` : "New"}
    </span>
  );
}

function SourceBadge({ source }: { source?: string }) {

  const label = SOURCE_LABEL[source ?? "inspection"] ?? "Inspection";
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

const BAND_META: Record<string, { label: string; tone: string }> = {
  high: { label: "High intent", tone: "bg-destructive/10 text-destructive border-destructive/40" },
  hot: { label: "Hot", tone: "bg-growth/15 text-growth border-growth/40" },
  warm: { label: "Warm", tone: "bg-amber-500/10 text-amber-700 border-amber-500/40" },
  nurture: { label: "Nurture", tone: "bg-primary/10 text-primary border-primary/40" },
  hold: { label: "Hold", tone: "bg-secondary text-muted-foreground border-border" },
};

const READINESS_META: Record<string, { label: string; tone: string }> = {
  "list-ready": { label: "List-ready", tone: "bg-growth/15 text-growth" },
  "prep-needed": { label: "Prep needed", tone: "bg-amber-500/10 text-amber-700" },
  "not-ready": { label: "Not ready", tone: "bg-secondary text-muted-foreground" },
};

/** Tap-to-open explainer for the three listing-readiness bands. */
function ReadinessInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What does readiness mean?"
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
          Listing readiness
        </p>
        <p className="mt-1 text-muted-foreground">
          A 0–100 score from six pass/fail checks: equity clears selling costs,
          property records on file, home care record (documents and maintenance
          logged), past the 2-year capital-gains basis window, not represented
          elsewhere, and reachable.
        </p>

        <ul className="mt-3 space-y-1.5">
          {(["list-ready", "prep-needed", "not-ready"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  k === "list-ready"
                    ? "bg-growth"
                    : k === "prep-needed"
                      ? "bg-amber-500"
                      : "bg-muted-foreground/40"
                }`}
              />
              <span>
                <span className="font-medium">{READINESS_META[k].label}</span>
                <span className="block text-muted-foreground">
                  {k === "list-ready"
                    ? "Score 84+. All checks pass — could take the listing today."
                    : k === "prep-needed"
                      ? "Score 50–83. Real potential, but a few prep steps remain before it's listable."
                      : "Score < 50. Too many blockers — keep in value-only nurture."}
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What does intent mean?"
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
          Move intent
        </p>
        <p className="mt-1 text-muted-foreground">
          A 0–100 score with two halves. Property records: time in the home,
          equity, recent permits, tax pressure, absentee ownership, outgrown
          space, expired or withdrawn listings. Behavior: repeat home-value and
          equity checks, "thinking of selling" submissions, and clustered
          dashboard activity in the last few weeks.
        </p>
        <p className="mt-2 text-muted-foreground">
          High intent always requires real recent behavior — property signals
          alone can reach Hot, never High.
        </p>
        <ul className="mt-3 space-y-1.5">
          {(["high", "hot", "warm", "nurture", "hold"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <span
                className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  k === "high"
                    ? "bg-destructive"
                    : k === "hot"
                    ? "bg-growth"
                    : k === "warm"
                      ? "bg-amber-500"
                      : k === "nurture"
                        ? "bg-primary"
                        : "bg-muted-foreground/40"
                }`}
              />
              <span>
                <span className="font-medium">{BAND_META[k].label}</span>
                <span className="block text-muted-foreground">
                  {k === "high"
                    ? "Score 75+ with recent homeowner activity. Actively looking — call today."
                    : k === "hot"
                    ? "Score 60+. Clear, time-sensitive move signal — call today."
                    : k === "warm"
                      ? "Score 38–59. Several solid signals. Worth a real conversation."
                      : k === "nurture"
                        ? "Score 18–37. Mild signals. Stay in touch with value content."
                        : "Score under 18. Little movement signal, or represented elsewhere."}
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
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How are net proceeds calculated?"
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
          Projected net proceeds
        </p>
        <p className="mt-1 text-muted-foreground">
          What the homeowner would likely walk away with at closing, after
          agent compensation and closing costs.
        </p>
        <div className="mt-3 rounded-lg bg-secondary/60 p-2 font-mono text-[11px] leading-relaxed">
          Est. value
          <br />− {sellCostPct}% cost to sell
          <br />− mortgage balance
          <br />
          <span className="font-semibold">= net proceeds</span>
        </div>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Cost to sell</span> covers
            agent compensation on both sides, title and escrow, transfer taxes, and
            typical seller concessions. Adjust the {sellCostPct}% assumption at the
            top of the page.
          </li>
          <li>
            <span className="font-medium text-foreground">Est. value</span> and the
            mortgage balance are modeled from property records — not an appraisal or
            a payoff statement.
          </li>
          <li>A negative figure means the sale would not clear costs and payoff.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const STATUSES = ["off_market", "active", "pending", "sold", "expired", "withdrawn"] as const;
const PAGE_SIZE = 25;

function AgentPortfolio() {
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
    onMutate: () => ({ toastId: toast.loading("Pulling property records…") }),
    onSuccess: (r: any, _v, ctx) => {
      const extra = r.unmappable
        ? ` · ${r.unmappable} skipped (no street address on file)`
        : "";
      const left = r.remaining ? ` · ${r.remaining} still pending` : "";
      toast.success(`Records pulled for ${r.enriched} homes${extra}${left}`, { id: ctx?.toastId });
      qc.invalidateQueries({ queryKey: ["agent-portfolio", id] });
    },
    onError: (e: any, _v, ctx) => toast.error(e.message, { id: ctx?.toastId }),
  });

  // Records fill in continuously via the background engine; the coverage panel
  // shows live progress. Nothing is pulled on page load.



  const saveListing = useMutation({
    mutationFn: (v: any) => listingFn({ data: v }),
    onSuccess: () => {
      toast.success("Listing status saved");
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
      toast.success(v.reviewed ? "Marked reviewed" : "Restored");
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
        title: `${topHigh.client_name ?? "A homeowner"} is showing high intent`,
        subtitle: topHigh.reason,
        next: (data.high_intent_feed ?? []).slice(1, 4).map((h: any) => ({
          client: data.clients?.find((c: any) => c.id === h.client_id),
          label: `${h.client_name ?? "Household"} — ${h.reason}`,
        })),
      };
    }
    const topListing = data.top_listing_opportunities?.[0];
    if (topListing) {
      return {
        kind: "listing" as const,
        client: topListing,
        title: `${topListing.name} could be list-ready`,
        subtitle: `Readiness ${topListing.readiness_score} · Net proceeds ${moneyCompact(topListing.net_proceeds)}`,
        next: data.top_listing_opportunities.slice(1, 4).map((c: any) => ({
          client: c,
          label: `${c.name} — readiness ${c.readiness_score}`,
        })),
      };
    }
    const missing = data.clients?.filter((c: any) => !c.has_intel);
    if (missing?.length > 0) {
      return {
        kind: "enrich" as const,
        client: null,
        title: `${missing.length} household${missing.length === 1 ? "" : "s"} need property records`,
        subtitle: "Value, equity and readiness scores unlock after records are pulled.",
        next: [],
      };
    }
    return null;
  }, [data]);

  return (
    <BusinessShell kind="agent" bookId={id}>
      <main className="px-4 py-6 sm:px-5 sm:py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/agent"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              <ArrowLeft className="h-3 w-3" /> All client lists
            </Link>
            <Link
              to="/agent/network"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Lender network &amp; approvals
            </Link>
          </div>


          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
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
                  Lender network &amp; approvals
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
                    priority.kind === "enrich" ? "Pull property records" : "View homeowner"
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
                      Top listing opportunities @ {sellCost}% cost to sell
                    </h2>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Cost to sell
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
                  Ranked on move intent × listing readiness. Modeled, not an appraisal.
                </p>

                <div className="mt-4 space-y-3 md:hidden">
                  {data.top_listing_opportunities.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No scored opportunities yet.
                    </p>
                  ) : (
                    data.top_listing_opportunities.map((c: any) => (
                      <OpportunityCard
                        key={c.id}
                        pill={<BandPill band={c.band} score={c.move_score} />}
                        name={c.name}
                        subtitle={[c.city, c.state].filter(Boolean).join(", ")}
                        heroLabel="Net proceeds"
                        heroValue={moneyCompact(c.net_proceeds)}
                        metrics={[
                          { label: "Est. value", value: moneyCompact(c.estimated_value) },
                          { label: "Readiness", value: c.readiness_label ?? c.readiness_score },
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
                        <th className="py-2 pr-3 font-medium">Household</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Intent
                            <IntentInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Readiness
                            <ReadinessInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">Est. value</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Net proceeds
                            <NetProceedsInfo sellCostPct={sellCost} />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">Top signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_listing_opportunities.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            No scored opportunities yet — pull property records to begin.
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
                    Listing readiness mix
                    <ReadinessInfo />
                  </h3>
                  <div className="mt-4 space-y-3">
                    {(["list-ready", "prep-needed", "not-ready"] as const).map((k) => {
                      const n = data.summary.readiness[k] ?? 0;
                      const pct = data.summary.total ? (n / data.summary.total) * 100 : 0;
                      return (
                        <div key={k}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{READINESS_META[k].label}</span>
                            <span className="text-muted-foreground">{n}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-secondary">
                            <div
                              className={`h-2 rounded-full ${
                                k === "list-ready"
                                  ? "bg-growth"
                                  : k === "prep-needed"
                                    ? "bg-amber-500"
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
                    Readiness scores equity vs. selling costs, records on file, the home care
                    record, the 2-year basis window, representation, and reachability.
                  </p>

                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-soft sm:p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Wrench className="h-4 w-4 shrink-0 text-primary" />
                      <h3 className="truncate text-sm font-semibold">Client activity</h3>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {data.summary.active_referrals} open ·{" "}
                      {data.summary.recommendations_due ?? 0} due ·{" "}
                      {data.summary.touches_30d ?? 0} touches / 30d
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    What your clients are doing, what their home needs next, and what has already
                    gone out to them.
                  </p>
                  <Tabs
                    value={activityTab}
                    onValueChange={setActivityTab}
                    className="mt-4 min-w-0"
                  >
                    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:h-9 sm:w-auto sm:grid-cols-none">
                      <TabsTrigger value="high_intent" className="gap-1.5">
                        High intent
                        {highIntentFeed.length > 0 && <NewPill count={highIntentFeed.length} />}
                      </TabsTrigger>
                      <TabsTrigger value="recommendations" className="gap-1.5">
                        <span className="truncate">Recommendations</span>
                        {newRecCount > 0 && <NewPill count={newRecCount} />}
                      </TabsTrigger>
                      <TabsTrigger value="communicated">Communicated</TabsTrigger>
                      <TabsTrigger value="referrals" className="gap-1.5">
                        Referrals
                        {newRefCount > 0 && <NewPill count={newRefCount} />}
                      </TabsTrigger>
                    </TabsList>


                    <TabsContent value="high_intent" className="mt-4 space-y-2">
                      {highIntentFeed.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          No high-intent sellers right now. This fills in when a linked client
                          repeatedly checks their home value or equity, or asks about selling.
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
                                {h.client_name ?? h.address ?? "Client"}
                              </p>
                              <p className="text-xs text-muted-foreground">{h.reason}</p>
                              {h.detail && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {h.detail}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 rounded-full border border-destructive/40 bg-background px-2 py-0.5 text-[10px] font-semibold text-destructive">
                              {h.score} · High
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
                            ? "Hide reviewed"
                            : `Show ${reviewedCount} reviewed`}
                        </button>
                      )}
                      {recFeed.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                          Nothing outstanding. Recommendations come from property records
                          (home age + permits) and from inspection reports once a linked client
                          uploads one.
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
                                {r.reviewed_at ? "Undo reviewed" : "Mark reviewed"}
                              </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <SourceBadge source={r.source} />
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                                  r.urgency === "high"
                                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                                    : r.urgency === "medium"
                                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
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
                          No service activity yet. Invite clients to SuCasa to see their projects
                          here.
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
                          No campaign messages have gone out to this book yet.
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

              {/* Client table */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    Households ({filtered.length.toLocaleString()})
                  </h2>
                  <div className="relative w-full sm:w-auto">
                    <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Name, address, city, zip"
                      className="w-full rounded-full border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary sm:w-64"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-3 md:hidden">
                  {pageRows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No households match this filter.
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
                                ? String(c.listing.status).replace("_", " ")
                                : "off market"}
                            </StatusPill>
                          </>
                        }
                        metrics={[
                          { label: "Value", value: moneyCompact(c.estimated_value) },
                          { label: "Equity", value: moneyCompact(c.equity_dollars) },
                          { label: "Net proceeds", value: moneyCompact(c.net_proceeds) },
                          {
                            label: "Tenure",
                            value: c.tenure_years ? `${c.tenure_years.toFixed(1)} yr` : "—",
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
                        <th className="py-2 pr-3 font-medium">Household</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Intent
                            <IntentInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Readiness
                            <ReadinessInfo />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">Value</th>
                        <th className="py-2 pr-3 font-medium">Equity</th>
                        <th className="py-2 pr-3 font-medium">
                          <span className="inline-flex items-center gap-1">
                            Net proceeds
                            <NetProceedsInfo sellCostPct={sellCost} />
                          </span>
                        </th>
                        <th className="py-2 pr-3 font-medium">Tenure</th>
                        <th className="py-2 pr-3 font-medium">Listing</th>
                        <th className="py-2 pr-3 font-medium">Referrals</th>
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
                            {c.tenure_years ? `${c.tenure_years.toFixed(1)} yr` : "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs capitalize text-muted-foreground">
                            {c.listing ? String(c.listing.status).replace("_", " ") : "off market"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                            {c.referral_count || "—"}
                          </td>
                        </tr>
                      ))}
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-muted-foreground">
                            No households match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filtered.length > PAGE_SIZE && (
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing {page * PAGE_SIZE + 1}–
                      {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
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
                        Page {page + 1} / {pageCount}
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
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${BAND_META[band]?.tone}`}
    >
      {(band === "hot" || band === "high") && <Flame className="h-3 w-3" />}
      {score} · {BAND_META[band]?.label}
    </span>
  );
}

function ReadinessBar({ score, label }: { score: number; label: string }) {
  return (
    <div className="w-28">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`rounded-full px-1.5 py-0.5 font-medium ${READINESS_META[label]?.tone}`}>
          {READINESS_META[label]?.label}
        </span>
        <span className="text-muted-foreground">{score}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-secondary">
        <div
          className={`h-1.5 rounded-full ${
            label === "list-ready"
              ? "bg-growth"
              : label === "prep-needed"
                ? "bg-amber-500"
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
  const [status, setStatus] = useState<string>(client.listing?.status ?? "off_market");
  const [otherAgent, setOtherAgent] = useState<boolean>(
    client.listing?.listed_with_other_agent ?? false,
  );
  const [agentName, setAgentName] = useState<string>(client.listing?.listing_agent_name ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-background p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{client.name ?? "Household"}</h2>
            <p className="text-xs text-muted-foreground">
              {[client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BandPill band={client.band} score={client.move_score} />
          <IntentInfo />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              READINESS_META[client.readiness_label]?.tone
            }`}
          >
            {READINESS_META[client.readiness_label]?.label} · {client.readiness_score}
          </span>
          <ReadinessInfo />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Field label="Est. value" value={money(client.estimated_value)} />
          <Field
            label="Net proceeds"
            value={money(client.net_proceeds)}
            info={<NetProceedsInfo sellCostPct={sellCostPct} />}
            tone={
              client.net_proceeds == null
                ? undefined
                : client.net_proceeds > 0
                  ? "text-growth"
                  : "text-destructive"
            }
          />
          <Field label="Equity" value={money(client.equity_dollars)} />
          <Field
            label="Tenure"
            value={client.tenure_years ? `${client.tenure_years.toFixed(1)} yr` : "—"}
          />
          <Field
            label="Beds / baths"
            value={client.beds ? `${client.beds} / ${client.baths ?? "—"}` : "—"}
          />
          <Field label="Sqft" value={client.sqft ? client.sqft.toLocaleString() : "—"} />
          <Field label="Year built" value={client.year_built ?? "—"} />
          <Field label="Permits" value={money(client.permit_total_value)} />
        </div>

        <h3 className="mt-6 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Listing readiness
          <ReadinessInfo />
        </h3>
        <ul className="mt-2 space-y-1.5">
          {client.readiness_checks?.map((c: any) => (
            <li key={c.key} className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-growth" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="block text-muted-foreground">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Move signals
        </h3>
        <ul className="mt-2 space-y-2">
          {client.signals.length === 0 && (
            <li className="text-xs text-muted-foreground">
              {client.has_intel
                ? "No movement signals yet."
                : "No property records pulled for this address yet."}
            </li>
          )}
          {client.signals.map((s: any, i: number) => (
            <li key={i} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ul>

        {client.referrals?.length > 0 && (
          <>
            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Service activity
            </h3>
            <ul className="mt-2 space-y-1.5">
              {client.referrals.map((r: any) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2 text-xs"
                >
                  <span className="font-medium capitalize">
                    {String(r.category).replace(/_/g, " ")}
                  </span>
                  <span className="capitalize text-muted-foreground">
                    {String(r.status).replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {client.recommendations?.length > 0 && (
          <>
            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recommendations due
            </h3>
            <ul className="mt-2 space-y-1.5">
              {client.recommendations.map((r: any) => (
                <li key={r.id} className="rounded-2xl border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium capitalize">
                      {String(r.system).replace(/_/g, " ")}
                      {r.recommended_category ? ` · ${r.recommended_category}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <SourceBadge source={r.source} />
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                          r.urgency === "high"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : r.urgency === "medium"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                              : "border-border bg-secondary text-muted-foreground"
                        }`}
                      >
                        {r.urgency}
                      </span>
                    </span>
                  </div>
                  {r.recommended_action && (
                    <p className="mt-1 text-xs text-muted-foreground">{r.recommended_action}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {client.touches?.length > 0 && (
          <>
            <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Communicated
            </h3>
            <ul className="mt-2 space-y-1.5">
              {client.touches.map((t: any) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs"
                >
                  <span className="font-medium">
                    {t.campaign_name}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {new Date(
                        t.sent_at ?? t.scheduled_for ?? t.created_at,
                      ).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="capitalize text-muted-foreground">
                    {String(t.status).replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}



        <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Suggested opener
          </p>
          <p className="mt-1 text-sm">{client.opener}</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(client.opener);
              toast.success("Copied");
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>

        <button
          onClick={onBrief}
          disabled={briefLoading}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {briefLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate listing brief
        </button>
        {brief && (
          <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-border bg-card p-3 text-sm">
            {brief}
          </pre>
        )}

        <div className="mt-5 flex gap-2">
          {client.phone && (
            <a
              href={`tel:${String(client.phone).replace(/[^0-9+]/g, "")}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm hover:border-primary"
            >
              <Phone className="h-4 w-4 text-primary" /> Call
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border px-3 py-2 text-sm hover:border-primary"
            >
              <Mail className="h-4 w-4 text-primary" /> Email
            </a>
          )}
        </div>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Listing status
        </h3>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-2 w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm"
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
            className="mt-2 w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm"
          />
        )}
        <button
          onClick={() =>
            onSaveListing({
              status,
              listedWithOtherAgent: otherAgent,
              listingAgentName: agentName || null,
            })
          }
          disabled={saving}
          className="mt-3 w-full rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save listing status"}
        </button>
      </aside>
    </div>
  );
}

function Field({
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
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
        {info}
      </p>
      <p className={`mt-0.5 font-medium ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
